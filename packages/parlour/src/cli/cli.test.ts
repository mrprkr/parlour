import assert from "node:assert/strict";
import { execFile, execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { after, afterEach, before, beforeEach, test } from "node:test";
import { fileURLToPath } from "node:url";
import { AGENT_LABEL, WHISPER_LABEL } from "../core/services.ts";
import { VERSION } from "../core/version.ts";

/**
 * The CLI is tested the way it is used: as a process, through `bin/parlour-dev`,
 * with its home pointed at a scratch directory. `HOME` is moved as well so the
 * cache, the logs and any LaunchAgent plist land in the same place and are
 * removed with it.
 *
 * launchd itself cannot be moved. It is one per user, and a job bootstrapped
 * from a scratch HOME is a real `parlour start` that keeps running after the
 * directory is gone, holding the microphone and the port with a token from
 * this file. So every run is given a stub launchctl (`PARLOUR_LAUNCHCTL`)
 * that records what it was asked and answers as launchd does for a job that
 * is not loaded, and the suite checks at the end that the real launchd looks
 * the same as it did at the start.
 */
const BIN = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "bin", "parlour-dev");

let home = "";
let launchctl = "";
let launchctlLog = "";

beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), "parlour-cli-"));
  launchctl = join(home, "bin", "launchctl");
  launchctlLog = join(home, "launchctl.log");
  mkdirSync(dirname(launchctl), { recursive: true });
  writeFileSync(
    launchctl,
    [
      "#!/bin/sh",
      `printf '%s\\n' "$*" >> "${launchctlLog}"`,
      // `launchctl list <label>` exits 113 when no such job is loaded.
      '[ "$1" = list ] && exit 113',
      "exit 0",
      "",
    ].join("\n"),
    { mode: 0o755 },
  );
});

afterEach(() => rmSync(home, { recursive: true, force: true }));

/** What the CLI asked the stub, one line of arguments per call. */
function launchctlCalls(): string[] {
  return existsSync(launchctlLog) ? readFileSync(launchctlLog, "utf8").split("\n").filter(Boolean) : [];
}

/**
 * The parts of the user's own agent job that a leak would change. The pid
 * and the last exit are left out because a real install can restart on its
 * own while the suite runs; what matters is which program is loaded from
 * where.
 */
function hostAgentJob(): string {
  if (process.platform !== "darwin") return "";
  try {
    const out = execFileSync("launchctl", ["list", AGENT_LABEL], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    });
    return out
      .split("\n")
      .filter((line) => /"(Program|StandardOutPath|StandardErrorPath)"/.test(line))
      .join("\n");
  } catch {
    return "not loaded";
  }
}

let hostAgentBefore = "";

before(() => {
  hostAgentBefore = hostAgentJob();
});

after(() => {
  assert.equal(
    hostAgentJob(),
    hostAgentBefore,
    `the suite changed ${AGENT_LABEL} in the real launchd; tests must go through the stub launchctl`,
  );
});

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
          // The stub is first on PATH as well, so a launchctl reached by name
          // rather than through the provider still cannot touch the real one.
          PATH: `${dirname(launchctl)}:${process.env.PATH ?? ""}`,
          HOME: home,
          PARLOUR_HOME: join(home, "config"),
          PARLOUR_LAUNCHCTL: launchctl,
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
    "stop",
    "restart",
    "text",
    "try",
    "doctor",
    "service",
    "connectors",
    "mcp",
    "skills",
    "plugins",
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

