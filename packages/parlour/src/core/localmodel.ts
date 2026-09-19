import { existsSync, readdirSync } from "node:fs";
import { arch, totalmem } from "node:os";
import { join } from "node:path";

/**
 * The local model, as something Parlour can bring with it rather than
 * something the person has to go and install. LM Studio is still supported and
 * is still the nicer window to poke a model through, but it is a four gigabyte
 * cask with a licence and a GUI, and a house that answers should not depend on
 * somebody having clicked "Start server" in it.
 *
 * What is bundled instead is llama.cpp's `llama-server`, from Homebrew, kept
 * warm by launchd exactly as whisper is, with one GGUF from the catalogue
 * below. This file is the only place that knows which models are worth
 * suggesting and how much machine each one wants. Nothing here touches the
 * network: fetching is `cli/models.ts` and the service is `core/services.ts`.
 */

/** A port of its own, so the bundled server and an LM Studio on 1234 can both exist. */
export const MANAGED_LLM_PORT = 8920;
export const MANAGED_LLM_BASE_URL = `http://127.0.0.1:${MANAGED_LLM_PORT}/v1`;
/** The Homebrew formula that carries `llama-server`. */
export const LLAMA_FORMULA = "llama.cpp";

export interface LocalModel {
  /**
   * What the model server reports and what `llm.local.model` names. Set with
   * llama-server's `--alias`, so it does not drift with the file name.
   */
  id: string;
  /** Shown when the model is offered, so a choice is made on something. */
  label: string;
  /** The Hugging Face repo and the file in it. */
  repo: string;
  file: string;
  /** The download, in GB, rounded to something worth reading out. */
  sizeGb: number;
  /**
   * How much memory the machine wants before this is the sensible answer.
   * Weights plus the context plus whatever else the Mac is doing: roughly
   * three times the download, rounded to the sizes Apple actually sells.
   */
  needsGb: number;
  note: string;
}

/**
 * Small instruct models that can be trusted with tool calls, which is the
 * whole job here: a model that chats beautifully and never emits a tool call
 * cannot turn a light off. Quantised to Q4_K_M throughout, the point on the
 * curve where the loss stops being audible and the file still fits in memory
 * beside everything else.
 *
 * In size order, because `suggestLocalModel` takes the last one that fits.
 */
export const LOCAL_MODELS: LocalModel[] = [
  {
    id: "qwen2.5-1.5b-instruct",
    label: "Qwen2.5 1.5B",
    repo: "bartowski/Qwen2.5-1.5B-Instruct-GGUF",
    file: "Qwen2.5-1.5B-Instruct-Q4_K_M.gguf",
    sizeGb: 1.1,
    needsGb: 4,
    note: "fast on anything, and it will get some requests wrong",
  },
  {
    id: "qwen2.5-3b-instruct",
    label: "Qwen2.5 3B",
    repo: "bartowski/Qwen2.5-3B-Instruct-GGUF",
    file: "Qwen2.5-3B-Instruct-Q4_K_M.gguf",
    sizeGb: 2.0,
    needsGb: 8,
    note: "enough for lights, timers and the weather",
  },
  {
    id: "qwen2.5-7b-instruct",
    label: "Qwen2.5 7B",
    repo: "bartowski/Qwen2.5-7B-Instruct-GGUF",
    file: "Qwen2.5-7B-Instruct-Q4_K_M.gguf",
    sizeGb: 4.7,
    needsGb: 16,
    note: "the one to want: right about the house, and still quick",
  },
  {
    id: "qwen2.5-14b-instruct",
    label: "Qwen2.5 14B",
    repo: "bartowski/Qwen2.5-14B-Instruct-GGUF",
    file: "Qwen2.5-14B-Instruct-Q4_K_M.gguf",
    sizeGb: 8.9,
    needsGb: 32,
    note: "noticeably better reasoning, a beat slower to answer",
  },
];

export interface Machine {
  /** Physical memory, in GB. On Apple silicon this is the GPU's memory too. */
  memoryGb: number;
  /** "arm64" is Apple silicon, where the GPU does the work. */
  arch: string;
}

export function thisMachine(): Machine {
  return { memoryGb: totalmem() / 1024 ** 3, arch: arch() };
}

/**
 * The largest model this Mac can run without thrashing. Apple silicon shares
 * its memory with the GPU and runs these at reading speed; an Intel Mac is on
 * the CPU, where the same model takes long enough that a person stops asking,
 * so it is given one size down.
 *
 * Never null: a machine too small for the smallest entry still gets the
 * smallest entry, because the alternative is no local model at all.
 */
export function suggestLocalModel(machine: Machine = thisMachine()): LocalModel {
  const budget = machine.arch === "arm64" ? machine.memoryGb : machine.memoryGb / 2;
  const fits = LOCAL_MODELS.filter((model) => model.needsGb <= budget);
  return fits.at(-1) ?? (LOCAL_MODELS[0] as LocalModel);
}

/** The catalogue entry with this id, for a config that names one. */
export function localModel(id: string): LocalModel | undefined {
  return LOCAL_MODELS.find((model) => model.id === id);
}

/** Where a GGUF lives once it has been fetched. Beside the other models, in the cache. */
export function localModelDir(modelsDir: string): string {
  return join(modelsDir, "llm");
}

export function localModelFile(modelsDir: string, model: LocalModel): string {
  return join(localModelDir(modelsDir), model.file);
}

/** Where the file comes from. Hugging Face serves a GGUF straight off the repo. */
export function localModelUrl(model: LocalModel): string {
  return `https://huggingface.co/${model.repo}/resolve/main/${model.file}`;
}

/**
 * The GGUF the bundled server should load: the one the config names when it
 * has been fetched, and otherwise whatever else is in the directory, so a
 * model dropped in by hand still runs. Null means there is nothing to serve.
 *
 * The id that comes back is the file's own, never the one that was asked for.
 * The server is started under it, so a config naming a model that was never
 * fetched shows up in `parlour doctor` as the mismatch it is, rather than as
 * a server claiming to be serving 7B while it holds 3B.
 */
export function installedLocalModel(modelsDir: string, id?: string): { id: string; file: string } | null {
  const wanted = id ? localModel(id) : undefined;
  if (wanted && existsSync(localModelFile(modelsDir, wanted))) {
    return { id: wanted.id, file: localModelFile(modelsDir, wanted) };
  }
  const dir = localModelDir(modelsDir);
  if (!existsSync(dir)) return null;
  const file = readdirSync(dir)
    .filter((name) => name.endsWith(".gguf"))
    .sort()[0];
  if (!file) return null;
  const known = LOCAL_MODELS.find((model) => model.file === file);
  return { id: known?.id ?? file.replace(/\.gguf$/, ""), file: join(dir, file) };
}
