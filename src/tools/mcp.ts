import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";
import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import type { McpServerConfig } from "../config.ts";
import type { JsonSchema } from "../llm/types.ts";
import { defineTool, type Tool } from "./registry.ts";
import { logger } from "../logger.ts";

const log = logger("mcp");

/**
 * Connects to the configured MCP servers and turns every tool they advertise
 * into a local tool. Home Assistant's own MCP Server integration is just
 * another entry here, which is why the agent needs no bespoke knowledge of
 * which entities exist: HA publishes the exposed ones as tools.
 */
export class McpTools {
  readonly #clients: Client[] = [];

  async connect(servers: Record<string, McpServerConfig>): Promise<Tool[]> {
    const tools: Tool[] = [];
    for (const [name, server] of Object.entries(servers)) {
      try {
        tools.push(...(await this.connectServer(name, await transportFor(server))));
      } catch (error) {
        // One dead server must not take the house's voice down with it.
        log.error(`${name} unavailable:`, error instanceof Error ? error.message : error);
      }
    }
    return tools;
  }

  /**
   * Connects one server over a transport the caller has built. Connectors use
   * this to hand over a transport that already carries their OAuth provider.
   */
  async connectServer(name: string, transport: Transport): Promise<Tool[]> {
    const client = new Client({ name: "home-agent", version: "0.1.0" });
    await client.connect(transport);
    this.#clients.push(client);

    const { tools } = await client.listTools();
    log.info(`${name}: ${tools.length} tools`);

    return tools.map((tool) =>
      defineTool(
        qualify(name, tool.name),
        tool.description ?? `${tool.name} on ${name}`,
        (tool.inputSchema as JsonSchema | undefined) ?? { type: "object", properties: {} },
        async (args) => {
          const result = await client.callTool({ name: tool.name, arguments: args });
          return renderContent(result.content);
        },
      ),
    );
  }

  async close(): Promise<void> {
    await Promise.allSettled(this.#clients.map((c) => c.close()));
  }
}

async function transportFor(server: McpServerConfig) {
  if (server.transport === "stdio") {
    return new StdioClientTransport({
      command: server.command,
      args: server.args,
      env: { ...(process.env as Record<string, string>), ...server.env },
    });
  }

  const token = server.tokenEnv ? process.env[server.tokenEnv] : undefined;
  const options = token
    ? { requestInit: { headers: { authorization: `Bearer ${token}` } } }
    : undefined;
  const url = new URL(server.url);
  // Home Assistant still serves MCP over SSE, so fall back rather than fail.
  return url.pathname.endsWith("/sse")
    ? new SSEClientTransport(url, options)
    : new StreamableHTTPClientTransport(url, options);
}

/** Tool names must be stable and safe for both APIs, so namespace and clean. */
function qualify(server: string, tool: string): string {
  return `${server}_${tool}`.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 64);
}

function renderContent(content: unknown): string {
  if (!Array.isArray(content)) return JSON.stringify(content ?? null);
  return content
    .map((part: { type?: string; text?: string }) =>
      part.type === "text" ? (part.text ?? "") : `[${part.type ?? "unknown"}]`,
    )
    .join("\n")
    .trim();
}
