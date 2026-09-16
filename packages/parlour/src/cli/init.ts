import { execFile } from "node:child_process";
import { randomBytes } from "node:crypto";
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { hostname } from "node:os";
import { dirname, join, resolve } from "node:path";
import { promisify } from "node:util";
import { type Config, loadConfig, parseConfig, writeConfig } from "../core/config.ts";
import { isLegacyConfig, migrateLegacyConfig, migrateLegacyEnv } from "../core/migrate.ts";
import type { Paths } from "../core/paths.ts";
import { findOnPath } from "../core/process.ts";
import { loadSecrets, writeSecret } from "../core/secrets.ts";
import { AGENT_LABEL, serviceSpecs } from "../core/services.ts";
import { pickServiceManager } from "../providers/service/index.ts";
import { kokoroSchema } from "../providers/tts/kokoro.ts";
import { findServer } from "../server/discovery.ts";
import { type Command, parseCli } from "./args.ts";
import { diagnose } from "./doctor.ts";
import { fetchModels } from "./models.ts";
import { formatChecks, headline, humanReporter, porcelainReporter, type Reporter } from "./output.ts";
import { ask, canAsk, confirm, secret } from "./prompts.ts";
import { describeState, parlourBin } from "./service.ts";
import { runSetup, stream } from "./setup.ts";

const USAGE = [
  "parlour init               ask everything, install what is missing",
  "parlour init --yes         take every default, ask only for secrets",
  "parlour init --no-deps     never touch Homebrew",
  "parlour init --no-service  never write a LaunchAgent, for an experiment in another PARLOUR_HOME",
  "parlour init --porcelain   one JSON line per event, for the desktop app",
];

const run = promisify(execFile);

type Raw = Record<string, unknown>;

interface InitOptions {
  yes: boolean;
  deps: boolean;
  /**
   * False never installs a LaunchAgent, not even for whisper. A LaunchAgent
   * is one per label per user, so an init run against a scratch PARLOUR_HOME
   * would otherwise replace the one running the real house.
   */
  service: boolean;
  report: Reporter;
}

/**
 * One-shot setup on a Mac. Installs what is missing, downloads the models,
 * asks for the things it cannot work out on its own, and finishes by saying
 * what is still broken. Safe to run again: answers default to what is already
 * set, and secrets are kept rather than asked for twice.
 *
 * Two halves, as the shell scripts had: `setup.ts` does the mechanics and
 * asks nothing, so the desktop app can drive it from a button; the questions
 * are here, and every one of them takes its default under `--yes` or when
 * there is no terminal to ask on.
 */
export const command: Command = {
  name: "init",
  summary: "Set this machine up: dependencies, models, config, secrets, and a service or the app.",
  usage: USAGE,

  async run({ paths, argv }) {
    const { values } = parseCli(argv, {
      yes: { type: "boolean", short: "y" },
      "no-deps": { type: "boolean" },
      "no-service": { type: "boolean" },
      porcelain: { type: "boolean" },
    });
    const report = values.porcelain ? porcelainReporter() : humanReporter();
    const options: InitOptions = {
      yes: values.yes === true,
      deps: values["no-deps"] !== true,
      service: values["no-service"] !== true,
      report,
    };
    try {
      await init(paths, options);
    } catch (error) {
      report.fail(error instanceof Error ? error.message : String(error));
      report.done(true);
      throw error;
    }
  },
};

