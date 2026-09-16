import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { type Logger, logger } from "../../core/logger.ts";
import type { ChatModel, Check } from "../../core/ports.ts";
import { defineProvider, type ProviderContext, registerProvider } from "../../core/providers.ts";
import type { Completion, Message, ToolSpec } from "../../core/types.ts";

/**
 * The escalation path. Everything the local model cannot do well, which in
 * practice means open questions, anything needing the web, and anything the
 * local model has already fumbled.
 *
 * Web search is a server side tool here: Anthropic runs it, so there is no
 * search API key to hold and no second round trip from the house.
 */
export const AnthropicSchema = z.object({
  model: z.string().default("claude-opus-5"),
  maxTokens: z.number().int().positive().default(1024),
  webSearch: z.boolean().default(true),
});

export type AnthropicOptions = z.infer<typeof AnthropicSchema>;

export interface CloudModelOptions {
  apiKey: string;
  model: string;
  maxTokens: number;
  webSearch: boolean;
  log?: Logger;
}

export class ClaudeModel implements ChatModel {
  readonly label: string;
  readonly #client: Anthropic;
  readonly #log: Logger;

  readonly #opts: CloudModelOptions;

  constructor(opts: CloudModelOptions) {
    this.#opts = opts;
    this.#log = opts.log ?? logger("cloud-llm");
    this.label = `cloud:${opts.model}`;
    this.#client = new Anthropic({ apiKey: opts.apiKey });
  }

  async complete(messages: Message[], tools: ToolSpec[]): Promise<Completion> {
    const system = messages
      .filter((m) => m.role === "system")
      .map((m) => m.content)
      .join("\n\n");
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
      this.#log.warn("refused:", response.stop_details);
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

  /**
   * No network call: a request costs money and the key is the only thing that
   * goes wrong here, and `create` has already refused to run without one.
   */
  async doctor(): Promise<Check[]> {
    return [{ name: "cloud escalation", status: "ok", detail: this.#opts.model }];
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

export function createAnthropic(options: AnthropicOptions, context: ProviderContext): ClaudeModel {
  const apiKey = context.secrets.anthropicKey;
  // Thrown rather than warned: the assembly decides whether running local
  // only is acceptable, and it can only decide if it is told.
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY is not set");
  return new ClaudeModel({ ...options, apiKey, log: context.log });
}

export const anthropicProvider = defineProvider<ClaudeModel>({
  kind: "llm",
  name: "anthropic",
  description: "Claude, with web search run on Anthropic's side",
  schema: AnthropicSchema,
  create: (options, context) => createAnthropic(options as AnthropicOptions, context),
});

registerProvider(anthropicProvider);
