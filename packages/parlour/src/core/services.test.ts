import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, beforeEach, test } from "node:test";
import { parseConfig } from "./config.ts";
import { resolvePaths } from "./paths.ts";
import { serviceSpecs } from "./services.ts";

let home = "";
let paths = resolvePaths({ HOME: "/nowhere" }, "darwin");

beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), "parlour-"));
  paths = resolvePaths({ HOME: home, PARLOUR_HOME: join(home, "config") }, "darwin");
});

afterEach(() => rmSync(home, { recursive: true, force: true }));

/** Stands in for the PATH lookup so the test does not depend on what is installed here. */
function whichOf(found: Record<string, string>) {
  return async (binary: string) => found[binary];
}

function withWhisperModel(name = "ggml-small.en.bin"): string {
  const dir = join(paths.modelsDir, "whisper");
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, name), "");
  return join(dir, name);
}

test("the agent spec runs parlour start with its home and a spelled out PATH", async () => {
  const specs = await serviceSpecs(parseConfig({}), paths, "/opt/homebrew/bin/parlour", {
    which: whichOf({ node: "/opt/homebrew/bin/node", ffmpeg: "/usr/local/bin/ffmpeg" }),
  });
  assert.equal(specs.length, 1);
  const agent = specs[0]!;
  assert.equal(agent.label, "io.parlour.agent");
  assert.equal(agent.what, "the agent");
  assert.deepEqual(agent.program, ["/opt/homebrew/bin/parlour", "start"]);
  assert.equal(agent.env.PARLOUR_HOME, join(home, "config"));
  assert.equal(agent.logPath, join(paths.logsDir, "agent.log"));
  const path = agent.env.PATH!.split(":");
  assert.ok(path.includes("/opt/homebrew/bin"), "the bin directory of parlour and node");
  assert.ok(path.includes("/usr/local/bin"), "the bin directory of ffmpeg");
  assert.ok(path.includes("/usr/bin") && path.includes("/bin"), "the system directories");
  assert.equal(path.indexOf("/opt/homebrew/bin"), path.lastIndexOf("/opt/homebrew/bin"), "no repeats");
});

test("the running node is on the agent's PATH when none is found by name", async () => {
  const specs = await serviceSpecs(parseConfig({}), paths, "/x/parlour", { which: whichOf({}) });
  const path = specs[0]!.env.PATH!.split(":");
  assert.ok(path.includes(dirname(process.execPath)), "the directory of the node running this test");
});

test("whisper is kept warm when the server, its binary and a model are all present", async () => {
  const model = withWhisperModel();
  const specs = await serviceSpecs(parseConfig({}), paths, "/opt/homebrew/bin/parlour", {
    which: whichOf({
      "whisper-server": "/opt/homebrew/bin/whisper-server",
      ffmpeg: "/opt/homebrew/bin/ffmpeg",
    }),
  });
  assert.deepEqual(
    specs.map((spec) => spec.label),
    ["io.parlour.agent", "io.parlour.whisper"],
  );
  const whisper = specs[1]!;
  assert.equal(whisper.what, "whisper, kept warm");
  assert.equal(whisper.program[0], "/opt/homebrew/bin/whisper-server");
  assert.equal(whisper.logPath, join(paths.logsDir, "whisper.log"));
  const arg = (flag: string) => whisper.program[whisper.program.indexOf(flag) + 1];
  assert.equal(arg("--model"), model);
  assert.equal(arg("--port"), "8910");
  assert.equal(arg("--language"), "en");
  assert.ok(whisper.program.includes("--convert"));
  assert.ok(whisper.env.PATH!.split(":").includes("/opt/homebrew/bin"));
});

test("the whisper port and language follow the stt slice", async () => {
  withWhisperModel();
  const config = parseConfig({ stt: { url: "http://127.0.0.1:9000/inference", language: "de" } });
  const specs = await serviceSpecs(config, paths, "/usr/local/bin/parlour", {
    which: whichOf({ "whisper-server": "/usr/local/bin/whisper-server" }),
  });
  const whisper = specs[1]!;
  const arg = (flag: string) => whisper.program[whisper.program.indexOf(flag) + 1];
  assert.equal(arg("--port"), "9000");
  assert.equal(arg("--language"), "de");
});

test("the first model by name wins when there are several", async () => {
  withWhisperModel("ggml-small.en.bin");
  const first = withWhisperModel("ggml-base.en.bin");
  const specs = await serviceSpecs(parseConfig({}), paths, "/usr/local/bin/parlour", {
    which: whichOf({ "whisper-server": "/usr/local/bin/whisper-server" }),
  });
  assert.equal(specs[1]!.program[specs[1]!.program.indexOf("--model") + 1], first);
});

test("no whisper spec without a model, without the binary, or when stt is something else", async () => {
  const binary = whichOf({ "whisper-server": "/usr/local/bin/whisper-server" });
  assert.equal((await serviceSpecs(parseConfig({}), paths, "/x/parlour", { which: binary })).length, 1);
  withWhisperModel();
  assert.equal((await serviceSpecs(parseConfig({}), paths, "/x/parlour", { which: whichOf({}) })).length, 1);
  const other = parseConfig({ stt: { provider: "some-cloud-stt" } });
  assert.equal((await serviceSpecs(other, paths, "/x/parlour", { which: binary })).length, 1);
});

test("a satellite gets no whisper and says what it is", async () => {
  withWhisperModel();
  const specs = await serviceSpecs(parseConfig({ role: "satellite" }), paths, "/x/parlour", {
    which: whichOf({ "whisper-server": "/usr/local/bin/whisper-server" }),
  });
  assert.equal(specs.length, 1);
  assert.equal(specs[0]!.what, "the satellite");
});
