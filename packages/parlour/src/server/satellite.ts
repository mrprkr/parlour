import { hostname } from "node:os";
import WebSocket from "ws";
import "../core/builtins.ts";
import { FRAME_MS } from "../core/audio.ts";
import { type Config, loadConfig, writeConfig } from "../core/config.ts";
import { Endpointer } from "../core/endpoint.ts";
import { emit } from "../core/events.ts";
import { logger } from "../core/logger.ts";
import type { Paths } from "../core/paths.ts";
import type { AudioSink, AudioSource, WakeWordEngine } from "../core/ports.ts";
import { onShutdown } from "../core/process.ts";
import { type ProviderKind, resolveProvider } from "../core/providers.ts";
import type { Secrets } from "../core/secrets.ts";
import { type Found, findServer } from "./discovery.ts";

const log = logger("satellite");

/**
 * A box with a microphone and a speaker, and no opinions.
 *
 * One machine in the house runs the models and holds the tokens; everything
 * else is this. It finds the server with Bonjour once, pins it, streams what
 * it hears, plays back what comes back, and reconnects for as long as it is
 * switched on. No model runs here, so it is happy on a Mac mini too old for
 * anything else, and a second one in another room costs nothing but the
 * hardware.
 *
 * It resolves its own microphone, speaker and wake word rather than taking an
 * `Agent`: building one would create a speech and a language model this box
 * will never use, and fail on the keys it does not have.
 */
export async function runSatellite(config: Config, secrets: Secrets, paths: Paths): Promise<void> {
  const name = config.discovery.name || hostname().replace(/\.local$/, "");
  const room = config.satellite.room;

  // Scoped by the provider's own name, not the specifier from config, so a
  // provider tried from a checkout does not log under its absolute path.
  const resolve = <T>(kind: ProviderKind, provider: string, slice: unknown) =>
    resolveProvider<T>(kind, provider, slice, (definition) => ({
      paths,
      secrets,
      log: logger(definition.name),
      emit,
      config,
    }));
  const mic = await resolve<AudioSource>("audioSource", config.audio.source, config.audio);
  const speaker = await resolve<AudioSink>("audioSink", config.audio.sink, config.audio);

  // Local wake is optional: it saves streaming the room to the server all day,
  // at the cost of keeping the models on this box too.
  let wake: WakeWordEngine | null = null;
  if (config.satellite.localWake) {
    wake = await resolve<WakeWordEngine>("wake", config.wake.provider, config.wake);
    await wake.load();
    log.info(`wake word runs here, listening for "${config.wake.words.join('", "')}"`);
  }

  const abort = new AbortController();
  // Ctrl-C, launchd's SIGTERM and a closed terminal's SIGHUP all end the same
  // way, so the microphone is released whichever of them arrives.
  onShutdown(() => {
    mic.close();
    speaker.stop();
    abort.abort();
  });

  const server = serverLocator(config, paths);
  let delay = 1000;
  while (!abort.signal.aborted) {
    const url = await server.url();
    if (!url) {
      log.warn(`no server found. Looking again in ${Math.round(delay / 1000)}s.`);
      await sleep(delay, abort.signal);
      delay = Math.min(delay * 2, config.satellite.retryMs);
      continue;
    }

    try {
      await session({
        url,
        name,
        room,
        config,
        secrets,
        mic,
        speaker,
        wake,
        abort: abort.signal,
        onOpen: () => server.connected(url),
      });
      delay = 1000; // A clean disconnection is not a reason to back off.
    } catch (error) {
      log.warn(error instanceof Error ? error.message : error);
      await server.failed(url);
      await sleep(delay, abort.signal);
      delay = Math.min(delay * 2, config.satellite.retryMs);
    }
  }
}

export interface ServerLocator {
  /** Where to connect next, or null when there is nothing to connect to yet. */
  url(): Promise<string | null>;
  /** The server at `url` let us in. Pin it if nothing is pinned yet. */
  connected(url: string): void;
  /** Could not reach `url`. Says so if something else is advertising instead. */
  failed(url: string): Promise<void>;
}

/**
 * Which server this box talks to, and so the only one it will hand the token
 * to.
 *
 * Bonjour finds the server but cannot vouch for it: anything on the network
 * can advertise `_parlour._tcp`, and the first answer wins. The token on the
 * connection opens the whole house, so giving it to whoever answered fastest
 * on every reconnect is giving it to a guest's phone or a compromised bulb
 * that happened to be quicker than a restarting server. Instead the satellite
 * discovers only while nothing is pinned, trusts the first server that lets
 * it in, and writes that address into `satellite.serverUrl`, the same key an
 * operator fills in by hand. From then on it connects there and nowhere else.
 *
 * When the pinned server stops answering and something else is advertising,
 * it says so and stays put: a server that genuinely moved is fixed by
 * clearing the key, and one that did not is not worth the token.
 */
