import assert from "node:assert/strict";
import { PassThrough } from "node:stream";
import { test } from "node:test";
import { select } from "./prompts.ts";
import { GoTo, runWizard, type Step } from "./wizard.ts";

/** A terminal on both ends, as in prompts.test.ts, with the keys fed in by the test. */
function terminal(): { keys: PassThrough; restore: () => void } {
  const input = new PassThrough();
  Object.assign(input, { isTTY: true, setRawMode: () => {} });
  const stdin = Object.getOwnPropertyDescriptor(process, "stdin");
  Object.defineProperty(process, "stdin", { value: input, configurable: true });
  const wasTTY = process.stdout.isTTY;
  const write = process.stdout.write.bind(process.stdout);
  process.stdout.isTTY = true;
  // The test runner reports to its parent over this same stdout, in buffers;
  // only the strings are the prompts drawing, and only those are swallowed.
  process.stdout.write = ((chunk: unknown, ...rest: unknown[]) =>
    typeof chunk === "string"
      ? true
      : (write as (...args: unknown[]) => boolean)(chunk, ...rest)) as typeof process.stdout.write;
  return {
    keys: input,
    restore: () => {
      process.stdout.write = write;
      process.stdout.isTTY = wasTTY;
      if (stdin) Object.defineProperty(process, "stdin", stdin);
    },
  };
}

const ESC = String.fromCharCode(27);
const DOWN = `${ESC}[B`;
const tick = () => new Promise((resolve) => setImmediate(resolve));

/** Presses the keys one question at a time, waiting for each prompt to start listening. */
async function press(keys: PassThrough, ...sequence: string[]): Promise<void> {
  for (const key of sequence) {
    await tick();
    keys.write(key);
  }
}

interface State {
  role: string;
  room: string;
  voice: string;
}

const yesNo = [
  { value: "server", label: "Server" },
  { value: "satellite", label: "Satellite" },
];

function steps(): Step<State>[] {
  return [
    {
      section: "Machine",
      title: "Role",
      run: async (state) => {
        state.role = await select("Role", yesNo, state.role);
      },
    },
    {
      section: "Machine",
      title: "Room",
      when: (state) => state.role === "satellite",
      run: async (state) => {
        state.room = await select(
          "Room",
          [
            { value: "kitchen", label: "Kitchen" },
            { value: "hall", label: "Hall" },
          ],
          state.room,
        );
      },
    },
    {
      section: "Voice",
      title: "Voice",
      run: async (state) => {
        state.voice = await select(
          "Voice",
          [
            { value: "emma", label: "Emma" },
            { value: "george", label: "George" },
          ],
          state.voice,
        );
      },
    },
  ];
}

test("without a terminal every visible step runs once, under one heading per title", async () => {
  const headings: string[] = [];
  const state = { role: "server", room: "", voice: "emma" };
  await runWizard(steps(), state, {
    interactive: false,
    heading: "Setup",
    report: { step: (text) => headings.push(text), ok: () => {} },
  });
  assert.deepEqual(headings, ["Role", "Voice"], "the room is skipped for a server");
  assert.deepEqual(state, { role: "server", room: "", voice: "emma" });
});

test("Escape goes back a question, keeps the answer given, and skips what no longer applies", async () => {
  const tty = terminal();
  try {
    const state = { role: "server", room: "kitchen", voice: "emma" };
    const done = runWizard(steps(), state, {
      interactive: true,
      heading: "Setup",
      report: { step: () => {}, ok: () => {} },
    });
    // Satellite, then Hall; then at the voice, change our mind twice over:
    // back to the room, back to the role, and make it a server after all.
    await press(tty.keys, DOWN, "\r", DOWN, "\r", ESC, ESC, `${ESC}[A`, "\r", DOWN, "\r");
    await done;
    // The room answered on the way is kept; the voice was reached straight
    // from the role, since a server has no room to ask about.
    assert.deepEqual(state, { role: "server", room: "hall", voice: "george" });
  } finally {
    tty.restore();
  }
});

test("a step can send the wizard to the start of a section, which is how the review changes an answer", async () => {
  const tty = terminal();
  try {
    const state = { role: "server", room: "", voice: "emma" };
    let reviews = 0;
    const withReview: Step<State>[] = [
      ...steps(),
      {
        section: "Review",
        title: "Review",
        run: async () => {
          reviews++;
          if (reviews === 1) throw new GoTo("Voice");
        },
      },
    ];
    const done = runWizard(withReview, state, {
      interactive: true,
      heading: "Setup",
      report: { step: () => {}, ok: () => {} },
    });
    await press(tty.keys, "\r", "\r", DOWN, "\r");
    await done;
    assert.equal(reviews, 2);
    assert.equal(state.voice, "george");
  } finally {
    tty.restore();
  }
});
