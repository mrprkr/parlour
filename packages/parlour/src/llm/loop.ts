import type { ChatModel, Message, ToolSpec } from "./types.ts";
import type { ToolRegistry } from "../tools/registry.ts";
import { ESCALATE_TOOL } from "../prompt.ts";
import { logger } from "../logger.ts";

const log = logger("loop");

export interface TurnResult {
  text: string;
  /** Set when the model asked to hand the question over. */
  escalateTo?: string;
  messages: Message[];
}

/**
 * The agentic loop: ask, run whatever tools came back, ask again. Capped,
 * because a model that has decided to poll a sensor forever should not be
 * allowed to do it while somebody stands in the kitchen waiting.
 */
export async function runTurn(opts: {
  model: ChatModel;
  messages: Message[];
  tools: ToolSpec[];
  registry: ToolRegistry;
  maxRounds: number;
  /** Escalation is only offered to the local model. */
  allowEscalation: boolean;
}): Promise<TurnResult> {
  const messages = [...opts.messages];

  for (let round = 0; round < opts.maxRounds; round++) {
    const completion = await opts.model.complete(messages, opts.tools);
    messages.push({
      role: "assistant",
      content: completion.text,
      ...(completion.toolCalls.length ? { toolCalls: completion.toolCalls } : {}),
    });

    if (!completion.toolCalls.length) return { text: completion.text, messages };

    for (const call of completion.toolCalls) {
      if (opts.allowEscalation && call.name === ESCALATE_TOOL) {
        const question = String(call.args.question ?? "");
        log.info("escalating:", question);
        // Drop the escalation call itself: the cloud model gets the question,
        // not the local model's decision to give up.
        return { text: completion.text, escalateTo: question, messages: opts.messages };
      }

      log.debug("tool", call.name, call.args);
      const result = await opts.registry.run(call.name, call.args);
      messages.push({ role: "tool", toolCallId: call.id, name: call.name, content: result });
    }
  }

  log.warn("hit the tool round limit");
  return { text: "That is taking longer than it should. Try asking me again.", messages };
}
