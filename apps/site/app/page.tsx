import Link from "next/link";
import { Diagram } from "./diagram";
import { Flow } from "./flow";
import { InstallButton } from "./install-button";

export default function Home() {
  return (
    <main className="book">
      <section className="opening" aria-labelledby="offer">
        <div className="head">
          <h1 id="offer">
            Ask your house. <span className="turn-line">Nothing you say leaves it.</span>
          </h1>
          <div className="offer">
            <p className="lede">
              Parlour is a voice assistant for your home that runs on a Mac you already own. Lights, heating,
              timers and questions, answered out loud in the room you asked from.
            </p>
            <div className="actions">
              <InstallButton />
              <Link className="docs-link" href="/docs">
                Read the docs
              </Link>
            </div>
          </div>
        </div>
        <Flow figure={<Diagram />} />
      </section>

      <section className="sheet" aria-labelledby="private-heading">
        <h2 id="private-heading">Your voice stays on your Mac</h2>
        <div className="two-col">
          <p>
            The wake word, the recording, the transcription, the model and the voice all run on your Mac.
            There is no account to create and no server of ours in the middle, so there is nothing to trust
            but the machine in your own house.
          </p>
          <p>
            When the local model decides a question is beyond it, and only then, it passes the sentence to
            Claude as text. Your voice never goes with it, the cloud sees one question at a time, and nothing
            in your house is reachable from the other side.
          </p>
        </div>
      </section>

      <section className="sheet" aria-labelledby="rooms-heading">
        <h2 id="rooms-heading">One Mac, heard in every room</h2>
        <p>
          One machine runs the models, holds the tokens and does the answering. Everything else with a
          microphone is a client of it, including the Mac's own, which gets no special treatment. All of them
          need <code>PARLOUR_TOKEN</code>; without it the server stays on loopback and never announces itself.
        </p>
        <div className="table-scroll">
          <table className="schedule">
            <caption>What can listen, and who hears the wake word</caption>
            <thead>
              <tr>
                <th scope="col" className="col">
                  Client
                </th>
                <th scope="col" className="col">
                  How it connects
                </th>
                <th scope="col" className="col">
                  Who hears the wake word
                </th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <th scope="row" className="row">
                  The Mac itself
                </th>
                <td data-label="How it connects">In process.</td>
                <td data-label="Who hears the wake word">Parlour, with openWakeWord.</td>
              </tr>
              <tr>
                <th scope="row" className="row">
                  Another Mac
                </th>
                <td data-label="How it connects">
                  <code>role: "satellite"</code>. Finds the server over Bonjour and holds a socket open.
                </td>
                <td data-label="Who hears the wake word">The server, or the satellite itself.</td>
              </tr>
              <tr>
                <th scope="row" className="row">
                  Voice PE
                </th>
                <td data-label="How it connects">
                  Home Assistant, pointed at the OpenAI-compatible endpoint on <code>/v1</code>.
                </td>
                <td data-label="Who hears the wake word">The device. Home Assistant does the speech.</td>
              </tr>
              <tr>
                <th scope="row" className="row">
                  A phone
                </th>
                <td data-label="How it connects">
                  The page the server serves at <code>/</code>. Hold the button.
                </td>
                <td data-label="Who hears the wake word">
                  Nobody. Your thumb is better, and the phone is not listening all day.
                </td>
              </tr>
              <tr>
                <th scope="row" className="row">
                  Something you built
                </th>
                <td data-label="How it connects">
                  The socket on <code>/listen</code>, raw 16 kHz mono PCM.
                </td>
                <td data-label="Who hears the wake word">The server, or the board. Its choice.</td>
              </tr>
              <tr>
                <th scope="row" className="row">
                  An automation
                </th>
                <td data-label="How it connects">
                  <code>POST /ask</code> with text, and an answer back as text.
                </td>
                <td data-label="Who hears the wake word">Nobody.</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <section className="sheet" aria-labelledby="parts-heading">
        <h2 id="parts-heading">Swap any part of it</h2>
        <p>
          Every stage sits behind a small interface and is picked by name in one config file. What ships is
          the fastest we have found for Apple silicon. Prefer something else? Publish it as an npm package,
          name it in your config, and <code>parlour doctor</code> will tell you whether it is happy.
        </p>
        <div className="table-scroll">
          <table className="schedule">
            <caption>The slots, what fills them, and the key that changes one</caption>
            <thead>
              <tr>
                <th scope="col" className="col">
                  Stage
                </th>
                <th scope="col" className="col">
                  What ships
                </th>
                <th scope="col" className="col">
                  To swap
                </th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <th scope="row" className="row">
                  <span className="disc-inline">1</span>
                  Wake word
                </th>
                <td data-label="What ships">openWakeWord, in process</td>
                <td data-label="To swap">
                  <code>wake.provider</code>
                </td>
              </tr>
              <tr>
                <th scope="row" className="row">
                  <span className="disc-inline">3</span>
                  Speech to text
                </th>
                <td data-label="What ships">whisper.cpp, small.en, kept warm</td>
                <td data-label="To swap">
                  <code>stt.provider</code>
                </td>
              </tr>
              <tr>
                <th scope="row" className="row">
                  <span className="disc-inline">4</span>
                  The local model
                </th>
                <td data-label="What ships">
                  Anything speaking the OpenAI chat API; LM Studio is the easy one
                </td>
                <td data-label="To swap">
                  <code>llm.local.provider</code>
                </td>
              </tr>
              <tr>
                <th scope="row" className="row">
                  <span className="disc-inline">5</span>
                  The cloud model
                </th>
                <td data-label="What ships">Claude, with web search and no house tools</td>
                <td data-label="To swap">
                  <code>llm.cloud.provider</code>
                </td>
              </tr>
              <tr>
                <th scope="row" className="row">
                  <span className="disc-inline">6</span>
                  Text to speech
                </th>
                <td data-label="What ships">Kokoro, in process, with macOS say behind it</td>
                <td data-label="To swap">
                  <code>tts.provider</code>
                </td>
              </tr>
              <tr>
                <th scope="row" className="row">
                  Search
                </th>
                <td data-label="What ships">SearXNG, if you run one</td>
                <td data-label="To swap">
                  <code>search.provider</code>
                </td>
              </tr>
              <tr>
                <th scope="row" className="row">
                  Tools
                </th>
                <td data-label="What ships">Home Assistant over MCP, connectors, timers</td>
                <td data-label="To swap">
                  <code>integrations</code>, as npm packages
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <section className="sheet" aria-labelledby="ha-heading">
        <h2 id="ha-heading">Made for Home Assistant</h2>
        <div className="two-col">
          <p>
            Home Assistant publishes whatever you have exposed to voice assistants, so Parlour can do exactly
            that and nothing more. Expose a light and it can turn it on. Leave it unexposed and it cannot.
          </p>
          <p>
            Mute lives in Home Assistant rather than on the Mac, so the house can keep Parlour quiet while
            everyone sleeps. Point the OpenAI Conversation integration at it and the voice satellites you
            already own get a new brain.
          </p>
        </div>
      </section>

      <section className="sheet" aria-labelledby="not-heading">
        <h2 id="not-heading">What it does not do</h2>
        <ul className="notes">
          <li>
            <strong>Tell voices apart.</strong> Everyone in the house is the same user.
          </li>
          <li>
            <strong>Cancel its own echo.</strong> Which is why barge-in is off by default.
          </li>
          <li>
            <strong>Fail over.</strong> There is one server. If it is off, satellites wait for it; a house
            with two brains that disagree is worse than a house with none.
          </li>
          <li>
            <strong>Keep connectors per person.</strong> Tokens belong to the household, because a satellite
            cannot tell who is talking.
          </li>
          <li>
            <strong>Run on Linux.</strong> Not yet. The platform-specific parts sit behind interfaces, so it
            is a contribution rather than a rewrite, and one we would love to see.
          </li>
          <li>
            <strong>Answer to “Parlour” out of the box.</strong> The install ships the stock{" "}
            <code>hey_jarvis</code> model; <Link href="/docs/wake-word">training your own</Link> takes an
            afternoon.
          </li>
        </ul>
      </section>

      <section className="sheet installation" aria-labelledby="install-heading">
        <h2 id="install-heading">Talking in ten minutes</h2>
        <div className="two-col">
          <pre>
            <code>
              {"npm install -g parlour\n"}
              {"parlour init          "}
              <span className="c"># fetches what it needs and asks a few questions</span>
              {"\nparlour text          "}
              <span className="c"># try it in the terminal, no microphone needed</span>
              {"\nparlour start         "}
              <span className="c"># and now out loud</span>
            </code>
          </pre>
          <p>
            You will need a Mac with Node 22 and Homebrew. <code>init</code> fetches ffmpeg, whisper.cpp and
            the models, asks for your Home Assistant token, offers to add an Anthropic key if you want the
            cloud behind it, and can start Parlour at login. If you would rather have a window than a
            terminal, the <Link href="/docs/desktop">menu bar app</Link> does the same with buttons.
          </p>
        </div>
      </section>

      <section className="sheet" aria-labelledby="source-heading">
        <h2 id="source-heading">Open source, built to be taken apart</h2>
        <p>
          Parlour is MIT licensed and at version 0.1.0. The most useful thing you could add is a provider: a
          new voice, a different speech to text engine, a Linux service manager. The{" "}
          <Link href="/docs/providers">provider guide</Link> walks through one from start to finish, the{" "}
          <a href="https://github.com/mrprkr/parlour/blob/main/CONTRIBUTING.md">contributing guide</a> covers
          the rest, and questions are welcome in the issues.
        </p>
      </section>
    </main>
  );
}
