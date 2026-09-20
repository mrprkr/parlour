import assert from "node:assert/strict";
import { test } from "node:test";
import { childEnvironment, McpServer, McpTools, mcpIntegration } from "./index.ts";

test("the definition is an integration called mcp with no servers by default", () => {
  assert.equal(mcpIntegration.kind, "integration");
  assert.equal(mcpIntegration.name, "mcp");
  assert.deepEqual(mcpIntegration.schema!.parse({}), { servers: {} });
});

test("a stdio server gets empty args and env", () => {
  assert.deepEqual(McpServer.parse({ transport: "stdio", command: "x" }), {
    transport: "stdio",
    command: "x",
    args: [],
    env: {},
  });
});

test("an http server needs a real url", () => {
  assert.throws(() => McpServer.parse({ transport: "http", url: "nope" }));
});

test("a stdio server inherits only what it needs to run, not our secrets", () => {
  const parent = { PATH: "/usr/bin", HOME: "/home/p", HA_TOKEN: "ha", ANTHROPIC_API_KEY: "sk" };
  assert.deepEqual(childEnvironment({}, undefined, parent), { PATH: "/usr/bin", HOME: "/home/p" });
});

test("a stdio server gets the one variable its tokenEnv names, and its own env wins", () => {
  const parent = { PATH: "/usr/bin", HA_TOKEN: "ha", BRAVE_API_KEY: "b" };
  assert.deepEqual(childEnvironment({ PATH: "/opt/bin", EXTRA: "1" }, "BRAVE_API_KEY", parent), {
    PATH: "/opt/bin",
    BRAVE_API_KEY: "b",
    EXTRA: "1",
  });
  // A tokenEnv that is not set is left out rather than passed as "undefined".
  assert.deepEqual(childEnvironment({}, "MISSING", parent), { PATH: "/usr/bin" });
});

test("the doctor names each configured server, and whether it answered", async () => {
  const servers = {
    dead: { transport: "stdio" as const, command: "/nonexistent/parlour-test", args: [], env: {} },
  };
  const mcp = new McpTools();

  // Before anything has connected: configured, not yet reached.
  assert.deepEqual(mcp.checks(servers), [
    { name: "mcp dead", status: "warn", detail: "/nonexistent/parlour-test, not connected" },
  ]);

  // A server that will not start is a failure the doctor can name, and no
  // tools rather than an exception out of the integration.
  assert.deepEqual(await mcp.connect(servers), []);
  const [check] = mcp.checks(servers);
  assert.equal(check?.status, "fail");
  assert.match(check?.detail ?? "", /^\/nonexistent\/parlour-test: /);
});
