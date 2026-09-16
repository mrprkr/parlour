import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { z } from "zod";

/**
 * Configuration is a JSON file plus the environment. Anything secret (tokens,
 * API keys) belongs in the environment, so `agent.config.json` stays readable
 * and, if you want, committable.
 */

const McpServer = z.discriminatedUnion("transport", [
  z.object({
    transport: z.literal("stdio"),
    command: z.string(),
    args: z.array(z.string()).default([]),
    env: z.record(z.string()).default({}),
  }),
  z.object({
    transport: z.literal("http"),
    url: z.string().url(),
    /** Name of the environment variable holding the bearer token, if any. */
    tokenEnv: z.string().optional(),
  }),
]);

export const ConfigSchema = z.object({
  /** What the house calls itself. Used in the persona. */
  name: z.string().default("Assistant"),
  locale: z.string().default("en-GB"),

  audio: z.object({
    /** `ffmpeg -f avfoundation -list_devices true -i ""` lists the indexes. */
    inputDevice: z.string().default(":0"),
    outputDevice: z.string().optional(),
    sampleRate: z.literal(16000).default(16000),
    /** Stop listening after this much silence, in ms. */
    silenceMs: z.number().int().positive().default(800),
    /** Give up on a single utterance after this long, in ms. */
    maxUtteranceMs: z.number().int().positive().default(15000),
    /** Let the wake word interrupt the agent mid-sentence. Needs a microphone
     * that does not hear the speaker, so leave it off with one box in one room. */
    bargeIn: z.boolean().default(false),

    /** RMS below this counts as silence. 0 to 1, tune with `--calibrate`. */
    silenceThreshold: z.number().min(0).max(1).default(0.012),
  }).default({}),

  wake: z.object({
    modelDir: z.string().default("models/openwakeword"),
    /** File names inside `modelDir`, without the .onnx. */
    words: z.array(z.string()).default(["hey_jarvis"]),
    threshold: z.number().min(0).max(1).default(0.5),
    /** Ignore further detections for this long after one fires, in ms. */
    refractoryMs: z.number().int().nonnegative().default(1500),
  }).default({}),

  stt: z.object({
    /** whisper.cpp server, started by scripts/whisper-server.sh. */
    url: z.string().url().default("http://127.0.0.1:8910/inference"),
    language: z.string().default("en"),
    timeoutMs: z.number().int().positive().default(20000),
  }).default({}),

  tts: z.object({
    engine: z.enum(["kokoro", "say"]).default("kokoro"),
    /** Kokoro voice id, or a macOS voice name when engine is "say". */
    voice: z.string().default("bf_emma"),
    speed: z.number().positive().default(1.0),
  }).default({}),

  llm: z.object({
    local: z.object({
      /** LM Studio's OpenAI-compatible server. */
      baseUrl: z.string().url().default("http://127.0.0.1:1234/v1"),
      model: z.string().default("qwen3-8b-mlx"),
      temperature: z.number().min(0).max(2).default(0.3),
      timeoutMs: z.number().int().positive().default(30000),
    }).default({}),
    cloud: z.object({
      enabled: z.boolean().default(true),
      model: z.string().default("claude-opus-5"),
      maxTokens: z.number().int().positive().default(1024),
      /** Escalate automatically when the local model fails or times out. */
      onLocalFailure: z.boolean().default(true),
    }).default({}),
    /** Hard ceiling on tool-call rounds per turn. */
    maxToolRounds: z.number().int().positive().default(6),
  }).default({}),

  homeAssistant: z.object({
    baseUrl: z.string().url().default("http://homeassistant.home:8123"),
    /** HA's MCP Server integration. Enable it in the UI first. */
    useMcp: z.boolean().default(true),
  }).default({}),

  search: z.object({
    /** SearXNG keeps searches in the house. Brave is the hosted fallback. */
    provider: z.enum(["searxng", "brave", "none"]).default("searxng"),
    searxngUrl: z.string().url().default("http://searxng.home:8080"),
    maxResults: z.number().int().positive().default(5),
  }).default({}),

  mcpServers: z.record(McpServer).default({}),

  /**
   * What this machine is. One box in the house runs the models and answers;
   * anything else that has a microphone is a satellite that streams to it.
   */
  role: z.enum(["server", "satellite"]).default("server"),

  /**
   * The agent as a service on the house network, so that the Mac mini's
   * microphone is one client among several rather than the only way in.
   */
  server: z.object({
    enabled: z.boolean().default(true),
    port: z.number().int().positive().default(8765),
    /**
     * Listening beyond loopback requires AGENT_TOKEN to be set. An open
     * endpoint on the house network can turn the heating on, so the default
     * refuses rather than asks.
     */
    host: z.string().default("0.0.0.0"),
    /** Serve the push to talk page at / for phones. */
    web: z.boolean().default(true),
  }).default({}),

  /**
   * Bonjour, so that a satellite or a phone finds the server by looking rather
   * than by being told an address that changes with the router's mood.
   */
  discovery: z.object({
    enabled: z.boolean().default(true),
    /** How it appears when browsing. Empty means the machine's own name. */
    name: z.string().default(""),
  }).default({}),

  /** Only read when role is "satellite". */
  satellite: z.object({
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
  }).default({}),

  /**
   * Remote MCP servers the household has signed in to. Written by
   * `pnpm connectors`, not by hand: the tokens live in the Keychain and only
   * the metadata is here.
   */
  connectorsFile: z.string().default("connectors.json"),

  /** Speak nothing and do nothing while this is true. Toggled by the UI. */
  muteEntity: z.string().default("input_boolean.home_agent_muted"),
});

export type Config = z.infer<typeof ConfigSchema>;
export type McpServerConfig = z.infer<typeof McpServer>;

export interface Secrets {
  haToken: string | undefined;
  anthropicKey: string | undefined;
  braveKey: string | undefined;
  agentToken: string | undefined;
}

export function loadConfig(path = "agent.config.json"): { config: Config; secrets: Secrets } {
  const file = resolve(path);
  const raw: unknown = existsSync(file) ? JSON.parse(readFileSync(file, "utf8")) : {};
  const config = ConfigSchema.parse(raw);
  return {
    config,
    secrets: {
      haToken: process.env.HA_TOKEN,
      anthropicKey: process.env.ANTHROPIC_API_KEY,
      braveKey: process.env.BRAVE_API_KEY,
      /** Required before the server will listen anywhere but loopback. */
      agentToken: process.env.AGENT_TOKEN,
    },
  };
}
