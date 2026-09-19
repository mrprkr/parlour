import { spawn } from "node:child_process";
import type { Config } from "../core/config.ts";
import { LLAMA_FORMULA, type LocalModel, localModel } from "../core/localmodel.ts";
import type { Paths } from "../core/paths.ts";
import { findOnPath } from "../core/process.ts";
import { LLM_LABEL, serviceSpecs, WHISPER_LABEL } from "../core/services.ts";
import { pickServiceManager } from "../providers/service/index.ts";
import { DEFAULT_WAKE_WORDS, DEFAULT_WHISPER_MODEL, fetchModels } from "./models.ts";
import type { Reporter } from "./output.ts";
import { describeState, parlourBin } from "./service.ts";

/**
 * Everything Parlour needs that nobody has to be asked about: the tools, the
 * models, and whisper kept warm. It asks nothing and it overwrites nothing,
 * so it is safe to run again and safe to run from a button in the app. The
 * questions live in `init.ts`.
 *
 * `PARLOUR_SKIP_MODELS=1` skips the model download. It exists for the test
 * suite, which cannot pull a gigabyte from Hugging Face on every run, and for
 * the throwaway init in CONTRIBUTING.md. It is not mentioned to users.
 */

export interface SetupOptions {
  paths: Paths;
  /** With the role already answered: a satellite has no whisper to keep warm. */
  config: Config;
  /** False never touches Homebrew. */
  deps: boolean;
  /** False never writes a LaunchAgent. Missing means true; only `init --no-service` says otherwise. */
  service?: boolean;
}

/**
 * What Homebrew is asked for. Node is deliberately not on the list: it is the
 * prerequisite that installed Parlour in the first place, and `brew install
 * node` on a machine that manages Node with nvm, fnm or volta would put a
 * second, newer major into /opt/homebrew/bin, ahead of the one Parlour was
 * installed with when the LaunchAgent PATH is built. The version check below
 * covers Node instead.
 */
export const HOMEBREW_FORMULAE = ["ffmpeg", "whisper-cpp"] as const;

/**
 * llama.cpp is on the list only for a house that asked Parlour to run the
 * model itself. Somebody pointing `llm.local.baseUrl` at LM Studio, at Ollama
 * or at a box in the cupboard already has a server, and a second one is a
 * formula they did not ask for.
 */
export function formulaeFor(config: Config): string[] {
  const local = config.llm.local as { managed?: boolean };
  const managed =
    config.role === "server" && config.llm.local.provider === "openai-compatible" && local.managed;
  return managed ? [...HOMEBREW_FORMULAE, LLAMA_FORMULA] : [...HOMEBREW_FORMULAE];
}

/**
 * The GGUF this config wants, or null when the model server is somebody
 * else's. A managed config that names a model outside the catalogue is one a
 * person put there by hand, and a file they dropped in themselves is not
 * ours to re-download.
 */
export function localModelFor(config: Config): LocalModel | null {
  if (!formulaeFor(config).includes(LLAMA_FORMULA)) return null;
  const local = config.llm.local as { model?: string };
  return (local.model ? localModel(local.model) : undefined) ?? null;
}

/**
 * Which models a box needs, or null for none. A satellite streams what it
 * hears and plays back what it is sent, so it has nothing to fetch unless
 * `localWake` moves the wake word onto it; whisper only ever runs on the
 * server. The configured word is fetched as well as the stock three, for a
 * word picked before the models were ever fetched.
 */
export function modelsFor(
  config: Config,
): { wake: string[]; whisper: string | null; llm: LocalModel | null } | null {
  if (config.role === "satellite" && !config.satellite.localWake) return null;
  return {
    wake: [...new Set([...DEFAULT_WAKE_WORDS, ...config.wake.words])],
    whisper: config.role === "server" ? DEFAULT_WHISPER_MODEL : null,
    llm: localModelFor(config),
  };
}

