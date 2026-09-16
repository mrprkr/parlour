import { loadConfig } from "../config.ts";
import { ConnectorStore, type Connector } from "./store.ts";
import { authorise } from "./oauth.ts";

/**
 * `pnpm connectors` — the household's accounts.
 *
 *   pnpm connectors list
 *   pnpm connectors add calendar https://example.com/mcp [--scope="calendar.events"]
 *   pnpm connectors remove calendar
 *
 * There is no catalogue of services here on purpose. A connector is any remote
 * MCP server: the sign in is discovered from the server itself, so the only
 * things this needs are a name to call it by and the URL its vendor documents.
 * Anything hardcoded would be out of date by the time it was read.
 */

const { config } = loadConfig(process.env.AGENT_CONFIG ?? "agent.config.json");
const store = new ConnectorStore(config.connectorsFile);
const [command, ...rest] = process.argv.slice(2);
const json = rest.includes("--json");
const args = rest.filter((arg) => !arg.startsWith("--"));

switch (command) {
  case "list":
  case undefined:
    await list();
    break;
  case "add":
    await add();
    break;
  case "remove":
  case "rm":
    await remove();
    break;
  default:
    console.error(`unknown command: ${command}`);
    console.error("usage: connectors [list | add <name> <url> [--scope=...] | remove <name>]");
    process.exitCode = 2;
}

async function list(): Promise<void> {
  const connectors = await store.list();
  const rows = await Promise.all(
    connectors.map(async (connector) => ({
      ...connector,
      signedIn: Boolean((await store.secrets(connector.name)).tokens),
    })),
  );

  if (json) {
    console.log(JSON.stringify(rows));
    return;
  }
  if (!rows.length) {
    console.log("No connectors. Add one with: pnpm connectors add <name> <url>");
    return;
  }
  for (const row of rows) {
    console.log(`${row.signedIn ? "ok  " : "OUT "}  ${row.name.padEnd(14)} ${row.url}`);
  }
}

async function add(): Promise<void> {
  const [name, url] = args;
  if (!name || !url) {
    console.error("usage: connectors add <name> <url> [--scope=\"a b\"]");
    process.exitCode = 2;
    return;
  }
  if (!/^[a-z0-9_-]{1,32}$/i.test(name)) {
    console.error("the name is a tool prefix, so keep it to letters, digits, dashes and underscores");
    process.exitCode = 2;
    return;
  }

  const scope = rest.find((arg) => arg.startsWith("--scope="))?.slice("--scope=".length);
  const connector: Connector = {
    name,
    url: new URL(url).toString(),
    ...(scope ? { scope } : {}),
    addedAt: new Date().toISOString(),
  };

  // Stored before the sign in, so that a half-finished authorisation can be
  // resumed by running the same command again rather than retyping the URL.
  await store.add(connector);
  await authorise(store, connector);
  console.log(`\n${name} is connected. Restart the agent to pick up its tools.`);
}

async function remove(): Promise<void> {
  const [name] = args;
  if (!name) {
    console.error("usage: connectors remove <name>");
    process.exitCode = 2;
    return;
  }
  const removed = await store.remove(name);
  console.log(removed ? `${name} removed, and its tokens deleted.` : `No connector called ${name}.`);
}
