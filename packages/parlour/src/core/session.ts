import { FRAME_MS, toWav } from "./audio.ts";
import type { Config } from "./config.ts";
import { Endpointer } from "./endpoint.ts";
import { type AgentEvent, emit } from "./events.ts";
import { logger } from "./logger.ts";
import type { SpeechToText, WakeWordDetector } from "./ports.ts";
import type { Answer, Router } from "./router.ts";
import type { Speaker } from "./speaker.ts";
import { isNoise } from "./text.ts";

const log = logger("voice");

export type VoiceState = "idle" | "listening" | "thinking" | "speaking";

/**
 * Where a reply goes. This machine's own microphone speaks through its
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
  audio: Config["audio"];
  router: Router;
  wake: WakeWordDetector;
  stt: SpeechToText;
  sink: VoiceSink;
  /** Conversation key and log label. One per client. */
  id: string;
  room?: string;
  /** Asked after the wake word and before anything is acted on. True means ignore it. */
  gate?: () => Promise<boolean>;
}

/**
 * Wake word, endpointing, transcription, the model, and the reply, as one
 * state machine over a stream of 80 ms frames. It does not know where the
 * frames come from, which is the point: this machine's microphone, a Voice PE
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
    const { audio, wake, sink } = this.#options;
    if (this.#state === "thinking" || this.#state === "speaking") return;

    // While the agent is talking, its own voice is in the microphone. Unless
    // the client has a microphone that cannot hear its speaker, the only safe
    // thing is to stop listening.
    if (sink.isSpeaking() && !audio.bargeIn) {
      wake.reset();
      return;
    }

    if (this.#state === "idle") {
      if (!(await wake.push(frame))) return;
      if (await this.#options.gate?.()) {
        log.info(`${this.#options.id}: muted, ignoring`);
        return;
      }
      sink.stop();
      this.#enter("listening");
      this.#endpointer = new Endpointer({
        frameMs: FRAME_MS,
        silenceMs: audio.silenceMs,
        maxUtteranceMs: audio.maxUtteranceMs,
        silenceThreshold: audio.silenceThreshold,
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
    const { audio, router, stt, sink, id, room } = this.#options;
    const started = Date.now();
    try {
      const text = await stt.transcribe(toWav(frames, audio.sampleRate));
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

/**
 * This machine's own speakers as a sink, with the session's state going out
 * as events for the desktop app. The CLI's microphone loop and the server
 * both speak through it, so a timer set from a phone still sounds in the room.
 */
export class LocalVoice implements VoiceSink {
  readonly #speaker: Speaker;
  readonly #emit: (event: AgentEvent) => void;

  constructor(speaker: Speaker, emitter: (event: AgentEvent) => void = emit) {
    this.#speaker = speaker;
    this.#emit = emitter;
  }

  /**
   * The speaker already cuts sentences and cancels the previous turn. The
   * answer is for sinks that send it over a socket; the room only hears it.
   */
  say(text: string, _answer?: Answer): Promise<void> {
    return this.#speaker.say(text);
  }

  isSpeaking(): boolean {
    return this.#speaker.isSpeaking();
  }

  stop(): void {
    this.#speaker.stop();
  }

  onState(state: VoiceState, detail?: string): void {
    if (state === "thinking" && detail) this.#emit({ type: "heard", text: detail });
    else this.#emit({ type: "state", value: state });
  }
}
