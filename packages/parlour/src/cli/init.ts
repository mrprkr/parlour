import { execFile } from "node:child_process";
import { randomBytes } from "node:crypto";
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { hostname } from "node:os";
import { dirname, join, resolve } from "node:path";
import { promisify } from "node:util";
import { type Config, loadConfig, parseConfig, writeConfig } from "../core/config.ts";
import {
  LOCAL_MODELS,
  type LocalModel,
  localModel,
  MANAGED_LLM_BASE_URL,
  suggestLocalModel,
  thisMachine,
} from "../core/localmodel.ts";
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
import { type HomeAssistantAnswers, setupHomeAssistant } from "./homeassistant.ts";
import { fetchModels } from "./models.ts";
import { formatChecks, headline, humanReporter, porcelainReporter, type Reporter, table } from "./output.ts";
import { ask, type Choice, canAsk, confirm, secret, select } from "./prompts.ts";
import { describeState, parlourBin } from "./service.ts";
import { runSetup, stream } from "./setup.ts";
import { GoTo, runWizard, type Step } from "./wizard.ts";

const USAGE = [
  "parlour init               ask everything, install what is missing",
  "parlour init --yes         take every default, ask only for secrets",
  "parlour init --no-deps     never touch Homebrew",
  "parlour init --no-service  never write a LaunchAgent, for an experiment in another PARLOUR_HOME",
  "parlour init --porcelain   one JSON line per event, for the desktop app",
  "parlour init --local-model auto|none|<id>   answer the local model question without a terminal",
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
  /**
   * The local model question, answered on the command line: "auto" is the
   * largest model this Mac can hold, "none" leaves the model server to
   * somebody else, and anything else names a catalogue entry. It exists for
   * the desktop app and for a script, neither of which has a terminal to be
   * asked in, and both of which should be able to say yes to the download
   * rather than only to be told it did not happen.
   */
  localModel?: string;
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
      "local-model": { type: "string" },
    });
    const report = values.porcelain ? porcelainReporter() : humanReporter();
    const options: InitOptions = {
      yes: values.yes === true,
      deps: values["no-deps"] !== true,
      service: values["no-service"] !== true,
      localModel: typeof values["local-model"] === "string" ? values["local-model"] : undefined,
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

/**
 * Every answer `init` collects, before any of it is acted on. The wizard's
 * steps fill it in and may go back and fill it in again; only once the last
 * one is answered is it turned into config, downloads and services. Starts as
 * whatever is set now, so a re-run offers the current answer to every question.
 */
export interface Answers {
  role: "server" | "satellite";
  room: string;
  /** Who runs the local model: Parlour's own llama-server, or a server somebody already has. */
  runner: "parlour" | "elsewhere";
  /** A catalogue id, when Parlour runs it. */
  model: string;
  /** The other server, when it does not. */
  baseUrl: string;
  modelId: string;
  installLmStudio: boolean;
  anthropicKey: string;
  /** Null until the Home Assistant step has run, and always for a satellite. */
  house: HomeAssistantAnswers | null;
  token: string;
  /** True when the token above was made this run, so going back can take it away again. */
  tokenGenerated: boolean;
  serverUrl: string;
  inputDevice: string;
  wake: string;
  voice: string;
  /** Run the agent at login. Only asked of a server at a terminal. */
  service: boolean;
}

/** What the steps need that is not an answer: the config as found, and what was learnt about the machine. */
interface Context {
  config: Config;
  options: InitOptions;
  /** Interactive: drawn screen by screen, with a review at the end. */
  interactive: boolean;
  machine: ReturnType<typeof thisMachine>;
  suggestion: LocalModel;
  asked: { runner: "parlour" | "elsewhere"; model?: string } | null;
  hasLmStudio: boolean;
  /** The Anthropic key in secrets.env, which is the only one the house may use. */
  fileKey: string;
  /** A key in this shell, offered rather than taken. */
  ambientKey: string;
  /** The Home Assistant token as found, from the file or this shell. */
  haToken: string;
  /** Looked for once, the first time the microphone question comes round. */
  devices?: AudioInput[];
}

async function init(paths: Paths, options: InitOptions): Promise<void> {
  const { report, yes } = options;
  if (!report.porcelain) headline("Parlour setup");

  await offerMigration(paths, options);

  const loaded = loadConfig(paths);
  const raw: Raw = loaded.raw;
  let config = loaded.config;

  // Read once, for both roles: a satellite needs the server's token and
  // nothing else, and losing that distinction is how a satellite ends up
  // generating a token of its own and never being let in.
  const secrets = loadSecrets(paths);
  // The Anthropic key alone is read from the file and not the shell.
  // ANTHROPIC_API_KEY is exported in plenty of shells for other tools, and
  // copying it into secrets.env would have the house sending its questions
  // to a key the person never chose for it. The other two names are
  // Parlour's own, so finding them in the environment is no accident.
  const fileKey = loadSecrets(paths, {}).anthropicKey ?? "";

  const machine = thisMachine();
  const context: Context = {
    config,
    options,
    interactive: !yes && !report.porcelain && canAsk(),
    machine,
    suggestion: suggestLocalModel(machine),
    // Before anything is asked: a --local-model naming nothing on the list
    // stops the run here rather than half way through.
    asked: askedFor(options.localModel),
    hasLmStudio: existsSync("/Applications/LM Studio.app"),
    fileKey,
    ambientKey: secrets.anthropicKey ?? "",
    haToken: secrets.haToken ?? "",
  };
  const answers = startingAnswers(config, secrets, fileKey, context.suggestion);
  // A fresh config says nothing about who runs the model, and at a terminal
  // the model Parlour brings is the answer to offer first. Unattended runs
  // keep the schema's default: a download of gigabytes is said yes to, never
  // assumed.
  const saidManaged = (raw.llm as { local?: { managed?: unknown } } | undefined)?.local?.managed;
  if (context.interactive && saidManaged === undefined) answers.runner = "parlour";

  // ---------------------------------------------------------------- questions

  await runWizard(wizardSteps(context), answers, {
    interactive: context.interactive,
    report,
    heading: "Parlour setup",
  });
  if (context.interactive) {
    // The screens are gone with the alternate screen, so the decisions are
    // written out once more where they will stay in the scrollback.
    report.step("Your answers");
    for (const line of summaryLines(answers, context)) report.ok(line);
  }

  config = applyAnswers(raw, config, answers, context);
  const haToken = answers.house ? answers.house.token : (secrets.haToken ?? "");
  const { token, anthropicKey } = answers;

  // ------------------------------------------------------------ the mechanics

  if (!(await runSetup({ paths, config, deps: options.deps, service: options.service }, report))) {
    report.warn("Some of the setup did not finish. The check at the end will say what.");
  }

  if (answers.installLmStudio) {
    if ((await stream("brew", ["install", "--cask", "lm-studio"], report)) !== 0) {
      report.warn("could not install LM Studio");
    }
  }

  const wake = config.wake.words[0] ?? "hey_jarvis";
  if (
    config.role === "server" &&
    !process.env.PARLOUR_SKIP_MODELS &&
    !existsSync(join(paths.modelsDir, "openwakeword", `${wake}.onnx`))
  ) {
    report.warn(`No model for ${wake}. Fetching it.`);
    await fetchModels({ modelsDir: paths.modelsDir, wake: [wake], whisper: null, report });
  }

  // ------------------------------------------------------------------- write

  report.step("Writing configuration");
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
    options.service && (config.role === "satellite" || (!report.porcelain && !unattended && answers.service));
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
    else if (config.role === "satellite")
      headline("Ready. It will find the server and stay connected to it.");
    else headline(`Ready. Say "${wake.replaceAll("_", " ")}".`);
    afterword(config, paths, token);
  }
  report.done(broken.length > 0);
}

