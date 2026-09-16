import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import { z } from "zod";
import { logger } from "../../core/logger.ts";
import type { Integration } from "../../core/ports.ts";
import { defineProvider, registerProvider } from "../../core/providers.ts";
import { defineTool, type Tool } from "../../core/registry.ts";
import type { JsonSchema } from "../../core/types.ts";
import { VERSION } from "../../core/version.ts";

const log = logger("mcp");

export const McpServer = z.discriminatedUnion("transport", [
  z.object({
    transport: z.literal("stdio"),
    command: z.string(),
    args: z.array(z.string()).default([]),
    /**
     * The server's own environment. It does not inherit ours beyond PATH, HOME,
     * LANG and TMPDIR, so anything else it needs goes here.
     */
    env: z.record(z.string()).default({}),
    /**
     * Name of one environment variable to pass through from ours, so a token
     * can live in `secrets.env` rather than in this file.
     */
    tokenEnv: z.string().optional(),
  }),
  z.object({
    transport: z.literal("http"),
    url: z.string().url(),
    /** Name of the environment variable holding the bearer token, if any. */
    tokenEnv: z.string().optional(),
  }),
]);

export type McpServerConfig = z.infer<typeof McpServer>;

export const McpOptions = z.object({ servers: z.record(McpServer).default({}) });

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
        tools.push(...(await this.connectServer(name, transportFor(server))));
      } catch (error) {
        // One dead server must not take the house's voice down with it.
        log.error(`${name} unavailable:`, error instanceof Error ? error.message : error);
      }
    }
    return tools;
  }

  /**
   * Connects one server over a transport the caller has built. Connectors use
   * this to hand over a transport that already carries their OAuth provider,
   * and Home Assistant to hand over one that carries its token.
   */
  async connectServer(name: string, transport: Transport): Promise<Tool[]> {
    const client = new Client({ name: "parlour", version: VERSION });
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

/** A transport for a remote server, with a bearer token when there is one. */
export function httpTransport(url: URL, token?: string): Transport {
  const options = token ? { requestInit: { headers: { authorization: `Bearer ${token}` } } } : undefined;
  // Home Assistant still serves MCP over SSE, so fall back rather than fail.
  return url.pathname.endsWith("/sse")
    ? new SSEClientTransport(url, options)
    : new StreamableHTTPClientTransport(url, options);
}

function transportFor(server: McpServerConfig): Transport {
  if (server.transport === "stdio") {
    return new StdioClientTransport({
      command: server.command,
      args: server.args,
      env: childEnvironment(server.env, server.tokenEnv),
    });
  }
  return httpTransport(new URL(server.url), server.tokenEnv ? process.env[server.tokenEnv] : undefined);
}

/** Enough for a server to find its runtime and a writable temp dir, no more. */
const INHERITED_ENV = ["PATH", "HOME", "LANG", "TMPDIR"];

/**
 * The environment a stdio server is spawned with. `main.ts` copies every
 * secret into `process.env` for the providers that read a named variable, so
 * passing it through whole would hand each third-party server every token
 * the house holds. A server gets the allow-list, the one variable its
 * `tokenEnv` names, and its own `env` block, which wins.
 */
export function childEnvironment(
  serverEnv: Record<string, string>,
  tokenEnv?: string,
  parent: NodeJS.ProcessEnv = process.env,
): Record<string, string> {
  const env: Record<string, string> = {};
  for (const key of tokenEnv ? [...INHERITED_ENV, tokenEnv] : INHERITED_ENV) {
    const value = parent[key];
    if (value !== undefined) env[key] = value;
  }
  return { ...env, ...serverEnv };
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

/**
 * Takes the unparsed slice so a caller outside the registry (a test, the
 * assembly in a pinch) can pass a partial one; parsing again is harmless.
 */
export function createMcpIntegration(options: z.input<typeof McpOptions>): Integration {
  const { servers } = McpOptions.parse(options);
  const mcp = new McpTools();
  return {
    name: "mcp",
    tools: () => mcp.connect(servers),
    close: () => mcp.close(),
  };
}

export const mcpIntegration = defineProvider<Integration>({
  kind: "integration",
  name: "mcp",
  description: "Tools from any MCP servers named in config, local or remote",
  schema: McpOptions,
  create: (options) => createMcpIntegration(options as z.input<typeof McpOptions>),
});

registerProvider(mcpIntegration);