async function init(paths: Paths, options: InitOptions): Promise<void> {
  const { report, yes } = options;
  if (!report.porcelain) headline("Parlour setup");

  await offerMigration(paths, options);

  const loaded = loadConfig(paths);
  const raw: Raw = loaded.raw;
  let config = loaded.config;

  // ---------------------------------------------------------------- the role

  report.step("What this machine is");
  report.ok("One box in the house runs the models and answers. Everything else");
  report.ok("with a microphone is a satellite: it streams to that box and plays");
  report.ok("back what it says. A satellite needs no models, no keys and no GPU.");
  const role = yes ? config.role : await ask("server or satellite", config.role);
  if (role !== "server" && role !== "satellite") {
    throw new Error(`That is not a role. It is "server" or "satellite", not "${role}".`);
  }
  set(raw, ["role"], role);
  if (role === "satellite") {
    const room = yes
      ? config.satellite.room
      : await ask("Which room is it in", config.satellite.room || "kitchen");
    set(raw, ["satellite", "room"], room);
  }
  config = parseConfig(raw);

  // ------------------------------------------------------------ the mechanics

  if (!(await runSetup({ paths, config, deps: options.deps, service: options.service }, report))) {
    report.warn("Some of the setup did not finish. The check at the end will say what.");
  }
  if (options.deps && role === "server" && (await findOnPath("brew"))) {
    // A multi-gigabyte cask, so it is offered only to a person who can say
    // no. The app runs this without a terminal and makes the offer itself.
    if (existsSync("/Applications/LM Studio.app")) {
      report.ok("have LM Studio");
    } else if (report.porcelain || !canAsk()) {
      report.warn("LM Studio is not installed. Without it there is no local model.");
    } else if (await confirmOr(yes, "Install LM Studio? It is what runs the local model.")) {
      if ((await stream("brew", ["install", "--cask", "lm-studio"], report)) !== 0) {
        report.warn("could not install LM Studio");
      }
    } else {
      report.warn("Without it there is no local model, and every question goes to the cloud.");
    }
  }

  // ----------------------------------------------------------------- secrets

  // Read once, for both roles: a satellite needs the server's token and
  // nothing else, and losing that distinction is how a satellite ends up
  // generating a token of its own and never being let in.
  const secrets = loadSecrets(paths);
  const house = config.integrations["home-assistant"] as { url?: string } | undefined;
  let haToken = secrets.haToken ?? "";
  let token = secrets.token ?? "";
  // The Anthropic key alone is read from the file and not the shell.
  // ANTHROPIC_API_KEY is exported in plenty of shells for other tools, and
  // copying it into secrets.env would have the house sending its questions
  // to a key the person never chose for it. The other two names are
  // Parlour's own, so finding them in the environment is no accident.
  let anthropicKey = loadSecrets(paths, {}).anthropicKey ?? "";
  const ambientKey = secrets.anthropicKey ?? "";

  if (role === "satellite") {
    report.step("The server");
    report.ok("A satellite finds the server with Bonjour and keeps the address it");
    report.ok("found, so all it needs is the same access token the server was");
    report.ok("given. Leave the address blank to look now, or give it if this");
    report.ok("network does not carry multicast.");
    let serverUrl = yes
      ? config.satellite.serverUrl
      : await ask("Server address, or blank to find it automatically", config.satellite.serverUrl);
    if (!serverUrl) {
      // Pinned here rather than left for the first connection, because this
      // is the one moment a person is watching and can see a wrong name.
      // Anything on the network can advertise the service, and the token
      // goes to whichever server the satellite connects to.
      const found = await findServer(4000);
      if (found) {
        serverUrl = found.url;
        report.ok(`found "${found.name}" at ${found.url}; the satellite will only ever talk to it`);
      } else {
        report.warn("No server is advertising yet. The satellite will keep the first one that lets it in.");
      }
    }
    set(raw, ["satellite", "serverUrl"], serverUrl);
    token = (await keepOrAsk("The server's access token", token, yes)).value;
    if (!token) report.warn("Without it the server will refuse this satellite.");
  } else {
    if (house) {
      report.step("Home Assistant");
      report.ok("A long lived access token: your profile page in Home Assistant,");
      report.ok("Security tab, right at the bottom. It is the whole house, so it goes");
      report.ok("in secrets.env and never into git.");
      const url = yes
        ? (house.url ?? "http://homeassistant.local:8123")
        : await ask("Home Assistant address", house.url ?? "http://homeassistant.local:8123");
      // A fresh file has no `integrations` yet, and writing only the house
      // into it would pin the block to the house alone: the defaults apply
      // to a missing key, not to a present one. Seed it with every default
      // integration first, so a connector added later is actually loaded. A
      // block that is already there is the person's own and is left alone.
      if (!("integrations" in raw)) raw.integrations = structuredClone(config.integrations);
      set(raw, ["integrations", "home-assistant", "url"], url);
      haToken = (await keepOrAsk("Home Assistant token", haToken, yes)).value;
      if (haToken) {
        if (await reachable(`${url.replace(/\/+$/, "")}/api/`, haToken)) report.ok(`reached ${url}`);
        else
          report.warn(`Could not reach ${url} with that token. Carrying on; parlour doctor will say so too.`);
      }
    }

    if (config.llm.cloud.provider === "anthropic") {
      report.step("Cloud escalation");
      report.ok("The local model hands over anything it is not confident about.");
      report.ok("Leave this empty to run local only.");
      // Not a secret `--yes` stops for: the house works without it. The
      // switch is turned on only by a key given this run, never by one kept
      // from last time, and a key found in the shell is offered rather than
      // taken, so a run that asked nothing (no terminal counts as asking
      // nothing) cannot turn the cloud on behind someone's back.
      if (yes || !canAsk()) {
        if (anthropicKey) report.ok("keeping the existing key");
        else if (ambientKey)
          report.ok(
            "ANTHROPIC_API_KEY is in this shell but not in secrets.env, so it is left there. " +
              "parlour secrets set ANTHROPIC_API_KEY if the house should use it.",
          );
        else report.ok("no key, so the local model is on its own");
      } else {
        const answer =
          !anthropicKey &&
          ambientKey &&
          (await confirm("ANTHROPIC_API_KEY is set in this shell. Use it here?"))
            ? { value: ambientKey, entered: true }
            : await keepOrAsk("Anthropic API key", anthropicKey, yes);
        anthropicKey = answer.value;
        if (answer.entered) set(raw, ["llm", "cloud", "enabled"], true);
      }
    }

    report.step("The rest of the house");
    report.ok("The agent listens on the network so that Home Assistant, a phone or");
    report.ok("a satellite can all reach it. That needs a shared token, or it");
    report.ok("answers this machine only.");
    if (token) {
      report.ok("keeping the existing token");
    } else if (await confirmOr(yes, "Generate an access token and let the house in?")) {
      token = randomBytes(24).toString("hex");
      report.ok("generated");
    } else {
      report.warn("Loopback only. Run this again to change your mind.");
    }
  }

  // ------------------------------------------------------------------- voice

  report.step("Voice");
  // Both roles need a microphone. Only the server needs a wake word, a
  // speaking voice and a model: a satellite streams what it hears and plays
  // back what it is sent.
  if (!yes && canAsk()) {
    for (const device of await audioInputs()) report.ok(`  ${device}`);
  }
  const inputDevice = yes
    ? config.audio.inputDevice
    : await ask('Input device (":0" is the default microphone)', config.audio.inputDevice);
  set(raw, ["audio", "inputDevice"], inputDevice);
  report.ok(`microphone ${inputDevice}`);

  const word = config.wake.words[0] ?? "hey_jarvis";
  if (role === "server") {
    const wake = yes ? word : await ask("Wake word (hey_jarvis, alexa, hey_mycroft)", word);
    // The question is about the first word only. A list that is already set
    // stays as it is unless the answer changed it, so a re-run under --yes
    // cannot quietly trim a second word off.
    if (wake !== config.wake.words[0]) set(raw, ["wake", "words"], [wake]);
    if (
      !process.env.PARLOUR_SKIP_MODELS &&
      !existsSync(join(paths.modelsDir, "openwakeword", `${wake}.onnx`))
    ) {
      report.warn(`No model for ${wake}. Fetching it.`);
      await fetchModels({ modelsDir: paths.modelsDir, wake: [wake], whisper: null, report });
    }
    // The voice is Kokoro's option, not core's, so the slice is untyped here
    // and the default comes from the provider's own schema.
    const current = (config.tts as { voice?: string }).voice ?? kokoroSchema.parse({}).voice;
    const voice = yes
      ? current
      : await ask("Speaking voice (bf_emma, bf_isabella, bm_george, bm_lewis)", current);
    set(raw, ["tts", "voice"], voice);
    report.ok(`wake word ${wake}, voice ${voice}`);

    if (config.llm.local.provider === "openai-compatible") {
      const local = config.llm.local as { baseUrl?: string; model?: string };
      const baseUrl = local.baseUrl ?? "http://127.0.0.1:1234/v1";
      const model = local.model ?? "qwen3-8b-mlx";
      set(raw, ["llm", "local", "baseUrl"], yes ? baseUrl : await ask("Local model server", baseUrl));
      set(
        raw,
        ["llm", "local", "model"],
        yes ? model : await ask("Local model id, as LM Studio reports it", model),
      );
    }
  }

  // ------------------------------------------------------------------- write

  report.step("Writing configuration");
  config = parseConfig(raw);
  writeConfig(paths, raw);
  report.ok(paths.configFile);
  // Written even when they came from the environment (the Anthropic key
  // excepted, above): a LaunchAgent starts with none, and the file is what
  // it reads.
  writeSecret(paths, "HA_TOKEN", haToken || null);
  writeSecret(paths, "ANTHROPIC_API_KEY", anthropicKey || null);
  writeSecret(paths, "PARLOUR_TOKEN", token || null);
  report.ok(paths.secretsFile);
  // The environment wins over the file, and main.ts copied the file into the
  // environment at start-up, so a secret replaced just now would still read
  // as the old one in the check below. Mirror what was written so the doctor
  // judges the values that will be in force next time.
  setEnv("HA_TOKEN", haToken);
  setEnv("ANTHROPIC_API_KEY", anthropicKey);
  setEnv("PARLOUR_TOKEN", token);

  // ---------------------------------------------------------------- services

  report.step("Running it");
  report.ok("launchd starts it at login and restarts it if it falls over.");
  // The app and a LaunchAgent must never both own the agent: two processes
  // on one microphone and one port. Under --porcelain the app is asking, so
  // the agent is left to it; a satellite has no app, so it is always a service
  // unless --no-service said otherwise.
  //
  // A server becomes a service only when a person could have said no: at a
  // terminal, by answering, or under --yes with a terminal they could have
  // answered in. A --yes from a script, a pipe or a test has nobody behind
  // it, and the job it would start outlives the script (launchd is one per
  // user, not per PARLOUR_HOME), so that case is left to `parlour service
  // install`, which says what it is doing.
  const unattended = !report.porcelain && !canAsk();
  const asService =
    options.service &&
    (role === "satellite" ||
      (!report.porcelain &&
        !unattended &&
        (await confirmOr(yes, "Run the agent at login? Say no if you want the menu bar app to own it."))));
  if (!options.service) {
    report.ok("no LaunchAgent (--no-service). parlour service install writes one later.");
  } else if (asService) {
    const specs = (await serviceSpecs(config, paths, parlourBin())).filter(
      (spec) => spec.label === AGENT_LABEL,
    );
    for (const state of await pickServiceManager().install(specs)) {
      report.ok(`${state.what}: ${describeState(state)}`);
    }
    report.warn("The first run asks for the microphone. Approve it, or it hears nothing.");
  } else if (unattended) {
    report.ok("no terminal to ask on, so no LaunchAgent. parlour service install writes one later.");
  } else if (!(await agentServiceInstalled())) {
    report.ok("the agent itself is left to the app");
  } else if (report.porcelain) {
    // The app asked nothing, so a job is not taken away behind its back; the
    // warning is shown in its window and names the command that removes it.
    report.warn(
      `A LaunchAgent for ${AGENT_LABEL} is installed and would run beside the app, both after one ` +
        "microphone and one port. parlour service uninstall removes it.",
    );
  } else {
    // The person said the app should own it, and an earlier init or
    // `parlour service install` left a LaunchAgent that would start beside
    // the app at the next login. That is the two-processes case the question
    // exists to prevent, so saying no to the service means removing it.
    await pickServiceManager().uninstall([AGENT_LABEL]);
    report.ok(`removed the ${AGENT_LABEL} LaunchAgent, so the app has the agent to itself`);
  }

  // ----------------------------------------------------------------- verdict

  report.step("Checking");
  const checks = await diagnose(paths);
  const broken = checks.filter((check) => check.status === "fail");
  if (report.porcelain) {
    // A check's status is a reporter method, so each lands as the kind of line it is.
    for (const check of checks) report[check.status](`${check.name}: ${check.detail}`);
  } else {
    process.stdout.write(`${formatChecks(checks)}\n\n`);
    if (broken.length) headline("Set up, with the failures above still to fix.");
    else if (role === "satellite") headline("Ready. It will find the server and stay connected to it.");
    else headline(`Ready. Say "${(config.wake.words[0] ?? word).replaceAll("_", " ")}".`);
    afterword(config, paths, token);
  }
  report.done(broken.length > 0);
}

