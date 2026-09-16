import { type ChildProcess, execFile, spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

/**
 * The little that core needs from child processes. Several providers shell out
 * to a command line tool (afplay, say, ffmpeg) rather than bind a library, so
 * there is nothing to compile and the tool can be swapped without a rebuild.
 */

export interface RunOptions {
  /** Written to stdin, which is how text reaches `say` without argv quoting. */
  input?: string;
  signal?: AbortSignal;
}

/**
 * Spawns a command, resolves when it exits, and kills it if the signal fires.
 * An aborted process resolves rather than rejects: being interrupted is what
 * barge-in and the next wake word are supposed to do, not a failure.
 */
export function run(command: string, args: string[], options: RunOptions = {}): Promise<void> {
  const { input, signal } = options;
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return resolve();

    // Always piped, so the stream types are not optional. Nothing reads the
    // output, and stdin is simply closed when there is no text to send.
    const proc = spawn(command, args, { stdio: ["pipe", "ignore", "pipe"] });
    const err: Buffer[] = [];
    proc.stderr.on("data", (chunk: Buffer) => err.push(chunk));

    const abort = () => proc.kill("SIGTERM");
    signal?.addEventListener("abort", abort, { once: true });

    proc.on("error", (error) => {
      signal?.removeEventListener("abort", abort);
      reject(error);
    });
    proc.on("close", (code) => {
      signal?.removeEventListener("abort", abort);
      if (signal?.aborted || code === 0) resolve();
      else reject(new Error(Buffer.concat(err).toString().trim() || `${command} exited ${code}`));
    });

    proc.stdin.on("error", () => {});
    proc.stdin.end(input ?? "");
  });
}

/** A scratch WAV path, for the tools that can only read from or write to a file. */
export async function withTempWav<T>(work: (file: string) => Promise<T>): Promise<T> {
  const dir = await mkdtemp(join(tmpdir(), "parlour-"));
  try {
    return await work(join(dir, "speech.wav"));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

const execFileAsync = promisify(execFile);

/** The signals that mean "stop now": Ctrl-C, launchd and a closed terminal. */
const SHUTDOWN_SIGNALS = ["SIGINT", "SIGTERM", "SIGHUP"] as const;

/**
 * Runs `stop` once, on whichever shutdown signal arrives first. Ctrl-C is
 * SIGINT, but launchd stops a job with SIGTERM (`launchctl unload`, which is
 * what `parlour service restart` and `uninstall` and a logout send), and a
 * closing terminal sends SIGHUP. Node's default for the last two is to die
 * on the spot without running anything, which leaves the ffmpeg child holding
 * the microphone. Handling all three the same way means the process always
 * gets to close what it opened. The other two handlers are removed when one
 * fires, so a second signal falls back to the default and ends a stuck exit.
 */
export function onShutdown(stop: (signal: NodeJS.Signals) => void): void {
  const handlers = new Map<NodeJS.Signals, () => void>();
  for (const signal of SHUTDOWN_SIGNALS) {
    const handler = () => {
      for (const [other, fn] of handlers) process.removeListener(other, fn);
      stop(signal);
    };
    handlers.set(signal, handler);
    process.once(signal, handler);
  }
}

/**
 * Kills a child when this process exits, whatever the reason. The signal
 * handlers close things in order; this is the net under them, for an exit
 * they never see (an uncaught exception, a `process.exit` from somewhere),
 * because a child that outlives its parent is reparented to launchd and, if it
 * is ffmpeg, keeps the microphone open. Returns the hook so a test can fire it.
 */
export function killOnExit(proc: ChildProcess): () => void {
  const kill = () => {
    if (proc.exitCode === null && proc.signalCode === null) proc.kill("SIGKILL");
  };
  process.once("exit", kill);
  proc.once("exit", () => process.removeListener("exit", kill));
  return kill;
}

/**
 * The pids of processes launchd has adopted whose command line matches.
 * An orphan is one whose parent is pid 1 and that was not started by launchd
 * on purpose, which for a command line ffmpeg is always the case.
 */
export async function orphans(pattern: RegExp): Promise<number[]> {
  try {
    const { stdout } = await execFileAsync("ps", ["-axo", "pid=,ppid=,command="]);
    return parseOrphans(stdout, pattern);
  } catch {
    return [];
  }
}

/** `ps -axo pid=,ppid=,command=` output to the pids whose parent is 1 and whose command matches. */
export function parseOrphans(ps: string, pattern: RegExp): number[] {
  const found: number[] = [];
  for (const line of ps.split("\n")) {
    const match = line.match(/^\s*(\d+)\s+(\d+)\s+(.*)$/);
    if (!match) continue;
    const [, pid, ppid, command] = match as [string, string, string, string];
    if (ppid === "1" && pattern.test(command)) found.push(Number(pid));
  }
  return found;
}

/**
 * Where a binary is on the PATH, or null. `parlour doctor` prints the path so
 * that a Homebrew and a MacPorts copy can be told apart.
 */
export async function findOnPath(binary: string): Promise<string | null> {
  try {
    const { stdout } = await execFileAsync("which", [binary]);
    return stdout.trim() || null;
  } catch {
    return null;
  }
}