/** True when nothing failed. Warnings are for the doctor to repeat. */
export async function runSetup(options: SetupOptions, report: Reporter): Promise<boolean> {
  const { paths, config } = options;
  let failed = false;
  const fail = (text: string) => {
    failed = true;
    report.fail(text);
  };

  if (process.platform !== "darwin") {
    fail(`This sets up a Mac. You are on ${process.platform}.`);
    return false;
  }

  // A bundled app and a LaunchAgent both start with a bare PATH, so the usual
  // places are put back before anything is looked for.
  process.env.PATH = `/opt/homebrew/bin:/usr/local/bin:${process.env.PATH ?? ""}`;

  report.step("Tools");
  if (!options.deps) {
    report.ok("skipping Homebrew");
  } else if (!(await findOnPath("brew"))) {
    report.warn("Homebrew is not installed, so nothing can be installed for you.");
    report.warn("Install it from https://brew.sh, then run this again.");
  } else {
    for (const formula of formulaeFor(config)) {
      if ((await stream("brew", ["list", "--formula", formula])) === 0) {
        report.ok(`have ${formula}`);
      } else {
        report.ok(`installing ${formula}`);
        if ((await stream("brew", ["install", formula], report)) !== 0) fail(`could not install ${formula}`);
      }
    }
  }

  const major = Number(process.versions.node.split(".")[0]);
  if (major < 22) fail(`node 22 or newer is needed. This is ${process.version}.`);
  else report.ok(`node ${process.version}`);
  if (await findOnPath("ffmpeg")) report.ok("ffmpeg");
  else fail("ffmpeg is missing. Without it there is no microphone.");
  if (await findOnPath("whisper-server")) report.ok("whisper-server");
  else report.warn("whisper-server is missing, so there is no speech to text.");
  if (formulaeFor(config).includes(LLAMA_FORMULA)) {
    if (await findOnPath("llama-server")) report.ok("llama-server");
    else
      report.warn(
        `llama-server is missing, so Parlour cannot run the local model. brew install ${LLAMA_FORMULA}`,
      );
  }

  report.step("Models");
  const models = modelsFor(config);
  if (process.env.PARLOUR_SKIP_MODELS) {
    report.ok("skipped (PARLOUR_SKIP_MODELS)");
  } else if (!models) {
    report.ok("none needed: a satellite streams to the server");
  } else {
    try {
      await fetchModels({ modelsDir: paths.modelsDir, ...models, report });
    } catch (error) {
      fail(error instanceof Error ? error.message : String(error));
    }
  }

  // Only the things the agent talks to are installed here: whether the agent
  // itself runs as a service or under the app is a question, and this does
  // not ask questions.
  if (config.role === "server") {
    const specs = await serviceSpecs(config, paths, parlourBin());
    await keepWarm(
      "Speech to text",
      specs.filter((spec) => spec.label === WHISPER_LABEL),
      "whisper-server or its model is missing, so it was not set up to start at login.",
      options,
      report,
    );
    if (formulaeFor(config).includes(LLAMA_FORMULA)) {
      await keepWarm(
        "The local model",
        specs.filter((spec) => spec.label === LLM_LABEL),
        "llama-server or the model file is missing, so it was not set up to start at login.",
        options,
        report,
      );
    }
  }

  return !failed;
}

/** One service launchd should hold open, reported the same way whichever it is. */
async function keepWarm(
  step: string,
  specs: Awaited<ReturnType<typeof serviceSpecs>>,
  missing: string,
  options: SetupOptions,
  report: Reporter,
): Promise<void> {
  report.step(step);
  if (options.service === false) {
    report.ok("not set up to start at login (--no-service)");
    return;
  }
  if (!specs.length) {
    report.warn(missing);
    return;
  }
  try {
    for (const state of await pickServiceManager().install(specs)) {
      report.ok(`${state.what}: ${describeState(state)}`);
    }
  } catch (error) {
    report.warn(
      `could not install ${step.toLowerCase()}: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

/**
 * Runs a command with its output folded into the report rather than
 * swallowed, because a five minute `brew install` with nothing on screen
 * looks like a hang. Without a reporter the output is dropped, for checks.
 */
export function stream(command: string, args: string[], report?: Reporter): Promise<number> {
  return new Promise((resolve) => {
    const child = spawn(command, args, { stdio: ["ignore", "pipe", "pipe"] });
    const relay = (chunk: Buffer) => {
      if (!report) return;
      for (const line of chunk.toString().split("\n")) if (line.trim()) report.log(line);
    };
    child.stdout.on("data", relay);
    child.stderr.on("data", relay);
    child.on("error", () => resolve(1));
    child.on("close", (code) => resolve(code ?? 1));
  });
}