/** The answers as things stand before anything is asked: the config, the secrets, and a suggestion for the rest. */
function startingAnswers(
  config: Config,
  secrets: ReturnType<typeof loadSecrets>,
  fileKey: string,
  suggestion: LocalModel,
): Answers {
  const local = config.llm.local as { baseUrl?: string; model?: string; managed?: boolean };
  return {
    role: config.role,
    room: config.satellite.room,
    runner: local.managed === true ? "parlour" : "elsewhere",
    // A re-run must not quietly swap the model out from under a house that
    // is working: the configured one wins while it is one Parlour knows,
    // retired or not, and the suggestion is only the default for a fresh setup.
    model: local.model && localModel(local.model) ? local.model : suggestion.id,
    baseUrl: local.baseUrl ?? "http://127.0.0.1:1234/v1",
    modelId: local.model ?? "qwen3-8b-mlx",
    installLmStudio: false,
    anthropicKey: fileKey,
    house: null,
    token: secrets.token ?? "",
    tokenGenerated: false,
    serverUrl: config.satellite.serverUrl,
    inputDevice: config.audio.inputDevice,
    wake: config.wake.words[0] ?? "hey_jarvis",
    // The voice is Kokoro's option, not core's, so the slice is untyped here
    // and the default comes from the provider's own schema.
    voice: (config.tts as { voice?: string }).voice ?? kokoroSchema.parse({}).voice,
    service: true,
  };
}

