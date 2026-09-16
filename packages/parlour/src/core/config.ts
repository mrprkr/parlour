import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { z } from "zod";
import type { Paths } from "./paths.ts";

/**
 * Configuration is a JSON file plus the environment. Anything secret (tokens,
 * API keys) belongs in `secrets.env`, so `config.json` stays readable and, if
 * you want, committable.
 *
 * Core only knows which provider fills each slot. The rest of a slice (`url`,
 * `voice`, `model`...) passes through untouched and is validated by the
 * provider's own schema when it is created, so a third-party provider can
 * have whatever options it likes without a change here.
 */
export const ProviderSlice = z.object({ provider: z.string() }).passthrough();

function isLocale(tag: string): boolean {
  try {
    return Intl.getCanonicalLocales(tag).length === 1;
  } catch {
    return false;
  }
}

export const ConfigSchema = z.object({
  /** What the house calls itself. Used in the persona. */
  name: z.string().default("Parlour"),
  /**
   * A BCP 47 tag. Sets the date in the prompt and which English the model
   * speaks. Checked here because a tag ICU rejects ("en_GB") would otherwise
   * throw from inside every turn rather than once, with the key named.
   */
  locale: z.string().refine(isLocale, "must be a BCP 47 language tag, such as en-GB").default("en-GB"),

  /**
   * What this machine is. One box in the house runs the models and answers;
   * anything else that has a microphone is a satellite that streams to it.
   */
  role: z.enum(["server", "satellite"]).default("server"),

  audio: z
    .object({
      source: z.string().default("ffmpeg"),
      sink: z.string().default("afplay"),
      /** `ffmpeg -f avfoundation -list_devices true -i ""` lists the indexes. */
      inputDevice: z.string().default(":0"),
      /** Null (the only way JSON can say so) or absent means the system default. */
      outputDevice: z.string().nullish(),
      sampleRate: z.literal(16000).default(16000),
      /** Stop listening after this much silence, in ms. */
      silenceMs: z.number().int().positive().default(800),
      /** Give up on a single utterance after this long, in ms. */
      maxUtteranceMs: z.number().int().positive().default(15000),
      /** RMS below this counts as silence. 0 to 1. */
      silenceThreshold: z.number().min(0).max(1).default(0.012),
      /** Let the wake word interrupt the agent mid-sentence. Needs a microphone
       * that does not hear the speaker, so leave it off with one box in one room. */
      bargeIn: z.boolean().default(false),
    })
    .default({}),

  wake: ProviderSlice.extend({
    provider: z.string().default("openwakeword"),
    /** Model names as the provider knows them, for openWakeWord the file without the .onnx. */
    words: z.array(z.string()).default(["hey_jarvis"]),
    threshold: z.number().min(0).max(1).default(0.5),
    /** Ignore further detections for this long after one fires, in ms. */
    refractoryMs: z.number().int().nonnegative().default(1500),
  }).default({}),

  stt: ProviderSlice.extend({ provider: z.string().default("whisper-cpp") }).default({}),

  tts: ProviderSlice.extend({
    provider: z.string().default("kokoro"),
    /** Used when the provider throws, so a missing model still speaks. Null disables it. */
    fallback: z.string().nullable().default("macos-say"),
    // No `voice` or `speed` here. The whole slice goes to the primary and to the
    // fallback alike, so a default filled in by core would hand a Kokoro voice
    // id to every other engine. Each provider's schema supplies its own.
  }).default({}),

  llm: z
    .object({
      local: ProviderSlice.extend({ provider: z.string().default("openai-compatible") }).default({}),
      cloud: ProviderSlice.extend({
        provider: z.string().default("anthropic"),
        enabled: z.boolean().default(true),
        /** Escalate automatically when the local model fails or times out. */
        onLocalFailure: z.boolean().default(true),
      }).default({}),
      /** Hard ceiling on tool-call rounds per turn. */
      maxToolRounds: z.number().int().positive().default(6),
    })
    .default({}),

  search: ProviderSlice.extend({
    /** "none" leaves the local model without a search tool. */
    provider: z.string().default("searxng"),
    maxResults: z.number().int().positive().default(5),
  }).default({}),

  /**
   * Keyed by integration name, which is also the provider name, so an
   * integration can be any npm package. Each one parses its own slice.
   *
   * Connectors are on by default because `parlour connectors add` writes
   * `connectors.json` and never this file: without the key here, an account
   * the house has signed in to would never reach the model. The integration
   * costs nothing when that file is empty or missing.
   */
  integrations: z.record(z.unknown()).default(() => ({ "home-assistant": {}, connectors: {} })),

  /**
   * The agent as a service on the house network, so that this machine's
   * microphone is one client among several rather than the only way in.
   */
  server: z
    .object({
      enabled: z.boolean().default(true),
      port: z.number().int().positive().default(8765),
      /**
       * Listening beyond loopback requires PARLOUR_TOKEN to be set. An open
       * endpoint on the house network can turn the heating on, so the default
       * refuses rather than asks.
       */
      host: z.string().default("0.0.0.0"),
      /** Serve the push to talk page at / for phones. */
      web: z.boolean().default(true),
    })
    .default({}),

  /**
   * Bonjour, so that a satellite or a phone finds the server by looking rather
   * than by being told an address that changes with the router's mood.
   */
  discovery: z
    .object({
      enabled: z.boolean().default(true),
      /** How it appears when browsing. Empty means the machine's own name. */
      name: z.string().default(""),
    })
    .default({}),

  /** Only read when role is "satellite". */
  satellite: z
    .object({
      /** Empty means find the server with Bonjour. */
      serverUrl: z.string().default(""),
      /** Which room this box is in. The server puts it in the prompt. */
      room: z.string().default(""),
      /**
       * Run the wake word here and stream only what follows it. Costs a copy of
       * the models on the satellite and saves a constant 32 KB/s on the network.
       */
      localWake: z.boolean().default(false),
      /** Backoff ceiling when the server is down, in ms. */
      retryMs: z.number().int().positive().default(15000),
    })
    .default({}),
});

export type Config = z.infer<typeof ConfigSchema>;

export function parseConfig(raw: unknown): Config {
  const result = ConfigSchema.safeParse(raw);
  if (result.success) return result.data;
  // Zod's own message is a JSON blob. One line per problem reads better on a
  // terminal and in the app, and the path is what the person needs to fix it.
  const issues = result.error.issues.map((issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`);
  throw new Error(`Invalid config: ${issues.join("; ")}`);
}

export function loadConfig(paths: Paths): { config: Config; raw: Record<string, unknown>; exists: boolean } {
  if (!existsSync(paths.configFile)) return { config: parseConfig({}), raw: {}, exists: false };
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(paths.configFile, "utf8"));
  } catch (error) {
    // A stray comma is the usual mistake, and JSON.parse's message alone does
    // not say which file has it.
    throw new Error(`${paths.configFile} is not valid JSON: ${(error as Error).message}`);
  }
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    throw new Error(`${paths.configFile} must contain a JSON object`);
  }
  return { config: parseConfig(raw), raw: raw as Record<string, unknown>, exists: true };
}

export function writeConfig(paths: Paths, config: Record<string, unknown>): void {
  mkdirSync(dirname(paths.configFile), { recursive: true });
  writeFileSync(paths.configFile, `${JSON.stringify(config, null, 2)}\n`);
}
