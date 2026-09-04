import { createInterface } from "node:readline/promises";
import { loadConfig, type McpServerConfig } from "./config.ts";
import { logger } from "./logger.ts";
import { FRAME_SAMPLES, Microphone, toWav } from "./audio/capture.ts";
import { Endpointer } from "./audio/endpoint.ts";
import { WakeWord } from "./audio/wake.ts";
import { isNoise, transcribe } from "./stt/whisper.ts";
import { createSpeaker, sentences, type Speaker } from "./tts/index.ts";
import { OpenAiCompatibleModel } from "./llm/openai.ts";
import { ClaudeModel } from "./llm/anthropic.ts";
import { Router } from "./llm/router.ts";
import { ToolRegistry } from "./tools/registry.ts";
import { McpTools } from "./tools/mcp.ts";
import { createHomeAssistant } from "./tools/homeassistant.ts";
import { searchTool } from "./tools/websearch.ts";
import { Timers } from "./tools/timers.ts";

const log = logger("agent");
const FRAME_MS = (FRAME_SAMPLES / 16000) * 1000;

async function main(): Promise<void> {
  const { config, secrets } = loadConfig(process.env.AGENT_CONFIG ?? "agent.config.json");

  const registry = new ToolRegistry();
  const mcp = new McpTools();

  // Home Assistant's own MCP server is just another entry, but it is the one
  // that matters, so it is wired up from homeAssistant rather than by hand.
  const servers: Record<string, McpServerConfig> = { ...config.mcpServers };
  if (config.homeAssistant.useMcp && secrets.haToken) {
    servers.house = {
      transport: "http",
      url: `${config.homeAssistant.baseUrl}/mcp_server/sse`,
      tokenEnv: "HA_TOKEN",
    };
  }
  registry.add(...(await mcp.connect(servers)));

  const ha = createHomeAssistant(config, secrets.haToken);
  if (ha) registry.add(...ha.tools());
  else log.warn("HA_TOKEN is not set, so the house is out of reach");

  const search = searchTool(config, secrets.braveKey);
  if (search) registry.add(search);

  const speaker = createSpeaker(config);
  const voice = new Voice(speaker);
  registry.add(...new Timers((text) => void voice.say(text)).tools());

  const local = new OpenAiCompatibleModel(config.llm.local);
  const cloud =
    config.llm.cloud.enabled && secrets.anthropicKey
      ? new ClaudeModel({
          apiKey: secrets.anthropicKey,
          model: config.llm.cloud.model,
          maxTokens: config.llm.cloud.maxTokens,
          webSearch: true,
        })
      : null;
  if (!cloud) log.warn("no cloud model: ANTHROPIC_API_KEY unset or cloud disabled");

  const router = new Router(config, local, cloud, registry);
  log.info(`${registry.specs().length} tools ready`);

  const done = process.argv.includes("--text")
    ? textMode(router)
    : voiceMode({ config, router, voice, ha });

  await done;
  await mcp.close();
}

/** Speaks a reply sentence by sentence, and can be cut off mid-flow. */
class Voice {
  #controller: AbortController | undefined;

  readonly #speaker: Speaker;

  constructor(speaker: Speaker) {
    this.#speaker = speaker;
  }

  get speaking(): boolean {
    return this.#controller !== undefined;
  }

  async say(text: string): Promise<void> {
    this.stop();
    const controller = new AbortController();
    this.#controller = controller;
    try {
      for (const sentence of sentences(text)) {
        if (controller.signal.aborted) break;
        await this.#speaker.say(sentence, controller.signal);
      }
    } finally {
      if (this.#controller === controller) this.#controller = undefined;
    }
  }

  stop(): void {
    this.#controller?.abort();
    this.#controller = undefined;
    this.#speaker.stop();
  }
}

type State = "idle" | "listening" | "thinking";

async function voiceMode(deps: {
  config: ReturnType<typeof loadConfig>["config"];
  router: Router;
  voice: Voice;
  ha: ReturnType<typeof createHomeAssistant>;
}): Promise<void> {
  const { config, router, voice, ha } = deps;
  const wake = await WakeWord.load(config.wake);
  const mic = new Microphone(config.audio.inputDevice, config.audio.sampleRate);
  const abort = new AbortController();
  process.on("SIGINT", () => {
    voice.stop();
    mic.close();
    abort.abort();
  });

  let state: State = "idle";
  let endpointer: Endpointer | undefined;

  log.info(`listening for "${config.wake.words.join('", "')}"`);

  for await (const frame of mic.frames(abort.signal)) {
    if (state === "thinking") continue;

    // While the agent is talking, its own voice is in the microphone. Unless
    // there is a separate mic, the only safe thing is to stop listening.
    if (voice.speaking && !config.audio.bargeIn) {
      wake.reset();
      continue;
    }

    if (state === "idle") {
      if (!(await wake.push(frame))) continue;
      if (ha && (await ha.isOn(config.muteEntity))) {
        log.info("muted, ignoring");
        continue;
      }
      voice.stop();
      state = "listening";
      endpointer = new Endpointer({
        frameMs: FRAME_MS,
        silenceMs: config.audio.silenceMs,
        maxUtteranceMs: config.audio.maxUtteranceMs,
        silenceThreshold: config.audio.silenceThreshold,
        leadingSilenceMs: 2500,
      });
      continue;
    }

    const verdict = endpointer!.push(frame);
    if (verdict === "listening") continue;

    const frames = endpointer!.frames;
    endpointer = undefined;
    if (verdict === "empty") {
      state = "idle";
      wake.reset();
      continue;
    }

    state = "thinking";
    // Deliberately not awaited: the microphone must keep draining, or ffmpeg
    // backs up and the next utterance arrives seconds late.
    void handle(frames)
      .catch((error) => log.error(error))
      .finally(() => {
        wake.reset();
        state = "idle";
      });
  }

  async function handle(frames: Int16Array[]): Promise<void> {
    const started = Date.now();
    const text = await transcribe(toWav(frames, config.audio.sampleRate), config);
    if (!text || isNoise(text)) {
      log.info("nothing said");
      return;
    }
    log.info("heard:", text);
    const reply = await router.ask(text);
    log.info(`replied in ${Date.now() - started}ms:`, reply);
    await voice.say(reply);
  }
}

/** Everything but the microphone, for testing over SSH. */
async function textMode(router: Router): Promise<void> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  for (;;) {
    const line = (await rl.question("> ")).trim();
    if (!line) continue;
    if (line === "/quit") break;
    if (line === "/reset") {
      router.reset();
      continue;
    }
    console.log(await router.ask(line));
  }
  rl.close();
}

await main();
