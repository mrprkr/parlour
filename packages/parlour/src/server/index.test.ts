import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { request as httpRequest, type IncomingHttpHeaders } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { type TestContext, test } from "node:test";
import { fileURLToPath } from "node:url";
import WebSocket from "ws";
import { Admin } from "../core/admin.ts";
import { type Config, parseConfig } from "../core/config.ts";
import { resolvePaths } from "../core/paths.ts";
import { ToolRegistry } from "../core/registry.ts";
import { Router } from "../core/router.ts";
import type { Completion } from "../core/types.ts";
import {
  FakeChatModel,
  FakeServiceManager,
  FakeSpeechToText,
  FakeTextToSpeech,
  FakeWakeWordEngine,
} from "../testing/index.ts";
import { type ServerDeps, startServer } from "./index.ts";

const say = (text: string): Completion => ({ text, toolCalls: [] });

/** The slice of an Agent the server needs, over fakes, with the fakes reachable. */
function fakeAgent(replies = ["hello"]) {
  const router = new Router({
    name: "Test",
    local: new FakeChatModel(replies.map(say)),
    cloud: null,
    registry: new ToolRegistry(),
    maxToolRounds: 3,
    onLocalFailure: false,
  });
  return {
    router,
    wake: new FakeWakeWordEngine(),
    stt: new FakeSpeechToText("hi"),
    tts: new FakeTextToSpeech(),
    gate: async () => false,
    status: () => ({ tools: 2, cloud: false }),
  } satisfies ServerDeps["agent"];
}

function testConfig(host: string): Config {
  const base = parseConfig({ server: { host }, discovery: { enabled: false } });
  // Port 0 asks the OS for a free one. The schema refuses it from a file,
  // where it would be a mistake, so it is set after parsing.
  return { ...base, server: { ...base.server, port: 0 } };
}

interface ServeOptions {
  token?: string;
  host?: string;
  agent?: ServerDeps["agent"];
  admin?: Admin | null;
  /** `server.admin` in config. */
  adminEnabled?: boolean;
}

/** Starts a server for one test and closes it when the test ends. */
async function serve(t: TestContext, options: ServeOptions = {}) {
  const config = testConfig(options.host ?? "127.0.0.1");
  const server = await startServer({
    config: { ...config, server: { ...config.server, admin: options.adminEnabled ?? true } },
    token: options.token,
    agent: options.agent ?? fakeAgent(),
    admin: options.admin,
  });
  assert.ok(server, "the server should start when server.enabled is true");
  t.after(() => server.close());
  return { ...server, url: `http://127.0.0.1:${server.port}` };
}

function post(url: string, body: unknown, token?: string): Promise<Response> {
  return fetch(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });
}

interface Raw {
  status: number;
  headers: IncomingHttpHeaders;
  body: string;
}

/** A request with the headers a browser sets and fetch will not let a test set, Host and Origin among them. */
function raw(
  url: string,
  options: { method?: string; headers?: Record<string, string>; body?: string } = {},
): Promise<Raw> {
  return new Promise((resolve, reject) => {
    const request = httpRequest(
      url,
      { method: options.method ?? "GET", headers: options.headers },
      (response) => {
        const chunks: Buffer[] = [];
        response.on("data", (chunk: Buffer) => chunks.push(chunk));
        response.on("end", () =>
          resolve({
            status: response.statusCode ?? 0,
            headers: response.headers,
            body: Buffer.concat(chunks).toString(),
          }),
        );
      },
    );
    request.on("error", reject);
    request.end(options.body);
  });
}

/** Opens a socket and reports whether the server let it, closing it either way. */
async function opens(t: TestContext, url: string, headers: Record<string, string> = {}): Promise<boolean> {
  const socket = new WebSocket(url, { headers });
  t.after(() => socket.close());
  return new Promise<boolean>((resolve) => {
    socket.once("open", () => resolve(true));
    socket.once("error", () => resolve(false));
    socket.once("close", () => resolve(false));
  });
}

