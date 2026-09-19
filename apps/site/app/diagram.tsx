import { steps } from "./steps";

/**
 * The signal path: a question crossing the machine from left to right, drawn
 * as a schematic rather than a picture of a house. Everything inside the
 * boundary runs on the Mac; the one branch that leaves it is dashed, carries
 * text, and is drawn crossing the boundary line on purpose. The `data-step`
 * attribute on the wrapper lights one stage at a time, so with no JavaScript
 * the whole diagram still renders, unlit and complete.
 */

// The local stages, evenly spaced along the spine. Step 5 is the branch.
const local = [1, 2, 3, 4, 6, 7];
const first = 110;
const gap = 148;
const spine = 182;
const radius = 15;

const at = (n: number) => first + local.indexOf(n) * gap;
const step = (n: number) => steps.find((s) => s.n === n);

function Node({ n, x, y }: { n: number; x: number; y: number }) {
  return (
    <g className={`node s${n}`}>
      <circle className="disc" cx={x} cy={y} r={radius} />
      <text className="num" x={x} y={y + 5} textAnchor="middle">
        {n}
      </text>
    </g>
  );
}

export function Diagram() {
  const branchX = at(4);

  return (
    <svg className="diagram" viewBox="0 10 960 276" role="img" aria-labelledby="diagram-title diagram-desc">
      <title id="diagram-title">How a question travels through Parlour</title>
      <desc id="diagram-desc">
        Seven stages. Six of them sit inside a boundary marked “on your Mac”: the wake word, your voice,
        speech to text with whisper.cpp, a local model, a voice from Kokoro, and your speakers. A single
        dashed branch leaves the boundary from the local model up to Claude, labelled text only, and only when
        the local model asks.
      </desc>

      {/* The boundary. Everything inside it runs on one machine. */}
      <g className="boundary">
        <rect x="40" y="134" width="880" height="140" />
        <text className="place" x="40" y="122">
          On your Mac
        </text>
      </g>

      {/* The spine, one segment per stage so the arriving segment can light. */}
      <g className="path">
        {local.slice(1).map((n, i) => {
          const from = first + i * gap + radius;
          const to = first + (i + 1) * gap - radius;
          const mid = (from + to) / 2;
          return (
            <g className={`seg s${n}`} key={n}>
              <line x1={from} y1={spine} x2={to} y2={spine} />
              <path className="tip" d={`M${mid - 4} ${spine - 5}l5 5l-5 5`} />
            </g>
          );
        })}
      </g>

      {/* The one line that leaves, drawn crossing the boundary. */}
      <g className="branch s5">
        <path className="lead" d={`M${branchX} ${spine - radius}V80`} />
        <text className="aside" x={branchX + 26} y="112">
          text only, and only when asked
        </text>
      </g>

      {/* The stages themselves. */}
      {local.map((n) => {
        const s = step(n);
        const x = at(n);
        return (
          <g key={n}>
            <Node n={n} x={x} y={spine} />
            <text className="label" x={x} y={spine + 42} textAnchor="middle">
              {s?.label}
            </text>
            <text className="detail" x={x} y={spine + 62} textAnchor="middle">
              {s?.detail}
            </text>
          </g>
        );
      })}

      {/* Step 5, outside, named above its disc rather than below it. */}
      <text className="label" x={branchX} y="36" textAnchor="middle">
        {step(5)?.label}
      </text>
      <Node n={5} x={branchX} y={65} />
    </svg>
  );
}
