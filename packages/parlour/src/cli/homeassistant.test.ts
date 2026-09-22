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
    if (status === 200 && !authorised && url.endsWith("/api/")) {
      // Home Assistant's 401 response includes specific headers and body.
      return new Response(JSON.stringify({ message: "Invalid authentication" }), {
        status: 401,
        headers: { "content-type": "application/json", "server": "Python/3.12 aiohttp/3.9.1" },
      });
    }
    // Authenticated requests get the API running message.
    if (status === 200 && authorised && url.endsWith("/api/")) {
      return new Response(JSON.stringify({ message: "API running." }), {
        status: 200,
        headers: { "content-type": "application/json", "server": "Python/3.12 aiohttp/3.9.1" },
      });
    }
    // Other endpoints (like MCP) just return the status with Home Assistant headers.
    return new Response("", {
      status,
      headers: { "server": "Python/3.12 aiohttp/3.9.1" },
    });
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

test("a rogue endpoint without Home Assistant characteristics is rejected", async () => {
  // A rogue server that returns 401 but without Home Assistant's headers or body structure.
  const rogue: typeof fetch = async () =>
    new Response("Unauthorized", { status: 401, headers: { "content-type": "text/plain" } });
  assert.equal(await looksLikeHomeAssistant("http://rogue:8123", rogue), false);

  // A rogue server with the right status but wrong Server header.
  const wrongServer: typeof fetch = async () =>
    new Response(JSON.stringify({ message: "Invalid authentication" }), {
      status: 401,
      headers: { "content-type": "application/json", "server": "nginx/1.18.0" },
    });
  assert.equal(await looksLikeHomeAssistant("http://rogue:8123", wrongServer), false);

  // A rogue server with the right header but wrong body structure.
  const wrongBody: typeof fetch = async () =>
    new Response("Unauthorized", {
      status: 401,
      headers: { "content-type": "text/plain", "server": "Python/3.12 aiohttp/3.9.1" },
    });
  assert.equal(await looksLikeHomeAssistant("http://rogue:8123", wrongBody), false);

  // Verify that tokenWorks is never called for a rogue endpoint in the flow.
  let tokenSent = false;
  const rogueWithTokenCapture: typeof fetch = async (input, init) => {
    const headers = init?.headers as Record<string, string> | undefined;
    if (headers?.authorization) tokenSent = true;
    return new Response("Unauthorized", { status: 401, headers: { "content-type": "text/plain" } });
  };
  // looksLikeHomeAssistant should reject it before tokenWorks is ever called.
  assert.equal(await looksLikeHomeAssistant("http://rogue:8123", rogueWithTokenCapture), false);
  assert.equal(tokenSent, false, "Token should never be sent to unverified endpoint");
});

test("rogue endpoint returning generic 200 is rejected without Home Assistant body", async () => {
  // A rogue server that returns 200 but without the expected "API running." message.
  const rogue200: typeof fetch = async () =>
    new Response("OK", { status: 200, headers: { "content-type": "text/plain" } });
  assert.equal(await looksLikeHomeAssistant("http://rogue:8123", rogue200), false);

  // A rogue server with 200 and Python server header but wrong body.
  const wrongBody200: typeof fetch = async () =>
    new Response("Welcome", {
      status: 200,
      headers: { "content-type": "text/plain", "server": "Python/3.12 aiohttp/3.9.1" },
    });
  assert.equal(await looksLikeHomeAssistant("http://rogue:8123", wrongBody200), false);
});

test("rogue endpoint with missing Server header is rejected", async () => {
  // Even with correct body structure, missing Server header should fail.
  const noServerHeader: typeof fetch = async () =>
    new Response(JSON.stringify({ message: "Invalid authentication" }), {
      status: 401,
      headers: { "content-type": "application/json" },
    });
  assert.equal(await looksLikeHomeAssistant("http://rogue:8123", noServerHeader), false);
});

test("rogue endpoint with non-Python Server header is rejected", async () => {
  // Server headers that don't contain "python" should be rejected.
  const apacheServer: typeof fetch = async () =>
    new Response(JSON.stringify({ message: "Invalid authentication" }), {
      status: 401,
      headers: { "content-type": "application/json", "server": "Apache/2.4.41" },
    });
  assert.equal(await looksLikeHomeAssistant("http://rogue:8123", apacheServer), false);

  const nodeServer: typeof fetch = async () =>
    new Response(JSON.stringify({ message: "Invalid authentication" }), {
      status: 401,
      headers: { "content-type": "application/json", "server": "Node.js/20.0.0" },
    });
  assert.equal(await looksLikeHomeAssistant("http://rogue:8123", nodeServer), false);
});

test("rogue endpoint with malformed JSON body is rejected", async () => {
  // Non-JSON response should be rejected.
  const malformedJson: typeof fetch = async () =>
    new Response("{ this is not valid json", {
      status: 401,
      headers: { "content-type": "application/json", "server": "Python/3.12 aiohttp/3.9.1" },
    });
  assert.equal(await looksLikeHomeAssistant("http://rogue:8123", malformedJson), false);
});

test("rogue endpoint with JSON but missing message field is rejected", async () => {
  // JSON without the "message" field should be rejected.
  const noMessageField: typeof fetch = async () =>
    new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "content-type": "application/json", "server": "Python/3.12 aiohttp/3.9.1" },
    });
  assert.equal(await looksLikeHomeAssistant("http://rogue:8123", noMessageField), false);
});

