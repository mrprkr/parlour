import assert from "node:assert/strict";
import { test } from "node:test";
import type { AgentEvent } from "../../core/events.ts";
import { resolvePaths } from "../../core/paths.ts";
import type { ProviderContext } from "../../core/providers.ts";
import type { Secrets } from "../../core/secrets.ts";
import { createHomeAssistant, homeAssistant } from "./index.ts";

const silent = { debug() {}, info() {}, warn() {}, error() {} };

const ctxWith = (secrets: Secrets, emit: (event: AgentEvent) => void = () => {}): ProviderContext => ({
  paths: resolvePaths({ HOME: "/nowhere" }, "darwin"),
  secrets,
  log: silent,
  emit,
  config: {},
});

const fetchNever: typeof fetch = async () => {
  throw new Error("fetch must not be called");
};

const entity = (state: string): typeof fetch => {
  return async () => new Response(JSON.stringify({ state, attributes: {} }));
};

test("gate is off when muteEntity is empty", async () => {
  const i = await createHomeAssistant({ muteEntity: "" }, ctxWith({ haToken: "t" }), fetchNever);
  assert.equal(await i.gate!(), false);
});

test("gate reads the entity and emits muted", async () => {
  const events: AgentEvent[] = [];
  const i = await createHomeAssistant(
    { muteEntity: "input_boolean.m" },
    ctxWith({ haToken: "t" }, (e) => events.push(e)),
    entity("on"),
  );
  assert.equal(await i.gate!(), true);
  assert.deepEqual(
    events.map((e) => e.type),
    ["muted"],
  );
});

test("gate is off when the entity is off, and says nothing", async () => {
  const events: AgentEvent[] = [];
  const i = await createHomeAssistant(
    { muteEntity: "input_boolean.m" },
    ctxWith({ haToken: "t" }, (e) => events.push(e)),
    entity("off"),
  );
  assert.equal(await i.gate!(), false);
  assert.deepEqual(events, []);
});

test("gate fails open when the house is unreachable", async () => {
  const unreachable: typeof fetch = async () => {
    throw new Error("ECONNREFUSED");
  };
  const i = await createHomeAssistant(
    { muteEntity: "input_boolean.m" },
    ctxWith({ haToken: "t" }),
    unreachable,
  );
  assert.equal(await i.gate!(), false);
});

test("gate is off without a token", async () => {
  const i = await createHomeAssistant({ muteEntity: "input_boolean.m" }, ctxWith({}), fetchNever);
  assert.equal(await i.gate!(), false);
});

test("without a token there are no tools and no throw", async () => {
  const i = await createHomeAssistant({}, ctxWith({}), fetchNever);
  assert.deepEqual(await i.tools(), []);
});

test("rest tools are named ha_get_state and ha_call_service", async () => {
  const i = await createHomeAssistant({ rest: true, mcp: false }, ctxWith({ haToken: "t" }), fetchNever);
  assert.deepEqual(
    (await i.tools()).map((tool) => tool.name),
    ["ha_get_state", "ha_call_service"],
  );
});

test("ha_get_state reads the entity with the token", async () => {
  const calls: { url: string; auth: string | undefined }[] = [];
  const seen: typeof fetch = async (input, init) => {
    const headers = new Headers(init?.headers);
    calls.push({ url: String(input), auth: headers.get("authorization") ?? undefined });
    return new Response(JSON.stringify({ state: "on", attributes: { friendly_name: "Kitchen" } }));
  };
  const i = await createHomeAssistant(
    { url: "http://h:8123", rest: true, mcp: false },
    ctxWith({ haToken: "t" }),
    seen,
  );
  const tool = (await i.tools()).find((t) => t.name === "ha_get_state");
  assert.equal(await tool!.run({ entity_id: "light.kitchen" }), "Kitchen is on");
  assert.deepEqual(calls, [{ url: "http://h:8123/api/states/light.kitchen", auth: "Bearer t" }]);
});

test("promptContext says the house is reachable through tools", async () => {
  const i = await createHomeAssistant({}, ctxWith({ haToken: "t" }), fetchNever);
  assert.equal(i.promptContext!().length, 1);
  assert.match(i.promptContext!()[0]!, /tools/);
});

test("doctor fails on a missing token without touching the network", async () => {
  const i = await createHomeAssistant({}, ctxWith({}), fetchNever);
  const checks = await i.doctor!();
  assert.equal(checks.length, 1);
  assert.equal(checks[0]!.status, "fail");
  assert.match(checks[0]!.detail, /HA_TOKEN/);
});

test("doctor checks the API and the MCP endpoint", async () => {
  const urls: string[] = [];
  const ok: typeof fetch = async (input) => {
    urls.push(String(input));
    return new Response("{}");
  };
  const i = await createHomeAssistant({ url: "http://h:8123", mcp: true }, ctxWith({ haToken: "t" }), ok);
  const checks = await i.doctor!();
  assert.deepEqual(
    checks.map((c) => c.status),
    ["ok", "ok", "ok"],
  );
  assert.deepEqual(urls, ["http://h:8123/api/", "http://h:8123/mcp_server/sse"]);
});

test("doctor skips the MCP check when mcp is off", async () => {
  const ok: typeof fetch = async () => new Response("{}");
  const i = await createHomeAssistant({ mcp: false }, ctxWith({ haToken: "t" }), ok);
  assert.deepEqual(
    (await i.doctor!()).map((c) => c.status),
    ["ok", "ok"],
  );
});

test("the definition registers as an integration with defaults", () => {
  assert.equal(homeAssistant.kind, "integration");
  assert.equal(homeAssistant.name, "home-assistant");
  assert.deepEqual(homeAssistant.schema!.parse({}), {
    url: "http://homeassistant.local:8123",
    mcp: true,
    rest: true,
    muteEntity: "",
  });
});
