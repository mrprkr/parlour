import { loadConfig, updateConfig } from "../core/config.ts";
import { McpServer, type McpServerConfig } from "../integrations/mcp/index.ts";
import { type Command, parseCli, subcommand, UsageError } from "./args.ts";
import { printJson, table } from "./output.ts";

const USAGE = [
  "parlour mcp add <name> --url <url> [--token-env <VAR>]        a server on the network",
  "parlour mcp add <name> [--token-env <VAR>] -- <command>...    one this machine starts",
  "parlour mcp list [--json]                                     what is configured",
  "parlour mcp remove <name>                                     forget it",
];

const SUBCOMMANDS = ["add", "list", "remove"] as const;

/**
 * MCP servers named in `config.json`, from the command line. They could
 * always be written by hand; this validates the entry before it lands in
 * the file, and keeps the shape of a stdio server (command, args, the one
 * variable it is allowed to read) out of the reader's head.
 *
 * A server that wants a whole environment block still wants
 * `parlour config edit`. A remote server that needs signing in wants
 * `parlour connectors add`, which does the OAuth and keeps the tokens in
 * the Keychain rather than the file.
 */
export const command: Command = {
  name: "mcp",
  summary: "MCP servers the house talks to: add, list, remove.",
  usage: USAGE,

  async run({ paths, argv }) {
    const { positionals, values } = parseCli(argv, {
      json: { type: "boolean" },
      url: { type: "string" },
      "token-env": { type: "string" },
    });
    const sub = subcommand(positionals, SUBCOMMANDS, USAGE);
    const tokenEnv = typeof values["token-env"] === "string" ? values["token-env"] : undefined;

    switch (sub) {
      case "list": {
        const servers = configured(loadConfig(paths).config);
        if (values.json) {
          printJson(Object.entries(servers).map(([name, server]) => ({ name, ...server })));
          return;
        }
        if (!Object.keys(servers).length) {
          process.stdout.write("No MCP servers. Add one with parlour mcp add <name> --url <url>.\n");
          return;
        }
        const rows = Object.entries(servers).map(([name, server]) => [name, server.transport, where(server)]);
        process.stdout.write(`${table(rows)}\n`);
        return;
      }

      case "add": {
        const [, name, ...rest] = positionals;
        if (!name) throw new UsageError(`Usage:\n  ${USAGE.slice(0, 2).join("\n  ")}`);
        const url = typeof values.url === "string" ? values.url : undefined;
        if (url && rest.length) throw new UsageError("Give either --url or a command, not both.");
        if (!url && !rest.length) throw new UsageError(`Usage:\n  ${USAGE.slice(0, 2).join("\n  ")}`);

        // Parsed here so a bad url or a missing command is a usage error
        // rather than something the next start trips over.
        const parsed = McpServer.safeParse(
          url
            ? { transport: "http", url, tokenEnv }
            : { transport: "stdio", command: rest[0], args: rest.slice(1), tokenEnv },
        );
        if (!parsed.success) {
          throw new UsageError(parsed.error.issues.map((issue) => issue.message).join("; "));
        }

        updateConfig(paths, (raw) => putMcpServer(raw, name, parsed.data));
        process.stdout.write(`Added ${name} (${where(parsed.data)}). parlour restart to pick it up.\n`);
        return;
      }

      case "remove": {
        const name = positionals[1];
        if (!name) throw new UsageError(`Usage:\n  ${USAGE[3]}`);
        updateConfig(paths, (raw) => {
          const servers = asRecord(asRecord(asRecord(raw.integrations)?.mcp)?.servers);
          if (!servers || !(name in servers)) throw new Error(`No MCP server called ${name}.`);
          delete servers[name];
        });
        process.stdout.write(`Removed ${name}.\n`);
        return;
      }
    }
  },
};

/**
 * Writes one server into a raw config. Refuses a name already taken unless
 * `replace` says the caller owns that entry, as `parlour laya setup` owns `laya`.
 */
export function putMcpServer(
  raw: Record<string, unknown>,
  name: string,
  server: McpServerConfig,
  replace = false,
): void {
  const integrations = asRecord(raw.integrations) ?? defaultIntegrations();
  const mcp = asRecord(integrations.mcp) ?? {};
  const servers = asRecord(mcp.servers) ?? {};
  if (name in servers && !replace) throw new Error(`There is already an MCP server called ${name}.`);
  mcp.servers = { ...servers, [name]: server };
  integrations.mcp = mcp;
  raw.integrations = integrations;
}

/** The parsed servers, so a hand-written entry is reported before it is printed. */
function configured(config: { integrations: Record<string, unknown> }): Record<string, McpServerConfig> {
  const servers = asRecord(asRecord(config.integrations.mcp)?.servers) ?? {};
  const parsed: Record<string, McpServerConfig> = {};
  for (const [name, server] of Object.entries(servers)) {
    const result = McpServer.safeParse(server);
    if (!result.success)
      throw new Error(`MCP server ${name} is not valid: ${result.error.issues[0]?.message}`);
    parsed[name] = result.data;
  }
  return parsed;
}

function where(server: McpServerConfig): string {
  return server.transport === "stdio" ? [server.command, ...server.args].join(" ") : server.url;
}

/**
 * The first `mcp` entry written into a file that has no integrations block
 * must not turn the house's own integrations off, since the block replaces
 * the default rather than adding to it.
 */
function defaultIntegrations(): Record<string, unknown> {
  return { "home-assistant": {}, connectors: {} };
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}
