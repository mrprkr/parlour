import { setTimeout as delay } from "node:timers/promises";
import { type Agent, buildAgent } from "../core/agent.ts";
import { type Companions, startCompanions } from "../core/companions.ts";
import { loadConfig } from "../core/config.ts";
import { enableEvents } from "../core/events.ts";
import { logger } from "../core/logger.ts";
import type { AudioSource } from "../core/ports.ts";
import { onShutdown } from "../core/process.ts";
import { sandboxed } from "../core/sandbox.ts";
import { loadSecrets } from "../core/secrets.ts";
import { AGENT_LABEL, serviceSpecs } from "../core/services.ts";
import { LocalVoice, VoiceSession } from "../core/session.ts";
import { type RunningServer, startServer } from "../server/index.ts";
import { runSatellite } from "../server/satellite.ts";
import { type Command, parseCli } from "./args.ts";
import { parlourBin } from "./service.ts";

const USAGE = ["parlour start [--events]   --events prints one JSON line per state change, for the app"];

const log = logger("agent");

/**
 * The real thing. What runs depends on `config.role`: a satellite is a
 * microphone and a speaker for the server in the other room, and needs no
 * models, no tools and no keys. Everything else is the server, with this
 * machine's own microphone as one client of it among several.
 */
export const command: Command = {
  name: "start",
  summary: "Run the server or the satellite, per config.role.",
  usage: USAGE,

  async run({ paths, argv }) {
    const { values } = parseCli(argv, { events: { type: "boolean" } });
    if (values.events) enableEvents();
    const { config } = loadConfig(paths);
    const secrets = loadSecrets(paths);

    if (config.role === "satellite") {
      await runSatellite(config, secrets, paths);
      return;
    }

    // Inside the App Store sandbox there is no launchd keeping whisper and the
    // local model warm, so they start here, before the agent that talks to
    // them, and stop when it does.
    let companions: Companions | null = null;
    if (sandboxed()) {
      const specs = (await serviceSpecs(config, paths, parlourBin())).filter(
        (spec) => spec.label !== AGENT_LABEL,
      );
      companions = startCompanions(specs, { log });
    }

    const agent = await buildAgent(config, secrets, paths).catch((error) => {
      companions?.stop();
      throw error;
    });
    // The server is started inside the try so a port already taken still
    // closes the agent, whose connectors would otherwise keep the process
    // alive after the error has been printed.
    let server: RunningServer | null = null;
    try {
      server = await startServer({ config, token: secrets.token, agent });
      await micMode(agent);
    } finally {
      await server?.close();
      await agent.close();
      companions?.stop();
    }
  },
};

/** The microphone attached to this machine, until Ctrl-C or launchd says stop. */
async function micMode(agent: Agent): Promise<void> {
  const { config } = agent;
  const abort = new AbortController();
  // Stop talking and stop listening; the loop below ends when the source
  // does, and the caller closes the rest. SIGTERM and SIGHUP take the same
  // path as Ctrl-C, or launchd's stop would leave ffmpeg holding the microphone.
  onShutdown(() => {
    agent.speaker.stop();
    abort.abort();
  });

  const session = new VoiceSession({
    audio: config.audio,
    router: agent.router,
    wake: agent.wake.detector("local"),
    stt: agent.stt,
    sink: new LocalVoice(agent.speaker),
    id: "local",
    gate: () => agent.gate(),
  });

  log.info(`listening for "${config.wake.words.join('", "')}"`);
  await keepListening(
    agent.source,
    (frame) => session.push(frame),
    abort.signal,
    (wait) =>
      log.error(
        `the microphone (audio.inputDevice ${config.audio.inputDevice}) stopped; the server carries on, ` +
          `and it is tried again in ${Math.round(wait / 1000)}s. parlour doctor names the devices there are.`,
      ),
  );
}

const RETRY_MS = [1_000, 5_000, 30_000, 60_000];
/** A microphone that ran this long was working, so the next failure starts the backoff again. */
const HEALTHY_MS = 60_000;

/**
 * Reads the microphone until `signal`, opening it again whenever it ends. A
 * microphone is one client of the server among several, and a device that
 * was unplugged or renumbered should not take the phone page, the iOS app
 * and every satellite down with it.
 */
export async function keepListening(
  source: AudioSource,
  push: (frame: Int16Array) => Promise<void>,
  signal: AbortSignal,
  stopped: (retryInMs: number) => void,
  retryMs: readonly number[] = RETRY_MS,
): Promise<void> {
  let failures = 0;
  while (!signal.aborted) {
    const opened = Date.now();
    try {
      for await (const frame of source.frames(signal)) await push(frame);
    } catch (error) {
      log.debug("microphone failed", error);
    }
    if (signal.aborted) return;
    if (Date.now() - opened >= HEALTHY_MS) failures = 0;
    const wait = retryMs[Math.min(failures, retryMs.length - 1)] ?? 0;
    failures += 1;
    stopped(wait);
    await delay(wait, undefined, { signal }).catch(() => {});
  }
}
