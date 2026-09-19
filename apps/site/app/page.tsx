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
            Give Home Assistant a voice. <span className="turn-line">And a brain for the rest.</span>
          </h1>
          <div className="offer">
            <p className="lede">
              Parlour is a voice agent that runs on one Mac you already own and listens from anywhere in the
              house. It works your rooms through Home Assistant, and answers everything else out loud,
              wherever you asked from.
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
        <h2 id="private-heading">Private and secure by design</h2>
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
        <ul className="notes">
          <li>
            <strong>Your house sets the permissions.</strong> Parlour reaches exactly what you have exposed to
            voice assistants in Home Assistant, and nothing else.
          </li>
          <li>
            <strong>Nothing on the network without a token.</strong> Without <code>PARLOUR_TOKEN</code> the
            server binds to loopback and does not announce itself.
          </li>
          <li>
            <strong>Secrets stay out of your config.</strong> Keys live in <code>secrets.env</code> or the
            environment, never in <code>config.json</code>, and connector tokens go to the Keychain.
          </li>
          <li>
            <strong>One household, one identity.</strong> Parlour does not tell voices apart, so everyone in
            the house gets the same permissions and the same answers.
          </li>
          <li>
            <strong>One server, and it waits.</strong> If the Mac is off, satellites wait for it rather than
            electing a new one. A house with two brains that disagree is worse than a house with none.
          </li>
          <li>
            <strong>One Mac to run it, anything to talk to it.</strong> The server wants macOS for now,
            because the models are built for Apple silicon. Clients are not fussy: a phone, a Voice PE or a
            board on the socket all work today, and the platform-specific parts sit behind interfaces, so a
            Linux server is a contribution rather than a rewrite.
          </li>
        </ul>
      </section>

      <section className="sheet" aria-labelledby="rooms-heading">
        <h2 id="rooms-heading">One Mac, heard in every room</h2>
        <p>
          One Mac runs the models, holds the tokens and does the answering. Everything else with a microphone
          is a client of it, and a client can be almost anything: a phone in your pocket, a Voice PE on a
          shelf, a board you soldered talking raw audio down a socket, or a script posting a question as text.
          The Mac's own microphone is just another client, with no special treatment. All of them need{" "}
          <code>PARLOUR_TOKEN</code>; without it the server stays on loopback and never announces itself.
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

      <section className="sheet installation" aria-labelledby="install-heading">
        <h2 id="install-heading">Install it and start talking</h2>
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
            Ten minutes from an empty terminal to asking your house a question. <code>init</code> fetches
            ffmpeg, whisper.cpp and the models, takes your Home Assistant token, and offers to start Parlour
            at login, so the house is listening again after every reboot without you thinking about it. The
            only machine that needs anything installed is the Mac running the server, with Node 22 and
            Homebrew on it; everything else in the house just needs a microphone. Prefer a window to a
            terminal? The <Link href="/docs/desktop">menu bar app</Link> does the same with buttons.
          </p>
          <p>
            It answers to <code>hey_jarvis</code> out of the box, because that is the model the install ships.
            Teaching it to answer to <Link href="/docs/wake-word">a word of your own</Link> takes an
            afternoon.
          </p>
        </div>
      </section>

      <section className="sheet" aria-labelledby="source-heading">
        <h2 id="source-heading">Open source, contributions welcome</h2>
        <p>
          Parlour is MIT licensed and at version 0.1.0, which is a good moment to arrive. The most useful
          thing you could add is a provider: a new voice, a different speech to text engine, a Linux service
          manager. The <Link href="/docs/providers">provider guide</Link> walks through one from start to
          finish, the{" "}
          <a href="https://github.com/mrprkr/parlour/blob/main/CONTRIBUTING.md">contributing guide</a> covers
          the rest. Bug reports, questions and rough ideas are all welcome in the issues, and a first pull
          request does not have to be a big one.
        </p>
      </section>
    </main>
  );
}
