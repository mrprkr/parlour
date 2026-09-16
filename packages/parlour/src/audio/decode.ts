import { spawn } from "node:child_process";

/**
 * Anything ffmpeg understands, to the 16 kHz mono WAV the rest of the pipeline
 * expects. Phones record Opus in WebM or AAC in MP4 depending on the browser,
 * and neither is worth teaching whisper about.
 */
export function decodeToWav(input: Buffer, sampleRate = 16000): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const proc = spawn("ffmpeg", [
      "-hide_banner", "-loglevel", "error",
      "-i", "pipe:0",
      "-ac", "1",
      "-ar", String(sampleRate),
      "-f", "wav",
      "pipe:1",
    ]);

    const out: Buffer[] = [];
    const err: Buffer[] = [];
    proc.stdout.on("data", (chunk: Buffer) => out.push(chunk));
    proc.stderr.on("data", (chunk: Buffer) => err.push(chunk));
    proc.on("error", reject);
    proc.on("close", (code) =>
      code === 0
        ? resolve(Buffer.concat(out))
        : reject(new Error(Buffer.concat(err).toString().trim() || `ffmpeg exited ${code}`)),
    );
    proc.stdin.on("error", () => {});
    proc.stdin.end(input);
  });
}