test("config show --raw prints the file as written, with no default filled in", async () => {
  // No file yet: the raw document is empty, while --json still fills it in.
  const empty = await parlour(["config", "show", "--raw"]);
  assert.equal(empty.code, 0, empty.stderr);
  assert.deepEqual(JSON.parse(empty.stdout), {});

  // A sparse file comes back sparse. This is what the desktop app edits and
  // hands to `config write`, so a save from the app must not turn `name`
  // and every other default into an explicit value.
  const written = await parlour(["config", "write"], { stdin: '{"wake":{"words":["alexa"]}}' });
  assert.equal(written.code, 0, written.stderr);
  const raw = await parlour(["config", "show", "--raw"]);
  assert.deepEqual(JSON.parse(raw.stdout), { wake: { words: ["alexa"] } });
  const effective = JSON.parse((await parlour(["config", "show", "--json"])).stdout) as { name: string };
  assert.equal(effective.name, "Parlour");

  // A file the schema rejects is an error, not a document to hand back.
  writeFileSync(join(home, "config", "config.json"), '{"role":"bogus"}\n');
  const bad = await parlour(["config", "show", "--raw"]);
  assert.equal(bad.code, 1);
  assert.match(bad.stderr, /role/);
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

  // A key status has never heard of, a provider's own, is still reported.
  await parlour(["secrets", "set", "MY_SERVICE_API_KEY"], { stdin: "provider-secret\n" });
  const withOwn = await parlour(["secrets", "status"]);
  assert.match(withOwn.stdout, /^set\s+MY_SERVICE_API_KEY\s+in secrets\.env$/m);
  assert.doesNotMatch(withOwn.stdout, /provider-secret/);
  const own = await parlour(["secrets", "status", "--json"]);
  const ownJson = JSON.parse(own.stdout) as Record<string, boolean>;
  assert.equal(ownJson.MY_SERVICE_API_KEY, true);
  assert.equal(ownJson.HA_TOKEN, true);
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

test("init --local-model answers the model question without a terminal", async () => {
  // The desktop app and a script have no terminal to be asked in, and both
  // should be able to say yes to the bundled model rather than only to be
  // told it did not happen.
  const configDir = join(home, "config");
  mkdirSync(configDir, { recursive: true });
  writeFileSync(
    join(configDir, "config.json"),
    JSON.stringify({ integrations: {}, search: { provider: "none" }, llm: { cloud: { enabled: false } } }),
  );
  const read = () =>
    JSON.parse(readFileSync(join(configDir, "config.json"), "utf8")) as {
      llm: { local?: { managed?: boolean; model?: string; baseUrl?: string } };
    };

  const auto = await parlour(
    ["init", "--porcelain", "--yes", "--no-deps", "--no-service", "--local-model", "auto"],
    {
      env: { PARLOUR_TOKEN: "net-secret", PARLOUR_SKIP_MODELS: "1" },
    },
  );
  assert.equal(auto.code, 0, auto.stderr);
  const managed = read().llm.local;
  assert.equal(managed?.managed, true);
  assert.match(String(managed?.model), /^qwen/, `a catalogue model: ${managed?.model}`);
  // Its own port, so a running LM Studio on 1234 and this can both exist.
  assert.equal(managed?.baseUrl, "http://127.0.0.1:8920/v1");

  const none = await parlour(
    ["init", "--porcelain", "--yes", "--no-deps", "--no-service", "--local-model", "none"],
    {
      env: { PARLOUR_TOKEN: "net-secret", PARLOUR_SKIP_MODELS: "1" },
    },
  );
  assert.equal(none.code, 0, none.stderr);
  assert.equal(read().llm.local?.managed, false);

  // A name that is not on the list stops the run rather than quietly setting
  // up a different model from the one that was asked for.
  const bogus = await parlour(
    ["init", "--porcelain", "--no-deps", "--no-service", "--local-model", "llama-9000"],
    {
      env: { PARLOUR_SKIP_MODELS: "1" },
    },
  );
  assert.equal(bogus.code, 1);
  assert.match(bogus.stderr, /No local model called "llama-9000"/);
  assert.match(bogus.stderr, /auto, none, or one of/);
});

test("init on a file with no integrations block writes every default integration, not only the house", async () => {
  // `parlour connectors add` never touches config.json, so the block init
  // writes is the one that decides whether a connector is ever loaded. No
  // HA_TOKEN, so the house's doctor asks nothing of the network.
  const configDir = join(home, "config");
  mkdirSync(configDir, { recursive: true });
  writeFileSync(
    join(configDir, "config.json"),
    JSON.stringify({ search: { provider: "none" }, llm: { cloud: { enabled: false } } }),
  );

  const run = await parlour(["init", "--porcelain", "--yes", "--no-deps"], {
    env: { PARLOUR_TOKEN: "net-secret", PARLOUR_SKIP_MODELS: "1" },
  });
  assert.equal(run.code, 0, run.stderr);
  const config = JSON.parse(readFileSync(join(configDir, "config.json"), "utf8")) as {
    integrations: Record<string, unknown>;
  };
  assert.deepEqual(config.integrations, {
    "home-assistant": { url: "http://homeassistant.local:8123" },
    connectors: {},
  });
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
  // A key that was only in the shell is not Parlour's to keep: nobody chose
  // it for the house, so it stays out of secrets.env and the run says so.
  assert.doesNotMatch(readFileSync(join(configDir, "secrets.env"), "utf8"), /ANTHROPIC_API_KEY/);
  assert.match(run.stdout, /ANTHROPIC_API_KEY is in this shell but not in secrets\.env/);
});

test("init --yes does not copy an ambient ANTHROPIC_API_KEY into secrets.env on a fresh config", async () => {
  // No config at all, so llm.cloud.enabled takes its default of true. The
  // switch is harmless without a key; the key is what must not appear, or
  // every escalation would go to Anthropic on a key exported for other tools.
  const configDir = join(home, "config");
  mkdirSync(configDir, { recursive: true });
  writeFileSync(
    join(configDir, "config.json"),
    JSON.stringify({ integrations: {}, search: { provider: "none" } }),
  );

  const run = await parlour(["init", "--porcelain", "--yes", "--no-deps"], {
    env: { ANTHROPIC_API_KEY: "sk-ant-secret", PARLOUR_TOKEN: "net-secret", PARLOUR_SKIP_MODELS: "1" },
  });
  assert.equal(run.code, 0, run.stderr);
  assert.doesNotMatch(run.stdout, /sk-ant-secret/);
  const secrets = readFileSync(join(configDir, "secrets.env"), "utf8");
  assert.doesNotMatch(secrets, /ANTHROPIC_API_KEY/);
  assert.match(
    secrets,
    /^PARLOUR_TOKEN=net-secret$/m,
    "Parlour's own names are still taken from the environment",
  );
  // The doctor at the end judges what the file holds, not what the shell had.
  assert.doesNotMatch(run.stdout, /"ok".*cloud escalation/);
});

test("init --yes keeps an ANTHROPIC_API_KEY that is already in secrets.env", async () => {
  const configDir = join(home, "config");
  mkdirSync(configDir, { recursive: true });
  writeFileSync(
    join(configDir, "config.json"),
    JSON.stringify({ integrations: {}, search: { provider: "none" }, llm: { cloud: { enabled: false } } }),
  );
  writeFileSync(join(configDir, "secrets.env"), "ANTHROPIC_API_KEY=sk-ant-kept\n");

  const run = await parlour(["init", "--porcelain", "--yes", "--no-deps"], {
    env: { PARLOUR_TOKEN: "net-secret", PARLOUR_SKIP_MODELS: "1" },
  });
  assert.equal(run.code, 0, run.stderr);
  assert.match(run.stdout, /keeping the existing key/);
  assert.match(readFileSync(join(configDir, "secrets.env"), "utf8"), /^ANTHROPIC_API_KEY=sk-ant-kept$/m);
});

test("init in human mode keeps the logger out of its Checking section", async () => {
  const configDir = join(home, "config");
  mkdirSync(configDir, { recursive: true });
  writeFileSync(
    join(configDir, "config.json"),
    JSON.stringify({ integrations: {}, search: { provider: "none" }, llm: { cloud: { enabled: false } } }),
  );
  // --no-service: without it, --yes on a terminal installs the agent, and a
  // LaunchAgent's label is per user, so this would boot out whatever
  // io.parlour.agent the developer's own Mac is running.
  const run = await parlour(["init", "--yes", "--no-deps", "--no-service"], {
    env: { PARLOUR_TOKEN: "net-secret", PARLOUR_SKIP_MODELS: "1" },
  });
  assert.match(run.stdout, /Checking/);
  assert.doesNotMatch(run.stdout, /tools ready/);
});

test("init --yes without a terminal does not make the agent a service", async () => {
  // Nobody answered "Run the agent at login?", so nothing may start at login.
  // A --yes piped from a script used to bootstrap a real job that outlived
  // the script, so this is checked at both ends: the plist and launchctl.
  const configDir = join(home, "config");
  mkdirSync(configDir, { recursive: true });
  writeFileSync(
    join(configDir, "config.json"),
    JSON.stringify({ integrations: {}, search: { provider: "none" }, llm: { cloud: { enabled: false } } }),
  );
  const run = await parlour(["init", "--yes", "--no-deps"], {
    env: { PARLOUR_TOKEN: "net-secret", PARLOUR_SKIP_MODELS: "1" },
  });
  assert.equal(run.code, 0, run.stderr);
  assert.match(run.stdout, /no terminal to ask on, so no LaunchAgent/);
  assert.equal(existsSync(join(home, "Library", "LaunchAgents", `${AGENT_LABEL}.plist`)), false);
  assert.ok(
    !launchctlCalls().some((call) => /^(bootstrap|load) /.test(call)),
    `nothing was loaded: ${launchctlCalls().join("; ")}`,
  );
});

test("init --yes --no-service on a terminal writes no LaunchAgent", async () => {
  // The CONTRIBUTING recipe: a throwaway PARLOUR_HOME must not leave a
  // LaunchAgent behind, because that one would replace a real install's.
  const configDir = join(home, "config");
  mkdirSync(configDir, { recursive: true });
  writeFileSync(
    join(configDir, "config.json"),
    JSON.stringify({ integrations: {}, search: { provider: "none" }, llm: { cloud: { enabled: false } } }),
  );
  const run = await parlour(["init", "--porcelain", "--yes", "--no-deps", "--no-service"], {
    env: { PARLOUR_TOKEN: "net-secret", PARLOUR_SKIP_MODELS: "1" },
  });
  const lines = run.stdout
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line) as { kind: string; text: string });
  assert.equal(lines.at(-1)?.kind, "done");
  assert.ok(
    lines.some((line) => line.kind === "ok" && /--no-service/.test(line.text)),
    "says why nothing was installed",
  );
  assert.equal(existsSync(join(home, "Library", "LaunchAgents")), false, "no LaunchAgents directory at all");
  assert.equal(existsSync(join(configDir, "config.json")), true, "the config was still written");
});

