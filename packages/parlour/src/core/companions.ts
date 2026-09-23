import { type ChildProcess, spawn } from "node:child_process";
import { createWriteStream, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import type { Logger } from "./logger.ts";
import type { ServiceSpec } from "./ports.ts";
import { killOnExit } from "./process.ts";

/**
 * What launchd does for a Parlour outside the sandbox, done by `parlour
 * start` for one inside it: the servers the agent talks to (whisper, the
 * local model) started beside it and stopped with it. The App Store app may
 * not install a LaunchAgent, so the agent's own process is the only thing
 * left that can keep them warm.
 *
 * Each companion logs to the file its LaunchAgent would have, so `parlour
 * service logs` reads the same place either way. One that dies is restarted
 * after a pause, as launchd's KeepAlive would, until `stop` is called.
 */

export type Spawn = (command: string, args: string[], env: Record<string, string>) => ChildProcess;

export interface CompanionOptions {
  log: Logger;
  /** Replaceable so a test can watch the calls without running anything. */
  spawn?: Spawn;
  /** How long a dead companion waits before it is started again. */
  restartMs?: number;
}

export interface Companions {
  stop(): void;
}

const defaultSpawn: Spawn = (command, args, env) =>
  spawn(command, args, { env: { ...process.env, ...env }, stdio: ["ignore", "pipe", "pipe"] });

export function startCompanions(specs: ServiceSpec[], options: CompanionOptions): Companions {
  const { log, restartMs = 5000 } = options;
  const run = options.spawn ?? defaultSpawn;
  const children = new Set<ChildProcess>();
  const timers = new Set<ReturnType<typeof setTimeout>>();
  let stopped = false;

  const start = (spec: ServiceSpec) => {
    const [command, ...args] = spec.program;
    if (!command) return;
    log.info(`starting ${spec.what}`);
    const child = run(command, args, spec.env);
    children.add(child);
    killOnExit(child);

    try {
      mkdirSync(dirname(spec.logPath), { recursive: true });
      const file = createWriteStream(spec.logPath, { flags: "a" });
      // A stream error with no listener ends the process, and that would be
      // the agent going down over a log file.
      file.on("error", (error) => log.warn(`${spec.what} log: ${error.message}`));
      child.stdout?.pipe(file);
      child.stderr?.pipe(file);
    } catch {
      // A log that cannot be written is not a reason to go without whisper.
    }

    child.on("error", (error) => log.warn(`${spec.what}: ${error.message}`));
    child.on("exit", (code, signal) => {
      children.delete(child);
      if (stopped) return;
      log.warn(`${spec.what} exited (${signal ?? code}), starting it again`);
      const timer = setTimeout(() => {
        timers.delete(timer);
        if (!stopped) start(spec);
      }, restartMs);
      timers.add(timer);
    });
  };

  for (const spec of specs) start(spec);

  return {
    stop() {
      stopped = true;
      for (const timer of timers) clearTimeout(timer);
      for (const child of children) child.kill("SIGTERM");
    },
  };
}
