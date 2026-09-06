import { hostname } from "node:os";
import WebSocket from "ws";
import type { Config, Secrets } from "../config.ts";
import { FRAME_SAMPLES, Microphone } from "../audio/capture.ts";
import { Endpointer } from "../audio/endpoint.ts";
import { WakeModels } from "../audio/wake.ts";
import { playWav } from "../tts/play.ts";
import { findServer } from "../discovery/index.ts";
import { emit } from "../events.ts";
import { logger } from "../logger.ts";

const log = logger("satellite");
const FRAME_MS = (FRAME_SAMPLES / 16000) * 1000;

/**
 * A box with a microphone and a speaker, and no opinions.
 *
 * One machine in the house runs the models and holds the tokens; everything
 * else is this. It finds the server with Bonjour, streams what it hears, plays
 * back what comes back, and reconnects for as long as it is switched on. No
 * model runs here, so it is happy on a Mac mini too old for anything else, and
 * a second one in another room costs nothing but the hardware.
 */
export async function runSatellite(config: Config, secrets: Secrets): Promise<void> {
  const name = config.discovery.name || hostname().replace(/\.local$/, "");
  const room = config.satellite.room;

  // Local wake is optional: it saves streaming the room to the server all day,
  // at the cost of keeping the models on this box too.
  const wake = config.satellite.localWake ? await WakeModels.load(config.wake) : null;
  if (wake) log.info(`wake word runs here, listening for "${config.wake.words.join('", "')}"`);

  const mic = new Microphone(config.audio.inputDevice, config.audio.sampleRate);
  const abort = new AbortController();
  process.on("SIGINT", () => {
    mic.close();
    abort.abort();
  });

  let delay = 1000;
  while (!abort.signal.aborted) {
    const url = await serverUrl(config);
    if (!url) {
      log.warn(`no server found. Looking again in ${Math.round(delay / 1000)}s.`);
      await sleep(delay, abort.signal);
      delay = Math.min(delay * 2, config.satellite.retryMs);
      continue;
    }

    try {
      await session({ url, name, room, config, secrets, mic, wake, abort: abort.signal });
      delay = 1000; // A clean disconnection is not a reason to back off.
    } catch (error) {
      log.warn(error instanceof Error ? error.message : error);
      await sleep(delay, abort.signal);
      delay = Math.min(delay * 2, config.satellite.retryMs);
    }
  }
}

async function serverUrl(config: Config): Promise<string | null> {
  if (config.satellite.serverUrl) return config.satellite.serverUrl;
  const found = await findServer();
  if (found) log.info(`found "${found.name}" at ${found.url}`);
  return found?.url ?? null;
}

/** One connection, from open to close. Rejects so the caller can back off. */
function session(deps: {
  url: string;
  name: string;
  room: string;
  config: Config;
  secrets: Secrets;
  mic: Microphone;
  wake: WakeModels | null;
  abort: AbortSignal;
}): Promise<void> {
  const { url, name, room, config, secrets, mic, wake, abort } = deps;
  const socket = new URL(url.replace(/^http/, "ws"));
  socket.pathname = "/listen";
  socket.searchParams.set("client", name);
  if (room) socket.searchParams.set("room", room);
  if (wake) socket.searchParams.set("mode", "push");
  if (secrets.agentToken) socket.searchParams.set("token", secrets.agentToken);

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
        void playWav(data)
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
    signal.addEventListener("abort", () => {
      clearTimeout(timer);
      resolve();
    }, { once: true });
  });
}
