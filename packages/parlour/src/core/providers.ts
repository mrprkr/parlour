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

function isDefinition(value: unknown, kind: ProviderKind): value is ProviderDefinition {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Partial<ProviderDefinition>;
  return (
    candidate.kind === kind && typeof candidate.name === "string" && typeof candidate.create === "function"
  );
}

/** The codes Node uses when a specifier simply does not lead anywhere. */
const NOT_FOUND = new Set(["ERR_MODULE_NOT_FOUND", "ERR_PACKAGE_PATH_NOT_EXPORTED"]);

/**
 * A name that is not registered is tried as a package. A `..` is refused so a
 * relative specifier cannot climb out of the package directory; an absolute
 * path is allowed on purpose, so a provider can be tried from a checkout
 * before it is published. Only "nothing there" is reported as an unknown
 * name. A package that exists but will not load (syntax error, missing peer,
 * old Node) is a different problem and must not be dressed up as a typo.
 */
async function importProvider(kind: ProviderKind, name: string): Promise<ProviderDefinition | null> {
  if (name.includes("..")) return null;
  let mod: unknown;
  try {
    mod = await import(name);
  } catch (error) {
    const code = (error as { code?: unknown }).code;
    if (typeof code === "string" && NOT_FOUND.has(code)) return null;
    throw new Error(`Provider "${name}" failed to load: ${(error as Error).message}`, { cause: error });
  }
  const candidate = (mod as { default?: unknown }).default;
  return isDefinition(candidate, kind) ? candidate : null;
}

export async function resolveProvider<T>(
  kind: ProviderKind,
  name: string,
  options: unknown,
  context: ProviderContext,
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
  const parsed = definition.schema ? definition.schema.parse(options) : options;
  return (await definition.create(parsed, context)) as T;
}
