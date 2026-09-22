import { createInterface } from "node:readline/promises";
import { bold, dim } from "./output.ts";

/**
 * The questions `parlour init` asks, and nothing else does. Every prompt
 * funnels through these four so `--yes` has one meaning throughout: take the
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
const UP = "\x1b[A";
const DOWN = "\x1b[B";

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

export interface Choice<T> {
  value: T;
  label: string;
  /** A few words after the label, for choosing on something other than the name. */
  hint?: string;
}

/**
 * One of a handful of answers, picked with the arrow keys. The alternative is
 * asking a person to type "openai-compatible" correctly, which they should not
 * have to do and which `ask` cannot check.
 *
 * Drawn in place: the list is rewritten over itself on every key and replaced
 * by the one answered line at the end, so a finished `init` reads as a
 * transcript of decisions rather than as every list that was ever shown.
 * Without a terminal the default is taken silently, as every other prompt does.
 */
export function select<T>(question: string, choices: Choice<T>[], current?: T): Promise<T> {
  const found = choices.findIndex((choice) => choice.value === current);
  const start = found < 0 ? 0 : found;
  const fallback = choices[start];
  if (!fallback) throw new Error(`${question} was asked with no answers to choose from`);
  if (!canAsk()) return Promise.resolve(fallback.value);

  const input = process.stdin;
  const out = process.stdout;
  return new Promise((resolve, reject) => {
    let index = start;
    const draw = (first: boolean) => {
      if (!first) out.write(`\x1b[${choices.length}A`);
      for (const [position, choice] of choices.entries()) {
        const chosen = position === index;
        const text = `${chosen ? "\u203a" : " "} ${choice.label}${choice.hint ? `  ${dim(choice.hint)}` : ""}`;
        // Erase the line first: the previous draw may have been longer.
        out.write(`\x1b[2K      ${chosen ? bold(text) : text}\n`);
      }
    };
    const finish = (error?: Error) => {
      input.off("data", onData);
      input.setRawMode(false);
      input.pause();
      // Rub out the list and leave the question with its answer, one line.
      out.write(`\x1b[${choices.length + 1}A\x1b[0J`);
      if (error) {
        out.write(`    ${question}\n`);
        reject(error);
        return;
      }
      const picked = choices[index] as Choice<T>;
      out.write(`    ${question}: ${picked.label}\n`);
      resolve(picked.value);
    };
    const onData = (chunk: string) => {
      if (chunk === UP) index = (index + choices.length - 1) % choices.length;
      else if (chunk === DOWN) index = (index + 1) % choices.length;
      else if (chunk === "k") index = (index + choices.length - 1) % choices.length;
      else if (chunk === "j") index = (index + 1) % choices.length;
      else if (/^[1-9]$/.test(chunk) && Number(chunk) <= choices.length) index = Number(chunk) - 1;
      else if (chunk === "\r" || chunk === "\n" || chunk === EOT) return finish();
      else if (chunk === ETX) return finish(new Error("Interrupted."));
      else return;
      draw(false);
    };

    out.write(`    ${question}\n`);
    draw(true);
    input.setRawMode(true);
    input.setEncoding("utf8");
    input.resume();
    input.on("data", onData);
  });
}
