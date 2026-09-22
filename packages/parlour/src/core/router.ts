import type { DecisionMode } from "./decision.ts";
import { type ActionAgent, dispatch } from "./dispatch.ts";
import { logger } from "./logger.ts";
import type { ChatModel, DecisionModel } from "./ports.ts";
import { systemPrompt } from "./prompt.ts";
import { RequestQueue, SupersededError } from "./queue.ts";
import type { ToolRegistry } from "./registry.ts";
import { type Task, TaskList, type TaskOutcome } from "./tasks.ts";
import { type TriageMode, triage } from "./triage.ts";
import type { Message } from "./types.ts";

const log = logger("router");

/** Forget a conversation after a quiet spell, so "turn it off" cannot mean a light from an hour ago. */
export const CONTEXT_TTL_MS = 4 * 60_000;
const MAX_HISTORY = 12;
/** Stop tracking clients that have gone away, rather than growing forever. */
const MAX_SESSIONS = 32;

export interface Answer {
  text: string;
  /** Which model produced the answer. Cloud if any part of it needed the cloud. */
  via: "local" | "cloud";
  /** What the request turned out to be, one entry per task. */
  tasks?: TaskOutcome[];
}

export interface AskOptions {
  /**
   * Which conversation this belongs to. One per client, so that a follow-up
   * said to the kitchen satellite does not resolve against something asked on
   * a phone ten minutes ago, and so that two satellites asking at once queue
   * separately rather than behind each other.
   */
  session?: string;
  /** The room the request came from, if the client knows. */
  room?: string;
}

export interface RouterOptions {
  /** What the house calls itself, for the persona. */
  name: string;
  /** BCP 47 tag for the date and the language the persona asks for. Defaults to en-GB. */
  locale?: string;
  local: ChatModel;
  /** Null runs local only: no escalation tool is offered and failures are final. */
  cloud: ChatModel | null;
  registry: ToolRegistry;
  maxToolRounds: number;
  /** Hand over to the cloud model when the local one throws, rather than apologise. */
  onLocalFailure: boolean;
  /** Extra prompt lines, asked for on every turn so an integration can change its mind. */
  promptContext?: () => string[];
  /** When the request is read before it is acted on. Defaults to "auto". */
  triage?: TriageMode;
  /** How many tasks one request may become. */
  maxTasks?: number;
  /** How many requests run at once across every client. */
  concurrency?: number;
  /** How many requests may wait in one client's lane before the oldest is dropped. */
  queueDepth?: number;
  /** How long one request may take before what is left of it is abandoned, in ms. */
  timeoutMs?: number;
  /**
   * Optional on-device model that judges escalate-vs-local for each task
   * before the local model runs. Null or absent leaves ask_the_clever_one as
   * the only gate.
   */
  decision?: DecisionModel | null;
  decisionMode?: DecisionMode;
  escalateThreshold?: number;
  localConfidence?: number;
  /** The clock, injectable so a test can age a session without waiting. */
  now?: () => number;
}

interface Session {
  history: Message[];
  lastSpoke: number;
}

/**
 * The pipeline every request runs, whichever client it came from.
 *
 *   queue -> triage -> tasks -> action agent -> one thing to say
 *
 * The queue keeps clients out of each other's way and the models from being
 * asked three things at once. Triage repairs what was heard and turns it into
 * a list. The action agent takes the list one task at a time, local first:
 * the local model is fast, free and private, and the cloud one is right more
 * often, so "turn the hall light off" never leaves the house and "why is the
 * sky blue" goes straight out of it.
 */
export class Router {
  readonly #sessions = new Map<string, Session>();
  readonly #options: RouterOptions;
  readonly #queue: RequestQueue;
  readonly #now: () => number;

