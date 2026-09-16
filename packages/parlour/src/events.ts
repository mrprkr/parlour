/**
 * A machine-readable copy of what the agent is doing, as NDJSON on stdout.
 *
 * The desktop app reads these lines to draw its status: parsing the human log
 * output would be guesswork, and a socket would be another thing to keep
 * alive. Off unless AGENT_EVENTS is 1, so the terminal stays readable.
 */

export type AgentEvent =
  | { type: "ready"; tools: number; cloud: boolean }
  | { type: "state"; value: "idle" | "listening" | "thinking" | "speaking" }
  | { type: "heard"; text: string }
  | { type: "reply"; text: string; via: "local" | "cloud"; ms: number }
  | { type: "muted" }
  | { type: "error"; message: string };

const enabled = process.env.AGENT_EVENTS === "1";

export function emit(event: AgentEvent): void {
  if (!enabled) return;
  process.stdout.write(JSON.stringify({ ...event, at: Date.now() }) + "\n");
}
