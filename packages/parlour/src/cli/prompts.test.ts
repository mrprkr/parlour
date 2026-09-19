import assert from "node:assert/strict";
import { PassThrough } from "node:stream";
import { test } from "node:test";
import { select } from "./prompts.ts";

/**
 * A terminal on both ends, which is what `canAsk` looks for, with what was
 * drawn collected rather than printed. The real stdin is a file descriptor
 * here, so it is replaced outright: node runs every test file in its own
 * process, so nothing outside this one sees it.
 */
function terminal(): { keys: PassThrough; drawn: () => string; restore: () => void } {
  const input = new PassThrough();
  // setEncoding is the stream's own: select asks for utf8, and without it the
  // keys arrive as buffers and nothing it compares them to ever matches.
  Object.assign(input, { isTTY: true, setRawMode: () => {} });
  const stdin = Object.getOwnPropertyDescriptor(process, "stdin");
  Object.defineProperty(process, "stdin", { value: input, configurable: true });
  const wasTTY = process.stdout.isTTY;
  const write = process.stdout.write.bind(process.stdout);
  const chunks: string[] = [];
  process.stdout.isTTY = true;
  process.stdout.write = ((chunk: string) => {
    chunks.push(String(chunk));
    return true;
  }) as typeof process.stdout.write;
  return {
    keys: input,
    drawn: () => chunks.join(""),
    restore: () => {
      process.stdout.write = write;
      process.stdout.isTTY = wasTTY;
      if (stdin) Object.defineProperty(process, "stdin", stdin);
    },
  };
}

/** Everything the escape codes were there to move around, so the assertions read. */
const ESC = String.fromCharCode(27);
const ESCAPES = new RegExp(`${ESC}\\[[0-9]*[A-Za-z]`, "g");
const plain = (text: string) => text.replace(ESCAPES, "");

test("select starts on the current answer, moves with the arrows, and leaves one line", async () => {
  const tty = terminal();
  try {
    const answer = select(
      "Which model",
      [
        { value: "small", label: "Small", hint: "1 GB" },
        { value: "medium", label: "Medium", hint: "4 GB" },
        { value: "large", label: "Large", hint: "9 GB" },
      ],
      "medium",
    );
    // Drawn before a key is pressed, with the cursor on what is set now.
    assert.match(plain(tty.drawn()), /› Medium/);

    tty.keys.write(`${ESC}[B`);
    tty.keys.write("\r");
    assert.equal(await answer, "large");

    // The list is rubbed out and the question kept with its answer, so a
    // finished init reads as a transcript of decisions.
    assert.match(plain(tty.drawn()), /Which model: Large\n$/);
  } finally {
    tty.restore();
  }
});

test("select wraps, takes a number, and hands Ctrl-C back as an interruption", async () => {
  const tty = terminal();
  try {
    const choices = [
      { value: 1, label: "One" },
      { value: 2, label: "Two" },
      { value: 3, label: "Three" },
    ];
    const first = select("Pick", choices, 1);
    tty.keys.write(`${ESC}[A`); // up from the first wraps to the last
    tty.keys.write("\r");
    assert.equal(await first, 3);

    const second = select("Pick", choices, 1);
    tty.keys.write("2");
    tty.keys.write("\r");
    assert.equal(await second, 2);

    const third = select("Pick", choices, 1);
    tty.keys.write(String.fromCharCode(3));
    await assert.rejects(third, /Interrupted/);
  } finally {
    tty.restore();
  }
});

test("without a terminal select takes the default, as every other prompt does", async () => {
  // No stdin replacement: the test runner's stdin is not a TTY, so nothing is
  // asked and nothing is drawn. This is the desktop app's path, and a pipe's.
  assert.equal(
    await select(
      "Which",
      [
        { value: "a", label: "A" },
        { value: "b", label: "B" },
      ],
      "b",
    ),
    "b",
  );
});
