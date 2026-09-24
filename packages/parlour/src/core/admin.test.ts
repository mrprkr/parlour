import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { type TestContext, test } from "node:test";
import { FakeServiceManager } from "../testing/index.ts";
import { Admin, type AdminDeps, AdminError } from "./admin.ts";
import { loadConfig, parseConfig } from "./config.ts";
import { resolvePaths } from "./paths.ts";
import type { ServiceSpec } from "./ports.ts";
import { LLM_LABEL, WHISPER_LABEL } from "./services.ts";

function setup(t: TestContext, overrides: Partial<AdminDeps> = {}) {
  const dir = mkdtempSync(join(tmpdir(), "parlour-admin-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const paths = resolvePaths({ HOME: dir, PARLOUR_HOME: dir }, "darwin");
  const model = join(dir, "model.gguf");
  writeFileSync(model, Buffer.alloc(16));
  const llm: ServiceSpec = {
    label: LLM_LABEL,
    what: "the local model",
    program: ["llama-server", "--model", model],
    env: {},
    logPath: join(dir, "llm.log"),
  };
  const manager = new FakeServiceManager();
  let restarts = 0;
  let now = 0;
  const admin = new Admin({
    config: parseConfig({}),
    paths,
    manager,
    specs: [llm],
    companions: null,
    doctor: async () => [{ name: "wake", status: "ok", detail: "fine" }],
    restartSelf: () => {
      restarts += 1;
    },
    now: () => now,
    cooldownMs: 1_000,
    ...overrides,
  });
  return {
    admin,
    manager,
    paths,
    llm,
    restarts: () => restarts,
    advance: (ms: number) => {
      now += ms;
    },
  };
}

async function refusal(work: Promise<unknown>, status: number, message?: RegExp): Promise<void> {
  await assert.rejects(work, (error: unknown) => {
    assert.ok(error instanceof AdminError);
    assert.equal(error.status, status);
    if (message) assert.match(error.message, message);
    return true;
  });
}

test("a pipeline change is saved to the file and restarts the agent so it takes effect", async (t) => {
  const { admin, paths, restarts } = setup(t);
  writeFileSync(paths.configFile, JSON.stringify({ name: "House", pipeline: { maxTasks: 3 } }));

  const result = await admin.setPipeline({ triage: "always", timeoutMs: 20_000 });
  assert.equal(result.restart, "scheduled");
  assert.equal(result.pipeline.triage, "always");
  // What was in the file stays, and no default is frozen into it.
  assert.deepEqual(JSON.parse(readFileSync(paths.configFile, "utf8")), {
    name: "House",
    pipeline: { maxTasks: 3, triage: "always", timeoutMs: 20_000 },
  });

  await new Promise((resolve) => setTimeout(resolve, 600));
  assert.equal(restarts(), 1);
  const status = await admin.status().catch(() => null);
  assert.ok(status, "status is still answered while the agent restarts");
});

test("a pipeline change outside the bounds is refused and nothing is written", async (t) => {
  const { admin, paths } = setup(t);
  await refusal(admin.setPipeline({ concurrency: 64 }), 400, /concurrency/);
  await refusal(admin.setPipeline({ timeoutMs: 1 }), 400, /timeoutMs/);
  await refusal(admin.setPipeline({ model: "other" }), 400);
  assert.equal(loadConfig(paths).exists, false);
});

test("a pipeline change says a restart is needed when nothing would bring the agent back", async (t) => {
  const { admin } = setup(t, { restartSelf: null });
  const result = await admin.setPipeline({ maxTasks: 2 });
  assert.equal(result.restart, "needed");
  await refusal(
    Promise.resolve().then(() => admin.restart()),
    409,
    /terminal/,
  );
});

test("a pipeline change to what is already running asks for no restart", async (t) => {
  const { admin, restarts } = setup(t);
  const result = await admin.setPipeline({ triage: "auto" });
  assert.equal(result.restart, "none");
  await new Promise((resolve) => setTimeout(resolve, 600));
  assert.equal(restarts(), 0);
});

test("a model server is started and stopped through the service manager", async (t) => {
  const { admin, manager, llm, advance } = setup(t);
  await refusal(admin.service("llm", "start"), 409, /not installed/);

  await manager.install([llm]);
  advance(2_000);
  const stopped = await admin.service("llm", "stop");
  assert.equal(stopped.running, false);
  assert.equal(stopped.installed, true);

  advance(2_000);
  const started = await admin.service("llm", "start");
  assert.equal(started.running, true);
  assert.deepEqual(manager.restarts, [LLM_LABEL]);
});

test("the same action is not repeated in a loop", async (t) => {
  const { admin, manager, llm, advance } = setup(t);
  await manager.install([llm]);
  await admin.service("llm", "restart");
  await refusal(admin.service("llm", "restart"), 429, /try again in 1s/);
  advance(1_000);
  await admin.service("llm", "restart");
  assert.equal(manager.restarts.length, 2);
});

test("only the model servers can be named, only for what they do", async (t) => {
  const { admin } = setup(t);
  await refusal(admin.service("agent", "stop"), 404);
  await refusal(admin.service("__proto__", "stop"), 404);
  await refusal(admin.service("llm", "delete"), 400);
  // Whisper is not in this server's specs, so there is nothing to start.
  await refusal(admin.service("whisper", "start"), 404, /does not run whisper/);
});

test("a model too big for the machine is refused rather than started", async (t) => {
  // The fixture's model is 16 bytes; a machine with 20 has no room for it.
  const { admin, manager, llm } = setup(t, { totalMemory: 20 });
  await manager.install([llm]);
  await refusal(admin.service("llm", "start"), 409, /leaves too little/);
  assert.deepEqual(manager.restarts, []);
  // Stopping it is always allowed.
  const stopped = await admin.service("llm", "stop");
  assert.equal(stopped.running, false);
});

test("status reports the services, the pipeline in force and the one saved", async (t) => {
  const { admin, manager, llm, paths } = setup(t);
  await manager.install([llm]);
  writeFileSync(paths.configFile, JSON.stringify({ pipeline: { concurrency: 1 } }));
  const status = await admin.status();
  assert.equal(status.restart, "automatic");
  assert.equal(status.pipeline.concurrency, 2);
  assert.equal(status.saved.concurrency, 1);
  assert.deepEqual(
    status.services.map((service) => [service.name, service.configured, service.running]),
    [
      ["llm", true, true],
      ["whisper", false, false],
    ],
  );
  assert.ok(status.memory.totalGb > 0);
});

test("logs are read by name and held to a size worth sending", async (t) => {
  const { admin, manager, llm } = setup(t);
  manager.logs.set(llm.logPath, "one\ntwo");
  const logs = await admin.logs("llm", 10_000);
  assert.deepEqual(logs.lines, ["one", "two"]);
  assert.equal(manager.tailed.at(-1)?.lines, 200);
  await refusal(admin.logs("../../etc/passwd"), 404);
});

test("the doctor says when the local model is too big for the machine", async (t) => {
  const { admin, paths } = setup(t, {
    config: parseConfig({ llm: { local: { managed: true } } }),
    totalMemory: 20,
  });
  mkdirSync(join(paths.modelsDir, "llm"), { recursive: true });
  writeFileSync(join(paths.modelsDir, "llm", "house.gguf"), Buffer.alloc(16));
  const checks = await admin.doctor();
  assert.deepEqual(
    checks.map((check) => [check.name, check.status]),
    [
      ["wake", "ok"],
      ["local model memory", "fail"],
    ],
  );
});

test("sandboxed companions are controlled directly, and a stopped one is reported as held", async (t) => {
  const calls: string[] = [];
  let held = false;
  const { admin } = setup(t, {
    companions: {
      stop: () => {},
      control: (label, action) => {
        calls.push(`${action} ${label}`);
        held = action === "stop";
        return true;
      },
      states: () => [{ label: LLM_LABEL, what: "the local model", running: !held, pid: null, held }],
    },
  });
  const state = await admin.service("llm", "stop");
  assert.deepEqual(calls, [`stop ${LLM_LABEL}`]);
  assert.equal(state.held, true);
  assert.equal(state.running, false);
  const whisper = (await admin.status()).services.find((service) => service.name === "whisper");
  assert.equal(whisper?.running, false);
  assert.ok(!calls.includes(`stop ${WHISPER_LABEL}`));
});
