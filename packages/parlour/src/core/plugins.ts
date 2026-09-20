import type { AgentEvent } from "./events.ts";
import { type Logger, logger } from "./logger.ts";
import type { Paths } from "./paths.ts";
import type { Check } from "./ports.ts";
import { type ProviderDefinition, registerProvider, specifierExists } from "./providers.ts";
import type { Skill } from "./skills.ts";

/**
 * A plugin is one npm package that brings several things at once: providers,
 * skills, and the config a person would otherwise have to write by hand for
 * them. Everything here can already be done a piece at a time (a provider
 * named in a slot, a skill file copied into the skills directory, an MCP
 * server added to config), and for one piece that is the simpler route. A
 * plugin is for the case where they only make sense together: a package for
 * a car, say, that is a provider, two skills that know what its tools are
 * called, and the MCP server both of them talk to.
 *
 * Plugins are listed in `config.plugins` and loaded before anything is
 * resolved, so a provider a plugin brings is registered by the time the slot
 * naming it is filled.
 */
export interface Plugin {
  name: string;
  description?: string;
  /** Registered before the slots are filled, so config can name any of them. */
  providers?: ProviderDefinition[];
  /** Skills written in the package rather than in the house's own directory. */
  skills?: Skill[];
  /** A directory of markdown skill files the package ships. Absolute. */
  skillsDir?: string;
  /**
   * Config for the integrations the plugin needs, keyed the way
   * `config.integrations` is. It is merged under the house's own config,
   * never over it: a plugin can bring an MCP server, and the person can
   * still change or remove it in `config.json`.
   */
  integrations?: Record<string, Record<string, unknown>>;
  /** Anything the package wants to do once, before the agent is built. */
  setup?(context: PluginContext): void | Promise<void>;
}

export interface PluginContext {
  paths: Paths;
  /** Scoped to the plugin's own name, not the specifier from config. */
  log: Logger;
  emit: (event: AgentEvent) => void;
  /** The whole config, for a plugin that wants to look before it sets up. */
  config: unknown;
}

/** Identity, so a package's default export reads as what it is. */
export function definePlugin(plugin: Plugin): Plugin {
  return plugin;
}

/** A plugin named in config that cannot be used. Config is wrong, so this is fatal. */
export class PluginError extends Error {
  readonly specifier: string;

  constructor(specifier: string, detail: string) {
    super(`Plugin "${specifier}" ${detail}`);
    this.name = "PluginError";
    this.specifier = specifier;
  }
}

export interface LoadedPlugins {
  plugins: { specifier: string; plugin: Plugin }[];
  /** Directories of skill files, in the order the plugins were listed. */
  skillDirs: string[];
  /** Skills declared in code rather than in a file. */
  skills: Skill[];
  /** Providers a plugin brought that were already registered, by key. */
  clashes: string[];
}

function isPlugin(value: unknown): value is Plugin {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Partial<Plugin>;
  return typeof candidate.name === "string" && !("kind" in candidate);
}

/**
 * Loads every plugin named in config, in order. A specifier that leads
 * nowhere, a package whose default export is not a plugin, and a `setup`
 * that throws are all mistakes a person has to fix, so they are thrown
 * rather than worked around: a house that starts without the plugin that
 * holds its skills looks like a house whose model has stopped listening.
 *
 * A provider a plugin brings that clashes with one already registered is the
 * exception. The registered one wins, since it was there first, and the
 * clash is reported by the doctor rather than refusing to start.
 */
export async function loadPlugins(
  specifiers: string[],
  context: Omit<PluginContext, "log">,
  options: { setup?: boolean } = {},
): Promise<LoadedPlugins> {
  const loaded: LoadedPlugins = { plugins: [], skillDirs: [], skills: [], clashes: [] };

  for (const specifier of specifiers) {
    // The same rule as a provider specifier: no climbing out with `..`, an
    // absolute path allowed so a plugin can be tried from a checkout.
    if (specifier.includes("..")) throw new PluginError(specifier, "may not contain ..");
    if (!specifierExists(specifier)) throw new PluginError(specifier, "is not installed");

    let mod: unknown;
    try {
      mod = await import(specifier);
    } catch (error) {
      throw new PluginError(specifier, `failed to load: ${(error as Error).message}`);
    }
    const plugin = (mod as { default?: unknown }).default;
    if (!isPlugin(plugin)) {
      throw new PluginError(specifier, "has no default export shaped like a plugin");
    }

    for (const definition of plugin.providers ?? []) {
      try {
        registerProvider(definition);
      } catch {
        loaded.clashes.push(`${definition.kind}/${definition.name}`);
      }
    }
    if (plugin.skillsDir) loaded.skillDirs.push(plugin.skillsDir);
    if (plugin.skills) loaded.skills.push(...plugin.skills);

    // `parlour plugins list` wants to see what a plugin brings without
    // letting it open a connection or write a file to say so.
    if (options.setup ?? true) {
      try {
        // Scoped by the plugin's own name: a plugin tried from a checkout is
        // named in config by an absolute path, which would not fit the column.
        await plugin.setup?.({ ...context, log: logger(plugin.name) });
      } catch (error) {
        throw new PluginError(specifier, `could not set itself up: ${(error as Error).message}`);
      }
    }

    loaded.plugins.push({ specifier, plugin });
  }

  return loaded;
}

/**
 * The integrations to build: the house's own block, with each plugin's
 * suggestions filled in underneath. Merged key by key rather than replaced,
 * so a plugin that brings an MCP server and a config that names another end
 * up with both, and anything the person wrote wins on a clash.
 */
export function mergeIntegrations(
  configured: Record<string, unknown>,
  plugins: { plugin: Plugin }[],
): Record<string, unknown> {
  const merged: Record<string, unknown> = { ...configured };
  for (const { plugin } of plugins) {
    for (const [name, slice] of Object.entries(plugin.integrations ?? {})) {
      merged[name] = name in merged ? underneath(slice, merged[name]) : slice;
    }
  }
  return merged;
}

/** `over` wins, key by key, down through plain objects. Arrays are values, not lists to join. */
function underneath(under: unknown, over: unknown): unknown {
  if (!isPlainObject(under) || !isPlainObject(over)) return over;
  const result: Record<string, unknown> = { ...under };
  for (const [key, value] of Object.entries(over)) {
    result[key] = key in result ? underneath(result[key], value) : value;
  }
  return result;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** What `parlour doctor` says about the plugins. */
export function pluginChecks({ plugins, clashes }: LoadedPlugins): Check[] {
  const checks: Check[] = [];
  if (plugins.length) {
    checks.push({
      name: "plugins",
      status: "ok",
      detail: plugins.map(({ plugin }) => plugin.name).join(", "),
    });
  }
  for (const clash of clashes) {
    checks.push({
      name: "plugins",
      status: "warn",
      detail: `${clash} was already registered, so the plugin's copy is not used`,
    });
  }
  return checks;
}
