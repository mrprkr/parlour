import { bold, dim } from "./output.ts";

/**
 * The questions `parlour init` asks, and nothing else does. Every prompt
 * funnels through these four so `--yes` has one meaning throughout: take the
 * default, and only stop for something that has no sensible default.
 *
 * A question needs a terminal on both ends. Without one (the desktop app, a
 * pipe, a LaunchAgent) the default is taken silently, which is what `--yes`
 * would have done anyway.
 *
 * All four read the keyboard in raw mode rather than through readline, so
 * Escape can be told apart from everything else: inside the setup wizard it
 * means "take me back a question", and readline would swallow it.
 */

/** The control characters raw mode hands over, named so the branches below can be told apart. */
const EOT = "\x04";
const ETX = "\x03";
const NAK = "\x15";
const DEL = "\x7f";
const ESC = "\x1b";
const UP = "\x1b[A";
const DOWN = "\x1b[B";
const LEFT = "\x1b[D";

/**
 * Thrown by a prompt when Escape is pressed, for the wizard to catch and step
 * backwards. Only while `allowBack` is on: outside the wizard there is nothing
 * to go back to, and a stray Escape should do nothing rather than throw.
 */
export class GoBack extends Error {
  constructor() {
    super("Went back.");
    this.name = "GoBack";
  }
}

let backAllowed = false;
let answered = 0;

/** Turned on by the wizard while it runs, so Escape means something. */
export function allowBack(on: boolean): void {
  backAllowed = on;
}

/**
 * How many questions have been answered so far. The wizard compares it before
 * and after a step: a step that asked nothing is not somewhere to go back to,
 * and Escape half way through a step goes back to its own first question.
 */
export function answeredCount(): number {
  return answered;
}

export function canAsk(): boolean {
  return Boolean(process.stdin.isTTY && process.stdout.isTTY);
}

/** What the keys do, under the question, only while there is somewhere to go back to. */
function keysHint(keys: string): string {
  return `      ${dim(backAllowed ? `${keys}  esc back` : keys)}`;
}

/**
 * A chunk from the terminal as the keys in it. Usually one key a chunk, but a
 * quick typist or a paste delivers several at once, and an arrow is three
 * characters that must stay together. A lone Escape is one key of its own.
 */
const SEQUENCE = new RegExp(`^${ESC}(\\[[0-9;]*[A-Za-z~]|O[A-Za-z])`);

export function splitKeys(chunk: string): string[] {
  const keys: string[] = [];
  let at = 0;
  while (at < chunk.length) {
    const rest = chunk.slice(at);
    const sequence = SEQUENCE.exec(rest);
    const key = sequence ? sequence[0] : (rest[0] as string);
    keys.push(key);
    at += key.length;
  }
  return keys;
}

/**
 * Raw keys until `onKey` settles the promise. Shared by every prompt so that
 * raw mode is always put back, whichever way the question ends.
 */
function readKeys<T>(
  onKey: (chunk: string, settle: { done: (value: T) => void; fail: (error: Error) => void }) => void,
): Promise<T> {
  const input = process.stdin;
  return new Promise((resolve, reject) => {
    const stop = () => {
      input.off("data", onData);
      input.setRawMode(false);
      input.pause();
    };
    const settle = {
      done: (value: T) => {
        settled = true;
        stop();
        answered++;
        resolve(value);
      },
      fail: (error: Error) => {
        settled = true;
        stop();
        reject(error);
      },
    };
    let settled = false;
    const onData = (chunk: string) => {
      for (const key of splitKeys(chunk)) {
        if (settled) return;
        onKey(key, settle);
      }
    };
    input.setRawMode(true);
    input.setEncoding("utf8");
    input.resume();
    input.on("data", onData);
  });
}

/**
 * One line of typing, echoed or masked. Backspace, Ctrl-U to clear, Enter to
 * finish, Ctrl-C to stop, and Escape to go back when the wizard allows it.
 * Other escape sequences (arrows, function keys) are dropped rather than
 * typed into the answer.
 */
