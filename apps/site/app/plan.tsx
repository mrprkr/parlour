/**
 * The house again, this time in plan: the same six rooms as the section, so
 * the reader can map one onto the other, with a dotted line from every
 * microphone to the one Mac. It says in a picture what the clients table
 * says in words: one server, and everything else a client of it.
 */

interface RoomProps {
  x: number;
  y: number;
  w: number;
  h: number;
  name: string;
}

function Room({ x, y, w, h, name }: RoomProps) {
  return (
    <>
      <rect className="room" x={x} y={y} width={w} height={h} />
      <text className="room-name" x={x + 12} y={y + 22}>
        {name}
      </text>
    </>
  );
}

interface DeviceProps {
  x: number;
  y: number;
  label: string;
}

function Device({ x, y, label }: DeviceProps) {
  return (
    <g className="device-plan">
      <use href="#mic-plan" x={x - 8} y={y - 11} width="16" height="22" />
      <text className="label" x={x} y={y + 28} textAnchor="middle">
        {label}
      </text>
    </g>
  );
}

// Where the Mac sits in the study, in plan coordinates.
const mac = { x: 200, y: 76 };

const devices: DeviceProps[] = [
  { x: 130, y: 174, label: "Voice PE, kitchen" },
  { x: 700, y: 174, label: "a phone, sitting room" },
  { x: 700, y: 74, label: "another Mac, bedroom" },
  { x: 420, y: 174, label: "a board, on /listen" },
];

export function Plan() {
  return (
    <svg className="plan" viewBox="0 0 860 220" role="img" aria-labelledby="plan-title">
      <title id="plan-title">
        The house in plan, with a dotted line from every microphone to the Mac in the study
      </title>
      <defs>
        <symbol id="mic-plan" viewBox="-8 -10 16 22">
          <rect x="-3" y="-9" width="6" height="11" rx="3" />
          <path d="M-6 -1a6 6 0 0 0 12 0M0 5v4M-3.5 9h7" />
        </symbol>
      </defs>

      <g className="rooms-plan">
        <Room x={10} y={10} w={280} h={100} name="Study" />
        <Room x={290} y={10} w={260} h={100} name="Landing" />
        <Room x={550} y={10} w={300} h={100} name="Bedroom" />
        <Room x={10} y={110} w={280} h={100} name="Kitchen" />
        <Room x={290} y={110} w={260} h={100} name="Hall" />
        <Room x={550} y={110} w={300} h={100} name="Sitting room" />
      </g>

      {/* Every client, wired to the one server. */}
      <g className="wires">
        {devices.map((d) => (
          <line key={d.label} x1={d.x} y1={d.y} x2={mac.x} y2={mac.y} />
        ))}
      </g>

      <g className="hub">
        <rect className="hub-frame" x={mac.x - 26} y={mac.y - 18} width="52" height="34" rx="3" />
        <rect className="hub-screen" x={mac.x - 21} y={mac.y - 13} width="42" height="24" rx="1" />
        <use href="#mic-plan" x={mac.x + 36} y={mac.y - 11} width="16" height="22" />
        <text className="label" x={mac.x + 8} y={mac.y - 30} textAnchor="middle">
          the Mac, and its own microphone
        </text>
      </g>

      {devices.map((d) => (
        <Device key={d.label} {...d} />
      ))}
    </svg>
  );
}
