import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { z } from "zod";
import type { AgentEvent } from "./events.ts";
import type { Logger } from "./logger.ts";
import type { Paths } from "./paths.ts";
import type { Secrets } from "./secrets.ts";

/**
 * The registry that turns a name in config into a running thing. Built-ins
 * register themselves at import; anything else is an npm package whose
 * default export is a `ProviderDefinition`, loaded on first use. Core never
 * needs to know a provider exists for it to be selectable.
 */

export type ProviderKind =
  | "audioSource"
  | "audioSink"
  | "wake"
  | "stt"
  | "tts"
  | "llm"
  | "decision"
  | "search"
  | "secrets"
  | "service"
  | "integration";

export interface ProviderContext {
  paths: Paths;
  secrets: Secrets;
  log: Logger;
  emit: (event: AgentEvent) => void;
  /** The whole config, for providers that need more than their own slice. */
  config: unknown;
}

export interface ProviderDefinition<T = unknown> {
  kind: ProviderKind;
  name: string;
  description: string;
  /** Validates the provider's own slice of config. Defaults to "anything". */
  schema?: z.ZodType;
  create(options: unknown, context: ProviderContext): T | Promise<T>;
}

/** Identity, for the type inference and so a package's default export reads as one. */
export function defineProvider<T>(definition: ProviderDefinition<T>): ProviderDefinition<T> {
  return definition;
}

const registry = new Map<string, ProviderDefinition>();

const keyOf = (kind: ProviderKind, name: string) => `${kind}/${name}`;

export function registerProvider(definition: ProviderDefinition): void {
  const key = keyOf(definition.kind, definition.name);
  if (registry.has(key)) throw new Error(`Provider ${key} is already registered.`);
  registry.set(key, definition);
}

export function registeredProviders(kind?: ProviderKind): ProviderDefinition[] {
  const all = [...registry.values()];
  return kind ? all.filter((definition) => definition.kind === kind) : all;
}

/** Tests only: every provider file registers at import, so tests start clean. */
export function clearProviders(): void {
  registry.clear();
}

export class UnknownProviderError extends Error {
  readonly kind: ProviderKind;
  /** Not `name`: that is the Error's own, and stack traces read it. */
  readonly providerName: string;
  readonly available: string[];

  constructor(kind: ProviderKind, name: string, available: string[]) {
    const known = available.length ? available.join(", ") : "none";
    super(`No ${kind} provider called "${name}". Registered: ${known}.`);
    this.name = "UnknownProviderError";
    this.kind = kind;
    this.providerName = name;
    this.available = available;
  }
}

/**
 * The module loaded and its default export is a provider, just not of the
 * kind the config slot asked for. Reporting it as an unknown name would send
 * the contributor to check the path when it is the `kind` field that is off.
 */
export class ProviderKindError extends Error {
  readonly kind: ProviderKind;
  readonly actualKind: ProviderKind;
  /** Not `name`: that is the Error's own, and stack traces read it. */
  readonly providerName: string;

  constructor(kind: ProviderKind, name: string, actualKind: ProviderKind) {
    super(`Provider "${name}" is a ${actualKind} provider, not ${kind}.`);
    this.name = "ProviderKindError";
    this.kind = kind;
    this.actualKind = actualKind;
    this.providerName = name;
  }
}

/**
 * A provider's slice of config failed its schema. Zod's own message is a JSON
 * blob that names neither the provider nor the slice, so this reads the way
 * `parseConfig` does: one line per problem, path first. The ZodError is kept
 * as `cause` for anything that wants the raw issues.
 */
export class ProviderOptionsError extends Error {
  readonly kind: ProviderKind;
  /** Not `name`: that is the Error's own, and stack traces read it. */
  readonly providerName: string;

