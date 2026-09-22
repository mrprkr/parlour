// The setup, drawn: one hub on a shelf and a satellite in each room, joined by
// hairlines. Filled and inked like the room at the top of the page.

import type { JSX } from "react";

type Icon = () => JSX.Element;

const stroke = {
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.5,
  strokeLinecap: "round",
  strokeLinejoin: "round",
} as const;

const MacMini: Icon = () => (
  <svg viewBox="0 0 160 64" className="device-art hub-art" aria-hidden="true">
    <ellipse cx="80" cy="54" rx="70" ry="4" className="a-shadow" />
    <rect x="8" y="14" width="144" height="34" rx="9" className="a-metal" {...stroke} />
    <path d="M22 48v3h116v-3" {...stroke} />
    <path d="M60 24h40" {...stroke} opacity="0.35" />
    <circle cx="138" cy="36" r="2.4" className="device-lit" />
  </svg>
);

const VoicePE: Icon = () => (
  <svg viewBox="0 0 64 64" className="device-art" aria-hidden="true">
    <ellipse cx="32" cy="55" rx="20" ry="3" className="a-shadow" />
    <rect x="12" y="12" width="40" height="40" rx="11" className="a-metal" {...stroke} />
    <circle cx="32" cy="32" r="11" className="a-page" {...stroke} />
    <circle cx="32" cy="32" r="14.5" fill="none" className="a-ring" strokeWidth="2" />
    <circle cx="32" cy="32" r="3" className="a-ink" />
  </svg>
);

const MacBook: Icon = () => (
  <svg viewBox="0 0 64 64" className="device-art" aria-hidden="true">
    <ellipse cx="32" cy="51" rx="26" ry="2.5" className="a-shadow" />
    <rect x="14" y="16" width="36" height="25" rx="2.5" className="a-metal" {...stroke} />
    <rect x="17.5" y="19.5" width="29" height="18" rx="1" className="a-glass" />
    <path d="M8 44h48l-3 4H11z" className="a-metal" {...stroke} />
  </svg>
);

const IPhone: Icon = () => (
  <svg viewBox="0 0 64 64" className="device-art" aria-hidden="true">
    <ellipse cx="32" cy="58" rx="13" ry="2.5" className="a-shadow" />
    <rect x="21" y="8" width="22" height="48" rx="6" className="a-metal" {...stroke} />
    <rect x="24" y="12" width="16" height="40" rx="3.5" className="a-glass" />
    <circle cx="32" cy="44" r="4" className="a-ring" fill="none" strokeWidth="1.5" />
  </svg>
);

const Board: Icon = () => (
  <svg viewBox="0 0 64 64" className="device-art" aria-hidden="true">
    <ellipse cx="32" cy="52" rx="24" ry="3" className="a-shadow" />
    <path d="M18 16v-5M24 16v-5M30 16v-5" {...stroke} />
    <rect x="12" y="16" width="40" height="32" rx="3" className="a-leaf" {...stroke} />
    <circle cx="26" cy="32" r="6" className="a-metal" {...stroke} />
    <rect x="38" y="24" width="10" height="16" rx="1" className="a-ink" />
  </svg>
);

const rooms: { room: string; device: string; how: string; Art: Icon }[] = [
  { room: "Kitchen", device: "Voice PE", how: "Answers through Home Assistant.", Art: VoicePE },
  { room: "Study", device: "Another Mac", how: "Finds the hub by itself.", Art: MacBook },
  { room: "Bedroom", device: "Your phone", how: "Hold the button and talk.", Art: IPhone },
  { room: "Hallway", device: "Your own hardware", how: "Streams audio over a socket.", Art: Board },
];

export function Topology() {
  return (
    <figure className="topology">
      <div className="hub">
        <MacMini />
        <p className="device-room">The hub</p>
        <p className="device-name">Mac mini</p>
        <p className="device-how">Runs the models, holds the keys and does the thinking. It listens too.</p>
      </div>
      <ul className="rooms">
        {rooms.map(({ room, device, how, Art }) => (
          <li key={room}>
            <Art />
            <p className="device-room">{room}</p>
            <p className="device-name">{device}</p>
            <p className="device-how">{how}</p>
          </li>
        ))}
      </ul>
      <figcaption className="visually-hidden">
        A Mac mini acts as the hub. Satellites in the kitchen, study, bedroom and hallway send what they hear
        to it and play back its answers.
      </figcaption>
    </figure>
  );
}