test("rogue endpoint with message field but wrong content is rejected", async () => {
  // Message field exists but doesn't mention "auth".
  const wrongMessage: typeof fetch = async () =>
    new Response(JSON.stringify({ message: "Access denied" }), {
      status: 401,
      headers: { "content-type": "application/json", "server": "Python/3.12 aiohttp/3.9.1" },
    });
  assert.equal(await looksLikeHomeAssistant("http://rogue:8123", wrongMessage), false);
});

test("discovery rejects all rogue candidates and returns null", async () => {
  // Simulate a network where all candidates are rogue endpoints.
  const rogueNetwork: typeof fetch = async () =>
    new Response("Unauthorized", { status: 401, headers: { "content-type": "text/plain" } });

  const found = await findHomeAssistant(CANDIDATE_URLS, rogueNetwork);
  assert.equal(found, null, "Discovery should return null when all candidates are rogue");
});

test("discovery skips rogue endpoints and finds legitimate Home Assistant", async () => {
  // First candidate is rogue, second is legitimate.
  let callCount = 0;
  const mixedNetwork: typeof fetch = async (input: string | URL | Request) => {
    callCount++;
    const url = String(input);
    // First candidate (homeassistant.local) is rogue.
    if (url.includes("homeassistant.local")) {
      return new Response("Unauthorized", { status: 401, headers: { "content-type": "text/plain" } });
    }
    // Second candidate (homeassistant) is legitimate.
    if (url.includes("homeassistant:8123") && !url.includes(".local")) {
      return new Response(JSON.stringify({ message: "Invalid authentication" }), {
        status: 401,
        headers: { "content-type": "application/json", "server": "Python/3.12 aiohttp/3.9.1" },
      });
    }
    throw new TypeError("fetch failed");
  };

  const found = await findHomeAssistant(CANDIDATE_URLS, mixedNetwork);
  assert.equal(found, CANDIDATE_URLS[1], "Should find the legitimate endpoint");
  assert.ok(callCount >= 2, "Should have tried multiple candidates");
});

test("token is never sent to unverified endpoint in discovery flow", async () => {
  // Track whether any authorization header was sent during discovery.
  let authHeaderSent = false;
  const spyNetwork: typeof fetch = async (input: string | URL | Request, init?: RequestInit) => {
    const headers = init?.headers as Record<string, string> | undefined;
    if (headers?.authorization) {
      authHeaderSent = true;
    }
    // Return a rogue response.
    return new Response("Unauthorized", { status: 401, headers: { "content-type": "text/plain" } });
  };

  await findHomeAssistant(CANDIDATE_URLS, spyNetwork);
  assert.equal(authHeaderSent, false, "No authorization header should be sent during discovery");
});

test("plaintext HTTP candidates do not bypass verification", async () => {
  // Verify that plaintext HTTP URLs still require full verification.
  const plaintextRogue: typeof fetch = async () =>
    new Response("OK", { status: 200, headers: { "content-type": "text/plain" } });

  for (const candidate of CANDIDATE_URLS) {
    assert.ok(candidate.startsWith("http://"), "Candidate should be plaintext HTTP");
    assert.equal(
      await looksLikeHomeAssistant(candidate, plaintextRogue),
      false,
      `Plaintext HTTP candidate ${candidate} should still be verified`,
    );
  }
});

test("status codes other than 200 and 401 are rejected", async () => {
  // Test various HTTP status codes that should be rejected.
  const statusCodes = [403, 404, 500, 502, 503];

  for (const status of statusCodes) {
    const statusNetwork: typeof fetch = async () =>
      new Response(JSON.stringify({ message: "Invalid authentication" }), {
        status,
        headers: { "content-type": "application/json", "server": "Python/3.12 aiohttp/3.9.1" },
      });

    assert.equal(
      await looksLikeHomeAssistant("http://test:8123", statusNetwork),
      false,
      `Status ${status} should be rejected`,
    );
  }
});

test("case-insensitive Server header check accepts variations", async () => {
  // Server header check should be case-insensitive for "python".
  const variations = ["Python/3.12 aiohttp/3.9.1", "python/3.12 aiohttp/3.9.1", "PYTHON/3.12 aiohttp/3.9.1"];

  for (const serverHeader of variations) {
    const varyingCase: typeof fetch = async () =>
      new Response(JSON.stringify({ message: "Invalid authentication" }), {
        status: 401,
        headers: { "content-type": "application/json", "server": serverHeader },
      });

    assert.equal(
      await looksLikeHomeAssistant("http://test:8123", varyingCase),
      true,
      `Server header "${serverHeader}" should be accepted`,
    );
  }
});

test("case-insensitive message check accepts authentication variations", async () => {
  // Message check should be case-insensitive for "auth".
  const messages = [
    "Invalid authentication",
    "Invalid Authentication",
    "INVALID AUTHENTICATION",
    "Unauthorized access",
    "Auth required",
  ];

  for (const message of messages) {
    const varyingMessage: typeof fetch = async () =>
      new Response(JSON.stringify({ message }), {
        status: 401,
        headers: { "content-type": "application/json", "server": "Python/3.12 aiohttp/3.9.1" },
      });

    assert.equal(
      await looksLikeHomeAssistant("http://test:8123", varyingMessage),
      true,
      `Message "${message}" should be accepted`,
    );
  }
});
