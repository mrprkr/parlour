import { logger } from "./logger.ts";
import { runTurn, type TurnResult } from "./loop.ts";
import type { ChatModel, DecisionModel } from "./ports.ts";
import { escalateSpec, systemPrompt } from "./prompt.ts";
import type { ToolRegistry } from "./registry.ts";
import { planTriage, runTriage, type TriageMode } from "./triage.ts";
import type { Message } from "./types.ts";

const log = logger("router");

/** Forget a conversation after a quiet spell, so "turn it off" cannot mean a light from an hour ago. */
export const CONTEXT_TTL_MS = 4 * 60_000;
const MAX_HISTORY = 12;
/** Stop tracking clients that have gone away, rather than growing forever. */
const MAX_SESSIONS = 32;

export interface Answer {
  text: string;
  /** Which model actually produced the answer. */
  via: "local" | "cloud";
}

export interface AskOptions {
  /**
   * Which conversation this belongs to. One per client, so that a follow-up
   * said to the kitchen satellite does not resolve against something asked on
   * a phone ten minutes ago.
   */
  session?: string;
  /** The room the request came from, if the client knows. */
  room?: string;
}

export interface RouterOptions {
  /** What the house calls itself, for the persona. */
  name: string;
  /** BCP 47 tag for the date and the language the persona asks for. Defaults to en-GB. */
  locale?: string;
  local: ChatModel;
  /** Null runs local only: no escalation tool is offered and failures are final. */
  cloud: ChatModel | null;
  registry: ToolRegistry;
  maxToolRounds: number;
  /** Hand over to the cloud model when the local one throws, rather than apologise. */
  onLocalFailure: boolean;
  /** Extra prompt lines, asked for on every turn so an integration can change its mind. */
  promptContext?: () => string[];
  /** The clock, injectable so a test can age a session without waiting. */
  now?: () => number;
  /**
   * Optional System One model that judges escalate-vs-local before the
   * generative turn. Null or absent keeps ask_the_clever_one as the only gate.
   */
  decision?: DecisionModel | null;
  decisionMode?: TriageMode;
  escalateThreshold?: number;
  localConfidence?: number;
}

interface Session {
  history: Message[];
  lastSpoke: number;
}

/**
 * Local first, cloud when the local model says so or falls over. The local
 * model is fast, free and private; the cloud one is right more often. Sending
 * "turn the hall light off" to a data centre is a waste of both.
 *
 * When a DecisionModel is configured, it may short-circuit that judgment with
 * calibrated probabilities (triage mode) or only log what it would have done
 * (shadow mode).
 */
export class Router {
  readonly #sessions = new Map<string, Session>();
  readonly #options: RouterOptions;
  readonly #now: () => number;

  constructor(options: RouterOptions) {
    this.#options = options;
    this.#now = options.now ?? Date.now;
  }

  async ask(text: string, options: AskOptions = {}): Promise<Answer> {
    const { local, cloud, registry, maxToolRounds } = this.#options;
    const session = this.#session(options.session ?? "local");
    const system: Message = {
      role: "system",
      content: systemPrompt(
        this.#options.name,
        [...this.#context(), ...roomContext(options.room)],
        this.#options.locale,
      ),
    };
    const messages: Message[] = [system, ...session.history, { role: "user", content: text }];
    const tools = registry.specs();

    const triage = await this.#triage(
      text,
      options.room,
      tools.map((tool) => tool.name),
    );
    if (triage?.path === "cloud" && cloud) {
      return this.#finish(
        session,
        text,
        await this.#cloudTurn(cloud, system, session.history, text, maxToolRounds, registry),
        "cloud",
      );
    }

    const offerEscalate = triage ? triage.offerEscalate : cloud !== null;
    const localTools = offerEscalate ? [...tools, escalateSpec] : tools;

    let via: "local" | "cloud" = "local";
    let result: TurnResult;
    try {
      result = await runTurn({
        model: local,
        messages,
        tools: localTools,
        registry,
        maxRounds: maxToolRounds,
        allowEscalation: offerEscalate,
      });
    } catch (error) {
      log.warn(`${local.label} failed:`, error instanceof Error ? error.message : error);
      if (!cloud || !this.#options.onLocalFailure) {
        return { text: "My local model is not answering. Try again in a moment.", via: "local" };
      }
      result = { text: "", escalateTo: text, messages };
    }

