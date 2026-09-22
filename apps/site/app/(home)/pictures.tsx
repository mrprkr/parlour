// The pictures on the front page. All of them are drawn rather than
// photographed: line drawings in ink, and mockups of the apps built from the
// same tokens the apps use, so they follow the page into dark mode.

const line = {
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.5,
  strokeLinecap: "round",
  strokeLinejoin: "round",
  vectorEffect: "non-scaling-stroke",
} as const;

/** A parlour: a chair, a lamp, a satellite on the side table and the hub on the sideboard. */
export function RoomScene() {
  return (
    <figure className="scene">
      <svg
        viewBox="0 0 1200 400"
        preserveAspectRatio="xMidYMax slice"
        role="img"
        aria-labelledby="scene-title"
      >
        <title id="scene-title">
          Someone in an armchair asks for the lamp to be dimmed, and the speaker on the side table answers.
        </title>

        {/* The floor and the rug. */}
        <path d="M0 350h1200" {...line} />
        <ellipse cx="500" cy="362" rx="210" ry="16" {...line} opacity="0.4" />

        {/* The window, with its curtain. */}
        <rect x="90" y="70" width="180" height="210" rx="2" {...line} />
        <path d="M180 70v210M90 175h180" {...line} opacity="0.5" />
        <path d="M78 58h204M84 58c10 60 -6 150 8 292M276 58c-10 60 6 150 -8 292" {...line} />

        {/* A plant on the sill side. */}
        <path d="M300 350l6-44h40l6 44" {...line} />
        <path d="M326 306c-4-40-30-60-44-66M326 306c2-44 18-70 34-80M326 306c-12-26-8-58 2-78" {...line} />

        {/* The armchair. */}
        <path
          d="M420 350v-18M580 350v-18M404 332h192M404 332v-70c0-14 10-22 24-22h144c14 0 24 8 24 22v70"
          {...line}
        />
        <path d="M436 240v-78c0-22 14-34 34-34h60c20 0 34 12 34 34v78" {...line} />
        <path d="M428 286h144" {...line} opacity="0.5" />

        {/* The floor lamp, the one lit thing. */}
        <circle cx="660" cy="118" r="46" className="glow" />
        <path d="M660 350v-214M636 350h48" {...line} />
        <path d="M622 136l12-50h52l12 50z" {...line} />

        {/* The side table, with a Voice PE on it. */}
        <path d="M712 280h92M724 280v70M792 280v70" {...line} />
        <rect x="738" y="262" width="40" height="18" rx="6" {...line} />
        <path d="M790 258c8-8 8-22 0-30M800 264c14-14 14-38 0-52" {...line} opacity="0.6" />

        {/* The sideboard, and the hub on it. */}
        <rect x="860" y="260" width="250" height="72" rx="3" {...line} />
        <path d="M985 260v72M876 332v18M1094 332v18" {...line} />
        <rect x="884" y="232" width="92" height="28" rx="7" {...line} />
        <circle cx="962" cy="246" r="3" className="lit" />
        <path d="M1010 260v-54h14v54M1028 260v-44h12v44M1044 260l10-48 12 3-10 45" {...line} />

        {/* A picture above it. */}
        <rect x="920" y="90" width="130" height="96" rx="2" {...line} />
        <path d="M934 170l30-34 22 22 16-14 34 26" {...line} opacity="0.5" />

        {/* What was said, and what came back. */}
        <text x="468" y="100" className="said" textAnchor="middle">
          “Dim the lamp a little.”
        </text>
        <text x="808" y="214" className="answer" textAnchor="middle">
          Done.
        </text>
      </svg>
    </figure>
  );
}

