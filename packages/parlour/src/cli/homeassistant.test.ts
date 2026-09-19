import assert from "node:assert/strict";
import { test } from "node:test";
import {
  CANDIDATE_URLS,
  findHomeAssistant,
  looksLikeHomeAssistant,
  mcpServerPresent,
  tokenWorks,
} from "./homeassistant.ts";

/** A network of exactly the URLs given, each with the status it should answer. */
function network(routes: Record<string, number>): typeof fetch {
  return (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    const status = routes[url];
    if (status === undefined) throw new TypeError("fetch failed");
    // The routes that need a token answer 401 without one, as Home Assistant does.
    const authorised = Boolean((init?.headers as Record<string, string> | undefined)?.authorization);
    if (status === 200 && !authorised && url.endsWith("/api/")) return new Response("", { status: 401 });
    return new Response("", { status });
  }) as typeof fetch;
}

test("a Home Assistant is the one that refuses an anonymous request rather than the one that hangs up", async () => {
  const fetchImpl = network({ "http://hass.local:8123/api/": 200 });
  assert.equal(await looksLikeHomeAssistant("http://hass.local:8123", fetchImpl), true);
  // A trailing slash must not become a double one, or nothing ever matches.
  assert.equal(await looksLikeHomeAssistant("http://hass.local:8123/", fetchImpl), true);
  assert.equal(await looksLikeHomeAssistant("http://nothing.local:8123", fetchImpl), false);
});

test("the search takes the first of the usual addresses that answers", async () => {
  const second = CANDIDATE_URLS[1] as string;
  const found = await findHomeAssistant(CANDIDATE_URLS, network({ [`${second}/api/`]: 200 }));
  assert.equal(found, second);
  assert.equal(await findHomeAssistant(CANDIDATE_URLS, network({})), null);
});

test("a token is checked against the address it was given for", async () => {
  const fetchImpl = network({ "http://hass:8123/api/": 200 });
  assert.equal(await tokenWorks("http://hass:8123", "good", fetchImpl), true);
  // Nothing typed is not a token to go and check.
  assert.equal(await tokenWorks("http://hass:8123", "", fetchImpl), false);
  assert.equal(await tokenWorks("http://elsewhere:8123", "good", fetchImpl), false);
});

test("the MCP Server integration is found by its endpoint answering at all", async () => {
  const on = network({ "http://hass:8123/mcp_server/sse": 200 });
  assert.equal(await mcpServerPresent("http://hass:8123", "t", on), true);
  // Installed but not added: the API is up and that one endpoint 404s.
  const off = network({ "http://hass:8123/api/": 200, "http://hass:8123/mcp_server/sse": 404 });
  assert.equal(await mcpServerPresent("http://hass:8123", "t", off), false);
});
