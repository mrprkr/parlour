import { z } from "zod";
import type { Logger } from "../../core/logger.ts";
import type { Check, Integration } from "../../core/ports.ts";
import { defineProvider, type ProviderContext, registerProvider } from "../../core/providers.ts";
import { defineTool, type Tool } from "../../core/registry.ts";
import { httpTransport, McpTools } from "../mcp/index.ts";

export const HomeAssistantOptions = z.object({
  url: z.string().default("http://homeassistant.local:8123"),
  /** Take the tools Home Assistant's own MCP Server integration exposes. */
  mcp: z.boolean().default(true),
  /** Add `ha_get_state` and `ha_call_service` for what intents cannot say. */
  rest: z.boolean().default(true),
  /**
   * Add `ha_assist`, which hands a command to Home Assistant's own Assist, so
   * its custom sentences and sentence-triggered automations still fire.
   */
  assist: z.boolean().default(true),
  /** The language Assist parses in. Empty means Home Assistant's own default. */
  language: z.string().default(""),
  /** An entity that, when on, makes the agent ignore its wake word. Empty means never. */
  muteEntity: z.string().default(""),
});

export type HomeAssistantOptionsInput = z.input<typeof HomeAssistantOptions>;

/**
 * A thin REST client alongside the MCP connection. MCP gives the model intents
 * ("turn the kitchen light on"); this gives it the two things intents cannot
 * express: reading an arbitrary entity, and calling an arbitrary service.
 */
export class HomeAssistant {
  readonly #baseUrl: string;
  readonly #token: string;
  readonly #fetch: typeof fetch;

  constructor(baseUrl: string, token: string, fetchImpl: typeof fetch = globalThis.fetch) {
    this.#baseUrl = baseUrl.replace(/\/+$/, "");
    this.#token = token;
    this.#fetch = fetchImpl;
  }

  async #api(path: string, init?: RequestInit): Promise<unknown> {
    const response = await this.#fetch(`${this.#baseUrl}/api/${path}`, {
      ...init,
      headers: {
        authorization: `Bearer ${this.#token}`,
        "content-type": "application/json",
        ...init?.headers,
      },
      signal: AbortSignal.timeout(10000),
    });
    if (!response.ok) throw new Error(`Home Assistant ${response.status}: ${await response.text()}`);
    return response.json();
  }

  async state(entityId: string): Promise<{ state: string; attributes: Record<string, unknown> }> {
    return (await this.#api(`states/${entityId}`)) as { state: string; attributes: Record<string, unknown> };
  }

  async isOn(entityId: string): Promise<boolean> {
    try {
      return (await this.state(entityId)).state === "on";
    } catch {
      return false;
    }
  }

  /**
   * Ask Assist, Home Assistant's built-in conversation agent. The agent id is
   * pinned so that a house whose pipeline points back at Parlour does not send
   * the command round in a circle.
   */
  async assist(text: string, language = ""): Promise<string> {
    const result = (await this.#api("conversation/process", {
      method: "POST",
      body: JSON.stringify({
        text,
        agent_id: "conversation.home_assistant",
        ...(language ? { language } : {}),
      }),
    })) as AssistResult;
    const speech = result.response?.speech?.plain?.speech?.trim() ?? "";
    if (result.response?.response_type === "error") {
      throw new Error(speech || `Assist could not handle "${text}"`);
    }
    return speech || "Done.";
  }

  tools(): Tool[] {
    return [
      defineTool(
        "ha_get_state",
        "Read the current state of one Home Assistant entity, by entity id.",
        {
          type: "object",
          properties: {
            entity_id: {
              type: "string",
              description: "For example light.kitchen or sensor.bedroom_temperature",
            },
          },
          required: ["entity_id"],
        },
        async (args) => {
          const entity = await this.state(String(args.entity_id));
          const friendly = entity.attributes.friendly_name ?? args.entity_id;
          return `${String(friendly)} is ${entity.state}`;
        },
      ),
      defineTool(
        "ha_call_service",
        "Call a Home Assistant service. Use this only when no more specific tool fits.",
        {
          type: "object",
          properties: {
            domain: { type: "string", description: "For example light, switch, scene, media_player" },
            service: { type: "string", description: "For example turn_on, turn_off, toggle" },
            entity_id: { type: "string" },
            data: { type: "object", description: "Extra service data, such as brightness_pct" },
          },
          required: ["domain", "service"],
        },
        async (args) => {
          await this.#api(`services/${String(args.domain)}/${String(args.service)}`, {
            method: "POST",
            body: JSON.stringify({
              ...(args.entity_id ? { entity_id: args.entity_id } : {}),
              ...((args.data as Record<string, unknown>) ?? {}),
            }),
          });
          return "Done.";
        },
      ),
    ];
  }
}

