import { steps } from "./steps";

/**
 * The signal path, running down the page in the direction the reader scrolls.
 * Everything inside the boundary runs on the Mac; the one branch that leaves
 * it goes sideways, out through the boundary line, because that is the whole
 * point of it. The `data-step` attribute on the wrapper lights one stage at a
 * time, so with no JavaScript the drawing still renders, unlit and complete.
 */

// The local stages, top to bottom. Step 5 is the branch off to one side.
const local = [1, 2, 3, 4, 6, 7];
const first = 96;
const gap = 82;
const spine = 246;
const radius = 14;

// Labels sit to the left of the spine, ranged right against it.
const labelEnd = 216;

// Where the branch leaves: level with "Thinking", the stage that decides.
const cloud = { x: 360, reach: 346 };

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
  const branch = at(4);

  return (
    <svg className="diagram" viewBox="0 0 440 580" role="img" aria-labelledby="diagram-title diagram-desc">
      <title id="diagram-title">How a question travels through Parlour</title>
      <desc id="diagram-desc">
        Seven stages, running down the page. Six of them sit inside a boundary marked “on your Mac”: the wake
        word, your voice, speech to text with whisper.cpp, a local model, a voice from Kokoro, and your
        speakers. A single dashed branch leaves the boundary sideways from the local model to Claude, carrying
        text only, and only when asked.
      </desc>

      {/* The boundary. Everything inside it runs on the one machine. */}
      <g className="boundary">
        <rect x="12" y="42" width="270" height="518" />
        <text className="place" x="12" y="32">
          On your Mac
        </text>
      </g>

      {/* The spine, one segment per stage so the path can fill as it is read. */}
      <g className="path">
        {local.slice(1).map((n, i) => {
          const from = first + i * gap + radius;
          const to = first + (i + 1) * gap - radius;
          const mid = (from + to) / 2;
          return (
            <g className={`seg s${n}`} key={n}>
              <line x1={spine} y1={from} x2={spine} y2={to} />
              <path className="tip" d={`M${spine - 5} ${mid - 4}l5 5l5 -5`} />
            </g>
          );
        })}
      </g>

      {/* The one line that leaves, drawn crossing the boundary. */}
      <g className="branch s5">
        <path className="lead" d={`M${spine + radius} ${branch}H${cloud.reach}`} />
      </g>

      {/* The local stages, each named beside its disc. */}
      {local.map((n) => {
        const s = step(n);
        const y = at(n);
        return (
          <g key={n}>
            <Node n={n} x={spine} y={y} />
            <text className="label" x={labelEnd} y={y + 2} textAnchor="end">
              {s?.label}
            </text>
            <text className="detail" x={labelEnd} y={y + 22} textAnchor="end">
              {s?.detail}
            </text>
          </g>
        );
      })}

      {/* Step 5, outside, named above and below its disc rather than beside it. */}
      <text className="label" x={cloud.x} y={branch - 30} textAnchor="middle">
        {step(5)?.label}
      </text>
      <Node n={5} x={cloud.x} y={branch} />
      <text className="detail" x={cloud.x} y={branch + 34} textAnchor="middle">
        {step(5)?.detail}
      </text>
    </svg>
  );
}
