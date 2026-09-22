/**
 * The work queue in front of the models.
 *
 * A house has more microphones than it has GPUs. Two satellites that hear
 * their wake word at the same moment both want the local model, and letting
 * both in at once makes each answer arrive later than if they had taken
 * turns: the model is one process and its batch is one request deep.
 *
 * So requests queue. Each client gets a lane of its own, which is what keeps
 * satellites out of each other's way in every sense that matters here: one
 * request per lane runs at a time, so a conversation stays in order and a
 * client can never hold more than one slot; lanes take turns, so the study
 * cannot starve the kitchen however fast it asks; and a lane that backs up
 * drops its own stale requests rather than anybody else's.
 */

/**
 * Thrown into a waiting request when a newer one from the same client
 * replaced it. Somebody standing in the kitchen who asks twice wants the
 * second answer, and hearing the first one first is worse than not hearing it.
 */
export class SupersededError extends Error {
  readonly client: string;

  constructor(client: string) {
    super(`${client} said something else before this was answered`);
    this.name = "SupersededError";
    this.client = client;
  }
}

export interface QueueOptions {
  /** How many requests run at once across the whole house. */
  concurrency: number;
  /** How many requests may wait in one client's lane before the oldest is dropped. */
  maxWaiting: number;
}

interface Job {
  run(): Promise<void>;
  drop(error: Error): void;
}

interface Lane {
  key: string;
  waiting: Job[];
  running: boolean;
}

export class RequestQueue {
  readonly #lanes = new Map<string, Lane>();
  /** Lane keys in the order they last had a turn, so no client can starve another. */
  readonly #order: string[] = [];
  readonly #concurrency: number;
  readonly #maxWaiting: number;
  #running = 0;

  constructor(options: QueueOptions) {
    this.#concurrency = Math.max(1, Math.trunc(options.concurrency));
    this.#maxWaiting = Math.max(1, Math.trunc(options.maxWaiting));
  }

  /** Run `job` when this client's lane and the house are ready. */
  submit<T>(client: string, job: () => Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const lane = this.#lane(client);
      // The lane is full, so the oldest thing waiting in it is the oldest
      // thing this client said, and the least worth answering now.
      while (lane.waiting.length >= this.#maxWaiting) {
        lane.waiting.shift()?.drop(new SupersededError(client));
      }
      lane.waiting.push({
        run: async () => {
          try {
            resolve(await job());
          } catch (error) {
            reject(error);
          }
        },
        drop: reject,
      });
      this.#pump();
    });
  }

  /** Requests in flight, across every client. */
  get running(): number {
    return this.#running;
  }

  /** Requests waiting for one client, or for all of them. */
  waiting(client?: string): number {
    if (client !== undefined) return this.#lanes.get(client)?.waiting.length ?? 0;
    let total = 0;
    for (const lane of this.#lanes.values()) total += lane.waiting.length;
    return total;
  }

  /** Drop everything waiting, for one client or for all of them. Nothing running is touched. */
  clear(client?: string): void {
    for (const lane of this.#lanes.values()) {
      if (client !== undefined && lane.key !== client) continue;
      const dropped = lane.waiting.splice(0);
      for (const job of dropped) job.drop(new SupersededError(lane.key));
      this.#forget(lane);
    }
  }

  #lane(key: string): Lane {
    const existing = this.#lanes.get(key);
    if (existing) return existing;
    const lane: Lane = { key, waiting: [], running: false };
    this.#lanes.set(key, lane);
    this.#order.push(key);
    return lane;
  }

  /** The lane that has waited longest for its turn and has something to run. */
  #next(): Lane | null {
    for (const key of this.#order) {
      const lane = this.#lanes.get(key);
      if (lane && !lane.running && lane.waiting.length) return lane;
    }
    return null;
  }

  /**
   * To the back of the queue, when a request of this client's finishes rather
   * than when it starts: a client waits behind everyone who asked while it
   * was being answered, and not only behind those who had asked before it.
   */
  #rotate(lane: Lane): void {
    const at = this.#order.indexOf(lane.key);
    if (at < 0) return;
    this.#order.splice(at, 1);
    this.#order.push(lane.key);
  }

  #pump(): void {
    while (this.#running < this.#concurrency) {
      const lane = this.#next();
      if (!lane) return;
      const job = lane.waiting.shift();
      if (!job) return;

      lane.running = true;
      this.#running += 1;
      // `run` settles the caller's promise itself and never rejects, so one
      // client's failure cannot stop the queue.
      void job.run().then(() => {
        lane.running = false;
        this.#running -= 1;
        this.#rotate(lane);
        this.#forget(lane);
        this.#pump();
      });
    }
  }

  /** A lane with nothing in it is a client that has gone quiet, not a leak. */
  #forget(lane: Lane): void {
    if (lane.running || lane.waiting.length) return;
    this.#lanes.delete(lane.key);
    const at = this.#order.indexOf(lane.key);
    if (at >= 0) this.#order.splice(at, 1);
  }
}
