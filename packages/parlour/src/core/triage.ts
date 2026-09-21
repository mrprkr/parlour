import { z } from "zod";
import { logger } from "./logger.ts";
import type { ChatModel } from "./ports.ts";
import type { TaskRequest } from "./tasks.ts";
import type { Message } from "./types.ts";

const log = logger("triage");

/**
 * The first stage of a request: work out what was actually said, and what it
 * is asking for, before anything acts on it.
 *
 * Speech recognition hands over a plausible sentence rather than a correct
 * one, people say "it" and "in there" and expect the house to know, and one
 * breath is often two jobs. A small model given all of that at once, with
 * thirty tools in front of it, does the first job and claims the second. So
 * the words are repaired, the pronouns are filled in from the conversation
 * and the room, and the request becomes a list of tasks, each written to
 * stand on its own.
 */

export type TriageMode = "auto" | "always" | "never";

export interface TriageContext {
  /** The local model. Triage is a small job and never leaves the house. */
  model: ChatModel;
  mode: TriageMode;
  /** Hard cap on how many tasks one request can become. */
  maxTasks: number;
  /** Tool names the action agent has, so triage can tell doing from asking. */
  tools: string[];
  /** The last few turns, for "turn it off" and "what about tomorrow". */
  history: Message[];
  room?: string;
  /** Stop and take the fast path if this has passed. */
  deadline?: number;
  now?: () => number;
}

export interface Triage {
  tasks: TaskRequest[];
  /**
   * How the list was worked out: "fast" skipped the model because the request
   * was plainly one thing, "model" is the full pass, "fallback" is what the
   * fast path gives when the model could not be understood or would not answer.
   */
  via: "fast" | "model" | "fallback";
}

/** More than this much of a request and it is worth a model's opinion on what it is. */
const SIMPLE_WORDS = 12;
/** Only the last turns matter for a pronoun, and every extra one costs latency. */
const HISTORY_TURNS = 4;
/** Words that join two requests. Conservative: a bare "and" usually joins two lights. */
const COMPOUND = /(\band then\b|\band also\b|\bafter that\b|\bas well as\b|\bthen\b|\balso\b|;)/i;

/**
 * Model triage costs a round trip, and "lights off" does not need one. In
 * `auto` a request that is plainly one short instruction takes the fast path
 * and reaches the action agent as quickly as it did before there was a triage
 * stage; anything compound, long or ambiguous gets the full pass. `always`
 * buys accuracy with that round trip on every request, `never` sells it.
 */
export async function triage(text: string, context: TriageContext): Promise<Triage> {
  const now = context.now ?? Date.now;
  const trimmed = text.trim();
  if (!trimmed) return { tasks: [], via: "fast" };

  const overdue = context.deadline !== undefined && now() > context.deadline;
  if (context.mode === "never" || overdue || (context.mode === "auto" && simple(trimmed))) {
    return fastTriage(trimmed, context.maxTasks);
  }

  try {
    const completion = await context.model.complete(
      [
        { role: "system", content: triagePrompt(context) },
        ...recent(context.history),
        { role: "user", content: trimmed },
      ],
      [],
    );
    const tasks = parseTriage(completion.text, context.maxTasks);
    if (tasks?.length) {
      log.debug(`${tasks.length} task(s):`, tasks.map((task) => `${task.kind}: ${task.text}`).join(" | "));
      return { tasks, via: "model" };
    }
    log.debug("triage returned nothing usable, taking the request as it was said");
  } catch (error) {
    // Triage is an optimisation, not a gate. A local model that is down is
    // the action agent's problem to report, not a reason to say nothing.
    log.warn("triage failed:", error instanceof Error ? error.message : error);
  }
  return { ...fastTriage(trimmed, context.maxTasks), via: "fallback" };
}

/** What a request is worth when nobody has looked at it: itself, split only where it plainly splits. */
export function fastTriage(text: string, maxTasks: number): Triage {
  const parts = text
    .split(COMPOUND)
    .filter((part) => !COMPOUND.test(part))
    .map((part) => part.trim().replace(/^[,;\s]+|[,;\s]+$/g, ""))
    .filter(Boolean);
  const tasks = (parts.length ? parts : [text]).slice(0, Math.max(1, maxTasks)).map(
    (part): TaskRequest => ({
      // Everything gets the house's tools, as it did before triage existed: a
      // guess here that says "chat" is a light that never goes off.
      text: part,
      kind: "action",
    }),
  );
  return { tasks, via: "fast" };
}

