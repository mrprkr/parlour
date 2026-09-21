/**
 * The one palette, type scale and state vocabulary. Every surface Parlour has
 * (the site, the menu bar app, the phone page, the iOS app) is drawn from this
 * file, and none of them keeps a colour of its own.
 *
 * The idea the site started with holds everywhere: ink on a limewashed wall,
 * with one lit thing. Everything is paper, ink, bracken and a hairline rule;
 * the hearth green says the house is listening and the lamp amber says it is
 * thinking. Nothing else is allowed to be colourful, so the two that are mean
 * something the moment you see them.
 */

/** A colour with a light and a dark value. Surfaces pick by scheme, not by name. */
export interface Duotone {
  light: string;
  dark: string;
}

export interface Palette {
  /** The wall. Page and window background. */
  paper: Duotone;
  /** A card or a panel lifted off the wall by a shade, never by a shadow. */
  surface: Duotone;
  /** Body text, headings, icons. */
  ink: Duotone;
  /** Secondary text: captions, labels, the how under the what. */
  bracken: Duotone;
  /** Hairlines. Parlour separates with a rule, not with a box. */
  rule: Duotone;
  /** The fill behind code, inputs and anything recessed into the wall. */
  inset: Duotone;
  /** The house is alive: running, listening, speaking, and the primary action. */
  hearth: Duotone;
  /** Text and icons drawn on top of hearth. */
  hearthInk: Duotone;
  /** The one lit thing: the wake word, the page you are on, thinking, a warning. */
  lamp: Duotone;
  /** Lamp as a word rather than a dot. Amber on a pale wall is unreadable, so the
   * light value is darkened until it carries text; in the dark the lamp itself does. */
  lampText: Duotone;
  /** Text drawn on top of lamp. */
  lampInk: Duotone;
  /** The halo under a lit dot, as an rgba so it can sit in a box-shadow. */
  lampGlow: Duotone;
  /** Something failed and a person has to do something about it. */
  alarm: Duotone;
  /** Text and icons drawn on top of alarm. */
  alarmInk: Duotone;
}

export const palette: Palette = {
  paper: { light: "#eef0ea", dark: "#0f1f1b" },
  surface: { light: "#f7f8f4", dark: "#16302a" },
  ink: { light: "#14312b", dark: "#e7e9e2" },
  bracken: { light: "#5f6f5e", dark: "#9aa89a" },
  rule: { light: "#cfd5cb", dark: "#2b3f39" },
  inset: { light: "#e3e7de", dark: "#17302a" },
  hearth: { light: "#1c6b52", dark: "#7ed3b0" },
  hearthInk: { light: "#f7f8f4", dark: "#0b2119" },
  lamp: { light: "#e9b84a", dark: "#e9b84a" },
  lampText: { light: "#8a6112", dark: "#e9b84a" },
  lampInk: { light: "#2a2008", dark: "#2a2008" },
  lampGlow: { light: "rgba(233, 184, 74, 0.35)", dark: "rgba(233, 184, 74, 0.22)" },
  alarm: { light: "#9c3a2c", dark: "#e59183" },
  alarmInk: { light: "#f7f8f4", dark: "#2a100b" },
};

/**
 * The four states a session moves through, plus the one it is in when nothing
 * is running. A surface may render these as a dot, a ring or a whole screen,
 * but the colour and the cadence are the same everywhere, so the kitchen
 * satellite, the menu bar and a phone in your hand all say the same thing.
 *
 * `pulseMs` is one full breath; `null` is a steady mark that does not move.
 * The cadence quickens as the turn approaches its answer, which is how you can
 * read the state across a room without reading the words.
 */
export type SessionState = "stopped" | "idle" | "listening" | "thinking" | "speaking";

export interface StateMark {
  /** Which palette entry the mark is drawn in. */
  colour: "hearth" | "lamp" | "bracken";
  /** One full breath in milliseconds, or null for a mark that holds still. */
  pulseMs: number | null;
  /** Filled marks are live; an outline is a thing that is switched off. */
  filled: boolean;
  /** Lit marks carry the halo. Only one thing on a screen should be lit. */
  glow: boolean;
  /** What to call the state in the interface. British English, lower case. */
  label: string;
}

export const stateMarks: Record<SessionState, StateMark> = {
  stopped: { colour: "bracken", pulseMs: null, filled: false, glow: false, label: "stopped" },
  idle: { colour: "hearth", pulseMs: null, filled: true, glow: false, label: "ready" },
  listening: { colour: "hearth", pulseMs: 1100, filled: true, glow: true, label: "listening" },
  thinking: { colour: "lamp", pulseMs: 700, filled: true, glow: true, label: "thinking" },
  speaking: { colour: "hearth", pulseMs: 500, filled: true, glow: true, label: "speaking" },
};

/** The states in the order a turn passes through them. */
export const sessionStates: SessionState[] = ["stopped", "idle", "listening", "thinking", "speaking"];

export interface Typography {
  /**
   * Headings and anything that wants to sound like the house rather than the
   * software. The site loads Young Serif and prepends it to this stack; the
   * apps fall back to what the system already has.
   */
  serif: string;
  /** Everything else. The platform's own face, so the interface stays quiet. */
  sans: string;
  /** Commands, config keys, transcripts of what was heard. */
  mono: string;
}

export const typography: Typography = {
  serif: '"Iowan Old Style", Georgia, serif',
  sans: '-apple-system, BlinkMacSystemFont, "SF Pro Text", system-ui, sans-serif',
  mono: 'ui-monospace, SFMono-Regular, "SF Mono", Menlo, monospace',
};

/**
 * The type scale, in px at a 17px base. Named for the job, not the size, so a
 * surface that has to shrink everything (the menu bar window runs at 14px)
 * scales the whole ramp rather than picking a different step.
 */
export const text = {
  micro: 12,
  small: 13,
  body: 15,
  lede: 17,
  title: 20,
  heading: 26,
  display: 40,
} as const;

export const leading = {
  tight: 1.15,
  snug: 1.3,
  normal: 1.55,
} as const;

/** A 4pt grid. Parlour's layouts are mostly rules and space, so this matters. */
export const space = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
  xxxl: 48,
} as const;

/** Corners: md for code and inputs, lg for cards, full for the marks. */
export const radius = {
  sm: 4,
  md: 6,
  lg: 10,
  full: 999,
} as const;

/** How long anything takes. Nothing in Parlour should announce itself. */
export const motion = {
  quick: 120,
  settle: 220,
  /** The dot's halo, and any state change the eye should follow rather than catch. */
  breath: 700,
} as const;

/** The line weight of every rule in the interface, in px. */
export const hairline = 1;

/** The one measure prose is set to, in rem, so a doc reads the same everywhere. */
export const measure = { prose: 40, doc: 44 } as const;
