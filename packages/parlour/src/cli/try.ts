import "../core/builtins.ts";
import { buildAgent } from "../core/agent.ts";
import { FRAME_MS, rms, toWav } from "../core/audio.ts";
import { type Config, loadConfig } from "../core/config.ts";
import { emit } from "../core/events.ts";
import { logger } from "../core/logger.ts";
import type { Paths } from "../core/paths.ts";
import { loadPlugins } from "../core/plugins.ts";
import type {
  AudioSink,
  AudioSource,
  ChatModel,
  SpeechToText,
  TextToSpeech,
  WakeWordEngine,
} from "../core/ports.ts";
import { type ProviderContextFactory, type ProviderKind, resolveProvider } from "../core/providers.ts";
import { loadSecrets, type Secrets } from "../core/secrets.ts";
import { stripThinking } from "../core/text.ts";
import { type Command, parseCli, subcommand, UsageError } from "./args.ts";
import { bold, dim, printJson } from "./output.ts";

const USAGE = [
  "parlour try mic [--seconds 3]            record, and say how loud it was",
  "parlour try wake [--seconds 10]          wait for the wake word",
  "parlour try stt [--seconds 8]            wait for speech, then transcribe it",
  "parlour try llm [--text <question>]      ask the local model, no tools",
  "parlour try cloud [--text <question>]    ask the cloud model, no tools",
  "parlour try tts [--text <line>] [--silent]  say something through the speaker",
  "parlour try ask [--text <request>]       the whole pipeline after the transcript, tools and all",
  "        add --json to any of them for one document the desktop app reads",
];

export const STAGES = ["mic", "wake", "stt", "llm", "cloud", "tts", "ask"] as const;
export type Stage = (typeof STAGES)[number];

/**
 * One stage of the pipeline, tried on its own. The doctor says whether a part
 * is in place; this says whether it works, which is a different question when
 * the microphone is the wrong one or the model answers in Chinese. Every
 * stage is the provider the config names, built the way the agent builds it,
 * so a stage that passes here passes in the house.
 */
export interface Trial {
  stage: Stage;
  ok: boolean;
  /** One sentence, for a person. */
  detail: string;
  /** How long the part being tried took, not the whole command. */
  ms: number;
  /** What was heard: the wake word that fired, or the transcript. */
  heard?: string;
  /** What was said back, or what was spoken. */
  reply?: string;
  /** Loudness over the recording, 0 to 1, so "nothing heard" can be told from "wrong word". */
  level?: { peak: number; mean: number };
  /** Which model answered, or which voice. */
  via?: string;
}

const DEFAULT_QUESTION = "In one short sentence, what is the capital of France?";
const DEFAULT_REQUEST = "What time is it?";
const DEFAULT_LINE = "Hello. This is how I will sound when I answer.";

const DEFAULT_SECONDS: Partial<Record<Stage, number>> = { mic: 3, wake: 10, stt: 8 };

/** Peak and mean loudness of a recording, rounded for printing. */
export function levels(frames: Int16Array[]): { peak: number; mean: number } {
  if (!frames.length) return { peak: 0, mean: 0 };
  const values = frames.map(rms);
  const round = (value: number) => Math.round(value * 10000) / 10000;
  return {
    peak: round(Math.max(...values)),
    mean: round(values.reduce((sum, value) => sum + value, 0) / values.length),
  };
}

/**
 * Where a recording of speech starts and ends: the first loud frame, and the
 * first run of quiet after it that lasts `silenceFrames`. Null when nothing
 * was loud enough to count. Pure, so the endpointing is tested without a
 * microphone.
 */
export function utterance(
  frames: Int16Array[],
  threshold: number,
  silenceFrames: number,
): { start: number; end: number } | null {
  const start = frames.findIndex((frame) => rms(frame) >= threshold);
  if (start < 0) return null;
  let quiet = 0;
  for (let index = start + 1; index < frames.length; index++) {
    quiet = rms(frames[index] as Int16Array) < threshold ? quiet + 1 : 0;
    if (quiet >= silenceFrames) return { start, end: index - quiet + 1 };
  }
  return { start, end: frames.length };
}

