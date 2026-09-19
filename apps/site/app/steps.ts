/**
 * The seven stages a question passes through, in order. The same list draws
 * the signal path and sets the key beside it, so the diagram and the words
 * can never disagree about what "4" is.
 */
export interface Step {
  n: number;
  /** The name on the diagram and in the key. */
  label: string;
  /** The part that does it, set under the label on the diagram. */
  detail: string;
  /** One sentence in the key. */
  how: string;
}

export const steps: Step[] = [
  {
    n: 1,
    label: "Wake word",
    detail: "openWakeWord",
    how: "“Hey Parlour”, heard on the Mac or on a satellite in the room. Nothing is recorded before that.",
  },
  {
    n: 2,
    label: "Your voice",
    detail: "800 ms of quiet",
    how: "Recording stops when you do. The audio goes to the Mac and no further.",
  },
  {
    n: 3,
    label: "Words",
    detail: "whisper.cpp",
    how: "small.en, kept warm, so a sentence becomes text in under a second.",
  },
  {
    n: 4,
    label: "Thinking",
    detail: "a local model",
    how: "A small model with tools: your house over MCP, timers, search and the accounts you have connected.",
  },
  {
    n: 5,
    label: "Claude",
    detail: "text only, when asked",
    how: "Asked only when the local model decides a question is beyond it, and given the sentence as text.",
  },
  {
    n: 6,
    label: "A voice",
    detail: "Kokoro",
    how: "Speaking the first sentence while the rest is still being written.",
  },
  {
    n: 7,
    label: "Your speakers",
    detail: "the room you asked",
    how: "The answer arrives out loud, where you are.",
  },
];
