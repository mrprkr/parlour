import { createInterface } from "node:readline/promises";
import { Microphone } from "./audio/capture.ts";
import { WakeModels } from "./audio/wake.ts";
import { type Config, loadConfig, type McpServerConfig } from "./config.ts";
import { connectorTools } from "./connectors/index.ts";
import { emit } from "./events.ts";
import { ClaudeModel } from "./llm/anthropic.ts";
import { OpenAiCompatibleModel } from "./llm/openai.ts";
import { Router } from "./llm/router.ts";
import { logger } from "./logger.ts";
import { runSatellite } from "./satellite/index.ts";
import { startServer } from "./server/index.ts";
import { createHomeAssistant, type HomeAssistant } from "./tools/homeassistant.ts";
import { McpTools } from "./tools/mcp.ts";
import { ToolRegistry } from "./tools/registry.ts";
import { Timers } from "./tools/timers.ts";
import { searchTool } from "./tools/websearch.ts";
import { createSpeaker, createSynthesiser, type Speaker, sentences } from "./tts/index.ts";
import { VoiceSession, type VoiceSink, type VoiceState } from "./voice/session.ts";

const log = logger("agent");

async function main(): Promise<void> {
  const { config, secrets } = loadConfig(process.env.AGENT_CONFIG ?? "agent.config.json");

  // A satellite is a microphone and a speaker for the server in the other
  // room: no models, no tools, no keys. Everything below this is the server.
  if (config.role === "satellite") {
    await runSatellite(config, secrets);
    return;
  }

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
  registry.add(...(await connectorTools(config, mcp)));

  const ha = createHomeAssistant(config, secrets.haToken);
  if (ha) registry.add(...ha.tools());
  else log.warn("HA_TOKEN is not set, so the house is out of reach");

  const search = searchTool(config, secrets.braveKey);
  if (search) registry.add(search);

  const speaker = createSpeaker(config);
  const voice = new LocalVoice(speaker);
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
  const status = () => ({ tools: registry.specs().length, cloud: cloud !== null });
  log.info(`${registry.specs().length} tools ready`);
  emit({ type: "ready", ...status() });

  if (process.argv.includes("--text")) {
    await textMode(router);
    await mcp.close();
    return;
  }

  // The wake word models are loaded once and shared: the Mac's microphone and
  // every satellite on the network get their own detector over the same
  // weights.
  const wake = await WakeModels.load(config.wake);
  const muted = async () => {
    if (!ha || !(await ha.isOn(config.muteEntity))) return false;
    emit({ type: "muted" });
    return true;
  };

  const server = await startServer({
    config,
    secrets,
    router,
    wake,
    synth: createSynthesiser(config),
    muted,
    status,
  });

  await micMode({ config, router, wake, voice, muted, ha });
  await server?.close();
  await mcp.close();
}

/** Speaks a reply through this machine, sentence by sentence, interruptibly. */
class LocalVoice implements VoiceSink {
  #controller: AbortController | undefined;
  readonly #speaker: Speaker;

  constructor(speaker: Speaker) {
    this.#speaker = speaker;
  }

  isSpeaking(): boolean {
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

  onState(state: VoiceState, detail?: string): void {
    if (state === "thinking" && detail) emit({ type: "heard", text: detail });
    else emit({ type: "state", value: state });
  }
}

/** The microphone attached to this machine, as one client among several. */
async function micMode(deps: {
  config: Config;
  router: Router;
  wake: WakeModels;
  voice: LocalVoice;
  muted: () => Promise<boolean>;
  ha: HomeAssistant | null;
}): Promise<void> {
  const { config, router, wake, voice, muted } = deps;
  const mic = new Microphone(config.audio.inputDevice, config.audio.sampleRate);
  const abort = new AbortController();
  process.on("SIGINT", () => {
    voice.stop();
    mic.close();
    abort.abort();
  });

  const session = new VoiceSession({
    config,
    router,
    wake: wake.detector("here"),
    sink: voice,
    id: "here",
    muted,
  });

  log.info(`listening for "${config.wake.words.join('", "')}"`);
  for await (const frame of mic.frames(abort.signal)) {
    await session.push(frame);
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
    const answer = await router.ask(line, { session: "terminal" });
    console.log(answer.text);
  }
  rl.close();
}

await main();