export const command: Command = {
  name: "try",
  summary: "Try one stage of the pipeline on its own: mic, wake, stt, llm, cloud, tts, ask.",
  usage: USAGE,

  async run({ paths, argv }) {
    const { positionals, values } = parseCli(argv, {
      json: { type: "boolean" },
      seconds: { type: "string" },
      text: { type: "string" },
      silent: { type: "boolean" },
    });
    const stage = subcommand(positionals, STAGES, USAGE);
    const seconds = values.seconds === undefined ? DEFAULT_SECONDS[stage] : Number(values.seconds);
    if (seconds !== undefined && !(seconds > 0 && seconds <= 60)) {
      throw new UsageError("--seconds takes a number from 1 to 60");
    }
    const text = typeof values.text === "string" && values.text.trim() ? values.text.trim() : undefined;

    const { config } = loadConfig(paths);
    const secrets = loadSecrets(paths);
    const trial = await attempt(stage, () =>
      trialOf(stage, { config, secrets, paths, seconds: seconds ?? 0, text, silent: values.silent === true }),
    );

    if (values.json) printJson(trial);
    else process.stdout.write(`${describe(trial)}\n`);
    if (!trial.ok) process.exitCode = 1;
  },
};

interface TrialContext {
  config: Config;
  secrets: Secrets;
  paths: Paths;
  seconds: number;
  text?: string;
  silent: boolean;
}

/** A stage that throws is a stage that failed, and the reason is the detail. */
async function attempt(stage: Stage, run: () => Promise<Trial>): Promise<Trial> {
  try {
    return await run();
  } catch (error) {
    return { stage, ok: false, detail: error instanceof Error ? error.message : String(error), ms: 0 };
  }
}

async function trialOf(stage: Stage, context: TrialContext): Promise<Trial> {
  const { config } = context;
  const resolve = await resolver(context);

  switch (stage) {
    case "mic": {
      const source = await resolve<AudioSource>("audioSource", config.audio.source, config.audio);
      const started = Date.now();
      const frames = await record(source, context.seconds * 1000, () => false);
      const level = levels(frames);
      const heard = level.peak >= config.audio.silenceThreshold;
      return {
        stage,
        ok: frames.length > 0 && heard,
        ms: Date.now() - started,
        level,
        detail: !frames.length
          ? "The microphone gave nothing. Is it the right device, and is the app allowed to use it?"
          : heard
            ? "The microphone is working and heard you."
            : "The microphone opened but heard only silence. Speak up, or pick another device.",
      };
    }

    case "wake": {
      const source = await resolve<AudioSource>("audioSource", config.audio.source, config.audio);
      const engine = await resolve<WakeWordEngine>("wake", config.wake.provider, config.wake);
      await engine.load();
      const detector = engine.detector("try");
      let word: string | null = null;
      const started = Date.now();
      const frames: Int16Array[] = [];
      // Pushed as they arrive, so the recording stops the moment the word fires
      // rather than at the end of the window.
      for await (const frame of listen(source, context.seconds * 1000)) {
        frames.push(frame);
        word = await detector.push(frame);
        if (word) break;
      }
      const level = levels(frames);
      const words = config.wake.words.map((name) => name.replaceAll("_", " ")).join(" or ");
      return {
        stage,
        ok: word !== null,
        ms: Date.now() - started,
        level,
        heard: word?.replaceAll("_", " "),
        detail: word
          ? `Heard "${word.replaceAll("_", " ")}".`
          : level.peak < config.audio.silenceThreshold
            ? "Heard nothing at all. Check the microphone first."
            : `Heard sound, but not ${words}. Try again a little closer, or lower wake.threshold.`,
      };
    }

    case "stt": {
      const source = await resolve<AudioSource>("audioSource", config.audio.source, config.audio);
      const stt = await resolve<SpeechToText>("stt", config.stt.provider, config.stt);
      const threshold = config.audio.silenceThreshold;
      const silenceFrames = Math.ceil(config.audio.silenceMs / FRAME_MS);
      // Stops at the end of the first thing said, the way the session does,
      // so a person is not left talking into a recording that has finished.
      const frames = await record(source, context.seconds * 1000, (sofar) => {
        const found = utterance(sofar, threshold, silenceFrames);
        return found !== null && found.end < sofar.length;
      });
      const level = levels(frames);
      const found = utterance(frames, threshold, silenceFrames);
      if (!found) {
        return {
          stage,
          ok: false,
          ms: 0,
          level,
          detail: "Heard nothing loud enough to be speech. Check the microphone first.",
        };
      }
      // A little either side, because the threshold cuts the soft ends of words.
      const pad = Math.ceil(240 / FRAME_MS);
      const speech = frames.slice(Math.max(0, found.start - pad), Math.min(frames.length, found.end + pad));
      const started = Date.now();
      const heard = (await stt.transcribe(toWav(speech, config.audio.sampleRate))).trim();
      return {
        stage,
        ok: heard.length > 0,
        ms: Date.now() - started,
        level,
        heard,
        via: config.stt.provider,
        detail: heard ? `Transcribed by ${config.stt.provider}.` : "It heard speech but made no words of it.",
      };
    }

    case "llm":
    case "cloud": {
      const slice = stage === "llm" ? config.llm.local : config.llm.cloud;
      if (stage === "cloud" && !config.llm.cloud.enabled) {
        return { stage, ok: false, ms: 0, detail: "Cloud help is switched off (llm.cloud.enabled)." };
      }
      const model = await resolve<ChatModel>("llm", slice.provider, slice);
      const question = context.text ?? DEFAULT_QUESTION;
      const started = Date.now();
      const completion = await model.complete(
        [
          { role: "system", content: "Answer in one short sentence, to be spoken aloud." },
          { role: "user", content: question },
        ],
        [],
      );
      const reply = stripThinking(completion.text).trim();
      return {
        stage,
        ok: reply.length > 0,
        ms: Date.now() - started,
        heard: question,
        reply,
        via: model.label,
        detail: reply ? `${model.label} answered.` : `${model.label} answered with nothing.`,
      };
    }

    case "tts": {
      // The fallback is tried by hand rather than through the agent's pairing,
      // because a test that quietly passes on the Mac's own voice has hidden
      // the one thing it was for.
      const primary = await resolve<TextToSpeech>("tts", config.tts.provider, config.tts);
      const line = context.text ?? DEFAULT_LINE;
      const started = Date.now();
      let wav: Buffer;
      let via = config.tts.provider;
      let problem = "";
      try {
        wav = await primary.render(line);
      } catch (error) {
        if (!config.tts.fallback) throw error;
        problem = error instanceof Error ? (error.message.split("\n")[0] ?? "") : String(error);
        const fallback = await resolve<TextToSpeech>("tts", config.tts.fallback, config.tts);
        wav = await fallback.render(line);
        via = config.tts.fallback;
      }
      const ms = Date.now() - started;
      if (!context.silent) {
        const sink = await resolve<AudioSink>("audioSink", config.audio.sink, config.audio);
        await sink.play(wav);
      }
      const done = context.silent ? "Rendered, not played." : "Spoken through the speaker.";
      return {
        stage,
        ok: wav.length > 44,
        ms,
        reply: line,
        via,
        detail: problem ? `${config.tts.provider} failed (${problem}), so ${via} stood in. ${done}` : done,
      };
    }

    case "ask": {
      const agent = await buildAgent(config, context.secrets, context.paths, { audio: false });
      try {
        const request = context.text ?? DEFAULT_REQUEST;
        const started = Date.now();
        const answer = await agent.router.ask(request, { session: "try" });
        return {
          stage,
          ok: answer.text.trim().length > 0,
          ms: Date.now() - started,
          heard: request,
          reply: answer.text,
          via: answer.via,
          detail: `${agent.status().tools} tools on offer; answered ${answer.via === "cloud" ? "in the cloud" : "locally"}.`,
        };
      } finally {
        await agent.close();
      }
    }
  }
}