function line(prompt: string, mask: boolean): Promise<string> {
  const out = process.stdout;
  out.write(prompt);
  let value = "";
  return readKeys<string>((key, settle) => {
    if (key === ESC) {
      if (!backAllowed) return;
      out.write("\n");
      return settle.fail(new GoBack());
    }
    if (key.startsWith(ESC)) return;
    if (key === "\r" || key === "\n" || key === EOT) {
      out.write("\n");
      return settle.done(value.trim());
    }
    if (key === ETX) {
      out.write("\n");
      return settle.fail(new Error("Interrupted."));
    }
    if (key === DEL || key === "\b") {
      if (!value) return;
      value = value.slice(0, -1);
      if (!mask) out.write("\b \b");
    } else if (key === NAK) {
      if (!mask) out.write("\b \b".repeat(value.length));
      value = "";
    } else if (key >= " ") {
      value += key;
      if (!mask) out.write(key);
    }
  });
}

/** `question [default]: `, with the default taken on an empty line. */
export async function ask(question: string, fallback: string): Promise<string> {
  if (!canAsk()) return fallback;
  const answer = await line(`    ${question} [${fallback}]: `, false);
  return answer || fallback;
}

/** `question [Y/n]: `. Anything starting with n is no; anything else is the default. */
export async function confirm(question: string, fallback = true): Promise<boolean> {
  if (!canAsk()) return fallback;
  const answer = await line(`    ${question} [${fallback ? "Y/n" : "y/N"}]: `, false);
  if (!answer) return fallback;
  return !/^n/i.test(answer);
}

/**
 * A value typed without echo, for tokens and keys. The same line editor as
 * `ask`, with nothing drawn as it is typed.
 */
export function secret(question: string): Promise<string> {
  if (!canAsk()) return Promise.resolve("");
  return line(`    ${question}: `, true);
}

export interface Choice<T> {
  value: T;
  label: string;
  /** A few words after the label, for choosing on something other than the name. */
  hint?: string;
}

/** One line of a list, cut to the terminal's width so a long hint cannot wrap and break the redraw. */
function choiceLine(choice: Choice<unknown>, chosen: boolean): string {
  const width = Math.max(20, (process.stdout.columns || 100) - 8);
  const head = `${chosen ? "›" : " "} ${choice.label}`;
  let hint = choice.hint ?? "";
  const room = width - head.length - 2;
  if (hint.length > room) hint = room > 1 ? `${hint.slice(0, room - 1)}…` : "";
  const text = hint ? `${head}  ${chosen ? hint : dim(hint)}` : head;
  return `      ${chosen ? bold(text) : text}`;
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

  const out = process.stdout;
  // The list, then the line saying which keys do what.
  const height = choices.length + 1;
  let index = start;
  const draw = (first: boolean) => {
    if (!first) out.write(`\x1b[${height}A`);
    for (const [position, choice] of choices.entries()) {
      // Erase the line first: the previous draw may have been longer.
      out.write(`\x1b[2K${choiceLine(choice, position === index)}\n`);
    }
    out.write(`\x1b[2K${keysHint("↑↓ move  enter choose")}\n`);
  };
  // Rub out the list and leave the question with its answer, one line.
  const rubOut = () => out.write(`\x1b[${height + 1}A\x1b[0J`);

  out.write(`    ${question}\n`);
  draw(true);
  return readKeys<T>((chunk, settle) => {
    if (chunk === UP || chunk === "k") index = (index + choices.length - 1) % choices.length;
    else if (chunk === DOWN || chunk === "j") index = (index + 1) % choices.length;
    else if (/^[1-9]$/.test(chunk) && Number(chunk) <= choices.length) index = Number(chunk) - 1;
    else if (chunk === "\r" || chunk === "\n" || chunk === EOT) {
      const picked = choices[index] as Choice<T>;
      rubOut();
      out.write(`    ${question}: ${picked.label}\n`);
      return settle.done(picked.value);
    } else if (chunk === ETX) {
      rubOut();
      out.write(`    ${question}\n`);
      return settle.fail(new Error("Interrupted."));
    } else if ((chunk === ESC || chunk === LEFT) && backAllowed) {
      rubOut();
      return settle.fail(new GoBack());
    } else return;
    draw(false);
  });
}