  constructor(kind: ProviderKind, name: string, error: z.ZodError) {
    const issues = error.issues.map((issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`);
    super(`Invalid options for ${kind} provider "${name}": ${issues.join("; ")}`, { cause: error });
    this.name = "ProviderOptionsError";
    this.kind = kind;
    this.providerName = name;
  }
}

/** Shaped like a definition of any kind; the kind is checked by the caller. */
function isDefinition(value: unknown): value is ProviderDefinition {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Partial<ProviderDefinition>;
  return (
    typeof candidate.kind === "string" &&
    typeof candidate.name === "string" &&
    typeof candidate.create === "function"
  );
}

/** The codes Node uses when a specifier simply does not lead anywhere. */
const NOT_FOUND = new Set(["ERR_MODULE_NOT_FOUND", "ERR_PACKAGE_PATH_NOT_EXPORTED"]);

/**
 * Whether the specifier itself leads anywhere, decided before it is imported.
 * Exported for the plugin loader, which resolves the same kind of name.
 * `import()` raises the same not-found code for a package that is missing and
 * for a package that exists but imports something missing, so the two cannot
 * be told apart afterwards. `import.meta.resolve` walks the same lookup as
 * `import()` for a bare name, but hands back a URL for an absolute path
 * without checking the file is there, so that case is checked by hand. Any
 * other resolution error is left for `import()` to raise, so it is reported
 * as a load failure with Node's own message.
 */
export function specifierExists(name: string): boolean {
  let url: string;
  try {
    url = import.meta.resolve(name);
  } catch (error) {
    const code = (error as { code?: unknown }).code;
    return !(typeof code === "string" && NOT_FOUND.has(code));
  }
  return !url.startsWith("file:") || existsSync(fileURLToPath(url));
}

/**
 * A name that is not registered is tried as a package. A `..` is refused so a
 * relative specifier cannot climb out of the package directory; an absolute
 * path is allowed on purpose, so a provider can be tried from a checkout
 * before it is published. Only "nothing there" is reported as an unknown
 * name. A package that exists but will not load (syntax error, missing peer,
 * old Node) is a different problem and must not be dressed up as a typo, and
 * nor is a package that loads but declares itself as another kind.
 */
async function importProvider(kind: ProviderKind, name: string): Promise<ProviderDefinition | null> {
  if (name.includes("..") || !specifierExists(name)) return null;
  let mod: unknown;
  try {
    mod = await import(name);
  } catch (error) {
    throw new Error(`Provider "${name}" failed to load: ${(error as Error).message}`, { cause: error });
  }
  const candidate = (mod as { default?: unknown }).default;
  if (!isDefinition(candidate)) return null;
  if (candidate.kind !== kind) throw new ProviderKindError(kind, name, candidate.kind);
  return candidate;
}

/**
 * The context can be built from the definition rather than handed over up
 * front, because the name in config is not always the provider's own: a
 * provider tried from a checkout is named by an absolute path, and a logger
 * scoped by that path would push every line it writes out of the column the
 * other scopes line up in.
 */
export type ProviderContextFactory = (definition: ProviderDefinition) => ProviderContext;

export async function resolveProvider<T>(
  kind: ProviderKind,
  name: string,
  options: unknown,
  context: ProviderContext | ProviderContextFactory,
): Promise<T> {
  let definition = registry.get(keyOf(kind, name));
  if (!definition) {
    const imported = await importProvider(kind, name);
    if (!imported) {
      throw new UnknownProviderError(
        kind,
        name,
        registeredProviders(kind).map((known) => known.name),
      );
    }
    // Keyed by the specifier from config, not the package's own name, so the
    // next lookup for the same specifier hits and nothing is registered twice.
    registry.set(keyOf(kind, name), imported);
    definition = imported;
  }
  let parsed = options;
  if (definition.schema) {
    const result = definition.schema.safeParse(options);
    if (!result.success) throw new ProviderOptionsError(kind, name, result.error);
    parsed = result.data;
  }
  return (await definition.create(
    parsed,
    typeof context === "function" ? context(definition) : context,
  )) as T;
}