/** One short instruction with nothing joining two halves of it. */
export function simple(text: string): boolean {
  if (COMPOUND.test(text)) return false;
  if (/\band\b/i.test(text)) return false;
  if (text.includes("?") && text.split("?").filter((part) => part.trim()).length > 1) return false;
  return text.trim().split(/\s+/).length <= SIMPLE_WORDS;
}

const TriagedItem = z.object({
  text: z.string(),
  kind: z.enum(["action", "question", "chat"]).catch("action"),
  clever: z.boolean().catch(false),
});

const TriageOutput = z.object({ items: z.array(TriagedItem) });

/**
 * The model's answer, read as generously as is safe. Small models fence their
 * JSON, preface it, call the key `tasks`, or return the array on its own;
 * none of that is worth a failed request, and anything left unreadable falls
 * back to the words as they were said.
 */
export function parseTriage(raw: string, maxTasks: number): TaskRequest[] | null {
  const json = extract(raw);
  if (json === null) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    return null;
  }
  const items = Array.isArray(parsed)
    ? { items: parsed }
    : {
        items:
          (parsed as { items?: unknown; tasks?: unknown })?.items ?? (parsed as { tasks?: unknown })?.tasks,
      };

  const result = TriageOutput.safeParse(items);
  if (!result.success) return null;

  const tasks: TaskRequest[] = [];
  for (const item of result.data.items) {
    const text = item.text.trim();
    if (!text) continue;
    tasks.push({ text, kind: item.kind, ...(item.clever ? { clever: true } : {}) });
    if (tasks.length >= Math.max(1, maxTasks)) break;
  }
  return tasks.length ? tasks : null;
}

/** The first balanced JSON object or array in the text, ignoring whatever surrounds it. */
function extract(raw: string): string | null {
  const text = raw.replace(/```(?:json)?/gi, " ");
  const start = text.search(/[[{]/);
  if (start < 0) return null;

  const open = text[start] as "[" | "{";
  const close = open === "[" ? "]" : "}";
  let depth = 0;
  let quoted = false;
  let escaped = false;
  for (let at = start; at < text.length; at++) {
    const char = text[at];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (char === "\\") {
      escaped = true;
      continue;
    }
    if (char === '"') quoted = !quoted;
    if (quoted) continue;
    if (char === open) depth += 1;
    else if (char === close && --depth === 0) return text.slice(start, at + 1);
  }
  return null;
}

/** The last few turns, and never the tool traffic: triage needs the gist, not the transcript. */
function recent(history: Message[]): Message[] {
  return history
    .filter((message) => message.role === "user" || message.role === "assistant")
    .slice(-HISTORY_TURNS);
}

export function triagePrompt(context: TriageContext): string {
  return [
    "You sort out what someone said to the assistant in their house, before anything acts on it.",
    "The words came from speech recognition, so they may be misheard, misspelt or ungrammatical. Work out what was meant.",
    "",
    "Answer with JSON and nothing else, in this shape:",
    '{"items":[{"text":"...","kind":"action","clever":false}]}',
    "",
    "Rules:",
    `- One item per separate thing being asked for, in the order it was said. Most requests are one item, and never more than ${context.maxTasks}.`,
    "- Write each item as a plain, correctly spelt instruction that stands on its own: no pronouns, nothing left to work out from the last thing said.",
    '- Resolve "it", "that" and "in there" from the conversation and the room. Keep the request itself unchanged otherwise: do not answer it, expand it or add politeness.',
    '- kind is "action" for something to do in the house, "question" for something to look up or work out, and "chat" for greetings, thanks and small talk.',
    "- clever is true only for a question needing real reasoning or current information from the web.",
    ...(context.tools.length ? ["", `The house can: ${context.tools.join(", ")}.`] : []),
    ...(context.room ? [`The person is speaking from the ${context.room}.`] : []),
  ].join("\n");
}