/** What to try next, printed once at the end for a person to read. */
function afterword(config: Config, paths: Paths, token: string): void {
  const out: string[] = [""];
  if (config.role === "server" && token) {
    const port = config.server.port;
    out.push(
      "The rest of the house",
      `    Phones:          http://${hostname()}:${port}`,
      `    Home Assistant:  http://${hostname()}:${port}/v1  (OpenAI Conversation integration)`,
      "    Satellites:      nothing to type. They find this machine by name.",
      `    The token is in ${paths.secretsFile} as PARLOUR_TOKEN. Satellites need the same one.`,
      "",
    );
  } else if (config.role === "satellite") {
    out.push(
      "This satellite",
      `    Room:            ${config.satellite.room || "not set"}`,
      `    Server:          ${config.satellite.serverUrl || "found automatically"}`,
      "",
    );
  }
  out.push(
    "    parlour service status   is it running, and does it start at login",
    "    parlour service logs     what it has been saying",
    "    parlour doctor           check again",
  );
  if (config.role === "server") out.push("    parlour text             try it without the microphone");
  process.stdout.write(`${out.join("\n")}\n`);
}

/**
 * The agent used to live inside a Home Assistant configuration as
 * `agent.config.json` beside a `.env`. Found in the working directory with
 * nothing yet at the new path, it is offered as the starting point.
 */