  constructor(options: RouterOptions) {
    this.#options = options;
    this.#now = options.now ?? Date.now;
    this.#queue = new RequestQueue({
      concurrency: options.concurrency ?? 2,
      maxWaiting: options.queueDepth ?? 2,
    });
  }

  /**
   * Answer one request. The reply belongs to the client that asked: it is
   * returned to that caller and to nobody else, and the conversation it
   * builds on is that client's alone.
   */
  async ask(text: string, options: AskOptions = {}): Promise<Answer> {
    const client = options.session ?? "local";
    try {
      return await this.#queue.submit(client, () => this.#turn(text, client, options));
    } catch (error) {
      if (error instanceof SupersededError) {
        // The person asked for something else before this came up the queue.
        // Answering it now would be answering the wrong question out loud.
        log.info(`${client}: dropped, a newer request replaced it`);
        return { text: "", via: "local", tasks: [] };
      }
      throw error;
    }
  }

  /** What is in flight and what is waiting, for `/health` and the log. */
  load(): { running: number; waiting: number } {
    return { running: this.#queue.running, waiting: this.#queue.waiting() };
  }

  reset(key?: string): void {
    if (key) this.#sessions.delete(key);
    else this.#sessions.clear();
    this.#queue.clear(key);
  }

  async #turn(text: string, client: string, options: AskOptions): Promise<Answer> {
    const session = this.#session(client);
    const deadline = this.#now() + (this.#options.timeoutMs ?? 45_000);
    const agent: ActionAgent = {
      local: this.#options.local,
      cloud: this.#options.cloud,
      registry: this.#options.registry,
      maxToolRounds: this.#options.maxToolRounds,
      onLocalFailure: this.#options.onLocalFailure,
      decision: this.#options.decision
        ? {
            model: this.#options.decision,
            mode: this.#options.decisionMode ?? "shadow",
            escalateThreshold: this.#options.escalateThreshold ?? 0.85,
            localConfidence: this.#options.localConfidence ?? 0.75,
          }
        : null,
      room: options.room,
    };

    // The persona is built per turn rather than once, because it carries the
    // date and the integrations' lines. Whether escalation exists goes in
    // here too: a prompt that names a tool the model was not given is how a
    // local-only house ends up apologising instead of calling ha_call_service.
    const system: Message = {
      role: "system",
      content: systemPrompt(
        this.#options.name,
        [...this.#context(), ...roomContext(options.room)],
        this.#options.locale,
        { escalation: this.#options.cloud !== null },
      ),
    };

    const plan = await triage(text, {
      model: this.#options.local,
      mode: this.#options.triage ?? "auto",
      maxTasks: this.#options.maxTasks ?? 4,
      tools: this.#options.registry.specs().map((spec) => spec.name),
      history: session.history,
      room: options.room,
      deadline,
      now: this.#now,
    });
    const list = new TaskList(plan.tasks);
    if (!list.length) return { text: "", via: "local", tasks: [] };
    if (list.length > 1) log.info(`${client}: ${list.length} things in one request`);

    for (let task = list.next(); task; task = list.next()) {
      // Each task sees the conversation, then what the tasks before it did,
      // then itself: "turn the light on and tell me if it worked" needs the
      // first answer to answer the second.
      const messages: Message[] = [
        system,
        ...session.history,
        ...list.transcript(),
        { role: "user", content: task.text },
      ];
      const started = this.#now();
      const result = await dispatch(task, messages, agent, deadline);
      const ms = this.#now() - started;

      if (result.failed) {
        list.fail(task, result.text, result.via, ms);
        // Whatever is left would fail the same way, and the person is owed
        // one apology rather than three.
        list.abandon();
        break;
      }
      list.finish(task, { reply: result.text, via: result.via, ms });
      if (this.#now() > deadline) {
        const left = list.tasks.filter((pending) => pending.status === "pending").length;
        log.warn(`${client}: out of time with ${left} to go`);
        // What was done is said, and so is what was not: half a request
        // answered in silence is worse than being told to ask again.
        list.abandon("I ran out of time before the rest of that.");
        break;
      }
    }

    const reply = list.reply() || "Done.";
    // The words as they were said go in the history, not the tidied ones:
    // triage reads it next time and does the tidying with the same context
    // the person had. The tool traffic stays out; it is long, it is stale by
    // the next question, and it is the bulk of the tokens. A turn where
    // nothing worked is left out altogether, so an apology about a model
    // being down is not what the next question builds on.
    if (list.tasks.some((task) => task.status === "done")) {
      const turn: Message[] = [
        { role: "user", content: text },
        { role: "assistant", content: reply },
      ];
      session.history = [...session.history, ...turn].slice(-MAX_HISTORY);
    }

    return { text: reply, via: list.via, tasks: list.outcomes() };
  }

  /** The integrations' lines, set off from the persona by a blank line when there are any. */
  #context(): string[] {
    const lines = this.#options.promptContext?.() ?? [];
    return lines.length ? ["", ...lines] : [];
  }

  #session(key: string): Session {
    const now = this.#now();
    const existing = this.#sessions.get(key);
    if (existing && now - existing.lastSpoke <= CONTEXT_TTL_MS) {
      existing.lastSpoke = now;
      return existing;
    }

    const session: Session = { history: [], lastSpoke: now };
    this.#sessions.set(key, session);
    if (this.#sessions.size > MAX_SESSIONS) {
      const oldest = [...this.#sessions.entries()].sort((a, b) => a[1].lastSpoke - b[1].lastSpoke)[0];
      if (oldest) this.#sessions.delete(oldest[0]);
    }
    return session;
  }
}

export type { Task, TaskOutcome };

function roomContext(room: string | undefined): string[] {
  if (!room) return [];
  return ["", `You are being spoken to from the ${room}. When a request names no room, it means this one.`];
}
