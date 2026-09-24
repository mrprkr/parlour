import { timingSafeEqual } from "node:crypto";
import { readFile } from "node:fs/promises";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { extname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { type WebSocket, WebSocketServer } from "ws";
import { z } from "zod";
import { type Admin, AdminError } from "../core/admin.ts";
import type { Agent } from "../core/agent.ts";
import { decodeToWav, FRAME_MS, FRAME_SAMPLES, FrameCutter, wavToFrames } from "../core/audio.ts";
import type { Config } from "../core/config.ts";
import { logger } from "../core/logger.ts";
import { VoiceSession, type VoiceState } from "../core/session.ts";
import { advertise } from "./discovery.ts";

const log = logger("server");
const WEB_DIR = fileURLToPath(new URL("./web/", import.meta.url));
const MAX_BODY = 8 * 1024 * 1024;
/** A socket frame is 2560 bytes. Anything near this is not audio. */
const MAX_SOCKET_MESSAGE = 256 * 1024;
/** The socket's control messages are a few dozen bytes. */
const MAX_SOCKET_TEXT = 4 * 1024;
/** A client id is a log line and a map key, not an essay. */
const MAX_CLIENT_ID = 64;
/** A room name goes into the system prompt, so it is a room and not a paragraph. */
const MAX_ROOM = 40;

/** The routes that manage the server rather than ask it anything. */
const ADMIN_ROUTES = new Set([
  "GET /admin",
  "POST /admin/pipeline",
  "POST /admin/service",
  "GET /admin/logs",
  "POST /admin/doctor",
  "POST /admin/restart",
]);

/** The routes that reach the agent, and so need the token. Everything else is the page. */
const API_ROUTES = new Set([
  "POST /ask",
  "POST /voice",
  "GET /v1/models",
  "POST /v1/chat/completions",
  ...ADMIN_ROUTES,
]);

const ServiceBody = z.object({ service: z.string(), action: z.string() });

const AskBody = z.object({
  text: z.string().min(1),
  client: z.string().optional(),
  room: z.string().optional(),
});

/** The parts of an OpenAI chat request that matter here. The rest is dropped, on purpose. */
const CompletionsBody = z.object({
  messages: z.array(z.object({ role: z.string(), content: z.unknown() })),
  stream: z.boolean().optional(),
  user: z.string().optional(),
});

export interface ServerDeps {
  config: Config;
  /** PARLOUR_TOKEN. Without it the server answers loopback only. */
  token: string | undefined;
  /** The parts of the assembled agent the network reaches. The microphone is not one of them. */
  agent: Pick<Agent, "router" | "wake" | "stt" | "tts" | "gate" | "status">;
  /** The /admin routes. Null, or `server.admin` off, and they answer 403. */
  admin?: Admin | null;
}

export interface RunningServer {
  close(): Promise<void>;
  /** The port actually bound, which differs from config when that asked for 0. */
  port: number;
  host: string;
}

/**
 * A request the client got wrong, and the status that says so. Anything else
 * that is thrown is the server's fault and the client is told only that.
 */
class RequestError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

/**
 * The agent, as a service on the house network.
 *
 * This machine's own microphone is one client of this and not a privileged
 * one. Everything else in the house reaches the same brain the same way: Home
 * Assistant through the OpenAI-compatible endpoint, so every Voice PE
 * satellite works with no new firmware; phones through the page at /; custom
 * hardware through the socket at /listen, which is the same pipeline the local
 * microphone runs, wake word and all.
 */
export async function startServer(deps: ServerDeps): Promise<RunningServer | null> {
  const { config, token } = deps;
  if (!config.server.enabled) return null;

  // A voice agent on an open port can turn the heating on and read the
  // shopping list. Without a token it answers loopback only.
  const host = token ? config.server.host : "127.0.0.1";
  if (!token && config.server.host !== "127.0.0.1") {
    log.warn("PARLOUR_TOKEN is not set, so the server is bound to loopback and the house cannot reach it");
  }

  const server = createServer((request, response) => {
    handle(request, response, deps, token).catch((error) => {
      if (error instanceof RequestError || error instanceof AdminError) {
        send(response, error.status, { error: error.message });
        return;
      }
      // The stack goes to the log. The client gets nothing that names a
      // file, a URL or a provider.
      log.error(error);
      if (response.headersSent) response.end();
      else send(response, 500, { error: "internal error" });
    });
  });

  const sockets = new WebSocketServer({ noServer: true, maxPayload: MAX_SOCKET_MESSAGE });
  // The ids in use right now, so two satellites that call themselves the same
  // thing at the same time get a conversation and a queue lane each.
  const live = new Set<string>();
  server.on("upgrade", (request, socket, head) => {
    const url = new URL(request.url ?? "/", "http://localhost");
    if (url.pathname !== "/listen" || !local(request, token) || !authorised(request, url, token)) {
      socket.destroy();
      return;
    }
    sockets.handleUpgrade(request, socket, head, (ws) => listen(ws, url, deps, live));
  });

  await new Promise<void>((resolve, reject) => {
    // The usual reason the port is taken is that init installed the login
    // item and it is already up. That deserves a sentence, not a stack.
    const failed = (error: NodeJS.ErrnoException) =>
      reject(
        error.code === "EADDRINUSE"
          ? new Error(
              `port ${config.server.port} is already in use, most likely by the Parlour that runs at login. ` +
                "parlour service status says whether it is, and parlour service uninstall stops it from starting.",
            )
          : error,
      );
    server.once("error", failed);
    server.listen(config.server.port, host, () => {
      server.off("error", failed);
      resolve();
    });
  });
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : config.server.port;
  log.info(`listening on http://${host}:${port}`);

  // Only advertise what the house can actually reach. A loopback-only server
  // that announces itself is an invitation to a satellite that will never
  // connect.
  const announcement =
    host === "127.0.0.1"
      ? null
      : advertise(config, {
          port,
          needsToken: Boolean(token),
          tools: deps.agent.status().tools,
        });

  return {
    port,
    host,
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

  if (!local(request, token)) {
    send(response, 403, { error: "this server answers its own machine only" });
    return;
  }
  allowCors(request, response, token);

  if (request.method === "OPTIONS") {
    response.writeHead(204).end();
    return;
  }

  if (route === "GET /health") {
    // What is in flight as well as what is configured: a satellite that is
    // waiting longer than it should can be told from one that is not.
    send(response, 200, { ok: true, ...deps.agent.status(), ...deps.agent.router.load() });
    return;
  }

  // The page and its files hold nothing secret, and the browser fetches
  // app.js and app.css without a token however the page was opened, so they
  // come before the check. The token is typed into the page; the routes that
  // reach the agent stay behind it.
  if (!API_ROUTES.has(route)) {
    if (request.method === "GET" && deps.config.server.web) return page(url, response);
    return send(response, 404, { error: "no such route" });
  }

  if (!authorised(request, url, token)) {
    send(response, 401, { error: "a bearer token is required" });
    return;
  }

  if (ADMIN_ROUTES.has(route)) return admin(request, response, deps, route, url);

  switch (route) {
    case "POST /ask":
      return ask(request, response, deps);
    case "POST /voice":
      return voice(request, response, deps, url);
    case "GET /v1/models":
      return send(response, 200, {
        object: "list",
        data: [{ id: "parlour", object: "model", created: 0, owned_by: "parlour" }],
      });
    default:
      return completions(request, response, deps);
  }
}

/** The plain endpoint: text in, text out. Automations and scripts use this. */
async function ask(request: IncomingMessage, response: ServerResponse, deps: ServerDeps): Promise<void> {
  const body = await json(request, AskBody);

  const answer = await deps.agent.router.ask(body.text, {
    session: clientId(body.client ?? null, "api"),
    room: roomName(body.room ?? null),
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
  const client = clientId(url.searchParams.get("client"), "phone");
  const room = roomName(url.searchParams.get("room"));

  let heard = "";
  let reply = "";
  let via = "local";
  const session = new VoiceSession({
    ...pipeline(deps, client),
    room,
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

  const speech = await deps.agent.tts.render(reply);
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
  const payload = await json(request, CompletionsBody);
  const last = [...payload.messages].reverse().find((m) => m.role === "user");
  const text =
    typeof last?.content === "string"
      ? last.content
      : Array.isArray(last?.content)
        ? last.content
            .map((part: { text?: unknown }) => (typeof part?.text === "string" ? part.text : ""))
            .join(" ")
        : "";
  if (!text.trim()) return send(response, 400, { error: "no user message" });

  // The caller's own system prompt and tools are ignored on purpose: this
  // agent has its own persona and its own tools, and the point of pointing
  // Home Assistant at it is to get them.
  const answer = await deps.agent.router.ask(text, { session: `ha:${payload.user ?? "default"}` });
  const id = `chatcmpl-${Date.now()}`;
  const created = Math.floor(Date.now() / 1000);

  if (!payload.stream) {
    return send(response, 200, {
      id,
      object: "chat.completion",
      created,
      model: "parlour",
      choices: [{ index: 0, message: { role: "assistant", content: answer.text }, finish_reason: "stop" }],
      usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
    });
  }

  response.writeHead(200, {
    "content-type": "text/event-stream",
    "cache-control": "no-cache",
    connection: "keep-alive",
  });
  const chunk = (delta: Record<string, unknown>, finish: string | null) =>
    response.write(
      `data: ${JSON.stringify({
        id,
        object: "chat.completion.chunk",
        created,
        model: "parlour",
        choices: [{ index: 0, delta, finish_reason: finish }],
      })}\n\n`,
    );
  chunk({ role: "assistant", content: answer.text }, null);
  chunk({}, "stop");
  response.end("data: [DONE]\n\n");
}

/**
 * Managing the server from a client: its status, the pipeline's settings,
 * the model servers and the maintenance commands. What is allowed is decided
 * in `core/admin.ts`; this only moves it on and off the wire.
 */
async function admin(
  request: IncomingMessage,
  response: ServerResponse,
  deps: ServerDeps,
  route: string,
  url: URL,
): Promise<void> {
  const control = deps.config.server.admin ? deps.admin : null;
  if (!control) return send(response, 403, { error: "remote management is switched off on this server" });

  switch (route) {
    case "GET /admin":
      return send(response, 200, await control.status());
    case "POST /admin/pipeline": {
      const patch = await json(request, z.record(z.string(), z.unknown()));
      const apply = url.searchParams.get("apply") !== "false";
      return send(response, 200, await control.setPipeline(patch, { apply }));
    }
    case "POST /admin/service": {
      const body = await json(request, ServiceBody);
      return send(response, 200, await control.service(body.service, body.action));
    }
    case "GET /admin/logs": {
      const lines = Number(url.searchParams.get("lines") ?? 50);
      return send(response, 200, await control.logs(url.searchParams.get("service") ?? "agent", lines));
    }
    case "POST /admin/doctor":
      return send(response, 200, { checks: await control.doctor() });
    default:
      return send(response, 202, control.restart());
  }
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
function listen(socket: WebSocket, url: URL, deps: ServerDeps, live: Set<string>): void {
  const client = clientId(url.searchParams.get("client"), `socket-${Date.now()}`, live);
  const room = roomName(url.searchParams.get("room"));
  const mode = url.searchParams.get("mode") === "push" ? "push" : "wake";

  let speaking = false;
  let pending: Int16Array[] | null = null;
  const cutter = new FrameCutter();

  const tell = (message: Record<string, unknown>) => {
    if (socket.readyState === socket.OPEN) socket.send(JSON.stringify(message));
  };

  const session = new VoiceSession({
    ...pipeline(deps, client),
    room,
    sink: {
      say: async (text, answer) => {
        tell({ type: "reply", text, via: answer.via });
        speaking = true;
        try {
          const wav = await deps.agent.tts.render(text);
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

  // Push mode trusts the client to say when the utterance ends. The
  // microphone's own limit applies here too, so a client that never does is
  // answered at that point rather than buffered for as long as it streams.
  const maxFrames = Math.ceil(deps.config.audio.maxUtteranceMs / FRAME_MS);
  const finish = () => {
    const frames = pending;
    pending = null;
    if (frames) void session.utterance(frames);
  };

  log.info(`${client} connected${room ? ` from the ${room}` : ""} in ${mode} mode`);
  tell({ type: "ready", sampleRate: deps.config.audio.sampleRate, frameSamples: FRAME_SAMPLES, mode });

  socket.on("message", (data: Buffer, isBinary: boolean) => {
    if (!isBinary) {
      if (data.length > MAX_SOCKET_TEXT) return;
      const message = parse(data.toString());
      if (message?.type === "start") pending = [];
      if (message?.type === "cancel") pending = null;
      if (message?.type === "end") finish();
      if (message?.type === "spoke") speaking = false;
      return;
    }

    // Frames arrive at whatever size the client's buffer happens to be, so
    // re-cut them to the 80 ms the wake word insists on.
    for (const frame of cutter.push(data)) {
      if (pending) {
        pending.push(frame);
        if (pending.length >= maxFrames) finish();
      } else if (mode === "wake") {
        void session.push(frame);
      }
    }
  });

  socket.on("close", () => {
    live.delete(client);
    log.info(`${client} disconnected`);
  });
  socket.on("error", (error) => log.warn(`${client}:`, error.message));
}

// --------------------------------------------------------------------- plumbing

/**
 * What every network client's session has in common. Each client gets a wake
 * word detector of its own so two rooms do not share a refractory period,
 * and the gate is the agent's, so a muted house is muted for phones too.
 */
function pipeline(deps: ServerDeps, client: string) {
  const { agent } = deps;
  return {
    audio: deps.config.audio,
    router: agent.router,
    wake: agent.wake.detector(client),
    stt: agent.stt,
    id: client,
    gate: () => agent.gate(),
  };
}

/**
 * A client id is a conversation, a wake word detector and a place in the
 * queue, so it decides what a client can see and how much of the house it can
 * hold up. It comes off the network, so it is cut down to something short and
 * printable first, and two clients claiming one name at the same time are
 * given one each: a satellite that reconnects should pick its conversation
 * back up, but the kitchen and a guest's phone both called "parlour" should
 * not be sharing one.
 */
function clientId(raw: string | null, fallback: string, taken?: Set<string>): string {
  const base =
    (raw ?? "")
      .replace(/[^\w.:-]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, MAX_CLIENT_ID) || fallback;
  if (!taken) return base;
  let id = base;
  for (let n = 2; taken.has(id); n++) id = `${base}~${n}`;
  taken.add(id);
  return id;
}

/** The room goes straight into the system prompt, so it is one line of it and no more. */
function roomName(raw: string | null | undefined): string | undefined {
  return (raw ?? "").replace(/\s+/g, " ").trim().slice(0, MAX_ROOM) || undefined;
}

function authorised(request: IncomingMessage, url: URL, token: string | undefined): boolean {
  if (!token) return true; // Loopback only in this case; see startServer and local.
  const header = request.headers.authorization ?? "";
  const supplied = header.startsWith("Bearer ") ? header.slice(7) : (url.searchParams.get("token") ?? "");
  const a = Buffer.from(supplied);
  const b = Buffer.from(token);
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * Without a token the server trusts the machine it runs on, and the browser
 * on that machine is part of it: a page from anywhere can post to loopback
 * and read the reply, and a name that resolves here is loopback to the
 * browser too. So the request has to be addressed to a loopback name and,
 * when a browser sends it, come from a page a loopback name served. With a
 * token the token decides and none of this applies.
 */
function local(request: IncomingMessage, token: string | undefined): boolean {
  if (token) return true;
  const origin = request.headers.origin;
  return loopback(request.headers.host) && (origin === undefined || loopback(origin));
}

/** `localhost`, 127.0.0.0/8 or ::1, with or without a scheme and a port. */
function loopback(address: string | undefined): boolean {
  if (!address) return false;
  try {
    const { hostname } = new URL(address.includes("://") ? address : `http://${address}`);
    return hostname === "localhost" || hostname === "[::1]" || /^127(\.\d{1,3}){3}$/.test(hostname);
  } catch {
    return false;
  }
}

/**
 * With a token the browser cannot forge the bearer, so any page may ask.
 * Without one only a loopback page reaches this far, and it is named rather
 * than starred so the browser hands the reply to that page alone.
 */
function allowCors(request: IncomingMessage, response: ServerResponse, token: string | undefined): void {
  const origin = token ? "*" : request.headers.origin;
  if (!origin) return; // Not a browser, so nothing to allow.
  response.setHeader("access-control-allow-origin", origin);
  response.setHeader("access-control-allow-headers", "authorization, content-type");
  response.setHeader("access-control-allow-methods", "GET, POST, OPTIONS");
  if (origin !== "*") response.setHeader("vary", "origin");
}

async function page(url: URL, response: ServerResponse): Promise<void> {
  const name = url.pathname === "/" ? "index.html" : url.pathname.slice(1);
  // Nothing outside the web directory, whatever the path claims to be.
  if (name.includes("..") || name.includes("/")) return send(response, 404, { error: "no such file" });
  try {
    const file = await readFile(join(WEB_DIR, name));
    response.writeHead(200, { "content-type": contentType(name) }).end(file);
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

function send(response: ServerResponse, status: number, payload: unknown): void {
  const body = JSON.stringify(payload);
  response.writeHead(status, { "content-type": "application/json" }).end(body);
}

function body(request: IncomingMessage): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    request.on("data", (chunk: Buffer) => {
      size += chunk.length;
      if (size > MAX_BODY) {
        reject(new RequestError(413, "body too large"));
        request.destroy();
        return;
      }
      chunks.push(chunk);
    });
    request.on("end", () => resolve(Buffer.concat(chunks)));
    request.on("error", reject);
  });
}

/**
 * The body, checked against the shape the route takes. It has to say it is
 * JSON: a form can post text/plain anywhere without a preflight, and a form
 * cannot say application/json.
 */
async function json<T>(request: IncomingMessage, schema: z.ZodType<T>): Promise<T> {
  const type = request.headers["content-type"]?.split(";")[0]?.trim().toLowerCase();
  if (type !== "application/json") throw new RequestError(415, "send application/json");

  const raw = (await body(request)).toString("utf8");
  let parsed: unknown;
  try {
    parsed = raw ? JSON.parse(raw) : {};
  } catch {
    throw new RequestError(400, "the body is not JSON");
  }

  const result = schema.safeParse(parsed);
  if (!result.success) {
    const path = result.error.issues[0]?.path.join(".");
    throw new RequestError(400, `the body is not what this route takes${path ? ` (${path})` : ""}`);
  }
  return result.data;
}

function parse(raw: string): { type?: string } | null {
  try {
    return JSON.parse(raw) as { type?: string };
  } catch {
    return null;
  }
}
