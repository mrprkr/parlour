/**
 * A machine-readable copy of what the agent is doing, as NDJSON on stdout.
 *
 * The desktop app reads these lines to draw its status: parsing the human log
 * output would be guesswork, and a socket would be another thing to keep
 * alive. Off until `enableEvents()` is called (the CLI does so for
 * `parlour start --events`), so the terminal stays readable.
 */

export type AgentEvent =
  | { type: "ready"; tools: number; cloud: boolean }
  | { type: "state"; value: "idle" | "listening" | "thinking" | "speaking" }
  | { type: "heard"; text: string }
  | { type: "reply"; text: string; via: "local" | "cloud"; ms: number }
  | { type: "muted" }
  /** About to exit so as to be started again, with RESTART_EXIT_CODE. */
  | { type: "restarting" }
  | { type: "error"; message: string };

let enabled = false;

export function enableEvents(): void {
  enabled = true;
}

export function emit(event: AgentEvent): void {
  if (!enabled) return;
  process.stdout.write(`${JSON.stringify({ ...event, at: Date.now() })}\n`);
}
