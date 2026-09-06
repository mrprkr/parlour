import { spawn } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

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

/**
 * Plays a WAV out of this machine's speakers. afplay is always on a Mac and
 * needs no arguments to get the default output right, but it will only read a
 * file, so the audio goes to a temporary one and is cleaned up after.
 */
export async function playWav(wav: Buffer, signal?: AbortSignal): Promise<void> {
  if (signal?.aborted) return;
  const dir = await mkdtemp(join(tmpdir(), "home-agent-"));
  const file = join(dir, "reply.wav");
  try {
    await writeFile(file, wav);
    await run("afplay", [file], { signal });
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

/** A scratch WAV path, for the engines that can only write to a file. */
export async function withTempWav<T>(work: (file: string) => Promise<T>): Promise<T> {
  const dir = await mkdtemp(join(tmpdir(), "home-agent-"));
  try {
    return await work(join(dir, "speech.wav"));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