/** Polls rather than sleeps, so a passing test is as quick as the work it waits for. */
async function until(check: () => boolean, what: string): Promise<void> {
  for (let i = 0; i < 500; i++) {
    if (check()) return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error(`timed out waiting for ${what}`);
}

/** A frame as the socket carries it: little-endian 16 bit samples. */
function frameBytes(value: number): Buffer {
  const frame = new Int16Array(1280).fill(value);
  return Buffer.from(frame.buffer, frame.byteOffset, frame.byteLength);
}

test("startServer returns null when the server is disabled", async () => {
  const config = parseConfig({ server: { enabled: false } });
  assert.equal(await startServer({ config, token: undefined, agent: fakeAgent() }), null);
});

test("without a token the server binds to loopback", async (t) => {
  const server = await serve(t, { host: "0.0.0.0" });
  assert.equal(server.host, "127.0.0.1");
  assert.ok(server.port > 0);
  const health = await fetch(`${server.url}/health`);
  assert.equal(health.status, 200);
  assert.deepEqual(await health.json(), { ok: true, tools: 2, cloud: false, running: 0, waiting: 0 });
});

test("a port already in use is one sentence naming the service, not a stack", async (t) => {
  const first = await serve(t);
  const base = testConfig("127.0.0.1");
  const config = { ...base, server: { ...base.server, port: first.port } };
  await assert.rejects(
    startServer({ config, token: undefined, agent: fakeAgent() }),
    new RegExp(`port ${first.port} is already in use.*parlour service status`),
  );
});

test("/health needs no token; /ask needs one", async (t) => {
  const server = await serve(t, { token: "secret" });
  assert.equal((await fetch(`${server.url}/health`)).status, 200);

  const anonymous = await post(`${server.url}/ask`, { text: "hi" });
  assert.equal(anonymous.status, 401);
  const wrong = await post(`${server.url}/ask`, { text: "hi" }, "nope");
  assert.equal(wrong.status, 401);

  const bearer = await post(`${server.url}/ask`, { text: "hi" }, "secret");
  assert.equal(bearer.status, 200);
  // Phones and sockets cannot always set a header, so the query string works too.
  const query = await post(`${server.url}/ask?token=secret`, { text: "hi" });
  assert.equal(query.status, 200);
});

test("/ask returns the router's answer with via", async (t) => {
  const server = await serve(t);
  const response = await post(`${server.url}/ask`, { text: "hi", client: "test" });
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { reply: "hello", via: "local" });

  const empty = await post(`${server.url}/ask`, {});
  assert.equal(empty.status, 400);
});

test("/v1/chat/completions returns an OpenAI shaped reply and model parlour", async (t) => {
  const server = await serve(t);
  const response = await post(`${server.url}/v1/chat/completions`, {
    messages: [
      { role: "system", content: "ignored on purpose" },
      { role: "user", content: "hi" },
    ],
  });
  assert.equal(response.status, 200);
  const body = (await response.json()) as {
    object: string;
    model: string;
    choices: { message: { role: string; content: string }; finish_reason: string }[];
  };
  assert.equal(body.object, "chat.completion");
  assert.equal(body.model, "parlour");
  assert.deepEqual(body.choices[0]?.message, { role: "assistant", content: "hello" });
  assert.equal(body.choices[0]?.finish_reason, "stop");
});

test("/v1/chat/completions streams as server-sent events when asked", async (t) => {
  const server = await serve(t);
  const response = await post(`${server.url}/v1/chat/completions`, {
    messages: [{ role: "user", content: [{ type: "text", text: "hi" }] }],
    stream: true,
  });
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /text\/event-stream/);
  const text = await response.text();
  assert.match(text, /"model":"parlour"/);
  assert.match(text, /"content":"hello"/);
  assert.ok(text.trimEnd().endsWith("data: [DONE]"));
});

test("/v1/models lists parlour", async (t) => {
  const server = await serve(t);
  const response = await fetch(`${server.url}/v1/models`);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    object: "list",
    data: [{ id: "parlour", object: "model", created: 0, owned_by: "parlour" }],
  });
});

