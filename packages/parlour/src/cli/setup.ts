import { spawn } from "node:child_process";
import type { Config } from "../core/config.ts";
import type { Paths } from "../core/paths.ts";
import { findOnPath } from "../core/process.ts";
import { serviceSpecs, WHISPER_LABEL } from "../core/services.ts";
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
 * suite, which cannot pull a gigabyte from Hugging Face on every run, and is
 * not otherwise documented.
 */

export interface SetupOptions {
  paths: Paths;
  /** With the role already answered: a satellite has no whisper to keep warm. */
  config: Config;
  /** False never touches Homebrew. */
  deps: boolean;
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
    for (const formula of ["node", "ffmpeg", "whisper-cpp"]) {
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

  report.step("Models");
  if (process.env.PARLOUR_SKIP_MODELS) {
    report.ok("skipped (PARLOUR_SKIP_MODELS)");
  } else {
    try {
      // The configured word as well as the stock three, for a word picked
      // before the models were ever fetched.
      await fetchModels({
        modelsDir: paths.modelsDir,
        wake: [...new Set([...DEFAULT_WAKE_WORDS, ...config.wake.words])],
        whisper: config.role === "server" ? DEFAULT_WHISPER_MODEL : null,
        report,
      });
    } catch (error) {
      fail(error instanceof Error ? error.message : String(error));
    }
  }

  // Only whisper is installed here: whether the agent itself runs as a
  // service or under the app is a question, and this does not ask questions.
  if (config.role === "server") {
    report.step("Speech to text");
    const whisper = (await serviceSpecs(config, paths, parlourBin())).filter(
      (spec) => spec.label === WHISPER_LABEL,
    );
    if (!whisper.length) {
      report.warn("whisper-server or its model is missing, so it was not set up to start at login.");
    } else {
      try {
        for (const state of await pickServiceManager().install(whisper)) {
          report.ok(`${state.what}: ${describeState(state)}`);
        }
      } catch (error) {
        report.warn(`could not install whisper: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
  }

  return !failed;
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
