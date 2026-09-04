import { defineTool, type Tool } from "./registry.ts";
import { logger } from "../logger.ts";

const log = logger("timers");

interface Timer {
  id: number;
  label: string;
  firesAt: number;
  handle: NodeJS.Timeout;
}

/**
 * Timers stay here rather than in Home Assistant. A kitchen timer that stops
 * working when the network does is not a kitchen timer.
 */
export class Timers {
  #next = 1;
  readonly #timers = new Map<number, Timer>();

  readonly #announce: (text: string) => void;

  constructor(announce: (text: string) => void) {
    this.#announce = announce;
  }

  tools(): Tool[] {
    return [
      defineTool(
        "set_timer",
        "Set a timer. Say what it is for so it can be announced when it goes off.",
        {
          type: "object",
          properties: {
            seconds: { type: "number", description: "Duration in seconds" },
            label: { type: "string", description: "For example: the pasta" },
          },
          required: ["seconds"],
        },
        async (args) => {
          const seconds = Math.max(1, Math.round(Number(args.seconds)));
          const label = args.label ? String(args.label) : "timer";
          const id = this.#next++;
          const handle = setTimeout(() => {
            this.#timers.delete(id);
            log.info("fired", label);
            this.#announce(`Your ${label} is up.`);
          }, seconds * 1000);
          this.#timers.set(id, { id, label, firesAt: Date.now() + seconds * 1000, handle });
          return `Timer ${id} set for ${describe(seconds)}.`;
        },
      ),
      defineTool(
        "list_timers",
        "List the timers that are still running.",
        { type: "object", properties: {} },
        async () => {
          if (!this.#timers.size) return "No timers running.";
          return [...this.#timers.values()]
            .map((t) => `${t.id}: ${t.label}, ${describe(Math.round((t.firesAt - Date.now()) / 1000))} left`)
            .join("; ");
        },
      ),
      defineTool(
        "cancel_timer",
        "Cancel a running timer by its id, or all of them.",
        {
          type: "object",
          properties: { id: { type: "number" }, all: { type: "boolean" } },
        },
        async (args) => {
          if (args.all) {
            for (const timer of this.#timers.values()) clearTimeout(timer.handle);
            this.#timers.clear();
            return "All timers cancelled.";
          }
          const timer = this.#timers.get(Number(args.id));
          if (!timer) return `No timer ${String(args.id)}.`;
          clearTimeout(timer.handle);
          this.#timers.delete(timer.id);
          return `Cancelled ${timer.label}.`;
        },
      ),
    ];
  }
}

function describe(seconds: number): string {
  if (seconds < 60) return `${seconds} seconds`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? "" : "s"}`;
  const hours = Math.round(minutes / 6) / 10;
  return `${hours} hours`;
}
