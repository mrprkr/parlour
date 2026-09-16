import { type ParseArgsConfig, parseArgs } from "node:util";
import type { Paths } from "../core/paths.ts";

/**
 * The little the CLI needs from an argument parser, over `node:util`'s own.
 * A framework would bring a dependency, its own help format and its own idea
 * of subcommands, for nine commands that each take a handful of flags.
 */

export type OptionSpec = NonNullable<ParseArgsConfig["options"]>;

/** One flag's parsed value. Nothing here takes a flag more than once. */
export type Values = Record<string, string | boolean | undefined>;

export interface Parsed {
  positionals: string[];
  values: Values;
}

/** Honoured by every command, so they are parsed once here rather than declared nine times. */
export const GLOBAL_OPTIONS = {
  config: { type: "string" },
  help: { type: "boolean", short: "h" },
  version: { type: "boolean" },
} satisfies OptionSpec;

/** A mistake on the command line, printed with the usage rather than a stack. */
export class UsageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UsageError";
  }
}

export function parseCli(argv: string[], options: OptionSpec = {}): Parsed {
  try {
    const { positionals, values } = parseArgs({
      args: argv,
      options: { ...GLOBAL_OPTIONS, ...options },
      allowPositionals: true,
      strict: true,
    });
    return { positionals, values: values as Values };
  } catch (error) {
    // parseArgs says "Unknown option '--x'. To specify a positional argument
    // starting with a '-', place it at the end..." The first sentence is the
    // useful one.
    throw new UsageError((error as Error).message.split(". ")[0] ?? String(error));
  }
}

/**
 * The global flags alone, with everything else let through untouched. Loose
 * on purpose: a command's own flags are not known here and must not be an
 * error here.
 */
export function parseGlobals(argv: string[]): { config?: string; help?: boolean; version?: boolean } {
  const { values } = parseArgs({
    args: argv,
    options: GLOBAL_OPTIONS,
    allowPositionals: true,
    strict: false,
  });
  return {
    config: typeof values.config === "string" ? values.config : undefined,
    help: values.help === true,
    version: values.version === true,
  };
}

/**
 * The command is the first word that is not a flag or a flag's value. It is
 * found without parsing so that a command's own flags, which the global parse
 * does not know, cannot be mistaken for it.
 */
export function splitCommand(argv: string[]): { command: string | undefined; rest: string[] } {
  const takesValue = new Set(
    Object.entries(GLOBAL_OPTIONS)
      .filter(([, spec]) => spec.type === "string")
      .map(([name]) => `--${name}`),
  );
  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index] as string;
    if (arg === "--") break;
    if (takesValue.has(arg)) {
      // A value-taking flag at the very end has lost its value. Said here,
      // because with no command found the caller would print the general help.
      if (index + 1 >= argv.length) throw new UsageError(`${arg} needs a file`);
      index += 1;
      continue;
    }
    if (arg.startsWith("-")) continue;
    return { command: arg, rest: [...argv.slice(0, index), ...argv.slice(index + 1)] };
  }
  return { command: undefined, rest: argv };
}

/** What every command is handed. Loading config is left to the command: not all of them want it. */
export interface CliContext {
  paths: Paths;
  /** The arguments after the command name, still to be parsed. */
  argv: string[];
}

export interface Command {
  name: string;
  summary: string;
  /** One line per form, printed under `parlour <name> --help`. */
  usage: string[];
  run(context: CliContext): Promise<void>;
}

/** The subcommand word, checked against what the command offers. */
export function subcommand<T extends string>(
  positionals: string[],
  allowed: readonly T[],
  usage: string[],
): T {
  const word = positionals[0];
  if (word && (allowed as readonly string[]).includes(word)) return word as T;
  throw new UsageError(
    word
      ? `Unknown subcommand "${word}". Usage:\n  ${usage.join("\n  ")}`
      : `Usage:\n  ${usage.join("\n  ")}`,
  );
}

/** Reads all of stdin, for the commands that take a document rather than a flag. */
export async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks).toString("utf8");
}
