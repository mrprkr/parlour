import Link from "next/link";
import { InstallButton } from "../install-button";

export default function Home() {
  return (
    <main className="book">
      <section className="opening" aria-labelledby="offer">
        <div className="head">
          <h1 id="offer">
            A voice for your home. <span className="turn-line">Private by design.</span>
          </h1>
          <div className="offer">
            <p className="lede">
              Parlour turns the Mac you already own into a voice assistant for the whole house. Control Home
              Assistant from any room, ask it anything, and hear the answer right where you are. Your voice
              never leaves home.
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
        <h2 id="how-heading">From question to answer</h2>
        <ol className="steps">
          <li>
            <strong>Say the wake word.</strong> Nothing is recorded until you do.
          </li>
          <li>
            <strong>Your Mac writes down what you said.</strong> The audio goes no further.
          </li>
          <li>
            <strong>A model on your Mac answers.</strong> It can use Home Assistant, timers, search and the
            accounts you connect.
          </li>
          <li>
            <strong>Tough questions go to Claude.</strong> Only when they need to, one question at a time, as
            text.
          </li>
          <li>
            <strong>You hear the answer</strong> in the room you asked from.
          </li>
        </ol>
      </section>

      <section className="sheet" aria-labelledby="private-heading">
        <h2 id="private-heading">What you say stays at home</h2>
        <p>
          The wake word, the transcription, the model and the voice all run on your Mac. No account to create.
          No server in the middle. When Claude helps, it sees a single question as text and nothing of your
          home.
        </p>
        <ul className="notes">
          <li>
            <strong>You decide what it can touch.</strong> Parlour controls only what you expose to voice
            assistants in Home Assistant.
          </li>
          <li>
            <strong>Closed until you open it.</strong> Until you set a token, only the Mac it runs on can talk
            to it.
          </li>
          <li>
            <strong>Everyone is treated the same.</strong> Parlour does not tell voices apart, so the whole
            household gets the same answers and the same permissions.
          </li>
          <li>
            <strong>One Mac does the work.</strong> It needs macOS for now, because the models are built for
            Apple silicon. If that Mac is off, nothing answers until it is back.
          </li>
        </ul>
      </section>

      <section className="sheet" aria-labelledby="rooms-heading">
        <h2 id="rooms-heading">Every room. Every microphone.</h2>
        <p>One Mac does the thinking. Anything with a microphone can ask, including that Mac.</p>
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
                <td data-label="How it connects">Becomes a satellite and finds the server by itself.</td>
              </tr>
              <tr>
                <th scope="row" className="row">
                  Voice PE
                </th>
                <td data-label="How it connects">Answers through Home Assistant, just as it does today.</td>
              </tr>
              <tr>
                <th scope="row" className="row">
                  Your phone
                </th>
                <td data-label="How it connects">Open a web page, hold the button and talk.</td>
              </tr>
              <tr>
                <th scope="row" className="row">
                  Your own hardware
                </th>
                <td data-label="How it connects">Streams raw audio over a socket.</td>
              </tr>
              <tr>
                <th scope="row" className="row">
                  An automation
                </th>
                <td data-label="How it connects">Sends a question as text and gets text back.</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <section className="sheet" aria-labelledby="ha-heading">
        <h2 id="ha-heading">Made for Home Assistant</h2>
        <div className="two-col">
          <p>
            Lights, heating, blinds. If you have exposed it to voice assistants, you can ask for it. Expose
            more and Parlour can do more, with nothing else to set up.
          </p>
          <p>
            Mute it from Home Assistant, so an automation can keep it quiet while everyone sleeps. And the
            voice satellites you already own can answer through Parlour too.
          </p>
        </div>
      </section>

      <section className="sheet" aria-labelledby="parts-heading">
        <h2 id="parts-heading">Make it yours</h2>
        <p>
          Pick the wake word, the voice, the models and the search you want, all by name in one config file.
          Teach it your <Link href="/docs/skills">house rules</Link> in plain markdown. And if you want
          something that is not built in, plug it in as an npm package. The{" "}
          <Link href="/docs/providers">provider guide</Link> shows you how.
        </p>
      </section>

      <section className="sheet installation" aria-labelledby="install-heading">
        <h2 id="install-heading">Up and running in ten minutes</h2>
        <div className="two-col">
          <pre>
            <code>
              {"npm install -g parlour\n"}
              {"parlour init          "}
              <span className="c"># gets what it needs, asks a few questions</span>
              {"\nparlour text          "}
              <span className="c"># try it by typing, no microphone needed</span>
              {"\nparlour start         "}
              <span className="c"># and now out loud</span>
            </code>
          </pre>
          <p>
            All you need is a Mac with Node 22 and Homebrew. Every other room just needs a microphone. Rather
            skip the terminal? The <Link href="/docs/desktop">menu bar app</Link> does it all with buttons.
            Parlour answers to <code>hey_jarvis</code> out of the box, and you can teach it{" "}
            <Link href="/docs/wake-word">a name of your own</Link> in an afternoon.
          </p>
        </div>
      </section>

      <section className="sheet" aria-labelledby="source-heading">
        <h2 id="source-heading">Free and open source</h2>
        <p>
          Parlour is MIT licensed and at version 0.1.0. Bug reports, questions and pull requests are all
          welcome on <a href="https://github.com/mrprkr/parlour">GitHub</a>. The most helpful thing you can
          add is a provider: a new voice, another speech engine, or a Linux service manager.
        </p>
      </section>
    </main>
  );
}
