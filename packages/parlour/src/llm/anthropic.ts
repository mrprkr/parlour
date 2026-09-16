import Anthropic from "@anthropic-ai/sdk";
import type { ChatModel, Completion, Message, ToolSpec } from "./types.ts";
import { logger } from "../logger.ts";

const log = logger("cloud-llm");

/**
 * The escalation path. Everything the local model cannot do well, which in
 * practice means open questions, anything needing the web, and anything the
 * local model has already fumbled.
 *
 * Web search is a server side tool here: Anthropic runs it, so there is no
 * search API key to hold and no second round trip from the house.
 */
export interface CloudModelOptions {
  apiKey: string;
  model: string;
  maxTokens: number;
  webSearch: boolean;
}

export class ClaudeModel implements ChatModel {
  readonly label: string;
  readonly #client: Anthropic;

  readonly #opts: CloudModelOptions;

  constructor(opts: CloudModelOptions) {
    this.#opts = opts;
    this.label = `cloud:${opts.model}`;
    this.#client = new Anthropic({ apiKey: opts.apiKey });
  }

  async complete(messages: Message[], tools: ToolSpec[]): Promise<Completion> {
    const system = messages.filter((m) => m.role === "system").map((m) => m.content).join("\n\n");
    const history = toAnthropicMessages(messages.filter((m) => m.role !== "system"));

    const params: Anthropic.MessageCreateParamsNonStreaming = {
      model: this.#opts.model,
      max_tokens: this.#opts.maxTokens,
      // Spoken answers want the shortest useful think, not the deepest one.
      output_config: { effort: "low" },
      system,
      messages: history,
      tools: [
        ...tools.map((t) => ({ name: t.name, description: t.description, input_schema: t.inputSchema })),
        ...(this.#opts.webSearch
          ? [{ type: "web_search_20260209", name: "web_search", max_uses: 4 } as const]
          : []),
      ],
    };

    let response = await this.#client.messages.create(params);
    // A server side tool can pause the turn. Hand the assistant turn back and
    // let it carry on, or the answer arrives silently truncated.
    while (response.stop_reason === "pause_turn") {
      history.push({ role: "assistant", content: response.content });
      response = await this.#client.messages.create({ ...params, messages: history });
    }

    if (response.stop_reason === "refusal") {
      log.warn("refused:", response.stop_details);
      return { text: "I would rather not answer that one.", toolCalls: [] };
    }

    return {
      text: response.content
        .filter((block): block is Anthropic.TextBlock => block.type === "text")
        .map((block) => block.text)
        .join(" ")
        .trim(),
      toolCalls: response.content
        .filter((block): block is Anthropic.ToolUseBlock => block.type === "tool_use")
        .map((block) => ({
          id: block.id,
          name: block.name,
          args: (block.input ?? {}) as Record<string, unknown>,
        })),
    };
  }
}

/**
 * Anthropic groups tool results into a single user turn, where the neutral
 * shape has one message per result. Consecutive tool results are merged.
 */
function toAnthropicMessages(messages: Message[]): Anthropic.MessageParam[] {
  const out: Anthropic.MessageParam[] = [];
  for (const message of messages) {
    if (message.role === "tool") {
      const block: Anthropic.ToolResultBlockParam = {
        type: "tool_result",
        tool_use_id: message.toolCallId,
        content: message.content,
      };
      const last = out.at(-1);
      if (last?.role === "user" && Array.isArray(last.content)) last.content.push(block);
      else out.push({ role: "user", content: [block] });
      continue;
    }

    if (message.role === "assistant") {
      const content: Anthropic.ContentBlockParam[] = [];
      if (message.content) content.push({ type: "text", text: message.content });
      for (const call of message.toolCalls ?? []) {
        content.push({ type: "tool_use", id: call.id, name: call.name, input: call.args });
      }
      if (content.length) out.push({ role: "assistant", content });
      continue;
    }

    out.push({ role: "user", content: message.content });
  }
  return out;
}
