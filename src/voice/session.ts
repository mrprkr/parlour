import type { Config } from "../config.ts";
import { FRAME_SAMPLES, toWav } from "../audio/capture.ts";
import { Endpointer } from "../audio/endpoint.ts";
import type { WakeWord } from "../audio/wake.ts";
import { isNoise, transcribe } from "../stt/whisper.ts";
import type { Answer, Router } from "../llm/router.ts";
import { logger } from "../logger.ts";

const log = logger("voice");
const FRAME_MS = (FRAME_SAMPLES / 16000) * 1000;

export type VoiceState = "idle" | "listening" | "thinking" | "speaking";

/**
 * Where a reply goes. The Mac's own microphone speaks through Kokoro and the
 * speakers; a satellite gets the same text and the same audio over a socket.
 * Keeping this an interface is what makes one pipeline serve both.
 */
export interface VoiceSink {
  say(text: string, answer: Answer): Promise<void>;
  /** True while sound is coming out, which decides the barge-in rule. */
  isSpeaking(): boolean;
  stop(): void;
  onState?(state: VoiceState, detail?: string): void;
}

export interface VoiceSessionOptions {
  config: Config;
  router: Router;
  wake: WakeWord;
  sink: VoiceSink;
  /** Conversation key and log label. One per client. */
  id: string;
  room?: string;
  /** Checked after the wake word and before anything is acted on. */
  muted?: () => Promise<boolean>;
}

/**
 * Wake word, endpointing, transcription, the model, and the reply, as one
 * state machine over a stream of 80 ms frames. It does not know where the
 * frames come from, which is the point: the Mac's microphone, a Voice PE
 * satellite relaying audio, a phone or a piece of custom hardware all feed the
 * same object and get the same behaviour.
 */
export class VoiceSession {
  #state: VoiceState = "idle";
  #endpointer: Endpointer | undefined;
  readonly #options: VoiceSessionOptions;

  constructor(options: VoiceSessionOptions) {
    this.#options = options;
  }

  get state(): VoiceState {
    return this.#state;
  }

  /** Feed one frame. Returns immediately; answering happens in the background. */
  async push(frame: Int16Array): Promise<void> {
    const { config, wake, sink } = this.#options;
    if (this.#state === "thinking" || this.#state === "speaking") return;

    // While the agent is talking, its own voice is in the microphone. Unless
    // the client has a microphone that cannot hear its speaker, the only safe
    // thing is to stop listening.
    if (sink.isSpeaking() && !config.audio.bargeIn) {
      wake.reset();
      return;
    }

    if (this.#state === "idle") {
      if (!(await wake.push(frame))) return;
      if (await this.#options.muted?.()) {
        log.info(`${this.#options.id}: muted, ignoring`);
        return;
      }
      sink.stop();
      this.#enter("listening");
      this.#endpointer = new Endpointer({
        frameMs: FRAME_MS,
        silenceMs: config.audio.silenceMs,
        maxUtteranceMs: config.audio.maxUtteranceMs,
        silenceThreshold: config.audio.silenceThreshold,
        leadingSilenceMs: 2500,
      });
      return;
    }

    const verdict = this.#endpointer!.push(frame);
    if (verdict === "listening") return;

    const frames = this.#endpointer!.frames;
    this.#endpointer = undefined;
    if (verdict === "empty") {
      this.#enter("idle");
      wake.reset();
      return;
    }

    this.#enter("thinking");
    // Deliberately not awaited: the frame source must keep draining, or ffmpeg
    // backs up and the next utterance arrives seconds late.
    void this.#answer(frames).finally(() => {
      wake.reset();
      this.#enter("idle");
    });
  }

  /**
   * For clients that already know where the utterance starts and stops: a
   * phone with a push to talk button, or a satellite that did its own wake
   * word. No wake word, no endpointing, just the rest of the pipeline.
   */
  async utterance(frames: Int16Array[]): Promise<Answer | null> {
    this.#enter("thinking");
    try {
      return await this.#answer(frames);
    } finally {
      this.#enter("idle");
    }
  }

  async #answer(frames: Int16Array[]): Promise<Answer | null> {
    const { config, router, sink, id, room } = this.#options;
    const started = Date.now();
    try {
      const text = await transcribe(toWav(frames, config.audio.sampleRate), config);
      if (!text || isNoise(text)) {
        log.info(`${id}: nothing said`);
        return null;
      }
      log.info(`${id} heard:`, text);
      sink.onState?.("thinking", text);

      const answer = await router.ask(text, { session: id, room });
      log.info(`${id} replied in ${Date.now() - started}ms via ${answer.via}:`, answer.text);

      this.#enter("speaking");
      await sink.say(answer.text, answer);
      return answer;
    } catch (error) {
      log.error(`${id}:`, error);
      return null;
    }
  }

  #enter(state: VoiceState): void {
    this.#state = state;
    this.#options.sink.onState?.(state);
  }
}
