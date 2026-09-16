import assert from "node:assert/strict";
import { test } from "node:test";
import { McpServer, mcpIntegration } from "./index.ts";

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
