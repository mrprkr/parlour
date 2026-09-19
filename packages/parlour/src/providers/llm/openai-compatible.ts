import { z } from "zod";
import { type Logger, logger } from "../../core/logger.ts";
import type { ChatModel, Check } from "../../core/ports.ts";
import { defineProvider, type ProviderContext, registerProvider } from "../../core/providers.ts";
import type { Completion, Message, ToolSpec } from "../../core/types.ts";

interface ApiToolCall {
  id: string;
  function: { name: string; arguments: string };
}

/**
 * LM Studio speaks the OpenAI chat completions API, so does Ollama and so does
 * llama.cpp's server. Nothing here is LM Studio specific beyond the default
 * port, which keeps the runtime swappable.
 */
export const OpenAiCompatibleSchema = z.object({
  baseUrl: z.string().url().default("http://127.0.0.1:1234/v1"),
  model: z.string().default("qwen3-8b-mlx"),
  temperature: z.number().min(0).max(2).default(0.3),
  timeoutMs: z.number().int().positive().default(30000),
  /**
   * True when Parlour runs this server itself: llama-server, kept warm by
   * launchd with a model from its own catalogue. It changes nothing about how
   * the model is talked to and everything about whose fault it is when the
   * port does not answer, which is what the check below has to say.
   */
  managed: z.boolean().default(false),
  /**
   * The name of an environment variable holding a bearer token, for a hosted
   * endpoint. The key itself stays out of config, like every other secret.
   */
  apiKeyEnv: z.string().optional(),
});

export type OpenAiCompatibleOptions = z.infer<typeof OpenAiCompatibleSchema>;

export interface LocalModelOptions {
  baseUrl: string;
  model: string;
  temperature: number;
  timeoutMs: number;
  /** Whether Parlour is the one meant to be running this server. */
  managed?: boolean;
  apiKey?: string;
  log?: Logger;
}

export class OpenAiCompatibleModel implements ChatModel {
  readonly label: string;

  readonly #opts: LocalModelOptions;
  readonly #log: Logger;

  constructor(opts: LocalModelOptions) {
    this.#opts = opts;
    this.#log = opts.log ?? logger("local-llm");
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
        args: this.#parseArgs(call.function.arguments),
      })),
    };
  }

  /**
   * Whether the server is up and has the configured model loaded, which are
   * different failures that look the same from the outside: the agent hears
   * you and says nothing.
   */
  async doctor(): Promise<Check[]> {
    const { baseUrl, model } = this.#opts;
    let served: string[] | null = null;
    try {
      const response = await fetch(`${baseUrl}/models`, {
        headers: this.#opts.apiKey ? { authorization: `Bearer ${this.#opts.apiKey}` } : {},
        signal: AbortSignal.timeout(4000),
      });
      if (response.ok) {
        const body = (await response.json()) as { data?: { id?: string }[] };
        served = (body.data ?? []).map((m) => m.id ?? "");
      }
    } catch {
      served = null;
    }
    // A server that is not answering is the usual failure, and what to do
    // about it depends on whose server it is: Parlour's own is a service to
    // restart, anybody else's is a window to go and open.
    const down = this.#opts.managed
      ? `${baseUrl} is not answering. parlour restart, or parlour service logs for why it stopped.`
      : `${baseUrl} is not answering. Start the server in LM Studio, or run parlour init to have Parlour run one.`;
    const detail = served
      ? served.length
        ? `served: ${served.join(", ")}. Configured: ${model}.`
        : "the server is up but has no model loaded."
      : down;
    return [{ name: "local model", status: served?.includes(model) ? "ok" : "fail", detail }];
  }

  #parseArgs(raw: string): Record<string, unknown> {
    try {
      const parsed: unknown = JSON.parse(raw || "{}");
      return typeof parsed === "object" && parsed !== null ? (parsed as Record<string, unknown>) : {};
    } catch {
      this.#log.warn("unparseable tool arguments:", raw);
      return {};
    }
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

export function createOpenAiCompatible(
  options: OpenAiCompatibleOptions,
  context: ProviderContext,
): OpenAiCompatibleModel {
  const { apiKeyEnv, ...rest } = options;
  return new OpenAiCompatibleModel({
    ...rest,
    apiKey: apiKeyEnv ? process.env[apiKeyEnv] : undefined,
    log: context.log,
  });
}

export const openAiCompatibleProvider = defineProvider<OpenAiCompatibleModel>({
  kind: "llm",
  name: "openai-compatible",
  description: "Any server speaking the OpenAI chat completions API: LM Studio, Ollama, llama.cpp",
  schema: OpenAiCompatibleSchema,
  create: (options, context) => createOpenAiCompatible(options as OpenAiCompatibleOptions, context),
});

registerProvider(openAiCompatibleProvider);