/**
 * The questions, one step each where a question stands alone, in the order a
 * person can answer them. Every one takes its current answer under `--yes`
 * or without a terminal, so this is as safe to run from a script as the rest.
 */
function wizardSteps(context: Context): Step<Answers>[] {
  const { config, options } = context;
  const { report, yes } = options;
  const quiet = yes || !canAsk();
  const server = (state: Answers) => state.role === "server";
  const satellite = (state: Answers) => state.role === "satellite";
  const localModelAsked = (state: Answers) =>
    server(state) && config.llm.local.provider === "openai-compatible";
  const house = config.integrations["home-assistant"] as { url?: string; muteEntity?: string } | undefined;

  const steps: Step<Answers>[] = [
    // ---------------------------------------------------------- this machine
    {
      section: "This machine",
      title: "What this machine is",
      intro: () => [
        "One box in the house runs the models and answers. Everything else",
        "with a microphone is a satellite: it streams to that box and plays",
        "back what it says. A satellite needs no models, no keys and no GPU.",
      ],
      run: async (state) => {
        if (yes) return;
        state.role = await select(
          "What is this machine",
          [
            { value: "server" as const, label: "Server", hint: "the models, the tools and the answers" },
            { value: "satellite" as const, label: "Satellite", hint: "a microphone in another room" },
          ],
          state.role,
        );
      },
    },
    {
      section: "This machine",
      title: "What this machine is",
      when: satellite,
      run: async (state) => {
        if (yes) return;
        state.room = await ask("Which room is it in", state.room || "kitchen");
      },
    },

    // ------------------------------------------------------------ the brains
    {
      section: "The brains",
      title: "The local model",
      when: localModelAsked,
      intro: () => [
        "Nearly every request is answered here, on this machine: the lights,",
        "the timers, the questions about the house. Nothing leaves the box.",
      ],
      run: async (state) => {
        if (context.asked) state.runner = context.asked.runner;
        else if (!quiet)
          state.runner = await select(
            "Who runs it",
            [
              {
                value: "parlour" as const,
                label: "Parlour",
                hint: "llama.cpp and a model, kept running for you",
              },
              {
                value: "elsewhere" as const,
                label: "Something else",
                hint: context.hasLmStudio
                  ? "LM Studio, which you have"
                  : "LM Studio, Ollama, a box in the cupboard",
              },
            ],
            state.runner,
          );
      },
    },
    {
      section: "The brains",
      title: "The local model",
      when: (state) => localModelAsked(state) && state.runner === "parlour",
      intro: () => [
        `This Mac has ${Math.round(context.machine.memoryGb)} GB of memory: ${context.suggestion.label} is the`,
        "largest it should hold comfortably beside everything else.",
      ],
      run: async (state) => {
        if (context.asked?.model) state.model = context.asked.model;
        else if (!quiet) state.model = await select("Which model", modelChoices(context, state), state.model);
        const model = localModel(state.model) ?? context.suggestion;
        report.ok(`${model.label} it is. The download and the server come after the questions.`);
      },
    },
    {
      section: "The brains",
      title: "The local model",
      when: (state) => localModelAsked(state) && state.runner === "elsewhere",
      intro: () => ["Any server speaking the OpenAI API will do. Start it before asking anything."],
      run: async (state) => {
        if (yes) return;
        state.baseUrl = await ask("Local model server", state.baseUrl);
        state.modelId = await ask("Local model id, as the server reports it", state.modelId);
        state.installLmStudio = false;
        if (options.deps && !context.hasLmStudio && canAsk() && (await findOnPath("brew"))) {
          // A multi-gigabyte cask, so it is only ever offered, never taken.
          state.installLmStudio = await confirm(
            "Install LM Studio? It is the friendliest of these to drive.",
            false,
          );
        }
      },
    },
    {
      section: "The brains",
      title: "Cloud escalation",
      when: (state) => server(state) && config.llm.cloud.provider === "anthropic",
      intro: () => [
        "The local model hands over anything it is not confident about.",
        "Leave this empty to run local only: it keeps the tools and answers",
        "everything itself, and never sends a word out of the house.",
      ],
      run: async (state) => {
        // Not a secret `--yes` stops for: the house works without it. The
        // switch is turned on only by a key given this run, never by one kept
        // from last time, and a key found in the shell is offered rather than
        // taken, so a run that asked nothing (no terminal counts as asking
        // nothing) cannot turn the cloud on behind someone's back.
        if (quiet) {
          if (state.anthropicKey) report.ok("keeping the existing key");
          else if (context.ambientKey)
            report.ok(
              "ANTHROPIC_API_KEY is in this shell but not in secrets.env, so it is left there. " +
                "parlour secrets set ANTHROPIC_API_KEY if the house should use it.",
            );
          else report.ok("no key, so the local model is on its own");
          return;
        }
        const useAmbient =
          !state.anthropicKey &&
          context.ambientKey &&
          (await confirm("ANTHROPIC_API_KEY is set in this shell. Use it here?"));
        state.anthropicKey = useAmbient
          ? context.ambientKey
          : (await keepOrAsk("Anthropic API key", state.anthropicKey, yes)).value;
      },
    },

    // -------------------------------------------------------------- the house
    {
      section: "The house",
      title: "Home Assistant",
      when: (state) => server(state) && house !== undefined,
      run: async (state) => {
        state.house = await setupHomeAssistant({
          url: state.house?.url ?? house?.url ?? "",
          token: state.house?.token ?? context.haToken,
          muteEntity: state.house?.muteEntity ?? house?.muteEntity ?? "",
          yes,
          report,
        });
      },
    },
    {
      section: "The house",
      title: "The rest of the house",
      when: server,
      intro: () => [
        "The agent listens on the network so that Home Assistant, a phone or",
        "a satellite can all reach it. That needs a shared token, or it",
        "answers this machine only.",
      ],
      run: async (state) => {
        if (state.token && !state.tokenGenerated) {
          report.ok("keeping the existing token");
        } else if (await confirmOr(yes, "Generate an access token and let the house in?")) {
          if (!state.token) state.token = randomBytes(24).toString("hex");
          state.tokenGenerated = true;
          report.ok("generated");
        } else {
          state.token = "";
          state.tokenGenerated = false;
          report.warn("Loopback only. Run this again to change your mind.");
        }
      },
    },

    // ------------------------------------------------------------- the server
    {
      section: "The server",
      title: "The server",
      when: satellite,
      intro: () => [
        "A satellite finds the server with Bonjour and keeps the address it",
        "found, so all it needs is the same access token the server was",
        "given. Leave the address blank to look now, or give it if this",
        "network does not carry multicast.",
      ],
      run: async (state) => {
        if (!yes) {
          state.serverUrl = await ask("Server address, or blank to find it automatically", state.serverUrl);
        }
        if (state.serverUrl) return;
        // Pinned here rather than left for the first connection, because this
        // is the one moment a person is watching and can see a wrong name.
        // Anything on the network can advertise the service, and the token
        // goes to whichever server the satellite connects to.
        report.ok("looking for one on this network");
        const found = await findServer(4000);
        if (found) {
          state.serverUrl = found.url;
          report.ok(`found "${found.name}" at ${found.url}; the satellite will only ever talk to it`);
        } else {
          report.warn("No server is advertising yet. The satellite will keep the first one that lets it in.");
        }
      },
    },
    {
      section: "The server",
      title: "The server",
      when: satellite,
      run: async (state) => {
        state.token = (await keepOrAsk("The server's access token", state.token, yes)).value;
        if (!state.token) report.warn("Without it the server will refuse this satellite.");
      },
    },

    // ------------------------------------------------------------------ voice
    {
      section: "Voice",
      title: "Voice",
      intro: (state) =>
        state.role === "server"
          ? ["What it listens with, what wakes it, and how it sounds."]
          : ["What it listens with. The server does the waking and the talking."],
      run: async (state) => {
        // Both roles need a microphone. Only the server needs a wake word and
        // a speaking voice: a satellite streams what it hears and plays back
        // what it is sent.
        if (yes) return void report.ok(`microphone ${state.inputDevice}`);
        context.devices ??= canAsk() ? await audioInputs() : [];
        state.inputDevice = context.devices.length
          ? await select(
              "Input device",
              [
                ...context.devices.map((device) => ({ value: device.index, label: device.name })),
                { value: state.inputDevice, label: "Leave it as it is", hint: state.inputDevice },
              ],
              state.inputDevice,
            )
          : await ask('Input device (":0" is the default microphone)', state.inputDevice);
        report.ok(`microphone ${state.inputDevice}`);
      },
    },
    {
      section: "Voice",
      title: "Voice",
      when: server,
      run: async (state) => {
        if (yes) return;
        state.wake = await select(
          "Wake word",
          [
            { value: "hey_jarvis", label: "Hey Jarvis" },
            { value: "alexa", label: "Alexa" },
            { value: "hey_mycroft", label: "Hey Mycroft" },
            { value: state.wake, label: "Leave it as it is", hint: state.wake },
          ],
          state.wake,
        );
      },
    },
    {
      section: "Voice",
      title: "Voice",
      when: server,
      run: async (state) => {
        if (!yes) {
          state.voice = await select(
            "Speaking voice",
            [
              { value: "bf_emma", label: "Emma", hint: "British, warm" },
              { value: "bf_isabella", label: "Isabella", hint: "British, brighter" },
              { value: "bm_george", label: "George", hint: "British, low" },
              { value: "bm_lewis", label: "Lewis", hint: "British, clipped" },
              { value: state.voice, label: "Leave it as it is", hint: state.voice },
            ],
            state.voice,
          );
        }
        report.ok(`wake word ${state.wake}, voice ${state.voice}`);
      },
    },
    {
      section: "Running it",
      title: "Starting at login",
      // Only asked where the answer is used: a server, at a terminal, with
      // somebody there to say no. The rest is settled after the questions.
      when: (state) => server(state) && options.service && context.interactive,
      intro: () => [
        "launchd can start the agent at login and restart it if it falls over.",
        "Say no if you want the menu bar app to own it instead.",
      ],
      run: async (state) => {
        state.service = await confirm("Run the agent at login?", state.service);
      },
    },
  ];

  const sections = [...new Set(steps.map((step) => step.section))];
  steps.push({
    section: "Review",
    title: "Ready to set up",
    when: () => context.interactive,
    intro: (state) => [...summaryLines(state, context), "", "Nothing has been downloaded or written yet."],
    run: async (state) => {
      const go = await select("Set it up", [
        { value: true, label: "Yes, set it up", hint: "download, install and write the config" },
        { value: false, label: "Change something", hint: "or press Escape to go back one question" },
      ]);
      if (go) return;
      const shown = sections.filter((section) =>
        steps.some((step) => step.section === section && (step.when?.(state) ?? true)),
      );
      const section = await select(
        "Which part",
        shown.map((name) => ({ value: name, label: name })),
      );
      throw new GoTo(section);
    },
  });
  return steps;
}

