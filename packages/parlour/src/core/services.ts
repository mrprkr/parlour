import { execFile } from "node:child_process";
import { existsSync, readdirSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { promisify } from "node:util";
import type { Config } from "./config.ts";
import { memoryVerdict, programMemoryVerdict, threadBudget } from "./guardrails.ts";
import { installedLocalModel, MANAGED_LLM_PORT } from "./localmodel.ts";
import type { Paths } from "./paths.ts";
import type { Check, ServiceSpec } from "./ports.ts";
import { sandboxed } from "./sandbox.ts";

/**
 * What the service manager is asked to keep running. This is the one place
 * that knows the agent is `parlour start` and that whisper wants keeping
 * warm, so the installer, the app and a person in a terminal all get the same
 * services rather than three near-misses.
 */

const run = promisify(execFile);

export const AGENT_LABEL = "io.parlour.agent";
export const WHISPER_LABEL = "io.parlour.whisper";
export const LLM_LABEL = "io.parlour.llm";

export interface ServiceSpecOptions {
  /** The PATH lookup, replaceable so a test does not depend on what is installed. */
  which?: (binary: string) => Promise<string | undefined>;
}

/** A LaunchAgent starts with almost no PATH, so everything is spelled out. */
function toolPath(...binaries: (string | undefined)[]): string {
  const dirs = new Set<string>();
  for (const binary of binaries) {
    if (binary) dirs.add(dirname(binary));
  }
  return [...dirs, "/usr/bin", "/bin", "/usr/sbin"].join(":");
}

async function defaultWhich(binary: string): Promise<string | undefined> {
  try {
    // Homebrew's directories are tried first because a login shell has them
    // and the shell that asks for a service install may not. Not inside the
    // sandbox, where the tools are the ones the app carries on the PATH it
    // gives, and a Homebrew copy is one the sandbox will not let run.
    const PATH = sandboxed()
      ? (process.env.PATH ?? "")
      : `/opt/homebrew/bin:/usr/local/bin:${process.env.PATH ?? ""}`;
    const { stdout } = await run("which", [binary], { env: { ...process.env, PATH } });
    return stdout.trim() || undefined;
  } catch {
    return undefined;
  }
}

/**
 * `parlourBin` is the command that runs parlour, usually one executable and
 * sometimes `[node, script]` when the script cannot be exec'd on its own.
 */
export async function serviceSpecs(
  config: Config,
  paths: Paths,
  parlourBin: string[],
  options: ServiceSpecOptions = {},
): Promise<ServiceSpec[]> {
  const which = options.which ?? defaultWhich;
  const out: ServiceSpec[] = [];

  // The installed `parlour` is a script with a node shebang, so node has to be
  // findable from the bare PATH a LaunchAgent starts with. When the lookup
  // finds nothing (the app launched from Finder with node from nvm, fnm or
  // volta rather than Homebrew) the node running this code is by definition a
  // working one, and without it launchd would crash loop on `env: node: No
  // such file or directory`.
  const node = (await which("node")) ?? process.execPath;
  out.push({
    label: AGENT_LABEL,
    what: config.role === "satellite" ? "the satellite" : "the agent",
    program: [...parlourBin, "start"],
    env: {
      PATH: toolPath(parlourBin[0], node, await which("ffmpeg"), await which("afplay")),
      PARLOUR_HOME: paths.home,
    },
    logPath: join(paths.logsDir, "agent.log"),
  });

  // A satellite has no models of its own to keep warm, and another speech
  // provider has no use for a whisper server sitting on a port.
  if (config.role === "server" && config.stt.provider === "whisper-cpp") {
    const whisper = await which("whisper-server");
    const model = firstWhisperModel(paths);
    if (whisper && model) {
      // The url and language belong to the whisper-cpp provider's own schema;
      // core only needs them here, so the defaults are repeated rather than
      // pulling a provider into core.
      const stt = config.stt as { url?: string; language?: string };
      const url = stt.url ?? "http://127.0.0.1:8910/inference";
      out.push({
        label: WHISPER_LABEL,
        what: "whisper, kept warm",
        program: [
          whisper,
          "--host",
          "127.0.0.1",
          "--port",
          String(new URL(url).port || 8910),
          "--model",
          model,
          "--language",
          stt.language ?? "en",
          "--threads",
          String(threadBudget()),
          "--no-timestamps",
          "--convert",
        ],
        // whisper-server shells out to ffmpeg for --convert.
        env: { PATH: toolPath(whisper, await which("ffmpeg")) },
        logPath: join(paths.logsDir, "whisper.log"),
        lowPriority: true,
      });
    }
  }

  // The local model, when Parlour is the one running it. `llm.local.managed`
  // is the openai-compatible provider's own option, so it is read untyped
  // here rather than pulling a provider into core, as whisper's url is above.
  // Without it the config is pointing at somebody else's server (LM Studio,
  // Ollama, a box in the cupboard) and starting a second one would be rude.
  if (config.role === "server" && config.llm.local.provider === "openai-compatible") {
    const local = config.llm.local as { managed?: boolean; model?: string; baseUrl?: string };
    const server = await which("llama-server");
    const model = installedLocalModel(paths.modelsDir, local.model);
    // A model too big for the machine is left out rather than started: loading
    // it would page the whole Mac into the ground, and the agent answers
    // without a local model (through the cloud one, or by saying so) far
    // better than a frozen machine does. The doctor says which and why.
    const fits = model ? programMemoryVerdict(["--model", model.file])?.status !== "refuse" : false;
    if (local.managed && server && model && fits) {
      out.push({
        label: LLM_LABEL,
        what: "the local model",
        program: [
          server,
          "--host",
          "127.0.0.1",
          "--port",
          String(portOf(local.baseUrl) ?? MANAGED_LLM_PORT),
          "--model",
          model.file,
          // The name the server answers to, so config can say "qwen3.5-9b"
          // rather than the file name of whatever quantisation was fetched.
          "--alias",
          model.id,
          // The chat template, which is what turns a tool list into something
          // the model has been trained to emit calls from. Without it the
          // house has a model that talks and never touches a light.
          "--jinja",
          // Every model in the catalogue reasons before it answers unless told
          // not to, and a paragraph of thinking is seconds of silence after a
          // question asked out loud. Anything that needs thought is what the
          // cloud model is for.
          "--chat-template-kwargs",
          JSON.stringify({ enable_thinking: false }),
          "--ctx-size",
          "8192",
          // One conversation's worth of context. llama.cpp otherwise sizes the
          // cache for several at once, which multiplies the memory the context
          // takes for a house that asks one question at a time.
          "--parallel",
          "1",
          "--threads",
          String(threadBudget()),
          // Everything on the GPU where there is one. llama.cpp ignores this
          // on a machine without, so it is safe on an Intel Mac.
          "--n-gpu-layers",
          "99",
        ],
        env: { PATH: toolPath(server) },
        logPath: join(paths.logsDir, "llm.log"),
        lowPriority: true,
      });
    }
  }

  return out;
}

/**
 * Whether the local model Parlour runs fits this Mac, for the doctor. Null
 * when Parlour runs no model of its own. A model too big is left out of
 * `serviceSpecs`, so this is the only place that says why it is not running.
 */
export function localModelMemory(config: Config, paths: Paths, total?: number): Check | null {
  if (config.role !== "server" || config.llm.local.provider !== "openai-compatible") return null;
  const local = config.llm.local as { managed?: boolean; model?: string };
  if (!local.managed) return null;
  const model = installedLocalModel(paths.modelsDir, local.model);
  if (!model) return null;
  let bytes: number;
  try {
    bytes = statSync(model.file).size;
  } catch {
    return null;
  }
  const verdict = memoryVerdict(bytes, total);
  const status = verdict.status === "refuse" ? "fail" : verdict.status;
  return { name: "local model memory", status, detail: `${model.id}: ${verdict.detail}` };
}

/** The port out of a base url, for a config that moved the bundled server. */
function portOf(baseUrl: string | undefined): number | undefined {
  if (!baseUrl) return undefined;
  try {
    const port = Number(new URL(baseUrl).port);
    return port > 0 ? port : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Every service parlour has ever installed that `specs` no longer mentions.
 * `serviceSpecs` describes what the config would install now, but a server
 * that became a satellite, or moved off whisper-cpp, still has the whisper
 * LaunchAgent it was given as a server, and it keeps starting at login until
 * something looks for it by name rather than by what the config says today.
 * `uninstall` and `status` are that something.
 */
export function leftoverServices(
  specs: Pick<ServiceSpec, "label">[],
  paths: Paths,
): Pick<ServiceSpec, "label" | "what" | "logPath">[] {
  const known = [
    { label: AGENT_LABEL, what: "the agent, left over", logPath: join(paths.logsDir, "agent.log") },
    { label: WHISPER_LABEL, what: "whisper, left over", logPath: join(paths.logsDir, "whisper.log") },
    { label: LLM_LABEL, what: "the local model, left over", logPath: join(paths.logsDir, "llm.log") },
  ];
  return known.filter((service) => !specs.some((spec) => spec.label === service.label));
}

function firstWhisperModel(paths: Paths): string | undefined {
  const dir = join(paths.modelsDir, "whisper");
  if (!existsSync(dir)) return undefined;
  const file = readdirSync(dir)
    .filter((name) => name.endsWith(".bin"))
    .sort()[0];
  return file ? join(dir, file) : undefined;
}