export function serverLocator(
  config: Config,
  paths: Paths,
  find: () => Promise<Found | null> = () => findServer(),
): ServerLocator {
  let warnedAbout = "";
  return {
    async url() {
      if (config.satellite.serverUrl) return config.satellite.serverUrl;
      const found = await find();
      if (found) log.info(`found "${found.name}" at ${found.url}`);
      return found?.url ?? null;
    },

    connected(url) {
      if (config.satellite.serverUrl) return;
      config.satellite.serverUrl = url;
      log.info(
        `pinned the server at ${url}. Clear satellite.serverUrl in ${paths.configFile} to look again.`,
      );
      try {
        // Only the one key changes, so read the file back rather than writing
        // the parsed config, which would bake every default into it.
        const { raw } = loadConfig(paths);
        const slice = raw.satellite;
        raw.satellite = { ...(typeof slice === "object" && slice !== null ? slice : {}), serverUrl: url };
        writeConfig(paths, raw);
      } catch (error) {
        // The pin still holds for this run; it only has to be found again
        // after a restart.
        log.warn(
          `could not save the pin to ${paths.configFile}:`,
          error instanceof Error ? error.message : error,
        );
      }
    },

    async failed(url) {
      if (!config.satellite.serverUrl) return;
      const found = await find();
      if (!found || sameServer(found.url, url) || warnedAbout === found.url) return;
      warnedAbout = found.url;
      log.warn(
        `${url} is not answering, but "${found.name}" is advertising at ${found.url}. ` +
          "Not connecting to it: it would be given this house's token. " +
          `If the server really moved, clear satellite.serverUrl in ${paths.configFile}.`,
      );
    },
  };
}

function sameServer(a: string, b: string): boolean {
  try {
    return new URL(a).host === new URL(b).host;
  } catch {
    return a === b;
  }
}

/** One connection, from open to close. Rejects so the caller can back off. */
function session(deps: {
  url: string;
  name: string;
  room: string;
  config: Config;
  secrets: Secrets;
  mic: AudioSource;
  speaker: AudioSink;
  wake: WakeWordEngine | null;
  abort: AbortSignal;
  onOpen?: () => void;
}): Promise<void> {
  const { url, name, room, config, secrets, mic, speaker, wake, abort, onOpen } = deps;
  const socket = new URL(url.replace(/^http/, "ws"));
  socket.pathname = "/listen";
  socket.searchParams.set("client", name);
  if (room) socket.searchParams.set("room", room);
  if (wake) socket.searchParams.set("mode", "push");
  if (secrets.token) socket.searchParams.set("token", secrets.token);

  return new Promise<void>((resolve, reject) => {
    const ws = new WebSocket(socket);
    let pumping = false;
    let playing = false;

    const stop = () => ws.close();
    abort.addEventListener("abort", stop, { once: true });
    const finish = (error?: Error) => {
      abort.removeEventListener("abort", stop);
      if (error) reject(error);
      else resolve();
    };

    ws.on("open", () => {
      log.info(`connected to ${socket.host}${room ? ` as the ${room}` : ""}`);
      onOpen?.();
      emit({ type: "state", value: "idle" });
      pumping = true;
      void pump().catch((error: Error) => {
        ws.close();
        finish(error);
      });
    });

    ws.on("message", (data: Buffer, isBinary: boolean) => {
      if (isBinary) {
        // The server has answered. Stop sending while it plays, or the reply
        // is transcribed as the next question.
        playing = true;
        void speaker
          .play(data)
          .catch((error: unknown) => log.warn("could not play the reply:", error))
          .finally(() => {
            playing = false;
            if (ws.readyState === ws.OPEN) ws.send(JSON.stringify({ type: "spoke" }));
            emit({ type: "state", value: "idle" });
          });
        return;
      }

      const event = parse(data.toString());
      if (event?.type === "state" && typeof event.value === "string") {
        emit({ type: "state", value: event.value as "idle" | "listening" | "thinking" | "speaking" });
        if (event.text) log.info("heard:", event.text);
      }
      if (event?.type === "reply" && typeof event.text === "string") {
        log.info(`reply via ${String(event.via)}:`, event.text);
        emit({ type: "reply", text: event.text, via: event.via === "cloud" ? "cloud" : "local", ms: 0 });
      }
    });

    ws.on("close", () => {
      if (pumping) log.info("disconnected");
      finish();
    });
    ws.on("error", (error: Error) => finish(error));

    /** Microphone to socket, either everything or only what follows the wake word. */
    async function pump(): Promise<void> {
      const detector = wake?.detector(name);
      let endpointer: Endpointer | undefined;

      for await (const frame of mic.frames(abort)) {
        if (ws.readyState !== ws.OPEN) return;
        if (playing) continue;

        if (!detector) {
          ws.send(Buffer.from(frame.buffer, frame.byteOffset, frame.byteLength));
          continue;
        }

        if (!endpointer) {
          if (!(await detector.push(frame))) continue;
          ws.send(JSON.stringify({ type: "start" }));
          endpointer = newEndpointer(config);
        }

        ws.send(Buffer.from(frame.buffer, frame.byteOffset, frame.byteLength));
        const verdict = endpointer.push(frame);
        if (verdict === "listening") continue;

        ws.send(JSON.stringify({ type: verdict === "empty" ? "cancel" : "end" }));
        endpointer = undefined;
        detector.reset();
      }
    }
  });
}

function newEndpointer(config: Config): Endpointer {
  return new Endpointer({
    frameMs: FRAME_MS,
    silenceMs: config.audio.silenceMs,
    maxUtteranceMs: config.audio.maxUtteranceMs,
    silenceThreshold: config.audio.silenceThreshold,
    leadingSilenceMs: 2500,
  });
}

function parse(raw: string): Record<string, unknown> | null {
  try {
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, ms);
    signal.addEventListener(
      "abort",
      () => {
        clearTimeout(timer);
        resolve();
      },
      { once: true },
    );
  });
}