test("init --porcelain names parlour service uninstall when a LaunchAgent is already installed", async () => {
  // The app and a LaunchAgent must never both own the agent. From the app
  // nobody answered the question, so the job is not taken away unasked, but
  // the app is told, in a line it shows, what removes it.
  const configDir = join(home, "config");
  mkdirSync(configDir, { recursive: true });
  writeFileSync(
    join(configDir, "config.json"),
    JSON.stringify({ integrations: {}, search: { provider: "none" }, llm: { cloud: { enabled: false } } }),
  );
  const plist = join(home, "Library", "LaunchAgents", `${AGENT_LABEL}.plist`);
  const installed = await parlour(["service", "install"]);
  assert.equal(installed.code, 0, installed.stderr);
  assert.ok(existsSync(plist), "the plist was written");
  const before = launchctlCalls().length;

  const run = await parlour(["init", "--porcelain", "--yes", "--no-deps"], {
    env: { PARLOUR_TOKEN: "net-secret", PARLOUR_SKIP_MODELS: "1" },
  });
  assert.equal(run.code, 0, run.stderr);
  const lines = run.stdout
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line) as { kind: string; text: string });
  assert.ok(
    lines.some((line) => line.kind === "warn" && /parlour service uninstall/.test(line.text)),
    `warns and names the command: ${run.stdout}`,
  );
  assert.ok(
    !lines.some((line) => /left to the app/.test(line.text)),
    "does not also claim the agent is the app's alone",
  );
  assert.ok(existsSync(plist), "the LaunchAgent is left for the person to remove");
  assert.ok(
    !launchctlCalls()
      .slice(before)
      .some((call) => /^(bootout|unload) /.test(call)),
    `nothing was unloaded: ${launchctlCalls().slice(before).join("; ")}`,
  );
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

