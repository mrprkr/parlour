// The questions on /help. The page, its FAQPage structured data and its
// markdown twin all read this list, so an answer is only ever written once.
// Keep each answer to what the docs and the code already say.

export interface Question {
  question: string;
  answer: string;
  /** A docs page that says more, if there is one. */
  more?: { label: string; href: string };
}

export const faq: Question[] = [
  {
    question: "What does Parlour cost?",
    answer:
      "Nothing. Parlour is free and open source under the MIT licence: the npm package, the menu bar app and the source. There is no account and no subscription. If you choose to add a cloud model, that provider bills you directly for what you use.",
    more: { label: "Pricing", href: "/pricing" },
  },
  {
    question: "What do I need to run it?",
    answer:
      "A Mac with Apple silicon that is on most of the time, Node 22 or later and Homebrew. Every other room just needs a microphone. Home Assistant is optional, but it is how Parlour reaches the lights, the heating and the rest of the house.",
    more: { label: "Getting started", href: "/docs/getting-started" },
  },
  {
    question: "How do I install it?",
    answer:
      "Run npm install -g parlour, then parlour init, which fetches what it needs and asks a few questions. Or download the menu bar app, which does the same setup in a window.",
    more: { label: "Getting started", href: "/docs/getting-started" },
  },
  {
    question: "Does my voice leave the house?",
    answer:
      "No. The wake word, the transcription, the model and the voice all run on your Mac. If you add a cloud model, the local model can pass it a single question as text when it needs help, never the recording and never the keys to your home. Leave the key empty and nothing leaves at all.",
    more: { label: "Privacy policy", href: "/privacy" },
  },
  {
    question: "Do I need an account?",
    answer: "No. Parlour has no account, no sign-up and no server of ours in the middle.",
  },
  {
    question: "What can it control?",
    answer:
      "Whatever you have exposed to voice assistants in Home Assistant, through its MCP Server integration, plus timers, search and the accounts and MCP servers you connect. Expose more and Parlour can do more.",
    more: { label: "Home Assistant", href: "/docs/home-assistant" },
  },
  {
    question: "Can other rooms, phones or scripts talk to it?",
    answer:
      "Yes. The Mac is the server and everything else is a client: another Mac as a satellite, a phone in the browser, a Home Assistant Voice PE, custom hardware on a raw audio socket, or an automation posting text to its HTTP API.",
    more: { label: "Clients", href: "/docs/clients" },
  },
  {
    question: "Does it run on Linux, Windows or an Intel Mac?",
    answer:
      "Not yet. The server needs macOS on Apple silicon, because the models are built for it. A Linux service manager is one of the most useful things to contribute.",
    more: { label: "Architecture", href: "/docs/architecture" },
  },
  {
    question: "Can I change the wake word, the voice or the models?",
    answer:
      "Yes, all by name in one config file. It answers to hey_jarvis out of the box, and you can train a name of your own. Anything not built in can be plugged in as an npm package.",
    more: { label: "Providers", href: "/docs/providers" },
  },
  {
    question: "Where do I report a bug or ask for help?",
    answer:
      "Open an issue on GitHub. Report a security problem privately through GitHub's vulnerability reporting instead, so it is not public before it is fixed.",
    more: { label: "Contact", href: "/contact" },
  },
];
