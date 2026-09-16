import { realpathSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { loadConfig } from "../core/config.ts";
import type { ServiceState } from "../core/ports.ts";
import { serviceSpecs } from "../core/services.ts";
import { pickServiceManager } from "../providers/service/index.ts";
import { type Command, parseCli, subcommand } from "./args.ts";
import { table } from "./output.ts";

const USAGE = [
  "parlour service install            start at login, and come back after a crash",
  "parlour service uninstall          stop, and forget",
  "parlour service restart",
  "parlour service status",
  "parlour service logs [--lines N]   the last N lines (40) of each log",
];

const SUBCOMMANDS = ["install", "uninstall", "restart", "status", "logs"] as const;

/**
 * The `parlour` that is running now, for the service to run later. In a
 * checkout that is `src/cli/main.ts` under type stripping, which launchd
 * cannot exec, so the dev script that knows the flags stands in for it.
 */
export function parlourBin(): string {
  const script = realpathSync(process.argv[1] ?? "parlour");
  if (script.endsWith(".ts")) return resolve(dirname(script), "..", "..", "bin", "parlour-dev");
  return script;
}

export function describeState(state: ServiceState): string {
  if (state.running) return `running as pid ${state.pid}, and it starts at login`;
  if (state.installed)
    return `installed but not running${state.lastExit ? `, last exit ${state.lastExit}` : ""}`;
  return "not installed";
}

function print(states: ServiceState[]): void {
  process.stdout.write(`${table(states.map((state) => [state.label, state.what, describeState(state)]))}\n`);
}

export const command: Command = {
  name: "service",
  summary: "The agent as a service, kept running by the platform.",
  usage: USAGE,

  async run({ paths, argv }) {
    const { positionals, values } = parseCli(argv, { lines: { type: "string" } });
    const sub = subcommand(positionals, SUBCOMMANDS, USAGE);
    const { config } = loadConfig(paths);
    const specs = await serviceSpecs(config, paths, parlourBin());
    const manager = pickServiceManager();

    switch (sub) {
      case "install":
        print(await manager.install(specs));
        return;
      case "uninstall": {
        const removed = await manager.uninstall(specs.map((spec) => spec.label));
        process.stdout.write(
          removed.length ? `Removed ${removed.join(", ")}.\n` : "Nothing was installed.\n",
        );
        return;
      }
      case "restart":
        print(await manager.restart(specs));
        return;
      case "status":
        print(await manager.status(specs));
        return;
      case "logs": {
        const lines = Math.max(1, Number(values.lines) || 40);
        for (const spec of specs) {
          process.stdout.write(
            `== ${spec.what} (${spec.logPath})\n${await manager.tail(spec.logPath, lines)}\n\n`,
          );
        }
        return;
      }
    }
  },
};
