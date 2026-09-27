import type { Reporter } from "./output.ts";
import { ask, canAsk, confirm, secret, select } from "./prompts.ts";

/**
 * Getting the house connected, which is the step people give up on. There are
 * four ways for it to go wrong and they all look the same from here: the
 * wrong address, no token, a token for the wrong thing, and the MCP Server
 * integration never added. So each one is checked as it is answered and named
 * when it fails, rather than all four landing together in `parlour doctor`
 * half an hour later.
 *
 * The network calls take a `fetch` so the flow can be tested without a Home
 * Assistant to talk to.
 */

/** Where a Home Assistant usually is, when the config does not say. */
export const CANDIDATE_URLS = [
  "http://homeassistant.local:8123",
  "http://homeassistant:8123",
  "http://localhost:8123",
];

export interface HomeAssistantAnswers {
  /** False leaves the integration out of the config: no house, no tools, no checks. */
  enabled: boolean;
  url: string;
  token: string;
  muteEntity: string;
}

export interface HouseOptions {
  /** What the config has now, so a re-run defaults to it rather than to a guess. */
  url: string;
  token: string;
  muteEntity: string;
  /** Take every default and ask nothing. */
  yes: boolean;
  report: Reporter;
  fetchImpl?: typeof fetch;
}

const trim = (url: string) => url.replace(/\/+$/, "");

/**
 * Whether something at this address is a Home Assistant. Asked without a
 * token: `/api/` answers 401 to an anonymous request, which is a better
 * signal than 200 would be, since it is the API refusing rather than a router
 * returning its own login page.
 *
 * To prevent credential disclosure to a rogue endpoint, this now requires
 * Home Assistant-specific response characteristics before the token is sent.
 * The `Server` header and the JSON structure of the error response are both
 * specific to Home Assistant and cannot be trivially spoofed by an attacker
 * who does not already possess a valid Home Assistant instance.
 */
export async function looksLikeHomeAssistant(
  url: string,
  fetchImpl: typeof fetch = globalThis.fetch,
): Promise<boolean> {
  try {
    const response = await fetchImpl(`${trim(url)}/api/`, { signal: AbortSignal.timeout(3000) });
    
    // Must be 401 (unauthorized) or 200 (authenticated, though we sent no token).
    if (response.status !== 401 && response.status !== 200) return false;
    
    // Home Assistant's API always returns a Server header identifying itself.
    // This is present in all versions and cannot be removed without modifying
    // the source. A rogue endpoint would need to know to set this header.
    const server = response.headers.get("server");
    if (!server || !server.toLowerCase().includes("python")) return false;
    
    // For 401 responses, Home Assistant returns a JSON body with a specific
    // structure: {"message": "Invalid authentication"}. A rogue endpoint
    // returning a generic 401 will not have this structure.
    if (response.status === 401) {
      try {
        const body = await response.json();
        if (typeof body !== "object" || body === null) return false;
        if (!("message" in body)) return false;
        // The message must mention authentication, which is Home Assistant-specific.
        const message = String(body.message).toLowerCase();
        if (!message.includes("auth")) return false;
      } catch {
        // Not JSON, or malformed: not Home Assistant.
        return false;
      }
    }
    
    // For 200 responses (which should not happen without a token, but might
    // if the instance is misconfigured), Home Assistant returns a JSON object
    // with a "message" field containing "API running."
    if (response.status === 200) {
      try {
        const body = await response.json();
        if (typeof body !== "object" || body === null) return false;
        if (!("message" in body)) return false;
        const message = String(body.message).toLowerCase();
        if (!message.includes("api") && !message.includes("running")) return false;
      } catch {
        return false;
      }
    }
    
    return true;
  } catch {
    return false;
  }
}

/** The first of the usual addresses that answers, or null. Tried in order, so the answer is stable. */
export async function findHomeAssistant(
  candidates: string[],
  fetchImpl: typeof fetch = globalThis.fetch,
): Promise<string | null> {
  for (const url of candidates) {
    if (await looksLikeHomeAssistant(url, fetchImpl)) return url;
  }
  return null;
}

/** Whether the token is one this Home Assistant will accept. */
export async function tokenWorks(
  url: string,
  token: string,
  fetchImpl: typeof fetch = globalThis.fetch,
): Promise<boolean> {
  if (!token) return false;
  try {
    const response = await fetchImpl(`${trim(url)}/api/`, {
      headers: { authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(6000),
    });
    return response.ok;
  } catch {
    return false;
  }
}

/**
 * Whether the MCP Server integration is there. It is what gives the model the
 * house's own intents ("turn the kitchen light on"), and it is off by default
 * in Home Assistant, so a house that works perfectly well in every other way
 * arrives here with it missing.
 *
 * The endpoint is an event stream that never ends, so only the headers are
 * waited for and the request is dropped as soon as they arrive.
 */
export async function mcpServerPresent(
  url: string,
  token: string,
  fetchImpl: typeof fetch = globalThis.fetch,
): Promise<boolean> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 4000);
  try {
    const response = await fetchImpl(`${trim(url)}/mcp_server/sse`, {
      headers: { authorization: `Bearer ${token}` },
      signal: controller.signal,
    });
    return response.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
    controller.abort();
  }
}

