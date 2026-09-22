import "./builtins.ts";
import type { Config } from "./config.ts";
import { emit } from "./events.ts";
import { logger } from "./logger.ts";
import type { Paths } from "./paths.ts";
import type {
  AudioSink,
  AudioSource,
  ChatModel,
  Check,
  DecisionModel,
  Diagnosable,
  Integration,
  SearchProvider,
  SpeechToText,
  TextToSpeech,
  WakeWordEngine,
} from "./ports.ts";
import {
  type ProviderContextFactory,
  type ProviderKind,
  ProviderKindError,
  ProviderOptionsError,
  resolveProvider,
  UnknownProviderError,
} from "./providers.ts";
import { ToolRegistry } from "./registry.ts";
import { Router } from "./router.ts";
import { searchTool } from "./search.ts";
import type { Secrets } from "./secrets.ts";
import { FallbackTextToSpeech, Speaker } from "./speaker.ts";
import { Timers } from "./timers.ts";

const log = logger("agent");

/**
 * Everything a running Parlour is made of, resolved from config and wired
 * together. The CLI's microphone loop, the text REPL and the network server
 * all take one of these rather than building their own, so a timer set from
 * a phone still sounds in the room and every client shares one tool list.
 */
export interface Agent {
  config: Config;
  paths: Paths;
  router: Router;
  registry: ToolRegistry;
  source: AudioSource;
  sink: AudioSink;
  wake: WakeWordEngine;
  stt: SpeechToText;
  tts: TextToSpeech;
  speaker: Speaker;
  integrations: Integration[];
  /** True means ignore this wake. Any integration can say so. */
  gate(): Promise<boolean>;
  status(): { tools: number; cloud: boolean };
  /** Every provider's checks, in the order they were built. */
  doctor(): Promise<Check[]>;
  close(): Promise<void>;
}

export interface BuildOptions {
  /**
   * False skips loading the wake word models and warming the voice, for
   * `parlour text` and `parlour doctor`. The providers are still created so
   * the doctor can report on them; creating one is cheap, loading it is not.
   */
  audio?: boolean;
}

