/**
 * The plate: a house cut in section, drawn once and lit by CSS. Every part of
 * Parlour that lives in the house is drawn where it lives; the sound is the
 * dotted route from the kitchen to the Mac and the cloud is outside the roof
 * on a single dashed line. The callout numbers match `steps.ts`, and the
 * `data-step` attribute on the figure around this decides which one is lit.
 */

// The stair from the hall floor up to the study door, as a section: eleven
// treads climbing right to left, on a stringer.
function stair(): string {
  const bottomX = 576;
  const bottomY = 566;
  const topX = 452;
  const topY = 390;
  const n = 11;
  const dx = (bottomX - topX) / n;
  const dy = (bottomY - topY) / n;
  const points: string[] = [`${bottomX},${bottomY}`];
  for (let i = 0; i < n; i++) {
    const x = bottomX - dx * i;
    const y = bottomY - dy * i;
    points.push(`${(x - dx).toFixed(1)},${y.toFixed(1)}`);
    points.push(`${(x - dx).toFixed(1)},${(y - dy).toFixed(1)}`);
  }
  // Close along a stringer under the treads rather than filling to the floor.
  points.push(`${topX},${topY}`, `${topX},${topY + 36}`, `${bottomX - 30},${bottomY}`);
  return points.join(" ");
}

// The ground beyond the house: a hatched strip under the garden line.
function hatch(): string {
  const strokes: string[] = [];
  for (let x = 6; x < 960; x += 28) strokes.push(`M${x} 586l-9 13`);
  return strokes.join(" ");
}

interface CalloutProps {
  n: number;
  cx: number;
  cy: number;
  tx: number;
  ty: number;
}

function Callout({ n, cx, cy, tx, ty }: CalloutProps) {
  return (
    <g className={`callout c${n}`}>
      <line className="leader" x1={cx} y1={cy} x2={tx} y2={ty} />
      <circle className="disc" cx={cx} cy={cy} r="13" />
      <text className="num" x={cx} y={cy + 5} textAnchor="middle">
        {n}
      </text>
    </g>
  );
}