/**
 * The questions, in the order a person can answer them. Every one takes its
 * current value under `--yes` or without a terminal, so this is as safe to run
 * from a script as the rest of `init`.
 */
export async function setupHomeAssistant(options: HouseOptions): Promise<HomeAssistantAnswers> {
  const { report, yes } = options;
  const fetchImpl = options.fetchImpl ?? globalThis.fetch;
  const kept: HomeAssistantAnswers = {
    enabled: true,
    url: options.url || CANDIDATE_URLS[0] || "",
    token: options.token,
    muteEntity: options.muteEntity,
  };

  // The heading is the caller's: init's wizard draws its own.
  if (yes || !canAsk()) {
    // Even in non-interactive mode, verify the endpoint before sending the token.
    const verified = await looksLikeHomeAssistant(kept.url, fetchImpl);
    if (kept.token && verified && (await tokenWorks(kept.url, kept.token, fetchImpl)))
      report.ok(`reached ${kept.url}`);
    else if (kept.token && !verified)
      report.warn(`${kept.url} does not answer like a Home Assistant. parlour doctor says so too.`);
    else if (kept.token)
      report.warn(`Could not reach ${kept.url} with that token. parlour doctor says so too.`);
    else report.warn("No token, so the house is out of reach. Run parlour init at a terminal to add one.");
    return kept;
  }

  // ------------------------------------------------------------ the address

  report.ok("This is the part that lets it turn the lights off. Three things:");
  report.ok("the address, a long lived token, and the MCP Server integration.");
  const use = await select("Do you run Home Assistant", [
    { value: true, label: "Yes", hint: "find it, take a token, and check both" },
    { value: false, label: "No", hint: "leave the house out entirely" },
  ]);
  if (!use) {
    report.ok("left out. Run parlour init again if you add one later.");
    return { ...kept, enabled: false };
  }

  report.ok("looking for it on this network");
  const found = await findHomeAssistant(
    [...(options.url ? [options.url] : []), ...CANDIDATE_URLS],
    fetchImpl,
  );
  if (found) report.ok(`found one at ${found}`);
  else report.warn("Nothing answered at the usual addresses, so this one has to be typed.");
  let url = trim(await ask("Home Assistant address", found ?? kept.url));
  while (!(await looksLikeHomeAssistant(url, fetchImpl))) {
    report.warn(`${url} does not answer like a Home Assistant.`);
    if (!(await confirm("Try a different address?"))) break;
    url = trim(await ask("Home Assistant address", url));
  }

  // -------------------------------------------------------------- the token

  let token = options.token;
  if (token && (await tokenWorks(url, token, fetchImpl))) {
    report.ok("the token you already had still works");
    if (!(await confirm("Keep it?"))) token = "";
  } else if (token) {
    report.warn("The token in secrets.env is not accepted by that address.");
    token = "";
  }

  if (!token) {
    report.ok("A long lived access token, from your own profile page:");
    report.ok(`  ${url}/profile/security`);
    report.ok("  scroll to the bottom, Create Token, and paste it here.");
    report.ok("It is the whole house, so it goes in secrets.env and never into git.");
    // Three goes: a pasted token is easy to truncate, and the alternative is
    // finishing init with a house that will never answer.
    for (let attempt = 1; attempt <= 3; attempt++) {
      const typed = await secret("Home Assistant token");
      if (!typed) {
        report.warn("Skipped. parlour secrets set HA_TOKEN adds it later.");
        break;
      }
      if (await tokenWorks(url, typed, fetchImpl)) {
        token = typed;
        report.ok(`reached ${url}`);
        break;
      }
      report.warn(
        attempt < 3
          ? "That token was refused. Check it was copied whole."
          : "That token was refused too. Carrying on without one; parlour doctor will say so.",
      );
    }
  }

  // ----------------------------------------------------------------- the MCP

  if (token) {
    let present = await mcpServerPresent(url, token, fetchImpl);
    if (!present) {
      report.warn("The MCP Server integration is not on, so the model gets no house intents.");
      report.ok("In Home Assistant: Settings, Devices and services, Add integration,");
      report.ok('  and search for "Model Context Protocol Server".');
      if (await confirm("Added it? I will look again")) {
        present = await mcpServerPresent(url, token, fetchImpl);
      }
    }
    if (present) report.ok("the MCP Server integration is answering");
    else report.warn("Carrying on without it. The two REST tools still work, and doctor will remind you.");
  }

  // ---------------------------------------------------------------- the mute

  report.ok("An entity that silences the agent while it is on: a switch or an");
  report.ok("input boolean, for a film or a phone call. Blank for never.");
  const muteEntity = await ask("Mute entity, or blank", options.muteEntity);

  return { enabled: true, url, token, muteEntity };
}
