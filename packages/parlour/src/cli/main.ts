#!/usr/bin/env node
import { existsSync, readFileSync } from "node:fs";
import { resolvePaths } from "../core/paths.ts";
import { parseEnvFile } from "../core/secrets.ts";
import { VERSION } from "../core/version.ts";
import { type Command, parseGlobals, splitCommand, UsageError } from "./args.ts";

/**
 * `parlour`. One process, one command, and nothing kept between runs: the
 * desktop app drives it the same way a person does, so there is one way in.
 *
 * Commands are loaded on demand. `--version` should not pay for onnxruntime,
 * and the logger reads LOG_LEVEL when it is first imported, which has to be
 * after `secrets.env` has been read into the environment.
 */

const COMMANDS: Record<string, () => Promise<{ command: Command }>> = {
  init: () => import("./init.ts"),
  start: () => import("./start.ts"),
  stop: () => import("./stop.ts"),
  restart: () => import("./restart.ts"),
  text: () => import("./text.ts"),
  doctor: () => import("./doctor.ts"),
  service: () => import("./service.ts"),
  connectors: () => import("./connectors.ts"),
  config: () => import("./config.ts"),
  secrets: () => import("./secrets.ts"),
  models: () => import("./models.ts"),
};

const SUMMARIES: Record<keyof typeof COMMANDS, string> = {
  init: "set this machine up: dependencies, models, config, secrets, service or app",
  start: "run the server or the satellite, per config.role",
  stop: "stop the agent and everything it keeps warm",
  restart: "stop and start it, after a change to config or a secret",
  text: "talk to it in the terminal, without the microphone",
  doctor: "check every moving part and name the broken one",
  service: "install, uninstall, stop, restart, status, logs",
  connectors: "sign in to remote MCP servers: add, list, remove",
  models: "fetch the wake word and whisper models",
  config: "path, show, write, edit",
  secrets: "status, set",
};

function help(): string {
  const width = Math.max(...Object.keys(SUMMARIES).map((name) => name.length));
  return [
    "Usage: parlour <command> [options]",
    "",
    "Commands:",
    ...Object.entries(SUMMARIES).map(([name, summary]) => `  ${name.padEnd(width)}  ${summary}`),
    "",
    "Options:",
    "  --config <file>  use this config file (PARLOUR_CONFIG does the same)",
    "  --version        print the version",
    "  --help           this, or a command's own with parlour <command> --help",
    "",
    "PARLOUR_HOME moves the config directory (config.json, secrets.env, connectors.json).",
  ].join("\n");
}

/**
 * `secrets.env` into the environment, for what is already set to win. Core
 * reads the file itself through `loadSecrets`; this is for the providers that
 * read a named variable (an `apiKeyEnv`, an MCP server's `tokenEnv`) and for
 * LOG_LEVEL, which the logger picks up from the environment alone.
 */
function loadEnvironment(secretsFile: string): void {
  if (!existsSync(secretsFile)) return;
  for (const [key, value] of Object.entries(parseEnvFile(readFileSync(secretsFile, "utf8")))) {
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

/**
 * The logger writes `info` to stdout, which is where `--json` and
 * `--porcelain` promise to print nothing else, and where `init` is talking
 * through its reporter: the doctor it runs last would otherwise put "3 tools
 * ready" in the middle of its Checking section. Warnings and errors go to
 * stderr and are kept; anything chattier is turned off for the run. This has
 * to happen before the command is imported, because the logger reads the
 * level once.
 */
function quietWhenMachineReadable(name: string | undefined, argv: string[]): void {
  if (name !== "init" && !argv.includes("--json") && !argv.includes("--porcelain")) return;
  const level = process.env.LOG_LEVEL;
  if (level !== "warn" && level !== "error") process.env.LOG_LEVEL = "warn";
}

async function main(argv: string[]): Promise<void> {
  const { command: name, rest } = splitCommand(argv);

  // Only the global flags are read here. The command parses the rest, so an
  // unknown flag is reported against the command it was meant for.
  const globals = parseGlobals(rest);

  if (globals.version) {
    process.stdout.write(`${VERSION}\n`);
    return;
  }
  if (!name) {
    process.stdout.write(`${help()}\n`);
    if (!globals.help) process.exitCode = 1;
    return;
  }

  const load = COMMANDS[name];
  if (!load) throw new UsageError(`Unknown command "${name}". Run parlour --help for the list.`);

  const paths = resolvePaths({
    ...process.env,
    PARLOUR_CONFIG: globals.config ?? process.env.PARLOUR_CONFIG,
  });
  loadEnvironment(paths.secretsFile);
  quietWhenMachineReadable(name, rest);

  const { command } = await load();
  if (globals.help) {
    process.stdout.write(`${command.summary}\n\nUsage:\n  ${command.usage.join("\n  ")}\n`);
    return;
  }
  await command.run({ paths, argv: rest });
}

try {
  await main(process.argv.slice(2));
} catch (error) {
  // One line, whatever went wrong. An UnknownProviderError's message already
  // names the registered alternatives, and a usage error names the flag.
  process.stderr.write(`parlour: ${error instanceof Error ? error.message : String(error)}\n`);
  // Not process.exit: stdout to a pipe is asynchronous, and exiting here
  // would truncate whatever the command had printed before it failed.
  process.exitCode = 1;
}
