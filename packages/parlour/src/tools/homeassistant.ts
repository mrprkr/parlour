import type { Config } from "../config.ts";
import { defineTool, type Tool } from "./registry.ts";

/**
 * A thin REST client alongside the MCP connection. MCP gives the model intents
 * ("turn the kitchen light on"); this gives it the two things intents cannot
 * express: reading an arbitrary entity, and calling an arbitrary service.
 */
export class HomeAssistant {
  readonly #baseUrl: string;
  readonly #token: string;

  constructor(baseUrl: string, token: string) {
    this.#baseUrl = baseUrl;
    this.#token = token;
  }

  async #api(path: string, init?: RequestInit): Promise<unknown> {
    const response = await fetch(`${this.#baseUrl}/api/${path}`, {
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

export function createHomeAssistant(config: Config, token: string | undefined): HomeAssistant | null {
  return token ? new HomeAssistant(config.homeAssistant.baseUrl, token) : null;
}
