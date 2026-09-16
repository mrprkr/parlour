import { addConnector, listConnectors, removeConnector } from "../integrations/connectors/index.ts";
import { type Command, parseCli, subcommand, UsageError } from "./args.ts";
import { printJson, table } from "./output.ts";

const USAGE = [
  "parlour connectors add <name> <url> [--scope <scope>]   store a remote MCP server and sign in to it",
  "parlour connectors list [--json]                        what is connected, and whether it is signed in",
  "parlour connectors remove <name>                        forget it, tokens included",
];

const SUBCOMMANDS = ["add", "list", "remove"] as const;

/**
 * Remote MCP servers the house can sign in to. The work is in the
 * integration; this is the printing. `add` opens a browser for the sign in,
 * so it is the one command here that cannot be driven from a pipe.
 */
export const command: Command = {
  name: "connectors",
  summary: "Sign the house in to remote MCP servers.",
  usage: USAGE,

  async run({ paths, argv }) {
    const { positionals, values } = parseCli(argv, {
      json: { type: "boolean" },
      scope: { type: "string" },
    });
    const sub = subcommand(positionals, SUBCOMMANDS, USAGE);

    switch (sub) {
      case "list": {
        const rows = await listConnectors(paths);
        if (values.json) {
          printJson(rows);
          return;
        }
        if (!rows.length) {
          process.stdout.write("No connectors. Add one with parlour connectors add <name> <url>.\n");
          return;
        }
        const lines = rows.map((row) => [row.name, row.url, row.signedIn ? "signed in" : "signed out"]);
        process.stdout.write(`${table(lines)}\n`);
        return;
      }

      case "add": {
        const [, name, url] = positionals;
        if (!name || !url) throw new UsageError(`Usage:\n  ${USAGE[0]}`);
        const scope = typeof values.scope === "string" ? values.scope : undefined;
        const connector = await addConnector(paths, name, url, scope ? { scope } : {});
        process.stdout.write(`Connected ${connector.name} at ${connector.url}.\n`);
        return;
      }

      case "remove": {
        const name = positionals[1];
        if (!name) throw new UsageError(`Usage:\n  ${USAGE[2]}`);
        const removed = await removeConnector(paths, name);
        if (!removed) throw new Error(`No connector called ${name}.`);
        process.stdout.write(`Removed ${name}.\n`);
        return;
      }
    }
  },
};