test("stop and restart say what they would have stopped when nothing is installed", async () => {
  // The stub answers "not loaded" whatever the host's launchd has. Neither
  // command may invent a job: a person who runs the agent under the menu bar
  // app has nothing here to stop, and should be told where to look instead.
  const stopped = await parlour(["stop"]);
  assert.equal(stopped.code, 0, stopped.stderr);
  assert.match(stopped.stdout, /Nothing is installed to stop/);
  assert.match(stopped.stdout, /menu bar app/);

  const restarted = await parlour(["restart"]);
  assert.equal(restarted.code, 0, restarted.stderr);
  assert.match(restarted.stdout, /Nothing is installed to restart/);
  assert.ok(
    !launchctlCalls().some((call) => /^(bootstrap|load) /.test(call)),
    `nothing was loaded: ${launchctlCalls().join("; ")}`,
  );
});

test("stop leaves the LaunchAgent in place for the next login", async () => {
  const plist = join(home, "Library", "LaunchAgents", `${AGENT_LABEL}.plist`);
  assert.equal((await parlour(["service", "install"])).code, 0);
  const before = launchctlCalls().length;

  const run = await parlour(["stop"]);
  assert.equal(run.code, 0, run.stderr);
  assert.ok(existsSync(plist), "stopping is not forgetting: the plist stays");
  assert.ok(
    launchctlCalls()
      .slice(before)
      .some((call) => call === `bootout gui/${process.getuid?.() ?? 0}/${AGENT_LABEL}`),
    `booted out through the stub: ${launchctlCalls().slice(before).join("; ")}`,
  );
  assert.match(run.stdout, /io\.parlour\.agent/);
});