export function House() {
  return (
    <svg className="house" viewBox="0 0 960 640" role="img" aria-labelledby="house-title house-desc">
      <title id="house-title">A house in section, with Parlour inside it</title>
      <desc id="house-desc">
        Two floors and a loft, cut open. Someone in the kitchen says the wake word; the sound travels through
        the hall, up the stairs and into the study, where the Mac runs everything. A phone on the sofa, a
        Voice PE on the kitchen shelf, another Mac in the bedroom and a board in the loft each have a
        microphone. Above the roof, a cloud labelled Claude joins the Mac by one dashed line marked text only,
        when asked.
      </desc>
      <defs>
        <symbol id="mic" viewBox="-8 -10 16 22">
          <rect x="-3" y="-9" width="6" height="11" rx="3" />
          <path d="M-6 -1a6 6 0 0 0 12 0M0 5v4M-3.5 9h7" />
        </symbol>
      </defs>

      {/* Outside: the ground, the garden line and one tree. */}
      <g className="ground">
        <path className="hatch" d={hatch()} />
        <line className="garden" x1="0" y1="580" x2="960" y2="580" />
        <line className="trunk" x1="906" y1="580" x2="906" y2="520" />
        <path
          className="canopy"
          d="M906 448c-22 0-36 18-32 34c-16 4-22 26-8 36c-2 16 14 24 26 18c10 12 30 8 34-6c16 0 26-16 20-30c14-12 6-36-12-36c0-12-14-20-28-16z"
        />
      </g>

      {/* The room washes, behind everything. */}
      <g className="washes">
        <rect className="wash kitchen" x="124" y="390" width="256" height="176" />
        <rect className="wash hall" x="392" y="376" width="188" height="190" />
        <rect className="wash sitting" x="592" y="390" width="244" height="176" />
        <rect className="wash study" x="124" y="200" width="316" height="176" />
        <rect className="wash landing" x="452" y="200" width="128" height="176" />
        <rect className="wash bedroom" x="592" y="200" width="244" height="176" />
        <polygon className="wash loft" points="130,186 480,66 830,186" />
      </g>

      {/* The cut: slabs, stairs and roof in ink; the walls in brick, the way a section shows what it cut through. */}
      <g className="cut">
        <rect x="124" y="566" width="712" height="14" />
        <rect x="124" y="376" width="328" height="14" />
        <rect x="452" y="376" width="48" height="14" />
        <rect x="592" y="376" width="244" height="14" />
        <rect x="124" y="186" width="712" height="14" />
        <rect className="wall" x="110" y="196" width="14" height="384" />
        <rect className="wall" x="836" y="196" width="14" height="384" />
        <rect className="wall" x="380" y="390" width="12" height="80" />
        <rect className="wall" x="580" y="390" width="12" height="80" />
        <rect className="wall" x="440" y="200" width="12" height="90" />
        <rect className="wall" x="580" y="200" width="12" height="190" />
        <polygon className="stair" points={stair()} />
        <polyline className="roof" points="96,200 480,60 864,200" />
      </g>

      {/* Doors, open, as thin leaves. */}
      <g className="line">
        <line x1="386" y1="470" x2="352" y2="548" />
        <line x1="586" y1="470" x2="620" y2="548" />
        <line x1="446" y1="290" x2="474" y2="360" />
      </g>

      {/* Kitchen: counter, speaker, shelf with the Voice PE, and the person. */}
      <g className="line kitchen">
        <line x1="200" y1="390" x2="200" y2="416" />
        <polygon className="fill" points="186,416 214,416 220,428 180,428" />
        <rect className="fill" x="140" y="500" width="160" height="66" />
        <path className="fill" d="M246 500v-12a9 9 0 0 1 18 0v12M264 492l8-4M250 488h10" />
        <line x1="140" y1="500" x2="300" y2="500" className="thick" />
        <line x1="220" y1="512" x2="220" y2="556" />
        <line x1="208" y1="530" x2="208" y2="540" />
        <line x1="232" y1="530" x2="232" y2="540" />
        <rect className="speaker fill" x="146" y="480" width="26" height="20" rx="2" />
        <circle className="cone" cx="159" cy="490" r="5" />
        <path
          className="speaks"
          d="M180 482a12 12 0 0 1 0 16M188 476a20 20 0 0 1 0 28M196 470a28 28 0 0 1 0 40"
        />
        <line className="thick" x1="296" y1="442" x2="372" y2="442" />
        <line x1="300" y1="442" x2="300" y2="452" />
        <line x1="368" y1="442" x2="368" y2="452" />
        <rect className="device vpe fill" x="334" y="430" width="26" height="12" rx="6" />
        <circle cx="347" cy="436" r="1.6" className="dot" />
        <use href="#mic" className="mic" x="339" y="406" width="16" height="22" />
        <text className="label" x="347" y="464" textAnchor="middle">
          Voice PE
        </text>
        <g className="person">
          <circle cx="252" cy="438" r="12" className="fill" />
          <path d="M252 450v50M252 462l-16 28M252 462l20 16M252 500l-10 40M252 500l10 40M240 540h-8M262 540h8" />
        </g>
        <path
          className="speech"
          d="M270 434a12 12 0 0 1 0 18M278 428a20 20 0 0 1 0 30M286 422a28 28 0 0 1 0 42"
        />
        <text className="label say" x="252" y="416" textAnchor="middle">
          Hey Parlour
        </text>
      </g>

      {/* Hall: the back door. */}
      <g className="line hall">
        <rect className="fill" x="404" y="478" width="44" height="88" />
        <circle cx="440" cy="524" r="2" className="dot" />
      </g>

      {/* Sitting room: window, sofa, the phone, a lamp. */}
      <g className="line sitting">
        <rect x="620" y="410" width="60" height="50" className="fill" />
        <line x1="650" y1="410" x2="650" y2="460" />
        <line x1="620" y1="435" x2="680" y2="435" />
        <rect className="fill" x="624" y="478" width="150" height="26" rx="4" />
        <rect className="fill" x="620" y="500" width="158" height="30" rx="4" />
        <rect className="fill" x="614" y="486" width="12" height="44" rx="3" />
        <rect className="fill" x="772" y="486" width="12" height="44" rx="3" />
        <path d="M626 530v36M772 530v36" />
        <rect className="device fill" x="690" y="484" width="14" height="24" rx="3" />
        <line x1="694" y1="504" x2="700" y2="504" />
        <use href="#mic" className="mic" x="689" y="458" width="16" height="22" />
        <text className="label" x="697" y="552" textAnchor="middle">
          a phone
        </text>
        <line x1="812" y1="566" x2="812" y2="470" />
        <polygon className="fill" points="796,470 828,470 836,448 788,448" />
        <line className="thick" x1="606" y1="561" x2="790" y2="561" />
      </g>

      {/* Study: the Mac on a desk, a chair, a bookshelf. */}
      <g className="line study">
        <rect x="384" y="214" width="52" height="162" className="fill" />
        <path d="M384 254h52M384 294h52M384 334h52" />
        <path d="M390 228v26M398 224v30M404 232v22M414 226v28M392 270v24M402 266v28M412 274v20M420 268v26M394 312v22M406 306v28M416 310v24M424 316v18" />
        <rect className="fill" x="150" y="330" width="150" height="8" />
        <path d="M156 338v38M292 338v38" />
        <rect className="screen-frame fill" x="200" y="272" width="84" height="52" rx="3" />
        <rect className="screen" x="205" y="277" width="74" height="40" rx="1" />
        <rect className="fill" x="238" y="324" width="8" height="6" />
        <line x1="226" y1="330" x2="258" y2="330" className="thick" />
        <rect className="device fill" x="156" y="316" width="28" height="14" rx="2" />
        <circle cx="178" cy="323" r="1.6" className="dot" />
        <text className="label" x="242" y="262" textAnchor="middle">
          the Mac
        </text>
        <use href="#mic" className="mic" x="272" y="246" width="16" height="22" />
        <text className="label note" x="224" y="364" textAnchor="middle">
          whisper.cpp, small.en
        </text>
        <rect className="fill" x="318" y="336" width="34" height="6" />
        <rect className="fill" x="352" y="300" width="6" height="42" />
        <path d="M322 342v34M348 342v34" />
      </g>

      {/* Bedroom: the bed, and a laptop on it that is another Mac. */}
      <g className="line bedroom">
        <rect className="fill" x="612" y="296" width="10" height="80" />
        <rect className="fill" x="622" y="334" width="180" height="26" rx="3" />
        <rect className="fill" x="628" y="322" width="44" height="12" rx="4" />
        <path d="M626 360v16M798 360v16" />
        <rect className="fill" x="700" y="326" width="42" height="8" rx="1" />
        <rect className="device fill" x="704" y="298" width="34" height="28" rx="2" />
        <use href="#mic" className="mic" x="748" y="296" width="16" height="22" />
        <text className="label" x="721" y="290" textAnchor="middle">
          another Mac
        </text>
        <rect x="806" y="340" width="24" height="36" className="fill" />
        <line x1="818" y1="340" x2="818" y2="322" />
        <polygon className="fill" points="808,322 828,322 832,308 804,308" />
        <rect className="fill" x="748" y="222" width="60" height="50" />
        <line x1="778" y1="222" x2="778" y2="272" />
        <line x1="748" y1="247" x2="808" y2="247" />
        <line className="thick" x1="640" y1="372" x2="800" y2="372" />
      </g>

      {/* Loft: a soldered board, listening on the socket. */}
      <g className="line loft">
        <rect className="device fill" x="432" y="152" width="44" height="24" rx="2" />
        <path d="M438 158h8M438 164h14M438 170h6M462 158v12M468 158v12" />
        <use href="#mic" className="mic" x="484" y="152" width="16" height="22" />
        <text className="label" x="508" y="169">
          a board on /listen, 16 kHz
        </text>
      </g>

      {/* Room names, in the corner of each room the way a plan letters them. */}
      <g className="rooms">
        <text x="134" y="410">
          Kitchen
        </text>
        <text x="466" y="410">
          Hall
        </text>
        <text x="602" y="410">
          Sitting room
        </text>
        <text x="134" y="220">
          Study
        </text>
        <text x="462" y="220">
          Landing
        </text>
        <text x="602" y="220">
          Bedroom
        </text>
        <text x="480" y="100" textAnchor="middle">
          Loft
        </text>
      </g>

      {/* The sound: from the kitchen, through the hall, up the stairs, to the Mac. */}
      <path
        className="route"
        d="M262 444C330 444 356 496 386 518C420 546 500 566 556 552C530 508 492 448 456 396C452 380 452 356 446 340C420 300 330 292 288 296"
      />

      <text className="label note" x="400" y="464">
        800 ms of quiet
      </text>

      {/* Outside the roof: the cloud, joined to the Mac by one dashed line. */}
      <g className="cloud">
        <line className="cloud-leader" x1="262" y1="98" x2="244" y2="270" />
        <text className="label along" x="232" y="132" textAnchor="end">
          text only, when asked
        </text>
        <path
          className="cloud-body"
          d="M222 96C202 96 202 68 224 68C224 44 260 38 270 58C290 46 316 64 306 82C324 84 322 96 306 96Z"
        />
        <text className="label cloud-name" x="264" y="86" textAnchor="middle">
          Claude
        </text>
      </g>

      {/* The callouts. The numbers are the key's numbers. */}
      <g className="callouts">
        <Callout n={1} cx={68} cy={470} tx={241} ty={444} />
        <Callout n={2} cx={412} cy={422} tx={360} ty={434} />
        <Callout n={3} cx={68} cy={258} tx={200} ty={282} />
        <Callout n={4} cx={68} cy={300} tx={200} ty={298} />
        <Callout n={5} cx={346} cy={30} tx={306} ty={62} />
        <Callout n={6} cx={68} cy={338} tx={156} ty={323} />
        <Callout n={7} cx={68} cy={544} tx={146} ty={492} />
      </g>
    </svg>
  );
}
