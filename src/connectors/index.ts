import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import type { Config } from "../config.ts";
import type { McpTools } from "../tools/mcp.ts";
import type { Tool } from "../tools/registry.ts";
import { ConnectorStore } from "./store.ts";
import { providerFor } from "./oauth.ts";
import { logger } from "../logger.ts";

const log = logger("connectors");

export { ConnectorStore } from "./store.ts";
export type { Connector } from "./store.ts";

/**
 * Every connected service, as tools.
 *
 * A connector is a remote MCP server the household has signed in to, so this
 * is the same code path as `mcpServers` in the config with the tokens attached.
 * The agent does not know what a calendar is: it knows that something called
 * "calendar" advertises tools, and the model reads their descriptions.
 */
export async function connectorTools(config: Config, mcp: McpTools): Promise<Tool[]> {
  const store = new ConnectorStore(config.connectorsFile);
  const connectors = await store.list();
  const tools: Tool[] = [];

  for (const connector of connectors) {
    const secrets = await store.secrets(connector.name);
    if (!secrets.tokens) {
      log.warn(`${connector.name} is not signed in: pnpm connectors add ${connector.name} ${connector.url}`);
      continue;
    }
    try {
      const transport = new StreamableHTTPClientTransport(new URL(connector.url), {
        authProvider: providerFor(store, connector),
      });
      tools.push(...(await mcp.connectServer(connector.name, transport)));
    } catch (error) {
      // A connector whose token has been revoked must not stop the house
      // answering questions about the lights.
      log.error(`${connector.name} unavailable:`, error instanceof Error ? error.message : error);
    }
  }

  return tools;
}