async function offerMigration(paths: Paths, options: InitOptions): Promise<void> {
  const { report, yes } = options;
  const legacyFile = resolve("agent.config.json");
  if (existsSync(paths.configFile) || !existsSync(legacyFile)) return;

  let legacy: unknown;
  try {
    legacy = JSON.parse(readFileSync(legacyFile, "utf8"));
  } catch {
    return;
  }
  if (!isLegacyConfig(legacy)) return;

  report.step("An older configuration");
  report.ok(`${legacyFile} is from before Parlour had its own home.`);
  if (!(await confirmOr(yes, `Convert it into ${paths.configFile}?`))) return;

  const migrated = migrateLegacyConfig(legacy as Raw);
  parseConfig(migrated);
  writeConfig(paths, migrated);
  report.ok(`wrote ${paths.configFile}`);

  // The config file may live outside the home directory (PARLOUR_CONFIG), so
  // writing it has not necessarily created the directory these two go in.
  const env = resolve(".env");
  if (existsSync(env) && !existsSync(paths.secretsFile)) {
    mkdirSync(dirname(paths.secretsFile), { recursive: true });
    writeFileSync(paths.secretsFile, migrateLegacyEnv(readFileSync(env, "utf8")), { mode: 0o600 });
    report.ok(`wrote ${paths.secretsFile}`);
  }
  const connectors = resolve(
    typeof (legacy as Raw).connectorsFile === "string"
      ? ((legacy as Raw).connectorsFile as string)
      : "connectors.json",
  );
  if (existsSync(connectors) && !existsSync(paths.connectorsFile)) {
    mkdirSync(dirname(paths.connectorsFile), { recursive: true });
    copyFileSync(connectors, paths.connectorsFile);
    report.ok(`copied ${paths.connectorsFile}`);
  }
}

