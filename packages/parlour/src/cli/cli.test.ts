import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, beforeEach, test } from "node:test";
import { fileURLToPath } from "node:url";
import { VERSION } from "../core/version.ts";

/**
 * The CLI is tested the way it is used: as a process, through `bin/parlour-dev`,
 * with its home pointed at a scratch directory. `HOME` is moved as well so the
 * cache, the logs and any LaunchAgent land in the same place and are removed
 * with it.
 */
const BIN = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "bin", "parlour-dev");

let home = "";

beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), "parlour-cli-"));
});

afterEach(() => rmSync(home, { recursive: true, force: true }));

interface Run {
  code: number;
  stdout: string;
  stderr: string;
}

function parlour(
  args: string[],
  options: { stdin?: string; env?: Record<string, string>; cwd?: string } = {},
): Promise<Run> {
  return new Promise((resolve) => {
    const child = execFile(
      BIN,
      args,
      {
        cwd: options.cwd,
        env: {
          PATH: process.env.PATH ?? "",
          HOME: home,
          PARLOUR_HOME: join(home, "config"),
          ...options.env,
        },
        timeout: 60_000,
      },
      (error, stdout, stderr) => {
        const code = error && "code" in error && typeof error.code === "number" ? error.code : error ? 1 : 0;
        resolve({ code, stdout, stderr });
      },
    );
    child.stdin?.end(options.stdin ?? "");
  });
}

test("--version prints the package version", async () => {
  const run = await parlour(["--version"]);
  assert.equal(run.code, 0, run.stderr);
  assert.equal(run.stdout.trim(), VERSION);
});

test("--help lists the commands and an unknown command fails with one line", async () => {
  const help = await parlour(["--help"]);
  assert.equal(help.code, 0);
  for (const command of [
    "init",
    "start",
    "text",
    "doctor",
    "service",
    "connectors",
    "config",
    "secrets",
    "models",
  ]) {
    assert.match(help.stdout, new RegExp(`^\\s+${command}\\b`, "m"), `help mentions ${command}`);
  }
  const unknown = await parlour(["bogus"]);
  assert.equal(unknown.code, 1);
  assert.equal(unknown.stderr.trim().split("\n").length, 1);
  assert.match(unknown.stderr, /bogus/);
});

test("a global flag without its value is a one line usage error", async () => {
  const run = await parlour(["--config"]);
  assert.equal(run.code, 1);
  assert.equal(run.stdout, "", "no help text");
  assert.equal(run.stderr.trim().split("\n").length, 1);
  assert.match(run.stderr, /--config needs a file/);
});

test("config path and show --json print defaults when no file exists", async () => {
  const path = await parlour(["config", "path"]);
  assert.equal(path.stdout.trim(), join(home, "config", "config.json"));

  const shown = await parlour(["config", "show", "--json"]);
  assert.equal(shown.code, 0, shown.stderr);
  const config = JSON.parse(shown.stdout) as { name: string; tts: { provider: string }; role: string };
  assert.equal(config.name, "Parlour");
  assert.equal(config.tts.provider, "kokoro");
  assert.equal(config.role, "server");
});

test("--config and PARLOUR_CONFIG point at another file", async () => {
  const file = join(home, "elsewhere.json");
  writeFileSync(file, '{"name":"Elsewhere"}\n');
  const flag = await parlour(["--config", file, "config", "show", "--json"]);
  assert.equal((JSON.parse(flag.stdout) as { name: string }).name, "Elsewhere");
  const env = await parlour(["config", "show", "--json"], { env: { PARLOUR_CONFIG: file } });
  assert.equal((JSON.parse(env.stdout) as { name: string }).name, "Elsewhere");
});

test("config write validates and round-trips", async () => {
  const written = await parlour(["config", "write"], { stdin: '{"name":"Test"}' });
  assert.equal(written.code, 0, written.stderr);
  assert.equal(JSON.parse(readFileSync(join(home, "config", "config.json"), "utf8")).name, "Test");

  const shown = await parlour(["config", "show", "--json"]);
  assert.equal((JSON.parse(shown.stdout) as { name: string }).name, "Test");

  const bad = await parlour(["config", "write"], { stdin: '{"role":"bogus"}' });
  assert.equal(bad.code, 1);
  assert.match(bad.stderr, /role/);
  // The bad document must not have replaced the good one.
  assert.equal(JSON.parse(readFileSync(join(home, "config", "config.json"), "utf8")).name, "Test");

  const notJson = await parlour(["config", "write"], { stdin: "{nope" });
  assert.equal(notJson.code, 1);
});

