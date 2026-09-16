import type { Config } from "../config.ts";
import type { ToolRegistry } from "../tools/registry.ts";
import { escalateSpec, systemPrompt } from "../prompt.ts";
import { runTurn } from "./loop.ts";
import type { ChatModel, Message } from "./types.ts";
import { logger } from "../logger.ts";

const log = logger("router");

/** Forget a conversation after a quiet spell, so "turn it off" cannot mean a light from an hour ago. */
const CONTEXT_TTL_MS = 4 * 60_000;
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
  readonly #config: Config;
  readonly #local: ChatModel;
  readonly #cloud: ChatModel | null;
  readonly #registry: ToolRegistry;

  constructor(config: Config, local: ChatModel, cloud: ChatModel | null, registry: ToolRegistry) {
    this.#config = config;
    this.#local = local;
    this.#cloud = cloud;
    this.#registry = registry;
  }

  async ask(text: string, options: AskOptions = {}): Promise<Answer> {
    const session = this.#session(options.session ?? "local");
    const system: Message = {
      role: "system",
      content: systemPrompt(this.#config, roomContext(options.room)),
    };
    const messages: Message[] = [system, ...session.history, { role: "user", content: text }];
    const tools = this.#registry.specs();
    const localTools = this.#cloud ? [...tools, escalateSpec] : tools;

    let via: "local" | "cloud" = "local";
    let result;
    try {
      result = await runTurn({
        model: this.#local,
        messages,
        tools: localTools,
        registry: this.#registry,
        maxRounds: this.#config.llm.maxToolRounds,
        allowEscalation: this.#cloud !== null,
      });
    } catch (error) {
      log.warn(`${this.#local.label} failed:`, error instanceof Error ? error.message : error);
      if (!this.#cloud || !this.#config.llm.cloud.onLocalFailure) {
        return { text: "My local model is not answering. Try again in a moment.", via: "local" };
      }
      result = { text: "", escalateTo: text, messages };
    }

    if (result.escalateTo && this.#cloud) {
      via = "cloud";
      const handover: Message[] = [
        system,
        ...session.history,
        { role: "user", content: result.escalateTo },
      ];
      try {
        result = await runTurn({
          model: this.#cloud,
          messages: handover,
          tools,
          registry: this.#registry,
          maxRounds: this.#config.llm.maxToolRounds,
          allowEscalation: false,
        });
      } catch (error) {
        log.error(`${this.#cloud.label} failed:`, error instanceof Error ? error.message : error);
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

  #session(key: string): Session {
    const now = Date.now();
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
  return [
    "",
    `You are being spoken to from the ${room}. When a request names no room, it means this one.`,
  ];
}