    if (result.escalateTo && cloud) {
      if (triage?.shadow) {
        log.info(
          `shadow triage would ${triage.verdict.needsCloud >= (this.#options.escalateThreshold ?? 0.85) ? "escalate" : "stay local"}` +
            ` (needs_cloud=${triage.verdict.needsCloud.toFixed(2)} intent=${triage.verdict.intent}` +
            ` conf=${triage.verdict.intentConfidence.toFixed(2)}); local escalated`,
        );
      }
      via = "cloud";
      result = await this.#cloudTurn(
        cloud,
        system,
        session.history,
        result.escalateTo,
        maxToolRounds,
        registry,
      );
    } else if (triage?.shadow) {
      log.info(
        `shadow triage: needs_cloud=${triage.verdict.needsCloud.toFixed(2)}` +
          ` needs_web=${triage.verdict.needsWeb.toFixed(2)} intent=${triage.verdict.intent}` +
          ` conf=${triage.verdict.intentConfidence.toFixed(2)} via=${triage.verdict.model}; local answered`,
      );
    }

    return this.#finish(session, text, result, via);
  }

  async #triage(text: string, room: string | undefined, toolNames: string[]) {
    const decision = this.#options.decision;
    if (!decision) return null;
    try {
      const verdict = await runTriage(decision, { transcript: text, room, tools: toolNames });
      const plan = planTriage(verdict, {
        mode: this.#options.decisionMode ?? "shadow",
        escalateThreshold: this.#options.escalateThreshold ?? 0.85,
        localConfidence: this.#options.localConfidence ?? 0.75,
        hasCloud: this.#options.cloud !== null,
      });
      log.info(
        `triage ${plan.shadow ? "shadow" : plan.path}: needs_cloud=${verdict.needsCloud.toFixed(2)}` +
          ` intent=${verdict.intent} conf=${verdict.intentConfidence.toFixed(2)} via ${verdict.model}`,
      );
      return plan;
    } catch (error) {
      log.warn(`triage failed, continuing locally:`, error instanceof Error ? error.message : error);
      return null;
    }
  }

  async #cloudTurn(
    cloud: ChatModel,
    system: Message,
    history: Message[],
    question: string,
    maxToolRounds: number,
    registry: ToolRegistry,
  ): Promise<TurnResult> {
    try {
      // No house tools for the cloud: the house stays local, the cloud gets
      // the question and brings its own web search. Handing it the local
      // web_search tool as well would clash with that one by name.
      return await runTurn({
        model: cloud,
        messages: [system, ...history, { role: "user", content: question }],
        tools: [],
        registry,
        maxRounds: maxToolRounds,
        allowEscalation: false,
      });
    } catch (error) {
      log.error(`${cloud.label} failed:`, error instanceof Error ? error.message : error);
      return {
        text: "I could not reach the cloud model, and I did not want to guess.",
        messages: [],
      };
    }
  }

  #finish(session: Session, text: string, result: TurnResult, via: "local" | "cloud"): Answer {
    // Keep the user and assistant turns, drop the tool traffic: it is long,
    // it is stale by the next question, and it is the bulk of the tokens.
    const turn: Message[] = [
      { role: "user", content: text },
      { role: "assistant", content: result.text },
    ];
    session.history = [...session.history, ...turn].slice(-MAX_HISTORY);
    return { text: result.text || "Done.", via };
  }

  /** The integrations' lines, set off from the persona by a blank line when there are any. */
  #context(): string[] {
    const lines = this.#options.promptContext?.() ?? [];
    return lines.length ? ["", ...lines] : [];
  }

  #session(key: string): Session {
    const now = this.#now();
    const existing = this.#sessions.get(key);
    if (existing && now - existing.lastSpoke <= CONTEXT_TTL_MS) {
      existing.lastSpoke = now;
      return existing;
    }

    const session: Session = { history: [], lastSpoke: now };
    this.#sessions.set(key, session);
    if (this.#sessions.size > MAX_SESSIONS) {
      const oldest = [...this.#sessions.entries()].sort((a, b) => a[1].lastSpoke - b[1].lastSpoke)[0];
      if (oldest) this.#sessions.delete(oldest[0]);
    }
    return session;
  }

  reset(key?: string): void {
    if (key) this.#sessions.delete(key);
    else this.#sessions.clear();
  }
}

function roomContext(room: string | undefined): string[] {
  if (!room) return [];
  return ["", `You are being spoken to from the ${room}. When a request names no room, it means this one.`];
}
