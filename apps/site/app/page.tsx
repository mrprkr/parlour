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
            Give Home Assistant a voice. <span className="turn-line">And ask it anything else.</span>
          </h1>
          <div className="offer">
            <p className="lede">
              Parlour is a voice assistant that runs on a Mac you already own. Say the wake word from any room
              to control your home through Home Assistant, or ask a question and hear the answer where you
              are. Your voice never leaves the house.
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
            There is no account to create and no server of ours in between. The only machine you have to trust
            is the one in your house.
          </p>
          <p>
            When a question is beyond the local model, it sends that one question to Claude as text. Your
            audio never goes with it, the cloud sees one question at a time, and Claude has no access to your
            home.
          </p>
        </div>
        <ul className="notes">
          <li>
            <strong>Your house sets the permissions.</strong> Parlour can only control what you have exposed
            to voice assistants in Home Assistant.
          </li>
          <li>
            <strong>Off the network until you set a token.</strong> Without <code>PARLOUR_TOKEN</code> the
            server answers only the Mac it runs on and does not announce itself.
          </li>
          <li>
            <strong>Secrets stay out of your config.</strong> Keys live in <code>secrets.env</code> or the
            environment, never in <code>config.json</code>. Connector tokens go to the Keychain.
          </li>
          <li>
            <strong>One household, one identity.</strong> Parlour does not tell voices apart. Everyone in the
            house gets the same permissions and the same answers.
          </li>
          <li>
            <strong>One server, no failover.</strong> If the Mac is off, satellites wait for it to come back
            rather than choosing a new one.
          </li>
          <li>
            <strong>One Mac to run it, anything to talk to it.</strong> The server needs macOS for now,
            because the models are built for Apple silicon. A phone, a Voice PE or a board you built can all
            be clients today. The platform-specific parts sit behind interfaces, so a Linux server is a
            contribution rather than a rewrite.
          </li>
        </ul>
      </section>

      <section className="sheet" aria-labelledby="rooms-heading">
        <h2 id="rooms-heading">Talk to it from any room</h2>
        <p>
          One Mac runs the models, holds the tokens and does the answering. Everything else with a microphone
          is a client: another Mac, a phone, a Voice PE on a shelf, hardware you built, or a script sending a
          question as text. The Mac's own microphone is just another client. Every client needs{" "}
          <code>PARLOUR_TOKEN</code>.
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
                  <code>role: "satellite"</code>. Finds the server over Bonjour and keeps a socket open.
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
                  Nobody. You hold a button, so the phone is not listening all day.
                </td>
              </tr>
              <tr>
                <th scope="row" className="row">
                  Something you built
                </th>
                <td data-label="How it connects">
                  The socket on <code>/listen</code>, raw 16 kHz mono PCM.
                </td>
                <td data-label="Who hears the wake word">The server, or the device.</td>
              </tr>
              <tr>
                <th scope="row" className="row">
                  An automation
                </th>
                <td data-label="How it connects">
                  <code>POST /ask</code> with text. The answer comes back as text.
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
          Every stage sits behind a small interface and is chosen by name in one config file. The defaults are
          the fastest we have found for Apple silicon. To use something else, publish it as an npm package,
          name it in your config, and <code>parlour doctor</code> will tell you whether it works.
        </p>
        <div className="table-scroll">
          <table className="schedule">
            <caption>Each stage, what ships, and the config key that changes it</caption>
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
                  Anything that speaks the OpenAI chat API. LM Studio is the simplest.
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
                <td data-label="What ships">Kokoro, in process, with macOS say as the fallback</td>
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
            Ask for the lights, the heating, the blinds or anything else you have exposed to voice assistants,
            and Parlour does it through Home Assistant's own tools. Expose more and it can do more, with
            nothing to change on the Parlour side.
          </p>
          <p>
            Mute lives in Home Assistant, not on the Mac, so an automation can keep Parlour quiet while
            everyone sleeps. Point the OpenAI Conversation integration at Parlour and the voice satellites you
            already own answer through it.
          </p>
        </div>
      </section>

      <section className="sheet installation" aria-labelledby="install-heading">
        <h2 id="install-heading">Running in ten minutes</h2>
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
            <code>init</code> fetches ffmpeg, whisper.cpp and the models, takes your Home Assistant token, and
            offers to start Parlour at login, so it is listening again after every reboot. Only the Mac
            running the server needs anything installed: Node 22 and Homebrew. Everything else in the house
            just needs a microphone. Prefer buttons to a terminal? The{" "}
            <Link href="/docs/desktop">menu bar app</Link> does the same.
          </p>
          <p>
            It answers to <code>hey_jarvis</code> out of the box, because that is the model the install ships.
            Training it to answer to <Link href="/docs/wake-word">a word of your own</Link> takes an
            afternoon.
          </p>
        </div>
      </section>

      <section className="sheet" aria-labelledby="source-heading">
        <h2 id="source-heading">Open source, contributions welcome</h2>
        <p>
          Parlour is MIT licensed and at version 0.1.0. The most useful thing to add is a provider: a new
          voice, a different speech to text engine, a Linux service manager. The{" "}
          <Link href="/docs/providers">provider guide</Link> walks through one from start to finish, and the{" "}
          <a href="https://github.com/mrprkr/parlour/blob/main/CONTRIBUTING.md">contributing guide</a> covers
          the rest. Bug reports, questions and rough ideas are welcome in the issues, and a first pull request
          does not have to be big.
        </p>
      </section>
    </main>
  );
}