test("service status without an install says so", async () => {
  // The stub answers "not loaded" whatever the host's launchd has, so this
  // passes on a Mac that runs Parlour for real as well as on a clean one.
  const run = await parlour(["service", "status"]);
  assert.equal(run.code, 0, run.stderr);
  assert.match(run.stdout, /io\.parlour\.agent/);
  assert.match(run.stdout, /not installed/);
});

test("service install writes the plist under HOME and talks only to the given launchctl", async () => {
  const plist = join(home, "Library", "LaunchAgents", `${AGENT_LABEL}.plist`);
  const installed = await parlour(["service", "install"]);
  assert.equal(installed.code, 0, installed.stderr);
  assert.ok(existsSync(plist), "the plist was written");
  assert.match(readFileSync(plist, "utf8"), /<key>PARLOUR_HOME<\/key>/);
  assert.ok(
    launchctlCalls().some((call) => call.startsWith("bootstrap gui/") && call.endsWith(plist)),
    `bootstrapped through the stub: ${launchctlCalls().join("; ")}`,
  );
  // The stub reports no job, so the plist alone counts as installed.
  assert.match(installed.stdout, /installed but not running/);

  const removed = await parlour(["service", "uninstall"]);
  assert.equal(removed.code, 0, removed.stderr);
  assert.match(removed.stdout, /Removed io\.parlour\.agent/);
  assert.equal(existsSync(plist), false);
  assert.ok(
    launchctlCalls().some((call) => call === `bootout gui/${process.getuid?.() ?? 0}/${AGENT_LABEL}`),
    `booted out through the stub: ${launchctlCalls().join("; ")}`,
  );
});

test("a whisper LaunchAgent the config no longer wants is still shown and removed", async () => {
  // A server that became a satellite keeps the whisper plist it was given as
  // a server. The specs for a satellite never mention it, so uninstall and
  // status have to look for it by name or it runs at login with nothing to
  // show it. No whisper-server is needed here: only the plist has to exist.
  const dir = join(home, "Library", "LaunchAgents");
  const plist = join(dir, `${WHISPER_LABEL}.plist`);
  mkdirSync(dir, { recursive: true });
  writeFileSync(plist, "<plist/>");
  writeFileSync(join(home, "c.json"), JSON.stringify({ role: "satellite" }));
  const env = { PARLOUR_CONFIG: join(home, "c.json") };

  const status = await parlour(["service", "status"], { env });
  assert.equal(status.code, 0, status.stderr);
  assert.match(status.stdout, /io\.parlour\.whisper\s+whisper, left over\s+installed but not running/);

  const removed = await parlour(["service", "uninstall"], { env });
  assert.equal(removed.code, 0, removed.stderr);
  assert.match(removed.stdout, /Removed io\.parlour\.whisper/);
  assert.equal(existsSync(plist), false);
  assert.ok(
    launchctlCalls().some((call) => call === `bootout gui/${process.getuid?.() ?? 0}/${WHISPER_LABEL}`),
    `booted out through the stub: ${launchctlCalls().join("; ")}`,
  );

  // Once it is gone, status stops mentioning it.
  const after = await parlour(["service", "status"], { env });
  assert.doesNotMatch(after.stdout, /io\.parlour\.whisper/);
});

test("connectors list is empty to begin with", async () => {
  const run = await parlour(["connectors", "list", "--json"]);
  assert.equal(run.code, 0, run.stderr);
  assert.deepEqual(JSON.parse(run.stdout), []);
});

