import { logger } from "../logger.ts";
import type { ChatModel, Completion, Message, ToolSpec } from "./types.ts";

const log = logger("local-llm");

interface ApiToolCall {
  id: string;
  function: { name: string; arguments: string };
}

/**
 * LM Studio speaks the OpenAI chat completions API, so does Ollama and so does
 * llama.cpp's server. Nothing here is LM Studio specific beyond the default
 * port, which keeps the runtime swappable.
 */
export interface LocalModelOptions {
  baseUrl: string;
  model: string;
  temperature: number;
  timeoutMs: number;
  apiKey?: string;
}

export class OpenAiCompatibleModel implements ChatModel {
  readonly label: string;

  readonly #opts: LocalModelOptions;

  constructor(opts: LocalModelOptions) {
    this.#opts = opts;
    this.label = `local:${opts.model}`;
  }

  async complete(messages: Message[], tools: ToolSpec[]): Promise<Completion> {
    const response = await fetch(`${this.#opts.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(this.#opts.apiKey ? { authorization: `Bearer ${this.#opts.apiKey}` } : {}),
      },
      body: JSON.stringify({
        model: this.#opts.model,
        temperature: this.#opts.temperature,
        messages: messages.map(toApiMessage),
        ...(tools.length
          ? {
              tools: tools.map((t) => ({
                type: "function",
                function: { name: t.name, description: t.description, parameters: t.inputSchema },
              })),
              tool_choice: "auto",
            }
          : {}),
      }),
      signal: AbortSignal.timeout(this.#opts.timeoutMs),
    });

    if (!response.ok) throw new Error(`${this.label} ${response.status}: ${await response.text()}`);

    const body = (await response.json()) as {
      choices?: { message?: { content?: string | null; tool_calls?: ApiToolCall[] } }[];
    };
    const message = body.choices?.[0]?.message;
    return {
      text: stripThinking(message?.content ?? ""),
      toolCalls: (message?.tool_calls ?? []).map((call) => ({
        id: call.id,
        name: call.function.name,
        args: parseArgs(call.function.arguments),
      })),
    };
  }
}

function toApiMessage(message: Message): Record<string, unknown> {
  switch (message.role) {
    case "tool":
      return { role: "tool", tool_call_id: message.toolCallId, name: message.name, content: message.content };
    case "assistant":
      return {
        role: "assistant",
        content: message.content || null,
        ...(message.toolCalls?.length
          ? {
              tool_calls: message.toolCalls.map((c) => ({
                id: c.id,
                type: "function",
                function: { name: c.name, arguments: JSON.stringify(c.args) },
              })),
            }
          : {}),
      };
    default:
      return { role: message.role, content: message.content };
  }
}

/** Qwen and friends emit their reasoning inline. It must never be spoken. */
function stripThinking(text: string): string {
  return text.replace(/<think>[\s\S]*?<\/think>/g, "").trim();
}

function parseArgs(raw: string): Record<string, unknown> {
  try {
    const parsed: unknown = JSON.parse(raw || "{}");
    return typeof parsed === "object" && parsed !== null ? (parsed as Record<string, unknown>) : {};
  } catch {
    log.warn("unparseable tool arguments:", raw);
    return {};
  }
}