test("secrets set and status never print the value", async () => {
  const set = await parlour(["secrets", "set", "HA_TOKEN"], { stdin: "hunter2\n" });
  assert.equal(set.code, 0, set.stderr);
  assert.doesNotMatch(set.stdout + set.stderr, /hunter2/);

  const file = readFileSync(join(home, "config", "secrets.env"), "utf8");
  assert.match(file, /^HA_TOKEN=hunter2$/m);

  const status = await parlour(["secrets", "status"]);
  assert.equal(status.code, 0);
  assert.doesNotMatch(status.stdout, /hunter2/);
  assert.match(status.stdout, /HA_TOKEN/);

  const json = await parlour(["secrets", "status", "--json"]);
  const parsed = JSON.parse(json.stdout) as Record<string, boolean>;
  assert.equal(parsed.HA_TOKEN, true);
  assert.equal(parsed.ANTHROPIC_API_KEY, false);
  assert.equal(parsed.PARLOUR_TOKEN, false);
  assert.equal(parsed.BRAVE_API_KEY, false);
  assert.doesNotMatch(json.stdout, /hunter2/);

  // The environment counts as set, and an empty value on stdin deletes.
  const fromEnv = await parlour(["secrets", "status", "--json"], { env: { PARLOUR_TOKEN: "x" } });
  assert.equal((JSON.parse(fromEnv.stdout) as Record<string, boolean>).PARLOUR_TOKEN, true);
  await parlour(["secrets", "set", "HA_TOKEN"], { stdin: "\n" });
  assert.doesNotMatch(readFileSync(join(home, "config", "secrets.env"), "utf8"), /HA_TOKEN/);

  const bad = await parlour(["secrets", "set", "not a name"], { stdin: "x" });
  assert.equal(bad.code, 1);
});

test("init --porcelain --yes --no-deps in a temp home writes config without touching Homebrew", async () => {
  // Seeded so the doctor at the end has nothing on the network to wait for:
  // no house, no search engine, no cloud. What init adds must survive it.
  const configDir = join(home, "config");
  mkdirSync(configDir, { recursive: true });
  writeFileSync(
    join(configDir, "config.json"),
    JSON.stringify({
      integrations: {},
      search: { provider: "none" },
      llm: { cloud: { enabled: false } },
      wake: { words: ["hey_jarvis", "alexa"] },
    }),
  );

  const run = await parlour(["init", "--porcelain", "--yes", "--no-deps"], {
    env: { HA_TOKEN: "ha-secret", PARLOUR_TOKEN: "net-secret", PARLOUR_SKIP_MODELS: "1" },
  });
  const lines = run.stdout
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line) as { kind: string; text: string });
  assert.ok(lines.length > 3, run.stdout);
  for (const line of lines) {
    assert.ok(["step", "ok", "warn", "fail", "log", "done"].includes(line.kind), `kind ${line.kind}`);
  }
  assert.equal(lines.at(-1)?.kind, "done");
  assert.ok(
    lines.some((line) => line.kind === "ok" && /skipping Homebrew/.test(line.text)),
    "Homebrew skipped",
  );
  assert.ok(
    lines.some((line) => /Checking/.test(line.text)),
    "the doctor ran",
  );
  assert.doesNotMatch(run.stdout, /ha-secret|net-secret/);

  const config = JSON.parse(readFileSync(join(configDir, "config.json"), "utf8")) as Record<string, unknown>;
  assert.equal(config.role, "server");
  // Nothing was asked, so the second wake word must not have been dropped.
  assert.deepEqual((config.wake as { words: string[] }).words, ["hey_jarvis", "alexa"]);
  assert.equal((config.tts as { voice: string }).voice, "bf_emma");
  assert.deepEqual(config.integrations, {}, "the seeded integrations were kept");

  const secrets = readFileSync(join(configDir, "secrets.env"), "utf8");
  assert.match(secrets, /^HA_TOKEN=ha-secret$/m);
  assert.match(secrets, /^PARLOUR_TOKEN=net-secret$/m);

  // The app owns the agent under --porcelain, so no agent LaunchAgent is written.
  assert.equal(existsSync(join(home, "Library", "LaunchAgents", "io.parlour.agent.plist")), false);
});