test("mcp add writes a server into config without turning the house's own integrations off", async () => {
  const added = await parlour(["mcp", "add", "weather", "--url", "https://weather.test/mcp"]);
  assert.equal(added.code, 0, added.stderr);
  const config = JSON.parse(readFileSync(join(home, "config", "config.json"), "utf8"));
  assert.deepEqual(config.integrations.mcp.servers.weather, {
    transport: "http",
    url: "https://weather.test/mcp",
  });
  // The block replaces the default rather than adding to it, so the first
  // write has to carry the integrations that were on before it.
  assert.deepEqual(Object.keys(config.integrations).sort(), ["connectors", "home-assistant", "mcp"]);

  const local = await parlour([
    "mcp",
    "add",
    "notes",
    "--token-env",
    "NOTES_TOKEN",
    "--",
    "npx",
    "-y",
    "notes",
  ]);
  assert.equal(local.code, 0, local.stderr);
  const withLocal = JSON.parse(readFileSync(join(home, "config", "config.json"), "utf8"));
  assert.deepEqual(withLocal.integrations.mcp.servers.notes, {
    transport: "stdio",
    command: "npx",
    args: ["-y", "notes"],
    env: {},
    tokenEnv: "NOTES_TOKEN",
  });

  const listed = await parlour(["mcp", "list", "--json"]);
  assert.deepEqual(
    (JSON.parse(listed.stdout) as { name: string }[]).map((server) => server.name),
    ["weather", "notes"],
  );

  const again = await parlour(["mcp", "add", "weather", "--url", "https://other.test/mcp"]);
  assert.equal(again.code, 1);
  assert.match(again.stderr, /already an MCP server called weather/);

  const removed = await parlour(["mcp", "remove", "weather"]);
  assert.equal(removed.code, 0, removed.stderr);
  const left = JSON.parse(readFileSync(join(home, "config", "config.json"), "utf8"));
  assert.deepEqual(Object.keys(left.integrations.mcp.servers), ["notes"]);
  assert.equal((await parlour(["mcp", "remove", "weather"])).code, 1);
});

test("mcp add refuses a server that is neither a url nor a command", async () => {
  const neither = await parlour(["mcp", "add", "half"]);
  assert.equal(neither.code, 1);
  assert.match(neither.stderr, /parlour mcp add/);

  const both = await parlour(["mcp", "add", "half", "--url", "https://a.test", "--", "npx"]);
  assert.equal(both.code, 1);
  assert.match(both.stderr, /either --url or a command/);

  const bad = await parlour(["mcp", "add", "half", "--url", "not-a-url"]);
  assert.equal(bad.code, 1);
  assert.equal(existsSync(join(home, "config", "config.json")), false, "nothing was written");
});

test("skills new writes a file the list and the show can read back", async () => {
  const made = await parlour(["skills", "new", "bedtime", "--description", "What goodnight means"]);
  assert.equal(made.code, 0, made.stderr);
  const file = made.stdout.trim();
  assert.equal(file, join(home, "config", "skills", "bedtime.md"));
  assert.equal((await parlour(["skills", "path"])).stdout.trim(), join(home, "config", "skills"));

  writeFileSync(file, "---\nname: bedtime\ndescription: What goodnight means\n---\nPorch light on.\n");
  const listed = await parlour(["skills", "list", "--json"]);
  assert.deepEqual((JSON.parse(listed.stdout) as { skills: { name: string }[] }).skills, [
    { name: "bedtime", description: "What goodnight means", source: file, own: true },
  ]);

  const shown = await parlour(["skills", "show", "bedtime"]);
  assert.equal(shown.stdout.trim(), "Porch light on.");
  assert.equal((await parlour(["skills", "show", "nothing"])).code, 1);
  assert.equal((await parlour(["skills", "new", "bedtime"])).code, 1, "an existing file is not overwritten");
});

