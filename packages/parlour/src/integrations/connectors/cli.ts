import type { Paths } from "../../core/paths.ts";
import type { SecretStore } from "../../core/ports.ts";
import { authorise } from "./oauth.ts";
import { type Connector, type ConnectorStore, connectorStore } from "./store.ts";

/**
 * What `parlour connectors` does, as functions the CLI prints the results of.
 *
 *   parlour connectors list
 *   parlour connectors add calendar https://example.com/mcp [--scope "calendar.events"]
 *   parlour connectors remove calendar
 *
 * There is no catalogue of services here on purpose. A connector is any remote
 * MCP server: the sign in is discovered from the server itself, so the only
 * things this needs are a name to call it by and the URL its vendor documents.
 * Anything hardcoded would be out of date by the time it was read.
 */

export interface ConnectorRow extends Connector {
  signedIn: boolean;
}

export async function listConnectors(paths: Paths, secrets?: SecretStore): Promise<ConnectorRow[]> {
  const store = connectorStore(paths, secrets);
  const connectors = await store.list();
  return Promise.all(
    connectors.map(async (connector) => ({
      ...connector,
      signedIn: Boolean((await store.secrets(connector.name)).tokens),
    })),
  );
}

/**
 * Stores the connector, then signs in. The order matters: a half-finished
 * authorisation can be resumed by running the same command again rather than
 * retyping the URL. `signIn` is a parameter so a test need not open a browser.
 */
export async function addConnector(
  paths: Paths,
  name: string,
  url: string,
  options: { scope?: string } = {},
  secrets?: SecretStore,
  signIn: (store: ConnectorStore, connector: Connector) => Promise<void> = authorise,
): Promise<Connector> {
  if (!/^[a-z0-9_-]{1,32}$/i.test(name)) {
    throw new Error("The name is a tool prefix, so keep it to letters, digits, dashes and underscores.");
  }
  const connector: Connector = {
    name,
    url: new URL(url).toString(),
    ...(options.scope ? { scope: options.scope } : {}),
    addedAt: new Date().toISOString(),
  };
  const store = connectorStore(paths, secrets);
  await store.add(connector);
  await signIn(store, connector);
  return connector;
}

/** True when there was one to remove. Its tokens go with it. */
export async function removeConnector(paths: Paths, name: string, secrets?: SecretStore): Promise<boolean> {
  return connectorStore(paths, secrets).remove(name);
}
