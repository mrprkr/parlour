import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { z } from "zod";
import { logger } from "../../core/logger.ts";
import type { Paths } from "../../core/paths.ts";
import type { Check, Integration, SecretStore } from "../../core/ports.ts";
import { defineProvider, registerProvider } from "../../core/providers.ts";
import type { Tool } from "../../core/registry.ts";
import { McpTools } from "../mcp/index.ts";
import { providerFor } from "./oauth.ts";
import { type ConnectorStore, connectorStore } from "./store.ts";

const log = logger("connectors");

export { addConnector, type ConnectorRow, listConnectors, removeConnector } from "./cli.ts";
export type { Connector, ConnectorSecrets } from "./store.ts";
export { ConnectorStore, connectorStore } from "./store.ts";

/**
 * Every connected service, as tools.
 *
 * A connector is a remote MCP server the household has signed in to, so this
 * is the same code path as the `mcp` integration with the tokens attached.
 * The agent does not know what a calendar is: it knows that something called
 * "calendar" advertises tools, and the model reads their descriptions.
 */
export async function connectorTools(store: ConnectorStore, mcp: McpTools): Promise<Tool[]> {
  const connectors = await store.list();
  const tools: Tool[] = [];

  for (const connector of connectors) {
    const secrets = await store.secrets(connector.name);
    if (!secrets.tokens) {
      log.warn(
        `${connector.name} is not signed in: parlour connectors add ${connector.name} ${connector.url}`,
      );
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

/** Nothing to configure: the list lives in `connectors.json`, not in config. */
export const ConnectorsOptions = z.object({}).passthrough();

export function createConnectorsIntegration(paths: Paths, secrets?: SecretStore): Integration {
  const store = connectorStore(paths, secrets);
  const mcp = new McpTools();
  return {
    name: "connectors",
    tools: () => connectorTools(store, mcp),
    close: () => mcp.close(),

    // No network here: a connector that is listed but has no tokens is the
    // one thing the doctor can catch before the model asks for it.
    async doctor(): Promise<Check[]> {
      const connectors = await store.list();
      if (connectors.length === 0) return [];
      const signedOut: string[] = [];
      for (const connector of connectors) {
        if (!(await store.secrets(connector.name)).tokens) signedOut.push(connector.name);
      }
      if (signedOut.length === 0) {
        return [{ name: "connectors", status: "ok", detail: `${connectors.length} connected` }];
      }
      return [
        {
          name: "connectors",
          status: "warn",
          detail: `signed out: ${signedOut.join(", ")}. Run parlour connectors add <name> <url> again.`,
        },
      ];
    },
  };
}

export const connectorsIntegration = defineProvider<Integration>({
  kind: "integration",
  name: "connectors",
  description: "Remote MCP servers the household has signed in to with parlour connectors add",
  schema: ConnectorsOptions,
  create: (_options, context) => createConnectorsIntegration(context.paths),
});

registerProvider(connectorsIntegration);
