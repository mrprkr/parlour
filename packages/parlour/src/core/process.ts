import { execFile, spawn } from "node:child_process";
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
