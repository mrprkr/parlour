import type { Message } from "./types.ts";

/**
 * One request can be several things: "turn the kitchen light off and set a
 * timer for ten minutes" is two jobs, and a model asked to do both in one
 * turn will usually do one of them and tell you it did both.
 *
 * Triage splits the request into this list. The action agent then takes them
 * one at a time, each seeing what the ones before it did, and the replies are
 * joined back into a single thing to say.
 */

export type TaskKind = "action" | "question" | "chat";

export interface TaskRequest {
  /** What to do, written to stand on its own: no pronouns, no missing room. */
  text: string;
  kind: TaskKind;
  /** Triage judged this beyond the local model, so it goes straight to the cloud. */
  clever?: boolean;
}

export type TaskStatus = "pending" | "running" | "done" | "failed" | "skipped";

export interface Task extends TaskRequest {
  id: number;
  status: TaskStatus;
  /** What to say about this one. Empty until it has run. */
  reply: string;
  via: "local" | "cloud";
  /** How long it took, in ms. */
  ms: number;
}

/** What a client is told about each part of its request. */
export interface TaskOutcome {
  text: string;
  kind: TaskKind;
  status: TaskStatus;
  via: "local" | "cloud";
  ms: number;
}

export class TaskList {
  readonly tasks: Task[];

  constructor(requests: TaskRequest[]) {
    this.tasks = requests.map((request, index) => ({
      ...request,
      id: index + 1,
      status: "pending",
      reply: "",
      via: "local",
      ms: 0,
    }));
  }

  get length(): number {
    return this.tasks.length;
  }

  /** The next thing to do, marked as running. */
  next(): Task | undefined {
    const task = this.tasks.find((candidate) => candidate.status === "pending");
    if (task) task.status = "running";
    return task;
  }

  finish(task: Task, result: { reply: string; via: "local" | "cloud"; ms: number }): void {
    task.status = "done";
    task.reply = result.reply.trim();
    task.via = result.via;
    task.ms = result.ms;
  }

  /** A task that could not be done, and what to say about it. */
  fail(task: Task, reply: string, via: "local" | "cloud" = "local", ms = 0): void {
    task.status = "failed";
    task.reply = reply.trim();
    task.via = via;
    task.ms = ms;
  }

  /**
   * Give up on whatever is left, because something before it went wrong or
   * time ran out. `note` is said in place of the first thing given up on, so
   * that a request half done is not a request half answered.
   */
  abandon(note?: string): void {
    let first = true;
    for (const task of this.tasks) {
      if (task.status !== "pending" && task.status !== "running") continue;
      task.status = "skipped";
      if (first && note) task.reply = note;
      first = false;
    }
  }

  /**
   * What has already been done, as the conversation the next task sees. The
   * model shape rather than a summary line, because "and tell me if it worked"
   * needs the previous answer, not a note about it.
   */
  transcript(): Message[] {
    const messages: Message[] = [];
    for (const task of this.tasks) {
      if (task.status !== "done" || !task.reply) continue;
      messages.push({ role: "user", content: task.text });
      messages.push({ role: "assistant", content: task.reply });
    }
    return messages;
  }

  /**
   * The whole request as one thing to say. Two jobs that both answer "Done."
   * are one "Done.", because hearing it twice sounds like a stutter rather
   * than like thoroughness.
   */
  reply(): string {
    const parts: string[] = [];
    for (const task of this.tasks) {
      const text = task.reply.trim();
      if (!text) continue;
      if (parts.some((part) => same(part, text))) continue;
      parts.push(text);
    }
    // One task speaks for itself, exactly as the model wrote it. Only a reply
    // with another sentence coming after it needs to end like one.
    if (parts.length < 2) return parts[0] ?? "";
    return parts.map(stopped).join(" ").trim();
  }

  /** Cloud if any part of the request needed it, which is what the client shows. */
  get via(): "local" | "cloud" {
    return this.tasks.some((task) => task.via === "cloud") ? "cloud" : "local";
  }

  outcomes(): TaskOutcome[] {
    return this.tasks.map(({ text, kind, status, via, ms }) => ({ text, kind, status, via, ms }));
  }
}

/** A reply that is about to have another sentence spoken after it needs to end like one. */
function stopped(text: string): string {
  return /[.!?…]["')\]]?$/.test(text) ? text : `${text}.`;
}

/** The same thing said twice, whether or not the model put a full stop on both. */
function same(a: string, b: string): boolean {
  const plain = (text: string) => text.toLowerCase().replace(/[.!?…\s]+$/, "");
  return plain(a) === plain(b);
}
