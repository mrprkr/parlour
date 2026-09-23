import Link from "next/link";
import { InstallButton } from "../install-button";
import { ConfigFile, DesktopSettings, PhoneHouse, PhoneTalk, PrivacyDiagram, RoomScene } from "./pictures";
import { Topology } from "./topology";

// The newest release's dmg. desktop-release.yml uploads it under this fixed name so the link never moves.
const downloadUrl = "https://github.com/mrprkr/parlour/releases/latest/download/Parlour-Server-arm64.dmg";

// Things people actually say to it, set as type rather than listed.
const asked = [
  "Turn the heating up a degree.",
  "Close the blinds in the study.",
  "Is the back door locked?",
  "Lights off downstairs.",
  "Set a timer for the pasta.",
];

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
              Parlour turns the Mac you already own into a voice assistant for the whole house. Your voice
              never leaves home.
            </p>
            <div className="actions">
              <InstallButton />
              <a className="docs-link" href={downloadUrl}>
                Download for Mac
              </a>
              <Link className="docs-link" href="/docs">
                Read the docs
              </Link>
            </div>
          </div>
        </div>
        <RoomScene />
      </section>

      <section className="sheet" aria-labelledby="how-heading">
        <h2 id="how-heading" className="reveal">
          Just ask. Parlour does the rest.
        </h2>
        <ol className="pipeline">
          <li className="reveal">
            <strong>Speak from any room.</strong> Say the wake word and ask. Nothing is recorded until you do.
          </li>
          <li className="reveal">
            <strong>Transcribed on your Mac.</strong> Your words become text right there. The recording never
            leaves home.
          </li>
          <li className="reveal">
            <strong>Answered at home.</strong> A model on your Mac takes care of it, using Home Assistant,
            timers, search and the accounts you connect.
          </li>
          <li className="reveal optional">
            <strong>The cloud, only when it helps.</strong> Just that one question goes to the cloud model you
            choose, as text. Never your voice, never the keys to your home. Or leave it off.
          </li>
          <li className="reveal">
            <strong>Hear the answer.</strong> Spoken back in the room you asked from.
          </li>
        </ol>
      </section>

      <section className="sheet band" aria-labelledby="rooms-heading">
        <div className="band-inner">
          <h2 id="rooms-heading" className="reveal">
            One hub. A voice in every room.
          </h2>
          <p className="reveal">
            A Mac mini on a shelf does the thinking. Everything else is a satellite that listens, passes on
            what it hears and plays back the answer. Satellites run no models, so almost anything with a
            microphone will do. Automations can ask too, in plain text.
          </p>
          <Topology />
        </div>
      </section>

      <section className="sheet" aria-labelledby="private-heading">
        <div className="privacy">
          <PrivacyDiagram />
          <div className="privacy-text">
            <h2 id="private-heading" className="reveal">
              What you say stays at home
            </h2>
            <p className="reveal">
              The wake word, the transcription, the model and the voice all run on your Mac. No account to
              create. No server in the middle. When a cloud model helps, it sees a single question as text and
              nothing of your home.
            </p>
          </div>
        </div>
        <ul className="limits">
          <li className="reveal">
            <strong>You decide what it can touch.</strong> Parlour controls only what you expose to voice
            assistants in Home Assistant.
          </li>
          <li className="reveal">
            <strong>Closed until you open it.</strong> Until you set a token, only the Mac it runs on can talk
            to it.
          </li>
          <li className="reveal">
            <strong>Everyone is treated the same.</strong> Parlour does not tell voices apart, so the whole
            household gets the same answers and the same permissions.
          </li>
          <li className="reveal">
            <strong>One Mac does the work.</strong> It needs macOS for now, because the models are built for
            Apple silicon. If that Mac is off, nothing answers until it is back.
          </li>
        </ul>
      </section>

      <section className="sheet" aria-labelledby="ha-heading">
        <h2 id="ha-heading" className="reveal">
          Made for Home Assistant
        </h2>
        <ul className="asked" aria-label="Things you can ask">
          {asked.map((line) => (
            <li key={line} className="reveal">
              “{line}”
            </li>
          ))}
        </ul>
        <div className="two-col">
          <p className="reveal">
            Lights, heating, blinds. If you have exposed it to voice assistants, you can ask for it. Expose
            more and Parlour can do more, with nothing else to set up.
          </p>
          <p className="reveal">
            Mute it from Home Assistant, so an automation can keep it quiet while everyone sleeps. And the
            voice satellites you already own can answer through Parlour too.
          </p>
        </div>
      </section>

      <section className="sheet" aria-labelledby="ios-heading">
        <div className="ios">
          <div className="phones">
            <PhoneTalk />
            <PhoneHouse />
          </div>
          <div className="ios-text">
            <h2 id="ios-heading" className="reveal">
              Parlour for iOS <span className="badge">Coming soon</span>
            </h2>
            <p className="reveal">
              Your whole house, in your pocket. The iOS app talks to the hub at home and brings HomeKit along
              with it.
            </p>
            <ul className="notes">
              <li className="reveal">
                <strong>Ask from anywhere at home.</strong> Hold the button, speak, and hear the answer from
                the same assistant as every other room.
              </li>
              <li className="reveal">
                <strong>HomeKit, built in.</strong> See your rooms and accessories, and switch things on and
                off with a tap. It still works when the Mac at home is off.
              </li>
              <li className="reveal">
                <strong>Finds your hub on its own.</strong> No addresses to type. It discovers Parlour on your
                network the moment you open it.
              </li>
              <li className="reveal">
                <strong>Answers even when home cannot.</strong> With Apple Intelligence, your phone can answer
                by itself, entirely on device.
              </li>
            </ul>
          </div>
        </div>
      </section>

      <section className="sheet" aria-labelledby="parts-heading">
        <h2 id="parts-heading" className="reveal">
          Make it yours
        </h2>
        <p className="reveal">
          Pick the wake word, the voice, the models and the search you want, all by name in one config file.
          Teach it your <Link href="/docs/skills">house rules</Link> in plain markdown. And if you want
          something that is not built in, plug it in as an npm package. The{" "}
          <Link href="/docs/providers">provider guide</Link> shows you how.
        </p>
        <div className="layered">
          <ConfigFile />
          <DesktopSettings />
        </div>
      </section>

      <section className="sheet installation" aria-labelledby="install-heading">
        <div className="terminal-plate">
          <h2 id="install-heading">Up and running in minutes</h2>
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
            skip the terminal? The <Link href="/docs/desktop">menu bar app</Link> does it all with buttons:{" "}
            <a href={downloadUrl}>download it</a> for a Mac with Apple silicon. Parlour answers to{" "}
            <code>hey_jarvis</code> out of the box, and you can teach it{" "}
            <Link href="/docs/wake-word">a name of your own</Link> in an afternoon.
          </p>
        </div>
      </section>

      <section className="sheet source" aria-labelledby="source-heading">
        <h2 id="source-heading">Free and open source</h2>
        <p>
          Parlour is MIT licensed. Bug reports, questions and pull requests are all welcome on{" "}
          <a href="https://github.com/mrprkr/parlour">GitHub</a>. The most helpful thing you can add is a
          provider: a new voice, another speech engine, or a Linux service manager.
        </p>
      </section>
    </main>
  );
}
