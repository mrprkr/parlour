import Link from "next/link";
import { InstallButton } from "../install-button";

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
      </section>

      <section className="sheet" aria-labelledby="how-heading">
        <h2 id="how-heading">How it works</h2>
        <ol className="steps">
          <li>
            <strong>Say the wake word.</strong> Nothing is recorded before that.
          </li>
          <li>
            <strong>Your Mac turns what you said into text.</strong> The audio goes no further.
          </li>
          <li>
            <strong>A small local model answers.</strong> It can use Home Assistant, timers, search and the
            accounts you have connected.
          </li>
          <li>
            <strong>Harder questions go to Claude.</strong> Only when the local model decides it needs to, and
            only that one question, as text.
          </li>
          <li>
            <strong>The answer plays out loud</strong> in the room you asked from.
          </li>
        </ol>
      </section>

      <section className="sheet" aria-labelledby="private-heading">
        <h2 id="private-heading">Your voice stays on your Mac</h2>
        <p>
          The wake word, the recording, the transcription, the model and the voice all run on your Mac. There
          is no account to create and no server of ours in between. Claude sees one question at a time, as
          text, and has no access to your home.
        </p>
        <ul className="notes">
          <li>
            <strong>Your house sets the permissions.</strong> Parlour can only control what you have exposed
            to voice assistants in Home Assistant.
          </li>
          <li>
            <strong>Off the network until you set a token.</strong> Without one, the server answers only the
            Mac it runs on.
          </li>
          <li>
            <strong>One household, one identity.</strong> Parlour does not tell voices apart. Everyone gets
            the same permissions and the same answers.
          </li>
          <li>
            <strong>One Mac runs it.</strong> The server needs macOS for now, because the models are built for
            Apple silicon. If it is off, nothing answers until it is back.
          </li>
        </ul>
      </section>

      <section className="sheet" aria-labelledby="rooms-heading">
        <h2 id="rooms-heading">Talk to it from any room</h2>
        <p>
          One Mac does the answering. Everything else with a microphone is a client, and the Mac's own
          microphone is just another one.
        </p>
        <div className="table-scroll">
          <table className="schedule">
            <thead>
              <tr>
                <th scope="col" className="col">
                  Client
                </th>
                <th scope="col" className="col">
                  How it connects
                </th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <th scope="row" className="row">
                  Another Mac
                </th>
                <td data-label="How it connects">As a satellite. It finds the server on its own.</td>
              </tr>
              <tr>
                <th scope="row" className="row">
                  Voice PE
                </th>
                <td data-label="How it connects">Through Home Assistant, which keeps doing the wake word.</td>
              </tr>
              <tr>
                <th scope="row" className="row">
                  A phone
                </th>
                <td data-label="How it connects">A web page the server serves. Hold the button and talk.</td>
              </tr>
              <tr>
                <th scope="row" className="row">
                  Something you built
                </th>
                <td data-label="How it connects">A socket that takes raw audio.</td>
              </tr>
              <tr>
                <th scope="row" className="row">
                  An automation
                </th>
                <td data-label="How it connects">Send a question as text, get the answer as text.</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <section className="sheet" aria-labelledby="ha-heading">
        <h2 id="ha-heading">Made for Home Assistant</h2>
        <div className="two-col">
          <p>
            Ask for the lights, the heating, the blinds or anything else you have exposed to voice assistants.
            Expose more and it can do more, with nothing to change on the Parlour side.
          </p>
          <p>
            Mute lives in Home Assistant, so an automation can keep Parlour quiet while everyone sleeps. Point
            the OpenAI Conversation integration at Parlour and the voice satellites you already own answer
            through it.
          </p>
        </div>
      </section>

      <section className="sheet" aria-labelledby="parts-heading">
        <h2 id="parts-heading">Swap any part of it</h2>
        <p>
          The wake word, speech to text, both models, the voice, search and the tools are each chosen by name
          in one config file. To use something else, publish it as an npm package and name it there. The{" "}
          <Link href="/docs/providers">provider guide</Link> shows how.
        </p>
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
            You need a Mac with Node 22 and Homebrew. Everything else in the house just needs a microphone.
            Prefer buttons to a terminal? The <Link href="/docs/desktop">menu bar app</Link> does the same. It
            answers to <code>hey_jarvis</code> out of the box, and training it to answer to{" "}
            <Link href="/docs/wake-word">a word of your own</Link> takes an afternoon.
          </p>
        </div>
      </section>

      <section className="sheet" aria-labelledby="source-heading">
        <h2 id="source-heading">Open source</h2>
        <p>
          Parlour is MIT licensed and at version 0.1.0. Bug reports, questions and pull requests are welcome
          on <a href="https://github.com/mrprkr/parlour">GitHub</a>. The most useful thing to add is a
          provider: a new voice, a different speech to text engine, or a Linux service manager.
        </p>
      </section>
    </main>
  );
}
