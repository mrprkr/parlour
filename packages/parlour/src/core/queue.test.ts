import assert from "node:assert/strict";
import { test } from "node:test";
import { RequestQueue, SupersededError } from "./queue.ts";

/** A promise the test settles by hand, so a job can be held open for as long as it likes. */
function deferred<T = void>() {
  let settle!: (value: T) => void;
  const promise = new Promise<T>((resolve) => {
    settle = resolve;
  });
  return { promise, settle };
}

/**
 * A queue and a way to watch it: `job` submits one that runs until it is
 * released, recording when it started.
 */
function harness(options: { concurrency: number; maxWaiting: number }) {
  const queue = new RequestQueue(options);
  const started: string[] = [];
  const gates = new Map<string, () => void>();

  const job = (client: string, label = client) => {
    const gate = deferred();
    gates.set(label, () => gate.settle());
    return queue.submit(client, async () => {
      started.push(label);
      await gate.promise;
      return label;
    });
  };
  const release = async (label: string) => {
    gates.get(label)?.();
    // Two turns of the microtask queue: one for the job, one for the pump.
    await new Promise((resolve) => setImmediate(resolve));
  };
  const settled = () => new Promise((resolve) => setImmediate(resolve));
  return { queue, started, job, release, settled };
}

test("a client's requests run one at a time, in the order they were asked", async () => {
  const { started, job, release, settled } = harness({ concurrency: 2, maxWaiting: 4 });
  const first = job("kitchen", "one");
  const second = job("kitchen", "two");
  await settled();

  assert.deepEqual(started, ["one"], "the second request waits for the first");
  await release("one");
  assert.equal(await first, "one");
  assert.deepEqual(started, ["one", "two"]);
  await release("two");
  assert.equal(await second, "two");
});

test("two satellites are answered at once rather than behind each other", async () => {
  const { queue, started, job, release, settled } = harness({ concurrency: 2, maxWaiting: 4 });
  const kitchen = job("kitchen");
  const study = job("study");
  await settled();

  assert.deepEqual(started, ["kitchen", "study"]);
  assert.equal(queue.running, 2);
  await release("study");
  assert.equal(await study, "study");
  await release("kitchen");
  assert.equal(await kitchen, "kitchen");
  assert.equal(queue.running, 0);
});

test("no more than the concurrency runs at once, however many clients ask", async () => {
  const { queue, started, job, release, settled } = harness({ concurrency: 2, maxWaiting: 4 });
  void job("a");
  void job("b");
  void job("c");
  await settled();

  assert.deepEqual(started, ["a", "b"]);
  assert.equal(queue.waiting(), 1);
  await release("a");
  assert.deepEqual(started, ["a", "b", "c"]);
});

test("lanes take turns, so a busy client cannot starve a quiet one", async () => {
  const { started, job, release, settled } = harness({ concurrency: 1, maxWaiting: 4 });
  void job("a", "a1");
  void job("a", "a2");
  void job("a", "a3");
  await settled();
  void job("b", "b1");
  await settled();

  assert.deepEqual(started, ["a1"]);
  await release("a1");
  await release("b1");
  await release("a2");
  // The study's one request is answered between the kitchen's, not after all of them.
  assert.deepEqual(started, ["a1", "b1", "a2", "a3"]);
});

test("a newer request from a client drops the oldest one still waiting", async () => {
  const { job, release, settled } = harness({ concurrency: 1, maxWaiting: 1 });
  const running = job("kitchen", "running");
  const stale = job("kitchen", "stale");
  await settled();
  const newest = job("kitchen", "newest");

  await assert.rejects(stale, (error: unknown) => {
    assert.ok(error instanceof SupersededError);
    assert.equal(error.client, "kitchen");
    return true;
  });
  await release("running");
  assert.equal(await running, "running");
  await release("newest");
  assert.equal(await newest, "newest");
});

test("a request that throws frees its slot rather than stopping the queue", async () => {
  const queue = new RequestQueue({ concurrency: 1, maxWaiting: 2 });
  await assert.rejects(
    queue.submit("kitchen", async () => {
      throw new Error("the model fell over");
    }),
    /fell over/,
  );
  assert.equal(queue.running, 0);
  assert.equal(await queue.submit("kitchen", async () => "next"), "next");
});

test("clear drops what is waiting for one client and leaves the others alone", async () => {
  const { queue, job, release } = harness({ concurrency: 1, maxWaiting: 2 });
  const running = job("a", "a1");
  const waiting = job("a", "a2");
  const other = job("b", "b1");
  await new Promise((resolve) => setImmediate(resolve));

  queue.clear("a");
  await assert.rejects(waiting, SupersededError);
  await release("a1");
  assert.equal(await running, "a1");
  await release("b1");
  assert.equal(await other, "b1");
});
