import { logger } from "./logger.ts";
import type { ChatModel } from "./ports.ts";
import { ESCALATE_TOOL } from "./prompt.ts";
import type { ToolRegistry } from "./registry.ts";
import type { Message, ToolSpec } from "./types.ts";

const log = logger("loop");

/**
 * What the local model is told when it asks to hand over and there is nobody
 * to hand over to. Phrased as an instruction rather than an error, because it
 * is read by a model deciding what to do next, and "unknown tool" reads as a
 * dead end.
 */
export const NO_CLOUD =
  "There is no other model to hand this to. Answer it yourself: use the tools you have if they help, " +
  "and otherwise say what you know in one or two sentences.";

/** What is said when the request ran past its deadline part way through. */
export const OUT_OF_TIME = "That took longer than it should have. Ask me again in a moment.";

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
  /**
   * When to stop asking for another round, as a timestamp. Checked between
   * rounds rather than during one: the port takes no signal, so a request
   * already with a model runs to its end either way, and abandoning it here
   * would only lose the answer we are waiting for.
   */
  deadline?: number;
  now?: () => number;
}): Promise<TurnResult> {
  const messages = [...opts.messages];
  const now = opts.now ?? Date.now;

  for (let round = 0; round < opts.maxRounds; round++) {
    if (round > 0 && opts.deadline !== undefined && now() > opts.deadline) {
      log.warn("out of time part way through the tool rounds");
      return { text: OUT_OF_TIME, messages };
    }

    const completion = await opts.model.complete(messages, opts.tools);
    messages.push({
      role: "assistant",
      content: completion.text,
      ...(completion.toolCalls.length ? { toolCalls: completion.toolCalls } : {}),
    });

    if (!completion.toolCalls.length) return { text: completion.text, messages };

    const escalation = opts.allowEscalation
      ? completion.toolCalls.find((call) => call.name === ESCALATE_TOOL)
      : undefined;
    if (escalation) {
      const question = String(escalation.args.question ?? "");
      log.info("escalating:", question);
      // Drop the escalation call itself: the cloud model gets the question,
      // not the local model's decision to give up.
      return { text: completion.text, escalateTo: question, messages: opts.messages };
    }

    // The model asked for every tool in this round before it saw any of the
    // answers, so nothing in the round depends on anything else in it.
    // Running them together costs the slowest rather than the sum, which is
    // the difference between two lights and one, and the results are still
    // appended in the order they were asked for.
    const allowedToolNames = new Set(opts.tools.map((tool) => tool.name));
    const results = await Promise.all(
      completion.toolCalls.map((call) => {
        if (call.name === ESCALATE_TOOL) {
          // No cloud model, and the model asked for one anyway: small models
          // trained on this pattern reach for it even when it is not in their
          // tool list. Answered as a tool result rather than left to the
          // registry's "no tool called that", so the next round is told what
          // to do instead of only what went wrong.
          log.debug("escalation asked for with no cloud model");
          return Promise.resolve(NO_CLOUD);
        }
        if (!allowedToolNames.has(call.name)) {
          log.warn(`tool ${call.name} was not in the allowed list for this turn`);
          return Promise.resolve(
            `Tool ${call.name} is not available in this context. Available tools: ${[...allowedToolNames].join(", ") || "none"}.`,
          );
        }
        log.debug("tool", call.name, call.args);
        return opts.registry.run(call.name, call.args);
      }),
    );
    completion.toolCalls.forEach((call, index) => {
      messages.push({
        role: "tool",
        toolCallId: call.id,
        name: call.name,
        content: results[index] as string,
      });
    });
  }

  log.warn("hit the tool round limit");
  return { text: "That is taking longer than it should. Try asking me again.", messages };
}