/** The catalogue as a list to pick from, with a model this house already runs kept on it after it has been retired. */
function modelChoices(context: Context, state: Answers): Choice<string>[] {
  const choices: Choice<string>[] = LOCAL_MODELS.map((model) => ({
    value: model.id,
    label: model.id === context.suggestion.id ? `${model.label} (suggested)` : model.label,
    hint: `${model.sizeGb} GB, for ${model.needsGb} GB+: ${model.note}`,
  }));
  const current = localModel(state.model);
  if (current && !LOCAL_MODELS.includes(current)) {
    choices.push({ value: current.id, label: `Keep ${current.label}`, hint: "what this house runs now" });
  }
  return choices;
}

/** The answers as a short table, for the review screen and for the scrollback after it. */
function summaryLines(state: Answers, context: Context): string[] {
  const { config, options } = context;
  const rows: string[][] = [];
  if (state.role === "satellite") {
    rows.push(
      ["This machine", `a satellite, in ${state.room ? `the ${state.room}` : "no room yet"}`],
      ["Server", state.serverUrl || "whichever answers first"],
      ["Access token", state.token ? "set" : "none, so the server will refuse it"],
      ["Microphone", state.inputDevice],
    );
    return table(rows).split("\n");
  }
  rows.push(["This machine", "the server"]);
  if (config.llm.local.provider === "openai-compatible") {
    const model = localModel(state.model) ?? context.suggestion;
    rows.push([
      "Local model",
      state.runner === "parlour"
        ? `${model.label}, run by Parlour (${model.sizeGb} GB download)`
        : `${state.modelId} at ${state.baseUrl}${state.installLmStudio ? ", installing LM Studio" : ""}`,
    ]);
  }
  if (config.llm.cloud.provider === "anthropic") {
    rows.push([
      "Cloud",
      state.anthropicKey ? "an Anthropic key, for what it cannot manage" : "none, local only",
    ]);
  }
  if (state.house) rows.push(["Home Assistant", state.house.enabled ? state.house.url : "left out"]);
  rows.push(
    ["Access token", state.token ? (state.tokenGenerated ? "a new one" : "kept") : "none, this machine only"],
    ["Microphone", state.inputDevice],
    ["Wake word", state.wake.replaceAll("_", " ")],
    ["Voice", state.voice],
  );
  if (options.service && context.interactive) {
    rows.push(["At login", state.service ? "runs as a service" : "left to the app"]);
  }
  return table(rows).split("\n");
}

