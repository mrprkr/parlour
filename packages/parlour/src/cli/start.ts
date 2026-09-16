import { type Agent, buildAgent } from "../core/agent.ts";
import { loadConfig } from "../core/config.ts";
import { enableEvents } from "../core/events.ts";
import { logger } from "../core/logger.ts";
import { onShutdown } from "../core/process.ts";
import { loadSecrets } from "../core/secrets.ts";
import { LocalVoice, VoiceSession } from "../core/session.ts";
import { type RunningServer, startServer } from "../server/index.ts";
import { runSatellite } from "../server/satellite.ts";
import { type Command, parseCli } from "./args.ts";

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

    const agent = await buildAgent(config, secrets, paths);
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
  for await (const frame of agent.source.frames(abort.signal)) {
    await session.push(frame);
  }
}