interface AssistResult {
  response?: {
    response_type?: string;
    speech?: { plain?: { speech?: string } };
  };
}

function assistTool(ha: HomeAssistant, language: string): Tool {
  return defineTool(
    "ha_assist",
    "Pass a spoken command, word for word, to Home Assistant's Assist. Use it for the house's own custom commands and routines, such as good night or movie time, when no other tool fits.",
    {
      type: "object",
      properties: {
        text: { type: "string", description: "The command as the person said it" },
      },
      required: ["text"],
    },
    async (args) => ha.assist(String(args.text), language),
  );
}

/** Whether a URL answers at all, within a few seconds, with the token attached. */
async function reachable(fetchImpl: typeof fetch, url: string, token: string): Promise<boolean> {
  // The MCP endpoint is an event stream that never ends, so this must not
  // wait for a body: the headers are the answer, and the request is dropped
  // as soon as they arrive.
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 4000);
  try {
    const response = await fetchImpl(url, {
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
 * The house as an integration. `tools()` opens the MCP connection, so it is
 * called once by the assembly; the gate and the doctor use REST directly.
 *
 * `fetchImpl` is a parameter rather than a global so the gate and the doctor
 * can be tested without a Home Assistant to talk to. The definition's `create`
 * passes the real one.
 */
export function createHomeAssistant(
  options: HomeAssistantOptionsInput,
  context: ProviderContext,
  fetchImpl: typeof fetch = globalThis.fetch,
): Integration {
  const { url, mcp, rest, assist, language, muteEntity } = HomeAssistantOptions.parse(options);
  const base = url.replace(/\/+$/, "");
  const token = context.secrets.haToken;
  const log: Logger = context.log;
  const ha = token ? new HomeAssistant(base, token, fetchImpl) : null;
  const clients = new McpTools();

  return {
    name: "home-assistant",

    async tools() {
      if (!ha || !token) {
        log.warn("HA_TOKEN is not set, so the house is out of reach: parlour secrets set HA_TOKEN");
        return [];
      }
      const tools: Tool[] = [];
      if (mcp) {
        // Named "house" rather than after the integration: it is the prefix
        // on every tool the model sees, and shorter reads better in a trace.
        try {
          tools.push(
            ...(await clients.connectServer(
              "house",
              httpTransport(new URL(`${base}/mcp_server/sse`), token),
            )),
          );
        } catch (error) {
          // Losing the intents must not lose the REST tools with them.
          log.error("house MCP unavailable:", error instanceof Error ? error.message : error);
        }
      }
      if (rest) tools.push(...ha.tools());
      if (assist) tools.push(assistTool(ha, language));
      return tools;
    },

    promptContext: () => ["The house is controlled through tools. Use them rather than guessing what is on."],

    async gate() {
      if (!ha || !muteEntity) return false;
      // Unreachable reads as off: a house that cannot be asked should still
      // be able to hear, and the model will report the outage soon enough.
      if (!(await ha.isOn(muteEntity))) return false;
      context.emit({ type: "muted" });
      return true;
    },

    async doctor() {
      const checks: Check[] = [];
      if (!token) {
        checks.push({
          name: "Home Assistant",
          status: "fail",
          detail: "HA_TOKEN is not set, so the house is out of reach. parlour secrets set HA_TOKEN",
        });
        return checks;
      }
      checks.push({ name: "Home Assistant token", status: "ok", detail: "HA_TOKEN is set" });
      const api = await reachable(fetchImpl, `${base}/api/`, token);
      checks.push({
        name: "Home Assistant",
        status: api ? "ok" : "fail",
        detail: api ? base : `${base} did not answer. A failure here is usually the token.`,
      });
      if (mcp) {
        const sse = `${base}/mcp_server/sse`;
        const answers = api && (await reachable(fetchImpl, sse, token));
        checks.push({
          name: "Home Assistant MCP",
          status: answers ? "ok" : "fail",
          detail: answers
            ? sse
            : `${sse} did not answer. Add the Model Context Protocol Server integration in Home Assistant.`,
        });
      }
      return checks;
    },

    close: () => clients.close(),
  };
}

export const homeAssistant = defineProvider<Integration>({
  kind: "integration",
  name: "home-assistant",
  description: "Home Assistant: its MCP tools, two REST tools, Assist, and a mute entity",
  schema: HomeAssistantOptions,
  create: (options, context) => createHomeAssistant(options as HomeAssistantOptionsInput, context),
});

registerProvider(homeAssistant);
