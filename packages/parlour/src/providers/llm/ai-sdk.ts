import { createAnthropic } from "@ai-sdk/anthropic";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import {
  type AssistantContent,
  generateText,
  jsonSchema,
  type LanguageModel,
  type ModelMessage,
  stepCountIs,
  type ToolSet,
  tool,
} from "ai";
import { z } from "zod";
import { type Logger, logger } from "../../core/logger.ts";
import type { ChatModel, Check } from "../../core/ports.ts";
import { defineProvider, type ProviderContext, registerProvider } from "../../core/providers.ts";
import { stripThinking } from "../../core/text.ts";
import type { Completion, Message, ToolSpec } from "../../core/types.ts";
import { localModelCheck } from "./openai-compatible.ts";

/**
 * Both back ends through one library: Vercel's AI SDK.
 *
 * `openai-compatible` and `anthropic` each hand-roll the same conversion, out
 * to the wire and back: the neutral message shape, the tool specs, the tool
 * calls. That is two of somebody else's APIs to keep up with, and the second
 * one to be added would be a third. This does the conversion once and lets
 * the SDK keep up, which also means every back end the SDK supports is a
 * `backend` away rather than a provider away.
 *
 * It is not the default, and the hand-rolled pair stay. They are what a house
 * runs with no dependency beyond `fetch`, they are what the defaults in
 * config name, and the Anthropic one is written around this pipeline. Choose
 * this by name when you would rather track one library than two APIs.
 *
 * The loop stays in core either way. The tools are declared without an
 * `execute`, so the SDK hands the calls back instead of running them, and
 * `core/loop.ts` keeps the escalation, the round cap and the deadline that
 * every client here depends on.
 */
export const AiSdkSchema = z.object({
  /** Which of the SDK's providers answers. The rest of the slice is read in that light. */
  backend: z.enum(["openai-compatible", "anthropic"]).default("openai-compatible"),
  /** Empty takes the back end's usual model, so a slice can name only the back end. */
  model: z.string().default(""),
  /** openai-compatible only. */
  baseUrl: z.string().url().default("http://127.0.0.1:1234/v1"),
  temperature: z.number().min(0).max(2).default(0.3),
  /** Null leaves it to the back end, which is what a local server wants. */
  maxTokens: z.number().int().positive().nullish(),
  timeoutMs: z.number().int().positive().default(30000),
  /**
   * The name of an environment variable holding the key. The Anthropic back
   * end falls back to ANTHROPIC_API_KEY, as the hand-rolled one uses.
   */
  apiKeyEnv: z.string().optional(),
  /** anthropic only: its own web search, run on its side, so no key to hold here. */
  webSearch: z.boolean().default(true),
  /** anthropic only. A spoken answer wants the shortest useful think. */
  effort: z.enum(["low", "medium", "high"]).default("low"),
  /** openai-compatible only, and only so the doctor knows whose server to blame. */
  managed: z.boolean().default(false),
});

export type AiSdkOptions = z.infer<typeof AiSdkSchema>;

export interface AiSdkModelOptions {
  backend: "openai-compatible" | "anthropic";
  /** Already built, so a test can hand over a fake without a network. */
  model: LanguageModel;
  /** What to call it in the log and in the doctor. */
  modelId: string;
  temperature: number;
  maxOutputTokens?: number;
  timeoutMs: number;
  /** The server-side tools the back end runs itself, added to every request. */
  serverTools?: ToolSet;
  effort?: "low" | "medium" | "high";
  baseUrl?: string;
  apiKey?: string;
  managed?: boolean;
  log?: Logger;
}

/** How many times the SDK may carry on by itself, which it can only do for
 * tools the back end ran. Ours have no `execute`, so a round of them stops
 * here; a server-side search that needs a second pass does not. */
const MAX_SERVER_STEPS = 4;

export class AiSdkModel implements ChatModel {
  readonly label: string;
  readonly #opts: AiSdkModelOptions;
  readonly #log: Logger;

  constructor(opts: AiSdkModelOptions) {
    this.#opts = opts;
    this.#log = opts.log ?? logger("ai-sdk");
    // Named for how it is reached rather than for the slot it fills: either
    // back end can be the local model or the cloud one here.
    this.label = `ai-sdk:${opts.modelId}`;
  }