/** The answers written into the sparse config, which is then parsed for the mechanics to use. */
function applyAnswers(raw: Raw, config: Config, state: Answers, context: Context): Config {
  set(raw, ["role"], state.role);
  set(raw, ["audio", "inputDevice"], state.inputDevice);
  if (state.role === "satellite") {
    set(raw, ["satellite", "room"], state.room);
    set(raw, ["satellite", "serverUrl"], state.serverUrl);
    return parseConfig(raw);
  }

  if (config.llm.local.provider === "openai-compatible") {
    const local = config.llm.local as { baseUrl?: string };
    if (state.runner === "parlour") {
      const model = localModel(state.model) ?? context.suggestion;
      set(raw, ["llm", "local", "managed"], true);
      set(raw, ["llm", "local", "model"], model.id);
      // Moved off 1234 so a running LM Studio and this can both exist. A
      // baseUrl already pointing somewhere else is left alone: somebody who
      // moved the port meant it.
      if (!local.baseUrl || local.baseUrl === "http://127.0.0.1:1234/v1") {
        set(raw, ["llm", "local", "baseUrl"], MANAGED_LLM_BASE_URL);
      }
    } else {
      set(raw, ["llm", "local", "managed"], false);
      set(raw, ["llm", "local", "baseUrl"], state.baseUrl);
      set(raw, ["llm", "local", "model"], state.modelId);
    }
  }

  // Only a key given this run turns the cloud on; one kept from last time
  // leaves the switch as the person left it.
  if (
    config.llm.cloud.provider === "anthropic" &&
    state.anthropicKey &&
    state.anthropicKey !== context.fileKey
  ) {
    set(raw, ["llm", "cloud", "enabled"], true);
  }

  if (state.house) {
    // A fresh file has no `integrations` yet, and writing only the house
    // into it would pin the block to the house alone: the defaults apply
    // to a missing key, not to a present one. Seed it with every default
    // integration first, so a connector added later is actually loaded. A
    // block that is already there is the person's own and is left alone.
    if (!("integrations" in raw)) raw.integrations = structuredClone(config.integrations);
    if (!state.house.enabled) {
      // Said no to the house. Left out rather than left broken: an
      // integration that is present and cannot be reached is a failing
      // check on every doctor run for something nobody has. A token
      // already in secrets.env is left where it is: nothing reads it now,
      // and init has no business deleting a credential it did not create.
      delete (raw.integrations as Raw)["home-assistant"];
    } else {
      set(raw, ["integrations", "home-assistant", "url"], state.house.url);
      // Only when there is one: an empty string here would be an explicit
      // "no mute entity" in a file that is meant to stay readable.
      if (state.house.muteEntity)
        set(raw, ["integrations", "home-assistant", "muteEntity"], state.house.muteEntity);
    }
  }

  // The question is about the first word only. A list that is already set
  // stays as it is unless the answer changed it, so a re-run under --yes
  // cannot quietly trim a second word off.
  if (state.wake !== config.wake.words[0]) set(raw, ["wake", "words"], [state.wake]);
  set(raw, ["tts", "voice"], state.voice);
  return parseConfig(raw);
}