export async function buildAgent(
  config: Config,
  secrets: Secrets,
  paths: Paths,
  options: BuildOptions = {},
): Promise<Agent> {
  const audio = options.audio ?? true;

  // One context per provider, differing only in the logger's scope, so a
  // line from Kokoro and a line from whisper can be told apart in the log.
  // The scope is the provider's own name, not the specifier from config: a
  // provider tried from a checkout is named by an absolute path, and that
  // would not fit the column.
  const context: ProviderContextFactory = (definition) => ({
    paths,
    secrets,
    log: logger(definition.name),
    emit,
    config,
  });
  const resolve = <T>(kind: ProviderKind, name: string, slice: unknown) =>
    resolveProvider<T>(kind, name, slice, context);

  const source = await resolve<AudioSource>("audioSource", config.audio.source, config.audio);
  const sink = await resolve<AudioSink>("audioSink", config.audio.sink, config.audio);
  const wake = await resolve<WakeWordEngine>("wake", config.wake.provider, config.wake);
  const stt = await resolve<SpeechToText>("stt", config.stt.provider, config.stt);

  // The fallback voice takes the same slice as the first: a voice name that
  // Kokoro cannot use is one `say` will ignore, and the speed carries over.
  const primary = await resolve<TextToSpeech>("tts", config.tts.provider, config.tts);
  const tts = config.tts.fallback
    ? new FallbackTextToSpeech(
        primary,
        await resolve<TextToSpeech>("tts", config.tts.fallback, config.tts),
        logger("tts"),
      )
    : primary;
  const speaker = new Speaker(tts, sink);

  const local = await resolve<ChatModel>("llm", config.llm.local.provider, config.llm.local);
  const cloud = config.llm.cloud.enabled
    ? await optional<ChatModel>("llm", config.llm.cloud.provider, config.llm.cloud, context)
    : { value: null };
  if (cloud.problem) log.warn(`no cloud model: ${cloud.problem}`);

  const decision =
    config.llm.decision.provider === "none"
      ? { value: null }
      : await optional<DecisionModel>("decision", config.llm.decision.provider, config.llm.decision, context);
  if (decision.problem) log.warn(`no decision model: ${decision.problem}`);

  const search =
    config.search.provider === "none"
      ? { value: null }
      : await optional<SearchProvider>("search", config.search.provider, config.search, context);
  if (search.problem) log.warn(`no web search: ${search.problem}`);

  const integrations: Integration[] = [];
  for (const [name, slice] of Object.entries(config.integrations)) {
    integrations.push(await resolve<Integration>("integration", name, slice));
  }

  const registry = new ToolRegistry();
  for (const integration of integrations) registry.add(...(await integration.tools()));
  if (search.value) registry.add(searchTool(search.value, config.search.maxResults));
  // A timer going off while nobody is listening is still worth hearing, so a
  // failed announcement is logged rather than left as an unhandled rejection.
  const announce = (text: string) =>
    void speaker.say(text).catch((error) => log.warn("could not announce the timer:", error));
  registry.add(...new Timers(announce).tools());

  const router = new Router({
    name: config.name,
    locale: config.locale,
    local,
    cloud: cloud.value,
    registry,
    maxToolRounds: config.llm.maxToolRounds,
    onLocalFailure: config.llm.cloud.onLocalFailure,
    promptContext: () => integrations.flatMap((integration) => integration.promptContext?.() ?? []),
    decision: decision.value,
    decisionMode: config.llm.decision.mode,
    escalateThreshold: config.llm.decision.escalateThreshold,
    localConfidence: config.llm.decision.localConfidence,
  });

  if (audio) {
    // The wake word is needed before the first frame, so it is loaded before
    // the agent is ready. The voice is not: Kokoro downloads itself on first
    // use, and the microphone, the server and the first reply should not wait
    // for that, so the warm-up runs in the background. A voice that will not
    // warm is left to its fallback or to fail out loud at the first reply,
    // which the log will explain.
    void tts.warm().catch((error) => log.warn("the voice did not warm up:", error));
    await wake.load();
  }

  const status = () => ({ tools: registry.specs().length, cloud: cloud.value !== null });
  log.info(`${status().tools} tools ready`);
  emit({ type: "ready", ...status() });

  return {
    config,
    paths,
    router,
    registry,
    source,
    sink,
    wake,
    stt,
    tts,
    speaker,
    integrations,
    status,

    async gate() {
      for (const integration of integrations) {
        if (await integration.gate?.()) return true;
      }
      return false;
    },

    async doctor() {
      const checks: Check[] = [];
      for (const part of [source, sink, wake, stt, tts, local]) checks.push(...(await checksOf(part)));
      if (cloud.value) checks.push(...(await checksOf(cloud.value)));
      if (cloud.problem) {
        checks.push({
          name: "cloud model",
          status: "warn",
          detail: `${cloud.problem}, so questions stay with the local model.`,
        });
      }
      if (decision.value) checks.push(...(await checksOf(decision.value)));
      if (decision.problem) {
        checks.push({
          name: "decision model",
          status: "warn",
          detail: `${decision.problem}, so triage is skipped.`,
        });
      }
      if (search.value) checks.push(...(await checksOf(search.value)));
      if (search.problem) {
        checks.push({
          name: "web search",
          status: "warn",
          detail: `${search.problem}, so the local model cannot look things up.`,
        });
      }
      for (const integration of integrations) checks.push(...(await checksOf(integration)));
      return checks;
    },

    async close() {
      speaker.stop();
      source.close();
      await Promise.all(integrations.map((integration) => integration.close?.()));
    },
  };
}

/**
 * The cloud model, decision triage and web search are the slots the house
 * runs without. A provider that cannot start (nearly always a missing key) is
 * reported and left out. A name that leads nowhere, a package of the wrong
 * kind or an option that fails its schema is a mistake in config, and is
 * thrown rather than worked around, because a house that quietly answers with
 * the wrong model is worse than one that refuses to start.
 */
async function optional<T>(
  kind: ProviderKind,
  name: string,
  slice: unknown,
  context: ProviderContextFactory,
): Promise<{ value: T | null; problem?: string }> {
  try {
    return { value: await resolveProvider<T>(kind, name, slice, context) };
  } catch (error) {
    if (
      error instanceof UnknownProviderError ||
      error instanceof ProviderKindError ||
      error instanceof ProviderOptionsError
    ) {
      throw error;
    }
    return { value: null, problem: error instanceof Error ? error.message : String(error) };
  }
}

async function checksOf(part: Diagnosable): Promise<Check[]> {
  return (await part.doctor?.()) ?? [];
}
