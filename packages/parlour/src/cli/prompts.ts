import { createInterface } from "node:readline/promises";

/**
 * The questions `parlour init` asks, and nothing else does. Every prompt
 * funnels through these three so `--yes` has one meaning throughout: take the
 * default, and only stop for something that has no sensible default.
 *
 * A question needs a terminal on both ends. Without one (the desktop app, a
 * pipe, a LaunchAgent) the default is taken silently, which is what `--yes`
 * would have done anyway.
 */

/** The control characters raw mode hands over, named so the branches below can be told apart. */
const EOT = "\x04";
const ETX = "\x03";
const DEL = "\x7f";

export function canAsk(): boolean {
  return Boolean(process.stdin.isTTY && process.stdout.isTTY);
}

async function line(prompt: string): Promise<string> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    return (await rl.question(prompt)).trim();
  } finally {
    rl.close();
  }
}

/** `question [default]: `, with the default taken on an empty line. */
export async function ask(question: string, fallback: string): Promise<string> {
  if (!canAsk()) return fallback;
  const answer = await line(`    ${question} [${fallback}]: `);
  return answer || fallback;
}

/** `question [Y/n]: `. Anything starting with n is no; anything else is the default. */
export async function confirm(question: string, fallback = true): Promise<boolean> {
  if (!canAsk()) return fallback;
  const answer = await line(`    ${question} [${fallback ? "Y/n" : "y/N"}]: `);
  if (!answer) return fallback;
  return !/^n/i.test(answer);
}

/**
 * A value typed without echo, for tokens and keys. Raw mode rather than a
 * muted readline: readline's masking needs a private method, and the four
 * keys that matter (Enter, Backspace, Ctrl-C, Ctrl-D) fit in a few lines.
 */
export function secret(question: string): Promise<string> {
  if (!canAsk()) return Promise.resolve("");
  const input = process.stdin;
  return new Promise((resolve, reject) => {
    let value = "";
    const finish = (error?: Error) => {
      input.off("data", onData);
      input.setRawMode(false);
      input.pause();
      process.stdout.write("\n");
      if (error) reject(error);
      else resolve(value);
    };
    const onData = (chunk: string) => {
      for (const char of chunk) {
        if (char === "\r" || char === "\n" || char === EOT) return finish();
        if (char === ETX) return finish(new Error("Interrupted."));
        if (char === DEL || char === "\b") value = value.slice(0, -1);
        else value += char;
      }
    };
    process.stdout.write(`    ${question}: `);
    input.setRawMode(true);
    input.setEncoding("utf8");
    input.resume();
    input.on("data", onData);
  });
}
