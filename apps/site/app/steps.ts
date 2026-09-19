/**
 * The seven callouts on the plate, in the order one sentence travels through
 * the house. The numbers are the ones drawn on the section, so the key, the
 * walk and the drawing all agree on what "5" is.
 */
export interface Step {
  n: number;
  what: string;
  how: string;
}

export const steps: Step[] = [
  {
    n: 1,
    what: "“Hey Parlour”",
    how: "openWakeWord hears it on the Mac, or on the satellite in the room. Nothing is recorded before that.",
  },
  {
    n: 2,
    what: "You talk",
    how: "Recording stops on its own after 800 ms of quiet and the audio goes to the Mac, never further.",
  },
  {
    n: 3,
    what: "Words",
    how: "whisper.cpp, small.en, kept warm on the Mac so it is done in under a second.",
  },
  {
    n: 4,
    what: "Thinking",
    how: "A local model with tools: the house over MCP, timers, search, and the accounts you have connected.",
  },
  {
    n: 5,
    what: "A hand from the cloud",
    how: "Only when the local model decides a question is beyond it, Claude gets the sentence. Text, never audio.",
  },
  {
    n: 6,
    what: "A voice",
    how: "Kokoro on the Mac, speaking the first sentence while the rest is still being made.",
  },
  {
    n: 7,
    what: "Your speakers",
    how: "In whichever room you asked from.",
  },
];
