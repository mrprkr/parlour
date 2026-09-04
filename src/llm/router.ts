import type { Config } from "../config.ts";
import type { ToolRegistry } from "../tools/registry.ts";
import { escalateSpec, systemPrompt } from "../prompt.ts";
import { runTurn } from "./loop.ts";
import type { ChatModel, Message } from "./types.ts";
import { logger } from "../logger.ts";

const log = logger("router");

/** Forget the conversation after a quiet spell, so "turn it off" cannot mean a light from an hour ago. */
const CONTEXT_TTL_MS = 4 * 60_000;
const MAX_HISTORY = 12;

/**
 * Local first, cloud when the local model says so or falls over. The local
 * model is fast, free and private; the cloud one is right more often. Sending
 * "turn the hall light off" to a data centre is a waste of both.
 */
export class Router {
  #history: Message[] = [];
  #lastSpoke = 0;

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

  async ask(text: string): Promise<string> {
    if (Date.now() - this.#lastSpoke > CONTEXT_TTL_MS) this.#history = [];
    this.#lastSpoke = Date.now();

    const system: Message = { role: "system", content: systemPrompt(this.#config) };
    const messages: Message[] = [system, ...this.#history, { role: "user", content: text }];
    const tools = this.#registry.specs();
    const localTools = this.#cloud ? [...tools, escalateSpec] : tools;

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
        return "My local model is not answering. Try again in a moment.";
      }
      result = { text: "", escalateTo: text, messages };
    }

    if (result.escalateTo && this.#cloud) {
      const handover: Message[] = [system, ...this.#history, { role: "user", content: result.escalateTo }];
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
        return "I could not reach the cloud model, and I did not want to guess.";
      }
    }

    // Keep the user and assistant turns, drop the tool traffic: it is long,
    // it is stale by the next question, and it is the bulk of the tokens.
    const turn: Message[] = [
      { role: "user", content: text },
      { role: "assistant", content: result.text },
    ];
    this.#history = [...this.#history, ...turn].slice(-MAX_HISTORY);

    return result.text || "Done.";
  }

  reset(): void {
    this.#history = [];
  }
}