  async complete(messages: Message[], tools: ToolSpec[]): Promise<Completion> {
    const declared = toolSet(tools);
    const result = await generateText({
      model: this.#opts.model,
      messages: toModelMessages(messages),
      tools: { ...declared, ...this.#opts.serverTools },
      // Every round that is ours ends here, whatever this says; it is the
      // back end's own tools that may need a second pass.
      stopWhen: stepCountIs(MAX_SERVER_STEPS),
      temperature: this.#opts.temperature,
      ...(this.#opts.maxOutputTokens ? { maxOutputTokens: this.#opts.maxOutputTokens } : {}),
      ...(this.#opts.effort ? { providerOptions: { anthropic: { effort: this.#opts.effort } } } : {}),
      abortSignal: AbortSignal.timeout(this.#opts.timeoutMs),
    });

    return {
      text: stripThinking(result.text),
      toolCalls: result.toolCalls
        // A call the back end ran itself is already answered; handing it to
        // the registry would run a second, different tool of the same name.
        .filter((call) => !call.providerExecuted)
        .map((call) => ({
          id: call.toolCallId,
          name: call.toolName,
          args: asArgs(call.input, call.toolName, this.#log),
        })),
    };
  }

  doctor(): Promise<Check[]> {
    if (this.#opts.backend === "anthropic") {
      return Promise.resolve([
        { name: "cloud escalation", status: "ok", detail: `${this.#opts.modelId} through the AI SDK` },
      ]);
    }
    return localModelCheck({
      baseUrl: this.#opts.baseUrl ?? "",
      model: this.#opts.modelId,
      apiKey: this.#opts.apiKey,
      managed: this.#opts.managed,
    });
  }
}

/**
 * The tools as the SDK takes them. No `execute` on any of them: that is what
 * makes the SDK hand the call back rather than run it, which is the whole
 * arrangement here. The schema goes over as the JSON Schema it already is,
 * because an MCP server's tools arrive that way and never as Zod.
 */
export function toolSet(tools: ToolSpec[]): ToolSet {
  const set: ToolSet = {};
  for (const spec of tools) {
    set[spec.name] = tool({
      description: spec.description,
      inputSchema: jsonSchema(spec.inputSchema),
    });
  }
  return set;
}

/**
 * The neutral shape to the SDK's. Consecutive tool results become one tool
 * message, which is the shape it expects and the shape the Anthropic wire
 * format needs underneath.
 */
export function toModelMessages(messages: Message[]): ModelMessage[] {
  const out: ModelMessage[] = [];
  for (const message of messages) {
    if (message.role === "tool") {
      const part = {
        type: "tool-result" as const,
        toolCallId: message.toolCallId,
        toolName: message.name,
        output: { type: "text" as const, value: message.content },
      };
      const last = out.at(-1);
      if (last?.role === "tool") last.content.push(part);
      else out.push({ role: "tool", content: [part] });
      continue;
    }

    if (message.role === "assistant") {
      const content: Extract<AssistantContent, unknown[]> = [];
      if (message.content) content.push({ type: "text", text: message.content });
      for (const call of message.toolCalls ?? []) {
        content.push({ type: "tool-call", toolCallId: call.id, toolName: call.name, input: call.args });
      }
      // An assistant turn with nothing in it is one the back ends reject.
      if (content.length) out.push({ role: "assistant", content });
      continue;
    }

    out.push({ role: message.role, content: message.content });
  }
  return out;
}

/** A tool call's input, which is an object by the time the SDK has parsed it. */
function asArgs(input: unknown, name: string, log: Logger): Record<string, unknown> {
  if (typeof input === "object" && input !== null && !Array.isArray(input)) {
    return input as Record<string, unknown>;
  }
  if (input !== undefined && input !== null)
    log.warn(`${name} was called with ${typeof input}, not an object`);
  return {};
}

export function createAiSdk(options: AiSdkOptions, context: ProviderContext): AiSdkModel {
  const fromEnv = options.apiKeyEnv ? process.env[options.apiKeyEnv] : undefined;

  if (options.backend === "anthropic") {
    const apiKey = fromEnv ?? context.secrets.anthropicKey;
    // Thrown rather than warned, as the hand-rolled one throws: the assembly
    // decides whether running local only is acceptable, and it can only
    // decide if it is told.
    if (!apiKey) throw new Error(`${options.apiKeyEnv ?? "ANTHROPIC_API_KEY"} is not set`);
    const anthropic = createAnthropic({ apiKey });
    const modelId = options.model || "claude-opus-5";
    return new AiSdkModel({
      backend: "anthropic",
      model: anthropic(modelId),
      modelId,
      temperature: options.temperature,
      maxOutputTokens: options.maxTokens ?? 1024,
      timeoutMs: options.timeoutMs,
      // Its own search, run on its side, which is both better than ours and
      // one fewer hop from the house.
      serverTools: options.webSearch
        ? { web_search: anthropic.tools.webSearch_20260318({ maxUses: 4 }) }
        : {},
      effort: options.effort,
      log: context.log,
    });
  }

  const modelId = options.model || "qwen3-8b-mlx";
  const provider = createOpenAICompatible({
    name: "parlour",
    baseURL: options.baseUrl,
    ...(fromEnv ? { apiKey: fromEnv } : {}),
  });
  return new AiSdkModel({
    backend: "openai-compatible",
    model: provider(modelId),
    modelId,
    temperature: options.temperature,
    ...(options.maxTokens ? { maxOutputTokens: options.maxTokens } : {}),
    timeoutMs: options.timeoutMs,
    baseUrl: options.baseUrl,
    apiKey: fromEnv,
    managed: options.managed,
    log: context.log,
  });
}

export const aiSdkProvider = defineProvider<AiSdkModel>({
  kind: "llm",
  name: "ai-sdk",
  description: "Either back end through Vercel's AI SDK, so one library tracks the APIs",
  schema: AiSdkSchema,
  create: (options, context) => createAiSdk(options as AiSdkOptions, context),
});

registerProvider(aiSdkProvider);