/**
 * `--local-model` as an answer to the two questions in the local model step.
 * Undefined means nobody said, so the questions are asked as usual. A name
 * that is not on the list is a mistake worth stopping for: the alternative is
 * quietly setting up a different model from the one that was asked for.
 */
function askedFor(flag: string | undefined): { runner: "parlour" | "elsewhere"; model?: string } | null {
  if (flag === undefined) return null;
  if (flag === "none") return { runner: "elsewhere" };
  if (flag === "auto") return { runner: "parlour", model: suggestLocalModel().id };
  const model = LOCAL_MODELS.find((entry) => entry.id === flag) ?? localModel(flag);
  if (!model) {
    throw new Error(
      `No local model called "${flag}". It is auto, none, or one of: ` +
        `${LOCAL_MODELS.map((entry) => entry.id).join(", ")}.`,
    );
  }
  return { runner: "parlour", model: model.id };
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

export interface AudioInput {
  /** As `audio.inputDevice` wants it: avfoundation's index, with the colon. */
  index: string;
  name: string;
}

/**
 * The microphones ffmpeg can see, so the device can be chosen from a list
 * rather than guessed at as a number. Nothing when ffmpeg is not installed,
 * which the Tools step has already complained about.
 */
export function parseAudioInputs(ffmpegOutput: string): AudioInput[] {
  const lines = ffmpegOutput.split("\n");
  const start = lines.findIndex((line) => /audio devices/i.test(line));
  if (start < 0) return [];
  const inputs: AudioInput[] = [];
  for (const line of lines.slice(start + 1)) {
    // `[AVFoundation indev @ 0x...] [0] MacBook Pro Microphone`, and the video
    // list above it has the same shape, which is why only what follows the
    // audio heading is read.
    const match = /\[AVFoundation[^\]]*\]\s*\[(\d+)\]\s*(.+?)\s*$/.exec(line);
    if (!match) break;
    inputs.push({ index: `:${match[1]}`, name: match[2] as string });
  }
  return inputs;
}

async function audioInputs(): Promise<AudioInput[]> {
  try {
    await run("ffmpeg", ["-f", "avfoundation", "-list_devices", "true", "-i", ""]);
    return [];
  } catch (error) {
    // ffmpeg exits non-zero after listing, and the list is on stderr.
    return parseAudioInputs((error as { stderr?: string }).stderr ?? "");
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
