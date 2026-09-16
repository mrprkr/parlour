import { timingSafeEqual } from "node:crypto";
import { readFile } from "node:fs/promises";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { extname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { type WebSocket, WebSocketServer } from "ws";
import { FRAME_SAMPLES, wavToFrames } from "../audio/capture.ts";
import { decodeToWav } from "../audio/decode.ts";
import type { WakeModels } from "../audio/wake.ts";
import type { Config, Secrets } from "../config.ts";
import { advertise } from "../discovery/index.ts";
import type { Router } from "../llm/router.ts";
import { logger } from "../logger.ts";
import type { Synthesiser } from "../tts/index.ts";
import { VoiceSession, type VoiceState } from "../voice/session.ts";

const log = logger("server");
const WEB_DIR = fileURLToPath(new URL("./web/", import.meta.url));
const MAX_BODY = 8 * 1024 * 1024;

export interface ServerDeps {
  config: Config;
  secrets: Secrets;
  router: Router;
  wake: WakeModels;
  synth: Synthesiser;
  muted: () => Promise<boolean>;
  status: () => { tools: number; cloud: boolean };
}

/**
 * The agent, as a service on the house network.
 *
 * The Mac's own microphone is one client of this and not a privileged one.
 * Everything else in the house reaches the same brain the same way: Home
 * Assistant through the OpenAI-compatible endpoint, so every Voice PE
 * satellite works with no new firmware; phones through the page at /; custom
 * hardware through the socket at /listen, which is the same pipeline the local
 * microphone runs, wake word and all.
 */
export async function startServer(deps: ServerDeps): Promise<{ close(): Promise<void> } | null> {
  const { config, secrets } = deps;
  if (!config.server.enabled) return null;

  // A voice agent on an open port can turn the heating on and read the
  // shopping list. Without a token it answers loopback only.
  const token = secrets.agentToken;
  const host = token ? config.server.host : "127.0.0.1";
  if (!token && config.server.host !== "127.0.0.1") {
    log.warn("AGENT_TOKEN is not set, so the server is bound to loopback and the house cannot reach it");
  }

  const server = createServer((request, response) => {
    handle(request, response, deps, token).catch((error) => {
      log.error(error);
      send(response, 500, { error: error instanceof Error ? error.message : String(error) });
    });
  });

  const sockets = new WebSocketServer({ noServer: true });
  server.on("upgrade", (request, socket, head) => {
    const url = new URL(request.url ?? "/", "http://localhost");
    if (url.pathname !== "/listen" || !authorised(request, url, token)) {
      socket.destroy();
      return;
    }
    sockets.handleUpgrade(request, socket, head, (ws) => listen(ws, url, deps));
  });

  await new Promise<void>((resolve) => server.listen(config.server.port, host, resolve));
  log.info(`listening on http://${host}:${config.server.port}`);

  // Only advertise what the house can actually reach. A loopback-only server
  // that announces itself is an invitation to a satellite that will never
  // connect.
  const announcement =
    host === "127.0.0.1"
      ? null
      : advertise(config, {
          port: config.server.port,
          needsToken: Boolean(token),
          tools: deps.status().tools,
        });

  return {
    close: async () => {
      await announcement?.stop();
      await new Promise<void>((resolve) => {
        for (const client of sockets.clients) client.terminate();
        server.close(() => resolve());
      });
    },
  };
}

// ------------------------------------------------------------------- routing

async function handle(
  request: IncomingMessage,
  response: ServerResponse,
  deps: ServerDeps,
  token: string | undefined,
): Promise<void> {
  const url = new URL(request.url ?? "/", "http://localhost");
  const route = `${request.method} ${url.pathname}`;

  if (request.method === "OPTIONS") {
    response.writeHead(204, cors()).end();
    return;
  }

  if (route === "GET /health") {
    send(response, 200, { ok: true, ...deps.status() });
    return;
  }

  if (!authorised(request, url, token)) {
    send(response, 401, { error: "a bearer token is required" });
    return;
  }

  switch (route) {
    case "POST /ask":
      return ask(request, response, deps);
    case "POST /voice":
      return voice(request, response, deps, url);
    case "GET /v1/models":
      return send(response, 200, {
        object: "list",
        data: [{ id: "home-agent", object: "model", created: 0, owned_by: "house" }],
      });
    case "POST /v1/chat/completions":
      return completions(request, response, deps);
    default:
      return deps.config.server.web ? page(url, response) : send(response, 404, { error: "no such route" });
  }
}

/** The plain endpoint: text in, text out. Automations and scripts use this. */
async function ask(request: IncomingMessage, response: ServerResponse, deps: ServerDeps): Promise<void> {
  const body = (await json(request)) as { text?: string; client?: string; room?: string };
  if (!body.text) return send(response, 400, { error: "text is required" });

  const answer = await deps.router.ask(body.text, {
    session: body.client ?? "api",
    room: body.room,
  });
  send(response, 200, { reply: answer.text, via: answer.via });
}

/**
 * Audio in, an answer and its speech back. This is what the phone page posts:
 * one recording, one reply, no streaming and no wake word, because a thumb on
 * a button is a better endpoint detector than any amount of signal processing.
 */
async function voice(
  request: IncomingMessage,
  response: ServerResponse,
  deps: ServerDeps,
  url: URL,
): Promise<void> {
  const audio = await body(request);
  if (!audio.length) return send(response, 400, { error: "no audio" });

  const wav = await decodeToWav(audio, deps.config.audio.sampleRate);
  const client = url.searchParams.get("client") ?? "phone";
  const room = url.searchParams.get("room") ?? undefined;

  let heard = "";
  let reply = "";
  let via = "local";
  const session = new VoiceSession({
    config: deps.config,
    router: deps.router,
    wake: deps.wake.detector(client),
    id: client,
    room,
    muted: deps.muted,
    sink: {
      say: async (text, answer) => {
        reply = text;
        via = answer.via;
      },
      isSpeaking: () => false,
      stop: () => {},
      onState: (state, detail) => {
        if (state === "thinking" && detail) heard = detail;
      },
    },
  });

  const answer = await session.utterance(wavToFrames(wav));
  if (!answer) return send(response, 200, { heard, reply: "", via, audio: null });

  const speech = await deps.synth.render(reply);
  send(response, 200, { heard, reply, via, audio: speech.toString("base64") });
}

/**
 * The OpenAI chat completions shape, which is how Home Assistant reaches the
 * agent: point the OpenAI Conversation integration at this and every Voice PE
 * satellite in the house is talking to it, with Home Assistant still doing the
 * wake word, the speech to text and the speech back.
 */
async function completions(
  request: IncomingMessage,
  response: ServerResponse,
  deps: ServerDeps,
): Promise<void> {
  const payload = (await json(request)) as {
    messages?: { role: string; content?: unknown }[];
    stream?: boolean;
    user?: string;
  };
  const last = [...(payload.messages ?? [])].reverse().find((m) => m.role === "user");
  const text =
    typeof last?.content === "string"
      ? last.content
      : Array.isArray(last?.content)
        ? last.content.map((part: { text?: string }) => part.text ?? "").join(" ")
        : "";
  if (!text.trim()) return send(response, 400, { error: "no user message" });

  // The caller's own system prompt and tools are ignored on purpose: this
  // agent has its own persona and its own tools, and the point of pointing
  // Home Assistant at it is to get them.
  const answer = await deps.router.ask(text, { session: `ha:${payload.user ?? "default"}` });
  const id = `chatcmpl-${Date.now()}`;
  const created = Math.floor(Date.now() / 1000);

  if (!payload.stream) {
    return send(response, 200, {
      id,
      object: "chat.completion",
      created,
      model: "home-agent",
      choices: [{ index: 0, message: { role: "assistant", content: answer.text }, finish_reason: "stop" }],
      usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
    });
  }

  response.writeHead(200, {
    "content-type": "text/event-stream",
    "cache-control": "no-cache",
    connection: "keep-alive",
    ...cors(),
  });
  const chunk = (delta: Record<string, unknown>, finish: string | null) =>
    response.write(
      `data: ${JSON.stringify({
        id,
        object: "chat.completion.chunk",
        created,
        model: "home-agent",
        choices: [{ index: 0, delta, finish_reason: finish }],
      })}\n\n`,
    );
  chunk({ role: "assistant", content: answer.text }, null);
  chunk({}, "stop");
  response.end("data: [DONE]\n\n");
}

// ------------------------------------------------------------------- sockets

/**
 * The socket a satellite holds open: frames up, events and speech down.
 *
 * In wake mode the server runs the same wake word and endpointing the local
 * microphone gets, so a satellite can be as simple as a microphone, a speaker
 * and a network stack. In push mode the client says when the utterance starts
 * and stops, for hardware with a button or its own wake word.
 */
function listen(socket: WebSocket, url: URL, deps: ServerDeps): void {
  const client = url.searchParams.get("client") ?? `socket-${Date.now()}`;
  const room = url.searchParams.get("room") ?? undefined;
  const mode = url.searchParams.get("mode") === "push" ? "push" : "wake";

  let speaking = false;
  let pending: Int16Array[] | null = null;
  let tail: Buffer = Buffer.alloc(0);

  const tell = (message: Record<string, unknown>) => {
    if (socket.readyState === socket.OPEN) socket.send(JSON.stringify(message));
  };

  const session = new VoiceSession({
    config: deps.config,
    router: deps.router,
    wake: deps.wake.detector(client),
    id: client,
    room,
    muted: deps.muted,
    sink: {
      say: async (text, answer) => {
        tell({ type: "reply", text, via: answer.via });
        speaking = true;
        try {
          const wav = await deps.synth.render(text);
          if (socket.readyState === socket.OPEN) socket.send(wav);
        } finally {
          // The client tells us when playback finished; until then assume it
          // is, so its own speaker does not wake it up.
          setTimeout(() => (speaking = false), 250);
        }
      },
      isSpeaking: () => speaking,
      stop: () => tell({ type: "stop" }),
      onState: (state: VoiceState, detail?: string) =>
        tell(detail ? { type: "state", value: state, text: detail } : { type: "state", value: state }),
    },
  });

  log.info(`${client} connected${room ? ` from the ${room}` : ""} in ${mode} mode`);
  tell({ type: "ready", sampleRate: deps.config.audio.sampleRate, frameSamples: FRAME_SAMPLES, mode });

  socket.on("message", (data: Buffer, isBinary: boolean) => {
    if (!isBinary) {
      const message = parse(data.toString());
      if (message?.type === "start") pending = [];
      if (message?.type === "cancel") pending = null;
      if (message?.type === "end" && pending) {
        const frames = pending;
        pending = null;
        void session.utterance(frames);
      }
      if (message?.type === "spoke") speaking = false;
      return;
    }

    // Frames arrive at whatever size the client's buffer happens to be, so
    // re-cut them to the 80 ms the wake word insists on.
    tail = tail.length ? Buffer.concat([tail, data]) : data;
    const bytes = FRAME_SAMPLES * 2;
    while (tail.length >= bytes) {
      const slice = tail.subarray(0, bytes);
      tail = tail.subarray(bytes);
      const frame = new Int16Array(FRAME_SAMPLES);
      for (let i = 0; i < FRAME_SAMPLES; i++) frame[i] = slice.readInt16LE(i * 2);
      if (pending) pending.push(frame);
      else if (mode === "wake") void session.push(frame);
    }
  });

  socket.on("close", () => log.info(`${client} disconnected`));
  socket.on("error", (error) => log.warn(`${client}:`, error.message));
}

// --------------------------------------------------------------------- plumbing

function authorised(request: IncomingMessage, url: URL, token: string | undefined): boolean {
  if (!token) return true; // Loopback only in this case; see startServer.
  const header = request.headers.authorization ?? "";
  const supplied = header.startsWith("Bearer ") ? header.slice(7) : (url.searchParams.get("token") ?? "");
  const a = Buffer.from(supplied);
  const b = Buffer.from(token);
  return a.length === b.length && timingSafeEqual(a, b);
}

async function page(url: URL, response: ServerResponse): Promise<void> {
  const name = url.pathname === "/" ? "index.html" : url.pathname.slice(1);
  // Nothing outside the web directory, whatever the path claims to be.
  if (name.includes("..") || name.includes("/")) return send(response, 404, { error: "no such file" });
  try {
    const file = await readFile(join(WEB_DIR, name));
    response.writeHead(200, { "content-type": contentType(name), ...cors() }).end(file);
  } catch {
    send(response, 404, { error: "no such file" });
  }
}

function contentType(name: string): string {
  return (
    {
      ".html": "text/html; charset=utf-8",
      ".js": "text/javascript; charset=utf-8",
      ".css": "text/css; charset=utf-8",
      ".webmanifest": "application/manifest+json",
      ".png": "image/png",
      ".svg": "image/svg+xml",
    }[extname(name)] ?? "application/octet-stream"
  );
}

function cors(): Record<string, string> {
  return {
    "access-control-allow-origin": "*",
    "access-control-allow-headers": "authorization, content-type",
    "access-control-allow-methods": "GET, POST, OPTIONS",
  };
}

function send(response: ServerResponse, status: number, payload: unknown): void {
  const body = JSON.stringify(payload);
  response.writeHead(status, { "content-type": "application/json", ...cors() }).end(body);
}

function body(request: IncomingMessage): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    request.on("data", (chunk: Buffer) => {
      size += chunk.length;
      if (size > MAX_BODY) {
        reject(new Error("body too large"));
        request.destroy();
        return;
      }
      chunks.push(chunk);
    });
    request.on("end", () => resolve(Buffer.concat(chunks)));
    request.on("error", reject);
  });
}

async function json(request: IncomingMessage): Promise<unknown> {
  const raw = (await body(request)).toString("utf8");
  return raw ? JSON.parse(raw) : {};
}

function parse(raw: string): { type?: string } | null {
  try {
    return JSON.parse(raw) as { type?: string };
  } catch {
    return null;
  }
}
