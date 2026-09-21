import { loadConfig, updateConfig } from "../core/config.ts";
import { emit } from "../core/events.ts";
import type { Paths } from "../core/paths.ts";
import { loadPlugins } from "../core/plugins.ts";
import { type Command, parseCli, subcommand, UsageError } from "./args.ts";
import { printJson, table } from "./output.ts";

const USAGE = [
  "parlour plugins add <package>      load it, then add it to config",
  "parlour plugins list [--json]      what is installed, and what each brings",
  "parlour plugins remove <package>   take it out of config",
];

const SUBCOMMANDS = ["add", "list", "remove"] as const;

/**
 * Plugins are npm packages, so installing one is npm's job and this is only
 * the list in `config.json`. `add` loads the package first: a name that is
 * not installed, or a package whose default export is not a plugin, is
 * caught here rather than at the next start with the microphone live.
 */
export const command: Command = {
  name: "plugins",
  summary: "Packages that bring providers, skills and integrations together.",
  usage: USAGE,

  async run({ paths, argv }) {
    const { positionals, values } = parseCli(argv, { json: { type: "boolean" } });
    const sub = subcommand(positionals, SUBCOMMANDS, USAGE);

    switch (sub) {
      case "list": {
        const loaded = await inspect(paths);
        const rows = loaded.plugins.map(({ specifier, plugin }) => ({
          specifier,
          name: plugin.name,
          description: plugin.description ?? "",
          providers: (plugin.providers ?? []).map((provider) => `${provider.kind}/${provider.name}`),
          skills: plugin.skills?.length ?? 0,
          skillsDir: plugin.skillsDir ?? "",
          integrations: Object.keys(plugin.integrations ?? {}),
        }));
        if (values.json) {
          printJson(rows);
          return;
        }
        if (!rows.length) {
          process.stdout.write("No plugins. Add one with parlour plugins add <package>.\n");
          return;
        }
        const lines = rows.map((row) => [row.name, row.specifier, brings(row)]);
        process.stdout.write(`${table(lines)}\n`);
        return;
      }

      case "add": {
        const specifier = positionals[1];
        if (!specifier) throw new UsageError(`Usage:\n  ${USAGE[0]}`);
        const { config } = loadConfig(paths);
        if (config.plugins.includes(specifier)) throw new Error(`${specifier} is already a plugin.`);
        // Loaded before it is written, so the file never names a package
        // that cannot be loaded. Not set up: that waits for the next start.
        const loaded = await loadPlugins([specifier], { paths, emit, config }, { setup: false });
        const plugin = loaded.plugins[0]?.plugin;
        updateConfig(paths, (raw) => {
          raw.plugins = [...(Array.isArray(raw.plugins) ? raw.plugins : []), specifier];
        });
        process.stdout.write(`Added ${plugin?.name ?? specifier}. parlour restart to pick it up.\n`);
        return;
      }

      case "remove": {
        const specifier = positionals[1];
        if (!specifier) throw new UsageError(`Usage:\n  ${USAGE[2]}`);
        updateConfig(paths, (raw) => {
          const plugins = Array.isArray(raw.plugins) ? raw.plugins : [];
          if (!plugins.includes(specifier)) throw new Error(`${specifier} is not a plugin in this config.`);
          raw.plugins = plugins.filter((plugin) => plugin !== specifier);
        });
        process.stdout.write(`Removed ${specifier}.\n`);
        return;
      }
    }
  },
};

/** Loads every plugin in config without setting any of them up. */
async function inspect(paths: Paths) {
  const { config } = loadConfig(paths);
  return loadPlugins(config.plugins, { paths, emit, config }, { setup: false });
}

/** The short "what is in it" column: only the parts that are there. */
function brings(row: {
  providers: string[];
  skills: number;
  skillsDir: string;
  integrations: string[];
}): string {
  const parts: string[] = [];
  if (row.providers.length) parts.push(row.providers.join(", "));
  if (row.skills || row.skillsDir) parts.push(row.skills ? `${row.skills} skills` : "skills");
  if (row.integrations.length) parts.push(row.integrations.join(", "));
  return parts.join("; ");
}
