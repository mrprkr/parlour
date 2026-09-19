import Link from "next/link";
import { House } from "./house";
import { InstallButton } from "./install-button";
import { Plan } from "./plan";
import { Walk } from "./walk";

export default function Home() {
  return (
    <main className="book">
      <section className="plate-1" aria-labelledby="offer">
        <div className="head">
          <h1 id="offer">A voice assistant for your home, on a Mac you already own.</h1>
          <div className="offer">
            <p className="lede">
              Say the wake word and ask. Lights, timers, the calendar, answered out loud by the one Mac in the
              house.
            </p>
            <div className="actions">
              <InstallButton />
              <Link className="docs-link" href="/docs">
                Read the docs
              </Link>
            </div>
          </div>
        </div>
        <Walk figure={<House />} />
      </section>

      <section className="sheet wall" aria-labelledby="wall-heading">
        <h2 id="wall-heading">What leaves the house</h2>
        <div className="two-col">
          <p>
            The wake word, the recording, the transcription, the model and the voice all run on your Mac.
            There is no account to create and no server of ours in the middle. When the local model decides a
            question is beyond it, and only then, it hands the sentence to Claude: the words you said, as
            text, never the audio. The cloud gets one question at a time, and nothing in the house is
            reachable from it.
          </p>
          <figure className="wall-figure" aria-labelledby="wall-caption">
            <svg viewBox="0 0 364 150" role="img" aria-labelledby="wall-title">
              <title id="wall-title">A wall in section: sound stays inside, one line of text leaves</title>
              <rect className="wall-cut" x="150" y="0" width="14" height="150" />
              <text className="side" x="70" y="22" textAnchor="middle">
                inside
              </text>
              <text className="side" x="246" y="22" textAnchor="middle">
                outside
              </text>
              <path
                className="stays"
                d="M40 62a14 14 0 0 1 0 26M54 54a24 24 0 0 1 0 42M68 46a34 34 0 0 1 0 58"
              />
              <text className="side" x="60" y="128" textAnchor="middle">
                audio
              </text>
              <line className="stays" x1="90" y1="75" x2="138" y2="75" />
              <path className="stays" d="M128 66l10 9-10 9" />
              <path className="dashed" d="M164 75h130" />
              <path className="dashed" d="M284 66l10 9-10 9" />
              <text className="side" x="172" y="128">
                the sentence, when asked
              </text>
            </svg>
            <figcaption id="wall-caption">
              Fig. 2. Sound never crosses the wall. Text does, on request.
            </figcaption>
          </figure>
        </div>
      </section>

      <section className="sheet rooms" aria-labelledby="rooms-heading">
        <h2 id="rooms-heading">One Mac, every room</h2>
        <p>
          One machine runs the models, holds the tokens and does the answering. Everything else with a
          microphone is a client of it, and the server's own microphone is one client among them, with no
          special privileges. All of them need <code>PARLOUR_TOKEN</code>; without it the server listens on
          loopback only and does not announce itself.
        </p>
        <figure className="plan-figure" aria-labelledby="plan-caption">
          <Plan />
          <figcaption id="plan-caption">
            Fig. 3. The same house in plan. Every microphone is a client of the one Mac; none of them is
            special.
          </figcaption>
        </figure>
        <div className="table-scroll">
          <table className="schedule">
            <caption>Table 1. The clients, and who listens for the wake word</caption>
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
                  The Mac's own microphone
                </th>
                <td data-label="How it connects">In process.</td>
                <td data-label="Who hears the wake word">Parlour, with openWakeWord.</td>
              </tr>
              <tr>
                <th scope="row" className="row">
                  Another Mac
                </th>
                <td data-label="How it connects">
                  <code>role: "satellite"</code>. Finds the server with Bonjour and holds a socket open.
                </td>
                <td data-label="Who hears the wake word">
                  The server, over the stream. Or the satellite itself, with local wake.
                </td>
              </tr>
              <tr>
                <th scope="row" className="row">
                  Voice PE, through Home Assistant
                </th>
                <td data-label="How it connects">
                  The OpenAI-compatible endpoint at <code>/v1</code>.
                </td>
                <td data-label="Who hears the wake word">
                  The Voice PE, on the device. Home Assistant does the speech both ways.
                </td>
              </tr>
              <tr>
                <th scope="row" className="row">
                  A phone
                </th>
                <td data-label="How it connects">
                  The page the server serves at <code>/</code>. Hold the button.
                </td>
                <td data-label="Who hears the wake word">
                  Nobody. Your thumb is a better endpoint, and the phone is not listening all day.
                </td>
              </tr>
              <tr>
                <th scope="row" className="row">
                  A board you soldered
                </th>
                <td data-label="How it connects">
                  The socket at <code>/listen</code>, raw 16 kHz mono PCM.
                </td>
                <td data-label="Who hears the wake word">The server, or the board. Its choice.</td>
              </tr>
              <tr>
                <th scope="row" className="row">
                  An automation
                </th>
                <td data-label="How it connects">
                  <code>POST /ask</code> with text; an answer back as text.
                </td>
                <td data-label="Who hears the wake word">Nobody.</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <section className="sheet parts" aria-labelledby="parts-heading">
        <h2 id="parts-heading">Schedule of parts</h2>
        <p>
          Every stage is a provider behind a small interface, chosen by name in one config file. The built-in
          ones are the fastest we have found for Apple silicon. Prefer something else? Publish it as an npm
          package, name it in your config, and <code>parlour doctor</code> will tell you whether it is happy.
        </p>
        <div className="table-scroll">
          <table className="schedule">
            <caption>Table 2. The slots, what fills them out of the box, and how to change one</caption>
            <thead>
              <tr>
                <th scope="col" className="col">
                  Slot
                </th>
                <th scope="col" className="col">
                  Built in
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
                <td data-label="Built in">openWakeWord, in process</td>
                <td data-label="To swap">
                  <code>wake.provider</code>
                </td>
              </tr>
              <tr>
                <th scope="row" className="row">
                  <span className="disc-inline">3</span>
                  Speech to text
                </th>
                <td data-label="Built in">whisper.cpp, small.en, kept warm</td>
                <td data-label="To swap">
                  <code>stt.provider</code>
                </td>
              </tr>
              <tr>
                <th scope="row" className="row">
                  <span className="disc-inline">4</span>
                  The local model
                </th>
                <td data-label="Built in">
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
                <td data-label="Built in">Claude, with web search, no house tools</td>
                <td data-label="To swap">
                  <code>llm.cloud.provider</code>
                </td>
              </tr>
              <tr>
                <th scope="row" className="row">
                  <span className="disc-inline">6</span>
                  Text to speech
                </th>
                <td data-label="Built in">Kokoro, in process; macOS say as the fallback</td>
                <td data-label="To swap">
                  <code>tts.provider</code>
                </td>
              </tr>
              <tr>
                <th scope="row" className="row">
                  Search
                </th>
                <td data-label="Built in">SearXNG, if you run one</td>
                <td data-label="To swap">
                  <code>search.provider</code>
                </td>
              </tr>
              <tr>
                <th scope="row" className="row">
                  Tools
                </th>
                <td data-label="Built in">Home Assistant over MCP, connectors, timers</td>
                <td data-label="To swap">
                  <code>integrations</code>, as npm packages
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <section className="sheet house-assistant" aria-labelledby="ha-heading">
        <h2 id="ha-heading">Made for Home Assistant</h2>
        <p>
          Home Assistant's MCP Server integration publishes whatever you have exposed to voice assistants as
          tools, so Parlour can do exactly what you have allowed and nothing more. Expose a light and it can
          turn it on; leave it unexposed and it cannot.
        </p>
        <p>
          A mute switch lives in Home Assistant rather than on the Mac, so the house itself can keep Parlour
          quiet while everyone is asleep. Point the OpenAI Conversation integration at Parlour and the voice
          satellites you already own start using it as their brain.
        </p>
      </section>

      <section className="sheet not-shown" aria-labelledby="not-heading">
        <h2 id="not-heading">Not shown on this drawing, on purpose</h2>
        <ul className="notes">
          <li>
            <strong>Telling voices apart.</strong> Everyone in the house is the same user.
          </li>
          <li>
            <strong>Cancelling its own echo.</strong> Which is why barge-in is off by default.
          </li>
          <li>
            <strong>Failing over.</strong> There is one server. If it is off, the satellites wait for it
            rather than electing a new one; a house with two brains that disagree is worse than a house with
            none.
          </li>
          <li>
            <strong>Per-person connectors.</strong> Tokens belong to the household. A satellite cannot tell
            who is talking, so neither can Parlour.
          </li>
          <li>
            <strong>Linux.</strong> Not yet. The platform-specific parts sit behind interfaces, so it is a
            contribution rather than a rewrite, and one we would love to see.
          </li>
          <li>
            <strong>A wake word called Parlour, in the box.</strong> The install ships the stock{" "}
            <code>hey_jarvis</code> model; <Link href="/docs/wake-word">training your own</Link> takes an
            afternoon.
          </li>
        </ul>
      </section>

      <section className="sheet installation" aria-labelledby="install-heading">
        <h2 id="install-heading">Installation</h2>
        <div className="two-col">
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
            You will need a Mac with Node 22 and Homebrew. <code>init</code> fetches ffmpeg, whisper.cpp and
            the models, asks for your Home Assistant token, offers to add an Anthropic key if you would like
            the cloud behind it, and can set Parlour to start at login. If you would rather have a window than
            a terminal, the <Link href="/docs/desktop">menu bar app</Link> does the same things with buttons.
          </p>
        </div>
      </section>

      <section className="sheet colophon" aria-labelledby="source-heading">
        <h2 id="source-heading">Open source</h2>
        <p>
          Parlour is MIT licensed, at version 0.1.0, and built to be extended. The most useful thing you could
          add is a provider: a new voice, a different speech to text engine, a Linux service manager. The{" "}
          <Link href="/docs/providers">provider guide</Link> walks through one from start to finish, and the{" "}
          <a href="https://github.com/mrprkr/parlour/blob/main/CONTRIBUTING.md">contributing guide</a> covers
          the rest. Questions and ideas are welcome in the issues.
        </p>
      </section>
    </main>
  );
}
