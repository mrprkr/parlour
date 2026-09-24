import { type ChildProcess, spawn } from "node:child_process";
import { closeSync, mkdirSync, openSync, renameSync, statSync, writeSync } from "node:fs";
import { setPriority } from "node:os";
import { dirname } from "node:path";
import { RestartBackoff } from "./guardrails.ts";
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

/** What launchd's logs are held to, so a companion's are too. */
export const MAX_LOG_BYTES = 8 * 1024 * 1024;

/**
 * A log file that never grows past `max`: when a write would take it over, the
 * file becomes `<path>.1`, replacing the one before, and writing starts again.
 * A write that fails (a full disk, a deleted directory) is dropped and said
 * once, because the agent going down over a log is worse than a gap in it.
 */
export class BoundedLog {
  readonly #path: string;
  readonly #max: number;
  readonly #warn: (message: string) => void;
  #fd: number | null = null;
  #size = 0;
  #warned = false;
  #closed = false;

  constructor(path: string, warn: (message: string) => void, max = MAX_LOG_BYTES) {
    this.#path = path;
    this.#max = max;
    this.#warn = warn;
  }

  write(chunk: Buffer): void {
    // Output a child flushes after its log was closed is dropped rather than
    // allowed to reopen the file behind the supervisor's back.
    if (this.#closed) return;
    try {
      if (this.#fd === null) this.#open();
      if (this.#size + chunk.length > this.#max && this.#size > 0) {
        this.#release();
        renameSync(this.#path, `${this.#path}.1`);
        this.#open();
      }
      writeSync(this.#fd as number, chunk);
      this.#size += chunk.length;
    } catch (error) {
      if (!this.#warned)
        this.#warn(`${this.#path}: ${error instanceof Error ? error.message : String(error)}`);
      this.#warned = true;
    }
  }

  /** For good: nothing written afterwards reaches the file. */
  close(): void {
    this.#closed = true;
    this.#release();
  }

  #release(): void {
    if (this.#fd !== null) closeSync(this.#fd);
    this.#fd = null;
  }

  #open(): void {
    mkdirSync(dirname(this.#path), { recursive: true });
    this.#fd = openSync(this.#path, "a");
    this.#size = statSync(this.#path).size;
  }
}

export type Spawn = (command: string, args: string[], env: Record<string, string>) => ChildProcess;

export interface CompanionOptions {
  log: Logger;
  /** Replaceable so a test can watch the calls without running anything. */
  spawn?: Spawn;
  /** How long a dead companion waits before it is started again, per crash in a row. */
  restartMs?: number[];
  /** How many crashes in ten minutes before a companion is left down. */
  crashLimit?: number;
}

export interface CompanionState {
  label: string;
  what: string;
  running: boolean;
  pid: number | null;
  /** Stopped on purpose, or left down after crashing too often. */
  held: boolean;
}

export interface Companions {
  stop(): void;
  /** One companion, by label, as a client asked. False when no companion has that label. */
  control(label: string, action: "start" | "stop" | "restart"): boolean;
  states(): CompanionState[];
}

const defaultSpawn: Spawn = (command, args, env) =>
  spawn(command, args, { env: { ...process.env, ...env }, stdio: ["ignore", "pipe", "pipe"] });

export function startCompanions(specs: ServiceSpec[], options: CompanionOptions): Companions {
  const { log } = options;
  const run = options.spawn ?? defaultSpawn;
  const running = new Map<ServiceSpec, ChildProcess>();
  const timers = new Map<ServiceSpec, ReturnType<typeof setTimeout>>();
  // Held companions are not started again when they exit: one a client
  // stopped, and one that crashed too often to be worth another go.
  const held = new Set<ServiceSpec>();
  const backoff = new Map<ServiceSpec, RestartBackoff>();
  let stopped = false;

  // One log per companion for its whole life, restarts included, so a child
  // that is still flushing as its replacement starts writes to the same file
  // through the same size check rather than to a second handle on it. What a
  // dying child says last is usually why it died, so it is kept, not cut off.
  // Each is held to launchd's size, so a crash loop cannot fill the container.
  const logs = new Map<ServiceSpec, BoundedLog>();
  for (const spec of specs) {
    logs.set(spec, new BoundedLog(spec.logPath, (message) => log.warn(`${spec.what} log: ${message}`)));
    backoff.set(spec, new RestartBackoff({ delaysMs: options.restartMs, limit: options.crashLimit }));
  }

  const start = (spec: ServiceSpec) => {
    const [command, ...args] = spec.program;
    if (!command || running.has(spec)) return;
    log.info(`starting ${spec.what}`);
    const child = run(command, args, spec.env);
    running.set(spec, child);
    killOnExit(child);
    // A model server yields to whatever the person at the Mac is doing, as
    // launchd's Nice does for the same server outside the sandbox.
    if (spec.lowPriority && child.pid) {
      try {
        setPriority(child.pid, 5);
      } catch {}
    }

    const file = logs.get(spec);
    const write = (chunk: Buffer) => file?.write(chunk);
    child.stdout?.on("data", write);
    child.stderr?.on("data", write);

    child.on("error", (error) => log.warn(`${spec.what}: ${error.message}`));
    child.on("exit", (code, signal) => {
      if (running.get(spec) === child) running.delete(spec);
      if (stopped || held.has(spec)) return;
      const wait = backoff.get(spec)?.crashed() ?? null;
      if (wait === null) {
        held.add(spec);
        log.error(
          `${spec.what} keeps exiting (${signal ?? code}), so it is left stopped. ` +
            "parlour service logs says why; starting it again from a client tries once more.",
        );
        return;
      }
      log.warn(`${spec.what} exited (${signal ?? code}), starting it again in ${Math.round(wait / 1000)}s`);
      const timer = setTimeout(() => {
        timers.delete(spec);
        if (!stopped && !held.has(spec)) start(spec);
      }, wait);
      timers.set(spec, timer);
    });
  };

  const halt = (spec: ServiceSpec) => {
    held.add(spec);
    const timer = timers.get(spec);
    if (timer) clearTimeout(timer);
    timers.delete(spec);
    running.get(spec)?.kill("SIGTERM");
  };

  for (const spec of specs) start(spec);

  return {
    stop() {
      stopped = true;
      for (const file of logs.values()) file.close();
      for (const timer of timers.values()) clearTimeout(timer);
      for (const child of running.values()) child.kill("SIGTERM");
    },

    control(label, action) {
      const spec = specs.find((candidate) => candidate.label === label);
      if (!spec || stopped) return false;
      if (action === "stop") {
        halt(spec);
        return true;
      }
      const begin = () => {
        held.delete(spec);
        backoff.get(spec)?.reset();
        start(spec);
      };
      const child = running.get(spec);
      if (action === "restart" && child) {
        // Started again once the old one has let go of its port.
        child.once("exit", () => {
          if (!stopped) begin();
        });
        halt(spec);
        return true;
      }
      begin();
      return true;
    },

    states() {
      return specs.map((spec) => ({
        label: spec.label,
        what: spec.what,
        running: running.has(spec),
        pid: running.get(spec)?.pid ?? null,
        held: held.has(spec),
      }));
    },
  };
}
