// The setup, drawn: one hub on a shelf and a satellite in each room, joined by
// hairlines. Line drawings in ink, so it sits in the same document as the text.

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
    <rect x="8" y="14" width="144" height="34" rx="9" {...stroke} />
    <path d="M22 48v4h116v-4" {...stroke} />
    <path d="M60 26h40" {...stroke} opacity="0.35" />
    <circle cx="138" cy="36" r="2.4" className="device-lit" />
  </svg>
);

const VoicePE: Icon = () => (
  <svg viewBox="0 0 64 64" className="device-art" aria-hidden="true">
    <rect x="12" y="12" width="40" height="40" rx="11" {...stroke} />
    <circle cx="32" cy="32" r="11" {...stroke} />
    <circle cx="32" cy="32" r="3" {...stroke} />
  </svg>
);

const MacBook: Icon = () => (
  <svg viewBox="0 0 64 64" className="device-art" aria-hidden="true">
    <rect x="14" y="16" width="36" height="24" rx="2.5" {...stroke} />
    <path d="M8 44h48l-3 4H11z" {...stroke} />
  </svg>
);

const IPhone: Icon = () => (
  <svg viewBox="0 0 64 64" className="device-art" aria-hidden="true">
    <rect x="21" y="8" width="22" height="48" rx="6" {...stroke} />
    <path d="M29 13h6" {...stroke} />
    <circle cx="32" cy="44" r="4" {...stroke} />
  </svg>
);

const Board: Icon = () => (
  <svg viewBox="0 0 64 64" className="device-art" aria-hidden="true">
    <rect x="12" y="16" width="40" height="32" rx="3" {...stroke} />
    <circle cx="26" cy="32" r="6" {...stroke} />
    <path d="M40 26h6M40 32h6M40 38h6M18 16v-5M24 16v-5M30 16v-5" {...stroke} />
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
