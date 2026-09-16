import assert from "node:assert/strict";
import { type TestContext, test } from "node:test";
import WebSocket from "ws";
import { type Config, parseConfig } from "../core/config.ts";
import { ToolRegistry } from "../core/registry.ts";
import { Router } from "../core/router.ts";
import type { Completion } from "../core/types.ts";
import { FakeChatModel, FakeSpeechToText, FakeTextToSpeech, FakeWakeWordEngine } from "../testing/index.ts";
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
}

/** Starts a server for one test and closes it when the test ends. */
async function serve(t: TestContext, options: ServeOptions = {}) {
  const server = await startServer({
    config: testConfig(options.host ?? "127.0.0.1"),
    token: options.token,
    agent: options.agent ?? fakeAgent(),
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
  assert.deepEqual(await health.json(), { ok: true, tools: 2, cloud: false });
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