/** Everything inside the house, and the one thin line that may leave it. */
export function PrivacyDiagram() {
  const stages = ["Wake word", "Transcription", "Model", "Voice"];
  return (
    <figure className="privacy-art">
      <svg viewBox="0 0 560 340" role="img" aria-labelledby="privacy-title">
        <title id="privacy-title">
          The wake word, transcription, model and voice all sit inside the house. A single dashed line carries
          one question, as text, out to a cloud model, and only when it helps.
        </title>

        {/* The house. */}
        <path d="M24 150L200 34l176 116v166H24z" {...line} />
        <text x="44" y="304" className="caption">
          Your Mac, at home
        </text>

        {stages.map((stage, i) => {
          const y = 118 + i * 44;
          return (
            <g key={stage}>
              <rect x="110" y={y} width="180" height="32" rx="16" {...line} />
              <text x="200" y={y + 21} className="stage" textAnchor="middle">
                {stage}
              </text>
              {i < stages.length - 1 ? <path d={`M200 ${y + 32}v12`} {...line} opacity="0.5" /> : null}
            </g>
          );
        })}
        <circle cx="130" cy="134" r="3.5" className="lit" />

        {/* The one way out: optional, as text, one question. */}
        <path d="M290 222C360 222 380 120 450 108" {...line} strokeDasharray="4 6" />
        <path
          d="M446 112c-18 0-30-12-30-26s12-26 28-26c6-18 22-28 40-28 22 0 38 14 42 32 14 2 24 12 24 26 0 12-10 22-24 22z"
          {...line}
          opacity="0.6"
        />
        <text x="486" y="150" className="caption" textAnchor="middle">
          Cloud model
        </text>
        <text x="486" y="168" className="caption faint" textAnchor="middle">
          optional
        </text>
        <text x="392" y="252" className="caption">
          one question, as text
        </text>
      </svg>
    </figure>
  );
}

function Toggle({ on }: { on: boolean }) {
  return <span className={on ? "toggle on" : "toggle"} aria-hidden="true" />;
}

/** The iOS app's Talk screen, after a turn. */
export function PhoneTalk() {
  return (
    <div className="phone" aria-hidden="true">
      <div className="screen">
        <div className="app-head">
          <span className="app-title">Parlour</span>
          <span className="state">
            <span className="dot" /> ready
          </span>
        </div>
        <p className="heard">is it going to rain tomorrow</p>
        <p className="reply">Only a light shower after four. Take a jacket.</p>
        <p className="via">answered at home</p>
        <span className="talk">Hold to talk</span>
      </div>
    </div>
  );
}

/** The iOS app's House screen, read from HomeKit. */
export function PhoneHouse() {
  const rooms: [string, [string, boolean][]][] = [
    [
      "Lounge",
      [
        ["Floor lamp", true],
        ["Ceiling light", false],
      ],
    ],
    [
      "Kitchen",
      [
        ["Pendants", true],
        ["Under cabinet", false],
      ],
    ],
  ];
  return (
    <div className="phone" aria-hidden="true">
      <div className="screen">
        <p className="app-title">Your home</p>
        <p className="via">From HomeKit, on this phone</p>
        {rooms.map(([room, things]) => (
          <div className="house-room" key={room}>
            <p className="room-name">{room}</p>
            {things.map(([name, on]) => (
              <div className="accessory" key={name}>
                <span className={on ? "mark on" : "mark"} />
                <span className="name">{name}</span>
                <Toggle on={on} />
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

/** The menu bar app's Settings tab, with the defaults a fresh install has. */
export function DesktopSettings() {
  const rows: [string, string][] = [
    ["Wake word", "hey_jarvis"],
    ["Voice", "bf_emma"],
    ["Local model", "qwen3-8b-mlx"],
    ["Cloud model", "on, when it helps"],
    ["Home Assistant", "homeassistant.local"],
  ];
  return (
    <div className="window" aria-hidden="true">
      <div className="window-bar">
        <span />
        <span />
        <span />
      </div>
      <div className="window-head">
        <span className="app-title">Parlour</span>
        <span className="state">
          <span className="dot breathing" /> listening
        </span>
      </div>
      <div className="window-tabs">
        <span>Status</span>
        <span className="current">Settings</span>
        <span>Connectors</span>
        <span>Logs</span>
      </div>
      <dl className="window-rows">
        {rows.map(([label, value]) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
        <div>
          <dt>Sensitivity</dt>
          <dd>
            <span className="slider">
              <span />
            </span>
          </dd>
        </div>
      </dl>
    </div>
  );
}