/** Providers the way the agent resolves them, after the plugins that may bring them. */
async function resolver({ config, secrets, paths }: TrialContext) {
  await loadPlugins(config.plugins, { paths, emit, config }, { setup: false });
  const context: ProviderContextFactory = (definition) => ({
    paths,
    secrets,
    log: logger(definition.name),
    emit,
    config,
  });
  return <T>(kind: ProviderKind, name: string, slice: unknown) =>
    resolveProvider<T>(kind, name, slice, context);
}

/** Frames for at most `ms`, then the source is let go. */
async function* listen(source: AudioSource, ms: number): AsyncGenerator<Int16Array> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    for await (const frame of source.frames(controller.signal)) {
      if (controller.signal.aborted) break;
      yield frame;
    }
  } finally {
    clearTimeout(timer);
    source.close();
  }
}

/** Records for at most `ms`, or until `done` says the recording has what it needs. */
async function record(
  source: AudioSource,
  ms: number,
  done: (frames: Int16Array[]) => boolean,
): Promise<Int16Array[]> {
  const frames: Int16Array[] = [];
  for await (const frame of listen(source, ms)) {
    frames.push(frame);
    if (done(frames)) break;
  }
  return frames;
}

function describe(trial: Trial): string {
  const lines = [`${trial.ok ? "ok" : bold("failed")}  ${trial.detail}`];
  if (trial.heard) lines.push(`${dim("heard")}  ${trial.heard}`);
  if (trial.reply) lines.push(`${dim("reply")}  ${trial.reply}`);
  if (trial.level) lines.push(`${dim("level")}  peak ${trial.level.peak}, mean ${trial.level.mean}`);
  if (trial.ms) lines.push(`${dim("took")}   ${trial.ms} ms${trial.via ? ` (${trial.via})` : ""}`);
  return lines.join("\n");
}