test("skills write replaces a skill after checking it, and remove deletes only the house's own", async () => {
  const skill = "---\nname: bedtime\ndescription: What goodnight means\n---\nPorch light on.\n";
  const written = await parlour(["skills", "write", "bedtime"], { stdin: skill });
  assert.equal(written.code, 0, written.stderr);
  const file = join(home, "config", "skills", "bedtime.md");
  assert.equal(readFileSync(file, "utf8"), skill);

  const renamed = await parlour(["skills", "write", "bedtime"], {
    stdin: skill.replace("name: bedtime", "name: other"),
  });
  assert.equal(renamed.code, 1, "the frontmatter has to agree with the name");
  const empty = await parlour(["skills", "write", "bedtime"], { stdin: "---\nname: bedtime\n---\n" });
  assert.equal(empty.code, 1, "a skill with no body is refused");
  assert.equal(readFileSync(file, "utf8"), skill, "a refused write leaves the file alone");
  assert.equal((await parlour(["skills", "write", "../escape"], { stdin: skill })).code, 1);

  const removed = await parlour(["skills", "remove", "bedtime"]);
  assert.equal(removed.code, 0, removed.stderr);
  assert.equal(existsSync(file), false);
  assert.equal((await parlour(["skills", "remove", "bedtime"])).code, 1);
});

test("try asks the local model the config names and reports what it said", async () => {
  const { createServer } = await import("node:http");
  const server = createServer((request, response) => {
    request.resume();
    request.on("end", () => {
      response.setHeader("content-type", "application/json");
      response.end(JSON.stringify({ choices: [{ message: { role: "assistant", content: "Paris." } }] }));
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const address = server.address() as { port: number };
    mkdirSync(join(home, "config"), { recursive: true });
    writeFileSync(
      join(home, "config", "config.json"),
      JSON.stringify({ llm: { local: { baseUrl: `http://127.0.0.1:${address.port}/v1`, model: "fake" } } }),
    );
    const run = await parlour(["try", "llm", "--json"]);
    assert.equal(run.code, 0, run.stderr);
    const trial = JSON.parse(run.stdout) as { stage: string; ok: boolean; reply: string; via: string };
    assert.equal(trial.stage, "llm");
    assert.equal(trial.ok, true);
    assert.equal(trial.reply, "Paris.");
    assert.equal(trial.via, "local:fake");
  } finally {
    server.close();
  }
});

test("try reports a stage that cannot run as a failed trial, and an unknown stage as a usage error", async () => {
  mkdirSync(join(home, "config"), { recursive: true });
  writeFileSync(
    join(home, "config", "config.json"),
    JSON.stringify({ llm: { local: { baseUrl: "http://127.0.0.1:9/v1", timeoutMs: 2000 } } }),
  );
  const down = await parlour(["try", "llm", "--json"]);
  assert.equal(down.code, 1);
  const trial = JSON.parse(down.stdout) as { ok: boolean; detail: string };
  assert.equal(trial.ok, false);
  assert.ok(trial.detail.length > 0);

  const unknown = await parlour(["try", "bogus"]);
  assert.equal(unknown.code, 1);
  assert.match(unknown.stderr, /Unknown subcommand/);
  assert.equal((await parlour(["try", "mic", "--seconds", "0"])).code, 1);
});

test("plugins add loads the package before it writes the name into config", async () => {
  const file = join(home, "car-plugin.js");
  writeFileSync(
    file,
    'export default { name: "car", description: "The car", skills: [], integrations: { mcp: {} } };\n',
  );

  const added = await parlour(["plugins", "add", file]);
  assert.equal(added.code, 0, added.stderr);
  assert.match(added.stdout, /Added car/);
  assert.deepEqual(JSON.parse(readFileSync(join(home, "config", "config.json"), "utf8")).plugins, [file]);

  const listed = await parlour(["plugins", "list", "--json"]);
  assert.deepEqual((JSON.parse(listed.stdout) as { name: string; integrations: string[] }[])[0], {
    specifier: file,
    name: "car",
    description: "The car",
    providers: [],
    skills: 0,
    skillsDir: "",
    integrations: ["mcp"],
  });

  // A package that is not installed is caught here, not at the next start.
  const missing = await parlour(["plugins", "add", "parlour-plugin-that-is-not-installed"]);
  assert.equal(missing.code, 1);
  assert.match(missing.stderr, /is not installed/);
  assert.deepEqual(JSON.parse(readFileSync(join(home, "config", "config.json"), "utf8")).plugins, [file]);

  const removed = await parlour(["plugins", "remove", file]);
  assert.equal(removed.code, 0, removed.stderr);
  assert.deepEqual(JSON.parse(readFileSync(join(home, "config", "config.json"), "utf8")).plugins, []);
});