/**
 * A secret already set is kept unless the person says otherwise; a missing
 * one is asked for. `entered` says whether the value was typed this run, for
 * the caller that treats a fresh key differently from a kept one.
 */
async function keepOrAsk(
  question: string,
  current: string,
  yes: boolean,
): Promise<{ value: string; entered: boolean }> {
  const kept = { value: current, entered: false };
  if (current && (yes || (await confirm(`${question} is already set. Keep it?`)))) return kept;
  const typed = await secret(question);
  return typed ? { value: typed, entered: true } : kept;
}

/** An empty value unsets the variable, as writing `null` removes the line. */
function setEnv(key: string, value: string): void {
  if (value) process.env[key] = value;
  else delete process.env[key];
}

/**
 * Whether a LaunchAgent for the agent is on this machine, from an earlier
 * init or `parlour service install`. Elsewhere than a Mac the service manager
 * refuses every call, and there is no job to find, so that counts as no.
 */
async function agentServiceInstalled(): Promise<boolean> {
  try {
    const [agent] = await pickServiceManager().status([
      { label: AGENT_LABEL, what: "the agent", logPath: "" },
    ]);
    return agent?.installed === true;
  } catch {
    return false;
  }
}

/** `--yes` answers yes; otherwise the person does. */
function confirmOr(yes: boolean, question: string): Promise<boolean> {
  return yes ? Promise.resolve(true) : confirm(question);
}

/** `[0] MacBook Pro Microphone` lines from ffmpeg, or nothing when it is not installed. */
async function audioInputs(): Promise<string[]> {
  try {
    await run("ffmpeg", ["-f", "avfoundation", "-list_devices", "true", "-i", ""]);
    return [];
  } catch (error) {
    // ffmpeg exits non-zero after listing, and the list is on stderr.
    const text = (error as { stderr?: string }).stderr ?? "";
    const lines = text.split("\n");
    const start = lines.findIndex((line) => /audio devices/i.test(line));
    if (start < 0) return [];
    return lines
      .slice(start + 1)
      .map((line) => /\[AVFoundation[^\]]*\]\s*(\[\d+\].*)$/.exec(line)?.[1])
      .filter((line): line is string => Boolean(line));
  }
}

async function reachable(url: string, token: string): Promise<boolean> {
  try {
    const response = await fetch(url, {
      headers: { authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(6000),
    });
    return response.ok;
  } catch {
    return false;
  }
}

/** Sets a nested key on the sparse config, creating the objects on the way. */
function set(raw: Raw, path: string[], value: unknown): void {
  let node = raw;
  for (const key of path.slice(0, -1)) {
    const next = node[key];
    if (typeof next !== "object" || next === null || Array.isArray(next)) node[key] = {};
    node = node[key] as Raw;
  }
  node[path.at(-1) as string] = value;
}
