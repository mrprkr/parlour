// The pictures on the front page. The rooms and devices are drawn, not
// photographed: filled shapes with an inked line, coloured from the same
// tokens as the page so they follow it into dark mode. The app mockups are
// built from the tokens the apps use.

const line = {
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.5,
  strokeLinecap: "round",
  strokeLinejoin: "round",
  vectorEffect: "non-scaling-stroke",
} as const;

/** A parlour at night: a chair, a lamp, a satellite on the side table and the hub on the sideboard. */
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
        <defs>
          <pattern id="scene-paper" width="28" height="28" patternUnits="userSpaceOnUse">
            <path d="M14 0v28" className="a-paper" strokeWidth="1" />
          </pattern>
          <linearGradient id="scene-cone" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" className="a-light" stopOpacity="0.55" />
            <stop offset="1" className="a-light" stopOpacity="0" />
          </linearGradient>
          <radialGradient id="scene-halo">
            <stop offset="0" className="a-light" stopOpacity="0.5" />
            <stop offset="1" className="a-light" stopOpacity="0" />
          </radialGradient>
        </defs>

        {/* The wall, papered in a fine stripe, the skirting and the boards. */}
        <rect width="1200" height="320" className="a-wall" />
        <rect width="1200" height="320" fill="url(#scene-paper)" />
        <rect x="-10" y="318" width="1220" height="14" className="a-wood" {...line} />
        <rect x="-10" y="332" width="1220" height="80" className="a-floor" {...line} />
        <path d="M0 352h1200M0 376h1200" className="a-board" strokeWidth="1" />

        {/* The lamp's light, drawn first so everything stands in it. This is what dims. */}
        <g className="glow">
          <circle cx="660" cy="118" r="150" fill="url(#scene-halo)" />
          <path d="M628 136h64l110 196H518z" fill="url(#scene-cone)" />
        </g>

        {/* The window at night, with its curtains. */}
        <rect x="92" y="66" width="176" height="214" className="a-wood" {...line} />
        <rect x="104" y="78" width="152" height="190" className="a-glass" {...line} />
        <circle cx="222" cy="116" r="15" className="a-shade" />
        <circle cx="136" cy="104" r="1.6" className="a-shade" />
        <circle cx="160" cy="146" r="1.2" className="a-shade" />
        <circle cx="238" cy="190" r="1.4" className="a-shade" />
        <path d="M180 78v190M104 173h152" {...line} />
        <rect x="84" y="276" width="192" height="10" rx="2" className="a-wood-deep" {...line} />
        <path d="M74 64h44c-8 70 8 150-6 254H58c14-104 22-184 16-254z" className="a-fabric-deep" {...line} />
        <path
          d="M286 64h-44c8 70-8 150 6 254h54c-14-104-22-184-16-254z"
          className="a-fabric-deep"
          {...line}
        />
        <path d="M92 110c4 60 0 150-6 208M268 110c-4 60 0 150 6 208" {...line} opacity="0.35" />
        <rect x="66" y="48" width="228" height="18" rx="2" className="a-wood-deep" {...line} />

        {/* A plant. */}
        <ellipse cx="336" cy="332" rx="36" ry="5" className="a-shadow" />
        <path d="M334 280c-32-8-52-38-50-70 28 8 48 38 50 70z" className="a-leaf" {...line} />
        <path d="M334 280c4-42 24-72 50-82 4 36-20 70-50 82z" className="a-leaf" {...line} />
        <path d="M334 280c-14-30-12-68 4-96 18 28 14 66-4 96z" className="a-leaf" {...line} />
        <path d="M306 326l7-46h42l7 46z" className="a-clay" {...line} />

        {/* The rug, and the armchair on it. */}
        <ellipse cx="500" cy="358" rx="224" ry="20" className="a-fabric" {...line} />
        <ellipse cx="500" cy="358" rx="192" ry="13" {...line} opacity="0.4" />
        <ellipse cx="500" cy="340" rx="112" ry="8" className="a-shadow" />
        <path d="M424 318v20M576 318v20" {...line} strokeWidth="3" />
        <path d="M436 250v-86c0-24 14-36 36-36h56c22 0 36 12 36 36v86z" className="a-fabric-deep" {...line} />
        <path d="M470 170v60M530 170v60" {...line} opacity="0.35" />
        <circle cx="470" cy="164" r="2" className="a-ink" />
        <circle cx="530" cy="164" r="2" className="a-ink" />
        <circle cx="500" cy="196" r="2" className="a-ink" />
        <rect x="412" y="280" width="176" height="40" rx="6" className="a-fabric-deep" {...line} />
        <rect x="432" y="248" width="136" height="36" rx="9" className="a-fabric" {...line} />
        <rect x="404" y="232" width="40" height="90" rx="16" className="a-fabric" {...line} />
        <rect x="556" y="232" width="40" height="90" rx="16" className="a-fabric" {...line} />

        {/* The floor lamp, the one lit thing. */}
        <ellipse cx="660" cy="334" rx="30" ry="4" className="a-shadow" />
        <path d="M660 136v196" {...line} strokeWidth="2.5" />
        <path d="M638 332c0-6 10-9 22-9s22 3 22 9z" className="a-ink" {...line} />
        <path d="M626 136l12-52h44l12 52z" className="a-shade" {...line} />

        {/* The side table, with a Voice PE on it, answering. */}
        <ellipse cx="758" cy="336" rx="56" ry="5" className="a-shadow" />
        <rect x="720" y="282" width="8" height="52" className="a-wood" {...line} />
        <rect x="788" y="282" width="8" height="52" className="a-wood" {...line} />
        <rect x="706" y="272" width="104" height="10" rx="2" className="a-wood-deep" {...line} />
        <rect x="736" y="252" width="44" height="20" rx="7" className="a-metal" {...line} />
        <ellipse cx="758" cy="256" rx="13" ry="2.5" fill="none" className="a-ring" strokeWidth="2" />
        <path className="waves a-ring" d="M792 256c8-8 8-22 0-30M803 262c14-14 14-38 0-52" {...line} />

        {/* The sideboard, and the hub on it. */}
        <ellipse cx="985" cy="336" rx="136" ry="6" className="a-shadow" />
        <path d="M876 322v12M1094 322v12" {...line} strokeWidth="3" />
        <rect x="860" y="252" width="250" height="72" rx="3" className="a-wood" {...line} />
        <rect x="872" y="262" width="104" height="52" rx="2" {...line} opacity="0.45" />
        <rect x="994" y="262" width="104" height="52" rx="2" {...line} opacity="0.45" />
        <circle cx="966" cy="288" r="2.5" className="a-ink" />
        <circle cx="1004" cy="288" r="2.5" className="a-ink" />
        <rect x="852" y="244" width="266" height="10" rx="2" className="a-wood-deep" {...line} />
        <rect x="884" y="220" width="92" height="24" rx="7" className="a-metal" {...line} />
        <path d="M896 244h68" {...line} opacity="0.3" />
        <circle cx="962" cy="232" r="3" className="lit" />
        <rect x="1012" y="196" width="14" height="48" rx="1" className="a-fabric-deep" {...line} />
        <rect x="1028" y="206" width="12" height="38" rx="1" className="a-clay" {...line} />
        <path d="M1044 244l10-46 12 3-10 43z" className="a-shade" {...line} />

        {/* A picture above it. */}
        <path d="M952 82l33-22 33 22" {...line} opacity="0.5" />
        <rect x="912" y="82" width="146" height="110" rx="2" className="a-wood-deep" {...line} />
        <rect x="924" y="94" width="122" height="86" className="a-page" {...line} />
        <circle cx="1016" cy="118" r="9" className="a-shade" />
        <path d="M924 180v-26c20-14 40-18 60-6s40 4 62-10v42z" className="a-fabric" />
        <path d="M924 180v-12c24-10 50-4 70 2s36 0 52-6v16z" className="a-leaf" />
        <rect x="924" y="94" width="122" height="86" {...line} />

        {/* What was said, and what came back. */}
        <text x="480" y="98" className="said" textAnchor="middle">
          “Dim the lamp a little.”
        </text>
        <text x="808" y="212" className="answer" textAnchor="middle">
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
      <svg viewBox="0 0 560 370" role="img" aria-labelledby="privacy-title">
        <title id="privacy-title">
          The wake word, transcription, model and voice all sit inside the house. A single dashed line carries
          one question, as text, out to a cloud model, and only when it helps.
        </title>

        {/* The house: chimney, roof, walls, standing on its own shadow. */}
        <ellipse cx="200" cy="346" rx="200" ry="8" className="a-shadow" />
        <rect x="292" y="58" width="26" height="60" className="a-wood-deep" {...line} />
        <rect x="286" y="50" width="38" height="10" rx="2" className="a-wood-deep" {...line} />
        <rect x="32" y="150" width="336" height="190" className="a-wall" {...line} />
        <path d="M14 158L200 30l186 128z" className="a-fabric-deep" {...line} />
        <path d="M60 140L200 44l140 96" {...line} opacity="0.3" />
        <text x="52" y="326" className="caption">
          Your Mac, at home
        </text>

        {stages.map((stage, i) => {
          const y = 170 + i * 38;
          return (
            <g key={stage}>
              <rect x="110" y={y} width="180" height="28" rx="14" className="a-page" {...line} />
              <text x="200" y={y + 19} className="stage" textAnchor="middle">
                {stage}
              </text>
              {i < stages.length - 1 ? <path d={`M200 ${y + 28}v10`} {...line} opacity="0.5" /> : null}
            </g>
          );
        })}
        <circle cx="128" cy="184" r="3.5" className="lit" />

        {/* The one way out: optional, as text, one question. */}
        <path d="M290 260C372 260 386 136 448 112" {...line} strokeDasharray="4 6" />
        <path
          d="M446 116c-18 0-30-12-30-26s12-26 28-26c6-18 22-28 40-28 22 0 38 14 42 32 14 2 24 12 24 26 0 12-10 22-24 22z"
          className="a-metal"
          {...line}
        />
        <text x="486" y="150" className="caption" textAnchor="middle">
          Cloud model
        </text>
        <text x="486" y="168" className="caption faint" textAnchor="middle">
          optional
        </text>
        <text x="392" y="292" className="caption">
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

/** The same choices as the Settings tab, as they sit in config.json. */
export function ConfigFile() {
  return (
    <div className="config-file" aria-hidden="true">
      <p className="file-name">~/.config/parlour/config.json</p>
      <pre>
        <code>
          {"{\n"}
          {'  "wake": { "words": ['}
          <span className="v">"hey_jarvis"</span>
          {"] },\n"}
          {'  "tts": { "provider": '}
          <span className="v">"kokoro"</span>
          {', "voice": '}
          <span className="v">"bf_emma"</span>
          {" },\n"}
          {'  "llm": {\n    "local": { "model": '}
          <span className="v">"qwen3-8b-mlx"</span>
          {" },\n"}
          {'    "cloud": { "enabled": '}
          <span className="v">true</span>
          {" }\n  },\n"}
          {'  "search": { "provider": '}
          <span className="v">"searxng"</span>
          {" }\n}"}
        </code>
      </pre>
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
