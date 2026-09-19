import Link from "next/link";
import { InstallButton } from "./install-button";

export default function Home() {
  return (
    <main>
      <section className="hero">
        <h1>A voice assistant for your home, on a Mac you already own.</h1>
        <p className="lede">
          Say the wake word and ask for what you want. Parlour turns the lights down, sets a timer, checks the
          calendar, and answers out loud. A small model on your Mac handles the house. When a question is
          beyond it, a cloud model steps in, and all it ever hears is the sentence you said, never your voice.
        </p>
        <div className="actions">
          <InstallButton />
          <Link className="quiet" href="/docs">
            Read the docs
          </Link>
        </div>
      </section>

      <section className="loop" aria-labelledby="loop-heading">
        <h2 id="loop-heading" className="visually-hidden">
          What happens when you speak
        </h2>
        <ol>
          <li className="lit">
            <span className="what">“Hey Parlour”</span>
            <span className="how">openWakeWord listens on your Mac, and only your Mac</span>
          </li>
          <li>
            <span className="what">You talk</span>
            <span className="how">it stops recording on its own after 800 ms of quiet</span>
          </li>
          <li>
            <span className="what">Words</span>
            <span className="how">whisper.cpp, kept warm so it is done in under a second</span>
          </li>
          <li>
            <span className="what">Thinking</span>
            <span className="how">
              a local model with tools: your house over MCP, timers, search, your connected accounts
            </span>
          </li>
          <li className="branch">
            <span className="what">A hand from the cloud</span>
            <span className="how">Claude, only when the local model decides a question is beyond it</span>
          </li>
          <li>
            <span className="what">A voice</span>
            <span className="how">
              Kokoro on your Mac, speaking the first sentence while the rest is still being made
            </span>
          </li>
          <li>
            <span className="what">Your speakers</span>
            <span className="how">or whichever room you asked from</span>
          </li>
        </ol>
      </section>

      <section className="pillars">
        <div>
          <h2>Your voice stays at home</h2>
          <p>
            The wake word, the transcription, the model and the voice all run on the one machine you own.
            There is no account to create and no server of ours in the middle. Asking the cloud for help is a
            decision the local model makes one question at a time, and it only ever sends the text.
          </p>
        </div>
        <div>
          <h2>Swap any part you like</h2>
          <p>
            The wake word, speech to text, the models, the voice, search: each one is a provider you choose by
            name in a single config file. The built-in ones are the fastest we have found for Apple silicon.
            Prefer something else? Publish it as an npm package, name it in your config, and{" "}
            <code>parlour doctor</code> will tell you whether it is happy.
          </p>
        </div>
        <div>
          <h2>One Mac, every room</h2>
          <p>
            One Mac runs the models and keeps the keys. Anything else with a microphone becomes a satellite
            that finds it on its own: another Mac, a phone with a button to hold, a Voice PE through Home
            Assistant, or a board you soldered yourself streaming audio to a socket. Your automations get a
            simple endpoint too: text in, answer out.
          </p>
        </div>
      </section>

      <section className="house">
        <h2>Made for Home Assistant</h2>
        <p>
          Home Assistant's MCP Server integration publishes whatever you have exposed to voice assistants as
          tools, so Parlour can do exactly what you have allowed and nothing more. Expose a light and it can
          turn it on; leave it unexposed and it cannot. A mute switch lives in Home Assistant rather than on
          the Mac, so the house itself can keep Parlour quiet while everyone is asleep. Point the OpenAI
          Conversation integration at Parlour and the voice satellites you already own start using it as their
          brain.
        </p>
      </section>

      <section className="start">
        <h2>Up and running in ten minutes</h2>
        <pre>
          <code>
            {"npm install -g parlour\n"}
            {"parlour init          "}
            <span className="c"># fetches what it needs and asks a few questions</span>
            {"\nparlour text          "}
            <span className="c"># chat in the terminal first, no microphone needed</span>
            {"\nparlour start         "}
            <span className="c"># and now out loud</span>
          </code>
        </pre>
        <p>
          You will need a Mac with Node 22 and Homebrew. <code>init</code> fetches ffmpeg, whisper.cpp and the
          models, asks for your Home Assistant token, offers to add an Anthropic key if you would like the
          cloud behind it, and can set Parlour to start at login. If you would rather have a window than a
          terminal, the <Link href="/docs/desktop">menu bar app</Link> does the same things with buttons.
        </p>
      </section>

      <section className="contribute">
        <h2>Open source</h2>
        <p>
          Parlour is MIT licensed and built to be extended. The most useful thing you could add is a provider:
          a new voice, a different speech to text engine, a Linux service manager. The{" "}
          <Link href="/docs/providers">provider guide</Link> walks through one from start to finish, and the{" "}
          <a href="https://github.com/mrprkr/parlour/blob/main/CONTRIBUTING.md">contributing guide</a> covers
          the rest. Questions and ideas are welcome in the issues.
        </p>
      </section>
    </main>
  );
}
