import { z } from "zod";
import { type Logger, logger } from "../../core/logger.ts";
import type {
  Check,
  DecisionModel,
  DecisionQuestion,
  DecisionResult,
  DecisionState,
} from "../../core/ports.ts";
import { defineProvider, type ProviderContext, registerProvider } from "../../core/providers.ts";

/**
 * TypeSafe Jev: structured decisions for the pre-router triage step. Speaks
 * no prose; the local and cloud ChatModels still write what is said aloud.
 * @see https://docs.typesafe.ai/api
 */
export const JevSchema = z.object({
  model: z.string().default("jev-latest"),
  /** Override for tests or a proxy; production uses api.typesafe.ai. */
  baseUrl: z.string().default("https://api.typesafe.ai"),
  timeoutMs: z.number().int().positive().default(5_000),
});

export type JevOptions = z.infer<typeof JevSchema>;

export interface JevModelOptions extends JevOptions {
  apiKey: string;
  log?: Logger;
  fetch?: typeof fetch;
}

export class JevDecisionModel implements DecisionModel {
  readonly label: string;
  readonly #opts: JevModelOptions;
  readonly #log: Logger;
  readonly #fetch: typeof fetch;

  constructor(opts: JevModelOptions) {
    this.#opts = opts;
    this.#log = opts.log ?? logger("jev");
    this.#fetch = opts.fetch ?? fetch;
    this.label = `decision:${opts.model}`;
  }

  async evaluate(state: DecisionState, questions: Record<string, DecisionQuestion>): Promise<DecisionResult> {
    const url = `${this.#opts.baseUrl.replace(/\/$/, "")}/v1/systemone`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.#opts.timeoutMs);
    let response: Response;
    try {
      response = await this.#fetch(url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.#opts.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ model: this.#opts.model, state, questions }),
        signal: controller.signal,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`Jev request failed: ${message}`, { cause: error });
    } finally {
      clearTimeout(timer);
    }

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      throw new Error(`Jev returned ${response.status}${body ? `: ${body.slice(0, 200)}` : ""}`);
    }

    const payload = (await response.json()) as {
      model?: string;
      answers?: DecisionResult["answers"];
    };
    if (!payload.answers || typeof payload.model !== "string") {
      throw new Error("Jev response was missing model or answers");
    }
    this.#log.debug("evaluated", Object.keys(questions).length, "questions via", payload.model);
    return { model: payload.model, answers: payload.answers };
  }

  async doctor(): Promise<Check[]> {
    return [
      {
        name: "jev",
        status: "ok",
        detail: `${this.#opts.model} (TYPESAFE_API_KEY is set)`,
      },
    ];
  }
}

export function createJev(options: JevOptions, context: ProviderContext): JevDecisionModel {
  const apiKey = context.secrets.typesafeKey;
  if (!apiKey) throw new Error("TYPESAFE_API_KEY is not set");
  return new JevDecisionModel({ ...options, apiKey, log: context.log });
}

export const jevProvider = defineProvider<JevDecisionModel>({
  kind: "decision",
  name: "jev",
  description: "TypeSafe Jev: calibrated decisions for local-vs-cloud triage",
  schema: JevSchema,
  create: (options, context) => createJev(options as JevOptions, context),
});

registerProvider(jevProvider);