test("init without a terminal leaves llm.cloud.enabled alone even when a key is in the environment", async () => {
  // No --yes and no TTY: every question takes its default. The key was not
  // typed this run, so the switch the file has must survive.
  const configDir = join(home, "config");
  mkdirSync(configDir, { recursive: true });
  writeFileSync(
    join(configDir, "config.json"),
    JSON.stringify({ integrations: {}, search: { provider: "none" }, llm: { cloud: { enabled: false } } }),
  );

  const run = await parlour(["init", "--porcelain", "--no-deps"], {
    env: { ANTHROPIC_API_KEY: "sk-ant-secret", PARLOUR_TOKEN: "net-secret", PARLOUR_SKIP_MODELS: "1" },
  });
  assert.equal(run.code, 0, run.stderr);
  const config = JSON.parse(readFileSync(join(configDir, "config.json"), "utf8")) as {
    llm: { cloud: { enabled: boolean } };
  };
  assert.equal(config.llm.cloud.enabled, false);
  assert.doesNotMatch(run.stdout, /sk-ant-secret/);
  // The key is still written, so a later run that turns the cloud on has it.
  assert.match(readFileSync(join(configDir, "secrets.env"), "utf8"), /^ANTHROPIC_API_KEY=sk-ant-secret$/m);
});

test("init in human mode keeps the logger out of its Checking section", async () => {
  const configDir = join(home, "config");
  mkdirSync(configDir, { recursive: true });
  writeFileSync(
    join(configDir, "config.json"),
    JSON.stringify({ integrations: {}, search: { provider: "none" }, llm: { cloud: { enabled: false } } }),
  );
  const run = await parlour(["init", "--yes", "--no-deps"], {
    env: { PARLOUR_TOKEN: "net-secret", PARLOUR_SKIP_MODELS: "1" },
  });
  assert.match(run.stdout, /Checking/);
  assert.doesNotMatch(run.stdout, /tools ready/);
});

test("init migrates a legacy agent.config.json into a home that does not exist yet", async () => {
  // The config file is sent outside PARLOUR_HOME, so the secrets directory
  // is not created as a side effect of writing config.json.
  const legacy = join(home, "legacy");
  mkdirSync(legacy, { recursive: true });
  writeFileSync(
    join(legacy, "agent.config.json"),
    JSON.stringify({
      homeAssistant: { baseUrl: "http://127.0.0.1:9" },
      mcpServers: {},
      search: { provider: "none" },
      llm: { cloud: { enabled: false } },
    }),
  );
  writeFileSync(join(legacy, ".env"), "AGENT_TOKEN=old-secret\n");
  writeFileSync(join(legacy, "connectors.json"), "[]\n");
  const configFile = join(home, "elsewhere", "config.json");

  const run = await parlour(["init", "--porcelain", "--yes", "--no-deps"], {
    cwd: legacy,
    env: { PARLOUR_CONFIG: configFile, PARLOUR_SKIP_MODELS: "1" },
  });
  assert.doesNotMatch(run.stdout, /ENOENT/);
  assert.equal(
    (JSON.parse(readFileSync(configFile, "utf8")) as { integrations: Record<string, unknown> }).integrations[
      "home-assistant"
    ] !== undefined,
    true,
  );
  assert.match(readFileSync(join(home, "config", "secrets.env"), "utf8"), /^PARLOUR_TOKEN=old-secret$/m);
  assert.equal(readFileSync(join(home, "config", "connectors.json"), "utf8"), "[]\n");
});

test("doctor --json reports checks and exits 1 when something fails", async () => {
  writeFileSync(join(home, "c.json"), JSON.stringify({ integrations: {}, search: { provider: "none" } }));
  const run = await parlour(["doctor", "--json"], { env: { PARLOUR_CONFIG: join(home, "c.json") } });
  const checks = JSON.parse(run.stdout) as { name: string; status: string; detail: string }[];
  assert.ok(checks.length > 0);
  for (const check of checks) assert.ok(["ok", "warn", "fail"].includes(check.status), check.status);
  assert.ok(
    checks.some((check) => check.name === "config"),
    "the config check is there",
  );
  // No models and no whisper on a fresh machine, so this is not a clean bill.
  assert.equal(run.code, checks.some((check) => check.status === "fail") ? 1 : 0);
});

test("service status without an install says so", async () => {
  const run = await parlour(["service", "status"]);
  assert.equal(run.code, 0, run.stderr);
  assert.match(run.stdout, /io\.parlour\.agent/);
  assert.match(run.stdout, /not installed/);
});

test("connectors list is empty to begin with", async () => {
  const run = await parlour(["connectors", "list", "--json"]);
  assert.equal(run.code, 0, run.stderr);
  assert.deepEqual(JSON.parse(run.stdout), []);
});
