import { accessSync, constants, realpathSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { loadConfig } from "../core/config.ts";
import type { Paths } from "../core/paths.ts";
import type { ServiceSpec, ServiceState } from "../core/ports.ts";
import { AGENT_LABEL, LLM_LABEL, leftoverServices, serviceSpecs, WHISPER_LABEL } from "../core/services.ts";
import { pickServiceManager } from "../providers/service/index.ts";
import { type Command, parseCli, subcommand, UsageError } from "./args.ts";
import { table } from "./output.ts";

const USAGE = [
  "parlour service install                   start at login, and come back after a crash",
  "parlour service uninstall                 stop, and forget",
  "parlour service start [agent|llm|whisper] start what was stopped, or one of them",
  "parlour service stop [agent|llm|whisper]  stop now, and start again at login",
  "parlour service restart [agent|llm|whisper]",
  "parlour service status",
  "parlour service logs [agent|llm|whisper] [--lines N]   the last N lines (40) of each log",
];

const SUBCOMMANDS = ["install", "uninstall", "start", "stop", "restart", "status", "logs"] as const;

/** The names a person uses for the services, and the labels launchd knows them by. */
const TARGETS: Record<string, string> = { agent: AGENT_LABEL, llm: LLM_LABEL, whisper: WHISPER_LABEL };

/** The specs one target names, or all of them when none is named. */
function only<T extends { label: string }>(specs: T[], target: string | undefined): T[] {
  if (!target) return specs;
  const label = TARGETS[target];
  if (!label) throw new UsageError(`no service called ${target}; try ${Object.keys(TARGETS).join(", ")}`);
  const found = specs.filter((spec) => spec.label === label);
  if (!found.length) {
    throw new UsageError(
      `this config runs no ${target}: nothing uses it, its model is missing, or it is too big for this Mac`,
    );
  }
  return found;
}

/**
 * The `parlour` that is running now, as the command for the service to run
 * later. In a checkout that is `src/cli/main.ts` under type stripping, which
 * launchd cannot exec, so the dev script that knows the flags stands in for
 * it. A global install is a script npm made executable, so it runs by its
 * shebang. Anything else (`node dist/cli/main.js`, which tsc emits without
 * the execute bit) is run by the node running now, because launchd cannot
 * exec a plain file and the service would sit installed but never start.
 */
export function parlourBin(): string[] {
  const script = realpathSync(process.argv[1] ?? "parlour");
  if (script.endsWith(".ts")) return [resolve(dirname(script), "..", "..", "bin", "parlour-dev")];
  return isExecutable(script) ? [script] : [process.execPath, script];
}

function isExecutable(file: string): boolean {
  try {
    accessSync(file, constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

export function describeState(state: ServiceState): string {
  if (state.running) return `running as pid ${state.pid}, and it starts at login`;
  if (state.installed)
    return `installed but not running${state.lastExit ? `, last exit ${state.lastExit}` : ""}`;
  return "not installed";
}

/**
 * Everything this config would install, plus whatever an older one left
 * behind. `parlour stop` and `parlour restart` want both: a whisper job from
 * back when this box was a server is still a process holding a port.
 */
export async function everyService(
  paths: Paths,
): Promise<{ specs: ServiceSpec[]; all: Pick<ServiceSpec, "label" | "what" | "logPath">[] }> {
  const { config } = loadConfig(paths);
  const specs = await serviceSpecs(config, paths, parlourBin());
  return { specs, all: [...specs, ...leftoverServices(specs, paths)] };
}

export function print(states: ServiceState[]): void {
  process.stdout.write(`${table(states.map((state) => [state.label, state.what, describeState(state)]))}\n`);
}

export const command: Command = {
  name: "service",
  summary: "The agent as a service, kept running by the platform.",
  usage: USAGE,

  async run({ paths, argv }) {
    const { positionals, values } = parseCli(argv, { lines: { type: "string" } });
    const sub = subcommand(positionals, SUBCOMMANDS, USAGE);
    const target = positionals[1];
    const { config } = loadConfig(paths);
    const specs = await serviceSpecs(config, paths, parlourBin());
    // What an earlier config installed and this one would not: a server that
    // became a satellite still has its whisper LaunchAgent. Uninstall removes
    // it and status admits to it, or it runs at login with nothing to show it.
    const leftovers = leftoverServices(specs, paths);
    const manager = pickServiceManager();

    switch (sub) {
      case "install":
        print(await manager.install(specs));
        return;
      case "stop":
        print(await manager.stop(only([...specs, ...leftovers], target)));
        return;
      case "start": {
        // launchd has no start for a job it was told to stop, only loading it
        // again, which is what restart does for anything installed.
        const states = await manager.restart(only(specs, target));
        if (!states.some((state) => state.installed)) {
          process.stdout.write("Nothing is installed to start. parlour service install sets it up.\n");
          return;
        }
        print(states);
        return;
      }
      case "uninstall": {
        const removed = await manager.uninstall([...specs, ...leftovers].map((spec) => spec.label));
        process.stdout.write(
          removed.length ? `Removed ${removed.join(", ")}.\n` : "Nothing was installed.\n",
        );
        return;
      }
      case "restart":
        print(await manager.restart(only(specs, target)));
        return;
      case "status": {
        // A leftover that is neither installed nor running is only noise.
        const stale = (await manager.status(leftovers)).filter((state) => state.installed || state.running);
        print([...(await manager.status(specs)), ...stale]);
        return;
      }
      case "logs": {
        const lines = Math.max(1, Number(values.lines) || 40);
        for (const spec of only(specs, target)) {
          process.stdout.write(
            `== ${spec.what} (${spec.logPath})\n${await manager.tail(spec.logPath, lines)}\n\n`,
          );
        }
        return;
      }
    }
  },
};