test("the phone page is served at / and nothing outside the web directory is", async (t) => {
  const server = await serve(t);
  const page = await fetch(`${server.url}/`);
  assert.equal(page.status, 200);
  assert.match(page.headers.get("content-type") ?? "", /text\/html/);
  assert.equal((await fetch(`${server.url}/../package.json`)).status, 404);
  assert.equal((await fetch(`${server.url}/nope.html`)).status, 404);
});

test("the phone page and its files need no token, since the browser fetches them without one", async (t) => {
  const server = await serve(t, { token: "secret" });
  // The token is typed into the page's settings, so the page has to load first.
  for (const path of ["/", "/app.js", "/app.css", "/manifest.webmanifest"]) {
    assert.equal((await fetch(`${server.url}${path}`)).status, 200, path);
  }
  // What reaches the agent still needs it.
  assert.equal((await post(`${server.url}/ask`, { text: "hi" })).status, 401);
  assert.equal((await fetch(`${server.url}/v1/models`)).status, 401);
  assert.equal((await fetch(`${server.url}/nope.html`)).status, 404);
});

test("building twice ships one copy of the phone page, not a copy nested inside the last one", (t) => {
  // `cp -R src/server/web dist/server/web` copies *into* the directory once it
  // exists, so a second build used to leave dist/server/web/web/ in the
  // published tarball. The copy step is run as written, twice, so the guard
  // is against the command text and not a paraphrase of it.
  const pkg = JSON.parse(readFileSync(fileURLToPath(new URL("../../package.json", import.meta.url)), "utf8"));
  const steps = (pkg.scripts.build as string)
    .split(" && ")
    .filter((step) => !/^(pnpm clean|tsc)\b/.test(step));
  assert.ok(
    steps.some((step) => step.startsWith("cp ")),
    "the build copies the web directory",
  );

  const root = mkdtempSync(join(tmpdir(), "parlour-build-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  // The package sits beside packages/laya, whose project the build ships too.
  const dir = join(root, "parlour");
  mkdirSync(join(root, "laya"), { recursive: true });
  for (const file of ["pyproject.toml", "uv.lock", "mcp_server.py"])
    writeFileSync(join(root, "laya", file), "");
  mkdirSync(join(dir, "src/server/web"), { recursive: true });
  writeFileSync(join(dir, "src/server/web/index.html"), "<!doctype html>");
  // The Python workers are copied by the same step, so they have to be there too.
  mkdirSync(join(dir, "src/providers/decision"), { recursive: true });
  writeFileSync(join(dir, "src/providers/decision/laya-worker.py"), "");
  mkdirSync(join(dir, "src/providers/stt"), { recursive: true });
  writeFileSync(join(dir, "src/providers/stt/parakeet-worker.py"), "");
  // tsc has already written dist/server/ by the time the copy runs.
  mkdirSync(join(dir, "dist/server"), { recursive: true });

  for (let build = 1; build <= 2; build++) {
    execFileSync("sh", ["-c", steps.join(" && ")], { cwd: dir, stdio: "pipe" });
    assert.ok(existsSync(join(dir, "dist/server/web/index.html")), `build ${build} has the page`);
    assert.ok(!existsSync(join(dir, "dist/server/web/web")), `build ${build} has no nested copy`);
  }
});

test("without a token, a page from elsewhere in this machine's browser cannot reach the agent", async (t) => {
  const server = await serve(t);
  const body = JSON.stringify({ text: "unlock the front door" });
  const json = { "content-type": "application/json" };

  // A form post: no preflight, and any content type a form can send.
  const form = await raw(`${server.url}/ask`, {
    method: "POST",
    headers: { origin: "https://evil.example", "content-type": "text/plain" },
    body,
  });
  assert.equal(form.status, 403);
  assert.equal(form.headers["access-control-allow-origin"], undefined);

  // DNS rebinding: a name that resolves here, so the page and the server share an origin.
  const rebound = await raw(`${server.url}/ask`, {
    method: "POST",
    headers: { host: "evil.example", ...json },
    body,
  });
  assert.equal(rebound.status, 403);

  // A form cannot say it is JSON, so what a form can say is refused even from here.
  const plain = await raw(`${server.url}/ask`, {
    method: "POST",
    headers: { "content-type": "text/plain" },
    body,
  });
  assert.equal(plain.status, 415);

  // A page loopback served is this machine, and gets its own origin back rather than a star.
  const own = await raw(`${server.url}/ask`, {
    method: "POST",
    headers: { origin: "http://localhost:5173", ...json },
    body,
  });
  assert.equal(own.status, 200);
  assert.equal(own.headers["access-control-allow-origin"], "http://localhost:5173");

  // Nothing to allow when no browser is asking.
  assert.equal((await raw(`${server.url}/health`)).headers["access-control-allow-origin"], undefined);
});

test("without a token, /listen refuses a socket a page from elsewhere opened", async (t) => {
  const server = await serve(t);
  const url = `ws://127.0.0.1:${server.port}/listen?mode=push`;
  assert.equal(await opens(t, url, { origin: "https://evil.example" }), false);
  assert.equal(await opens(t, url, { host: "evil.example" }), false);
  assert.equal(await opens(t, url), true);
});

test("a body the route does not take is a 400, and a failure inside is a 500 that says nothing more", async (t) => {
  const failing = {
    ...fakeAgent(),
    router: { ask: async () => Promise.reject(new Error("/Users/someone/secret")) },
  };
  const server = await serve(t, { agent: failing as unknown as ServerDeps["agent"] });
  const json = { "content-type": "application/json" };

  const messages = await post(`${server.url}/v1/chat/completions`, { messages: 5 });
  assert.equal(messages.status, 400);
  assert.deepEqual(await messages.json(), { error: "the body is not what this route takes (messages)" });

  const text = await post(`${server.url}/ask`, { text: { nested: true } });
  assert.equal(text.status, 400);

  const notJson = await raw(`${server.url}/ask`, { method: "POST", headers: json, body: "not json" });
  assert.equal(notJson.status, 400);
  assert.deepEqual(JSON.parse(notJson.body), { error: "the body is not JSON" });

  const broken = await post(`${server.url}/ask`, { text: "hi" });
  assert.equal(broken.status, 500);
  assert.deepEqual(await broken.json(), { error: "internal error" });
});

test("/listen in push mode transcribes the frames and sends the reply as text then audio", async (t) => {
  const agent = fakeAgent();
  const server = await serve(t, { token: "secret", agent });
  const socket = new WebSocket(`ws://127.0.0.1:${server.port}/listen?client=test&mode=push&token=secret`);
  t.after(() => socket.close());

  const messages: Record<string, unknown>[] = [];
  const audio: Buffer[] = [];
  socket.on("message", (data: Buffer, isBinary: boolean) => {
    if (isBinary) audio.push(data);
    else messages.push(JSON.parse(data.toString()) as Record<string, unknown>);
  });
  await new Promise<void>((resolve, reject) => {
    socket.once("open", resolve);
    socket.once("error", reject);
  });

  await until(() => messages.length > 0, "the ready message");
  assert.deepEqual(messages[0], { type: "ready", sampleRate: 16000, frameSamples: 1280, mode: "push" });

  socket.send(JSON.stringify({ type: "start" }));
  socket.send(frameBytes(3000));
  socket.send(frameBytes(3000));
  socket.send(JSON.stringify({ type: "end" }));
  await until(() => messages.some((m) => m.type === "state" && m.value === "idle"), "idle again");

  assert.equal(agent.stt.heard.length, 1);
  assert.deepEqual(agent.tts.rendered, ["hello"]);
  assert.equal(audio.length, 1);
  assert.equal(audio[0]?.toString(), "hello");
  // The text goes first so a client can show it while the audio is still rendering.
  assert.deepEqual(messages, [
    { type: "ready", sampleRate: 16000, frameSamples: 1280, mode: "push" },
    { type: "state", value: "thinking" },
    { type: "state", value: "thinking", text: "hi" },
    { type: "state", value: "speaking" },
    { type: "reply", text: "hello", via: "local" },
    { type: "state", value: "idle" },
  ]);
});

test("/listen refuses a socket without the token", async (t) => {
  const server = await serve(t, { token: "secret" });
  const socket = new WebSocket(`ws://127.0.0.1:${server.port}/listen?client=test`);
  let opened = false;
  socket.once("open", () => {
    opened = true;
  });
  await new Promise<void>((resolve) => {
    socket.once("error", () => resolve());
    socket.once("close", () => resolve());
  });
  assert.equal(opened, false);
});

test("/listen in push mode answers an utterance the client never ends once it reaches the limit", async (t) => {
  const agent = fakeAgent();
  const server = await serve(t, { agent });
  const socket = new WebSocket(`ws://127.0.0.1:${server.port}/listen?client=test&mode=push`);
  t.after(() => socket.close());
  const messages: Record<string, unknown>[] = [];
  socket.on("message", (data: Buffer, isBinary: boolean) => {
    if (!isBinary) messages.push(JSON.parse(data.toString()) as Record<string, unknown>);
  });
  await new Promise<void>((resolve, reject) => {
    socket.once("open", resolve);
    socket.once("error", reject);
  });
  await until(() => messages.length > 0, "the ready message");

  // maxUtteranceMs of 80 ms frames, and no end message.
  socket.send(JSON.stringify({ type: "start" }));
  for (let i = 0; i < Math.ceil(15000 / 80); i++) socket.send(frameBytes(3000));
  await until(() => messages.some((m) => m.type === "state" && m.value === "idle"), "idle again");
  assert.equal(agent.stt.heard.length, 1);
  assert.deepEqual(agent.tts.rendered, ["hello"]);
});

test("/listen closes a socket that sends a message too large to be audio", async (t) => {
  const server = await serve(t);
  const socket = new WebSocket(`ws://127.0.0.1:${server.port}/listen?client=test&mode=push`);
  t.after(() => socket.close());
  await new Promise<void>((resolve, reject) => {
    socket.once("open", resolve);
    socket.once("error", reject);
  });
  const closed = new Promise<number>((resolve) => socket.once("close", (code) => resolve(code)));
  socket.send(Buffer.alloc(300 * 1024));
  // 1009 is "message too big", from ws's own maxPayload.
  assert.equal(await closed, 1009);
});

test("two satellites that claim the same name do not end up in one conversation", async (t) => {
  const model = new FakeChatModel([say("one"), say("two")]);
  const agent: ServerDeps["agent"] = {
    ...fakeAgent(),
    router: new Router({
      name: "Test",
      local: model,
      cloud: null,
      registry: new ToolRegistry(),
      maxToolRounds: 3,
      onLocalFailure: false,
    }),
  };
  const server = await serve(t, { agent });

  /** A socket in push mode, and the messages it has been sent. */
  const connect = async (query: string) => {
    const socket = new WebSocket(`ws://127.0.0.1:${server.port}/listen?${query}`);
    t.after(() => socket.close());
    const messages: Record<string, unknown>[] = [];
    socket.on("message", (data: Buffer, isBinary: boolean) => {
      if (!isBinary) messages.push(JSON.parse(data.toString()) as Record<string, unknown>);
    });
    await new Promise<void>((resolve, reject) => {
      socket.once("open", resolve);
      socket.once("error", reject);
    });
    await until(() => messages.length > 0, "the ready message");
    return { socket, messages };
  };
  const speak = async (client: { socket: WebSocket; messages: Record<string, unknown>[] }) => {
    client.socket.send(JSON.stringify({ type: "start" }));
    client.socket.send(frameBytes(3000));
    client.socket.send(JSON.stringify({ type: "end" }));
    await until(() => client.messages.some((m) => m.type === "state" && m.value === "idle"), "idle again");
  };

  // Both call themselves the kitchen, which is what a satellite copied from
  // another satellite does.
  const first = await connect("client=kitchen&mode=push");
  const second = await connect("client=kitchen&mode=push");
  await speak(first);
  await speak(second);

  const turns = (index: number) =>
    (model.calls[index]?.messages ?? [])
      .filter((message) => message.role !== "system")
      .map((message) => (message as { content: string }).content);
  assert.deepEqual(turns(0), ["hi"]);
  // The second satellite starts from nothing rather than from the first one's turn.
  assert.deepEqual(turns(1), ["hi"]);
  assert.deepEqual(
    second.messages.filter((m) => m.type === "reply"),
    [{ type: "reply", text: "two", via: "local" }],
  );
});

/** An admin over a scratch home and a fake service manager, restarting nothing. */
function fakeAdmin(t: TestContext) {
  const dir = mkdtempSync(join(tmpdir(), "parlour-server-admin-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const manager = new FakeServiceManager();
  const restarts: number[] = [];
  const admin = new Admin({
    config: parseConfig({}),
    paths: resolvePaths({ HOME: dir, PARLOUR_HOME: dir }, "darwin"),
    manager,
    specs: [],
    companions: null,
    doctor: async () => [{ name: "wake", status: "ok", detail: "fine" }],
    restartSelf: () => restarts.push(Date.now()),
  });
  return { admin, manager, restarts };
}

test("the admin routes need the token, like everything else that reaches the agent", async (t) => {
  const { admin } = fakeAdmin(t);
  const { url } = await serve(t, { token: "secret", admin });
  assert.equal((await fetch(`${url}/admin`)).status, 401);
  const status = await fetch(`${url}/admin`, { headers: { authorization: "Bearer secret" } });
  assert.equal(status.status, 200);
  const body = (await status.json()) as { pipeline: { triage: string }; services: { name: string }[] };
  assert.equal(body.pipeline.triage, "auto");
  assert.deepEqual(
    body.services.map((service) => service.name),
    ["llm", "whisper"],
  );
});

test("an admin refusal reaches the client with its own status and sentence", async (t) => {
  const { admin } = fakeAdmin(t);
  const { url } = await serve(t, { token: "secret", admin });
  const unknown = await post(`${url}/admin/service`, { service: "agent", action: "stop" }, "secret");
  assert.equal(unknown.status, 404);
  assert.match(((await unknown.json()) as { error: string }).error, /no service called agent/);

  const bounds = await post(`${url}/admin/pipeline`, { concurrency: 99 }, "secret");
  assert.equal(bounds.status, 400);
  assert.match(((await bounds.json()) as { error: string }).error, /concurrency/);
});

test("a pipeline change is saved over the network, and the agent is told to restart", async (t) => {
  const { admin, restarts } = fakeAdmin(t);
  const { url } = await serve(t, { token: "secret", admin });
  const saved = await post(`${url}/admin/pipeline`, { maxTasks: 2 }, "secret");
  assert.equal(saved.status, 200);
  const body = (await saved.json()) as { pipeline: { maxTasks: number }; restart: string };
  assert.equal(body.pipeline.maxTasks, 2);
  assert.equal(body.restart, "scheduled");
  await new Promise((resolve) => setTimeout(resolve, 600));
  assert.equal(restarts.length, 1);
});

test("the maintenance commands answer over the network", async (t) => {
  const { admin } = fakeAdmin(t);
  const { url } = await serve(t, { token: "secret", admin });
  const doctor = await post(`${url}/admin/doctor`, {}, "secret");
  assert.deepEqual(
    ((await doctor.json()) as { checks: { name: string }[] }).checks.map((c) => c.name),
    ["wake"],
  );
  const logs = await fetch(`${url}/admin/logs?service=agent&lines=5`, {
    headers: { authorization: "Bearer secret" },
  });
  assert.equal(logs.status, 200);
  assert.equal(((await logs.json()) as { service: string }).service, "agent");
  const restart = await post(`${url}/admin/restart`, {}, "secret");
  assert.equal(restart.status, 202);
});

test("with server.admin off, or no admin at all, the routes are refused", async (t) => {
  const { admin } = fakeAdmin(t);
  const off = await serve(t, { token: "secret", admin, adminEnabled: false });
  const refused = await fetch(`${off.url}/admin`, { headers: { authorization: "Bearer secret" } });
  assert.equal(refused.status, 403);
  const none = await serve(t, { token: "secret" });
  assert.equal(
    (await fetch(`${none.url}/admin`, { headers: { authorization: "Bearer secret" } })).status,
    403,
  );
});
