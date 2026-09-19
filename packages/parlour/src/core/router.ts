import { logger } from "./logger.ts";
import { runTurn, type TurnResult } from "./loop.ts";
import type { ChatModel } from "./ports.ts";
import { escalateSpec, systemPrompt } from "./prompt.ts";
import type { ToolRegistry } from "./registry.ts";
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
}

interface Session {
  history: Message[];
  lastSpoke: number;
}

/**
 * Local first, cloud when the local model says so or falls over. The local
 * model is fast, free and private; the cloud one is right more often. Sending
 * "turn the hall light off" to a data centre is a waste of both.
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
    // The persona is built per turn rather than once, because it carries the
    // date and the integrations' lines. Whether escalation exists goes in
    // here too: a prompt that names a tool the model was not given is how a
    // local-only house ends up apologising instead of calling ha_call_service.
    const system: Message = {
      role: "system",
      content: systemPrompt(
        this.#options.name,
        [...this.#context(), ...roomContext(options.room)],
        this.#options.locale,
        { escalation: cloud !== null },
      ),
    };
    const messages: Message[] = [system, ...session.history, { role: "user", content: text }];
    const tools = registry.specs();
    const localTools = cloud ? [...tools, escalateSpec] : tools;

    let via: "local" | "cloud" = "local";
    let result: TurnResult;
    try {
      result = await runTurn({
        model: local,
        messages,
        tools: localTools,
        registry,
        maxRounds: maxToolRounds,
        allowEscalation: cloud !== null,
      });
    } catch (error) {
      log.warn(`${local.label} failed:`, error instanceof Error ? error.message : error);
      if (!cloud || !this.#options.onLocalFailure) {
        return { text: "My local model is not answering. Try again in a moment.", via: "local" };
      }
      result = { text: "", escalateTo: text, messages };
    }

    if (result.escalateTo && cloud) {
      via = "cloud";
      const handover: Message[] = [system, ...session.history, { role: "user", content: result.escalateTo }];
      try {
        // No house tools for the cloud: the house stays local, the cloud gets
        // the question and brings its own web search. Handing it the local
        // web_search tool as well would clash with that one by name.
        result = await runTurn({
          model: cloud,
          messages: handover,
          tools: [],
          registry,
          maxRounds: maxToolRounds,
          allowEscalation: false,
        });
      } catch (error) {
        log.error(`${cloud.label} failed:`, error instanceof Error ? error.message : error);
        return { text: "I could not reach the cloud model, and I did not want to guess.", via: "cloud" };
      }
    }

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
