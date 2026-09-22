import assert from "node:assert/strict";
import { test } from "node:test";
import {
  FakeAudioSink,
  FakeChatModel,
  FakeSpeechToText,
  FakeTextToSpeech,
  FakeWakeWordEngine,
  wakeFrame,
} from "../testing/index.ts";
import { parseConfig } from "./config.ts";
import type { AgentEvent } from "./events.ts";
import { ToolRegistry } from "./registry.ts";
import type { Answer } from "./router.ts";
import { Router } from "./router.ts";
import {
  LocalVoice,
  VoiceSession,
  type VoiceSessionOptions,
  type VoiceSink,
  type VoiceState,
} from "./session.ts";
import { Speaker } from "./speaker.ts";
import type { Completion } from "./types.ts";

const loud = () => new Int16Array(1280).fill(3000);
const quiet = () => new Int16Array(1280);

const say = (text: string): Completion => ({ text, toolCalls: [] });

/** A sink that only remembers, standing in for the speakers or a socket. */
class RecordingSink implements VoiceSink {
  readonly said: { text: string; answer: Answer; ms: number }[] = [];
  readonly states: [VoiceState, string?][] = [];
  readonly errors: string[] = [];
  speaking = false;
  stops = 0;

  async say(text: string, answer: Answer, ms: number): Promise<void> {
    this.said.push({ text, answer, ms });
  }

  isSpeaking(): boolean {
    return this.speaking;
  }

  stop(): void {
    this.stops += 1;
  }

  onState(state: VoiceState, detail?: string): void {
    this.states.push(detail === undefined ? [state] : [state, detail]);
  }

  onError(message: string): void {
    this.errors.push(message);
  }
}

/** The pipeline over fakes, with the pieces exposed so a test can read them. */
function pipeline(overrides: Partial<VoiceSessionOptions> = {}, replies = [say("hello")]) {
  const model = new FakeChatModel(replies);
  const sink = new RecordingSink();
  const wake = new FakeWakeWordEngine();
  const options: VoiceSessionOptions = {
    audio: parseConfig({}).audio,
    router: new Router({
      name: "Test",
      local: model,
      cloud: null,
      registry: new ToolRegistry(),
      maxToolRounds: 3,
      onLocalFailure: false,
    }),
    wake: wake.detector("test"),
    stt: new FakeSpeechToText("hi"),
    sink,
    id: "test",
    ...overrides,
  };
  return { session: new VoiceSession(options), model, sink, wake };
}

/** Answering happens off the frame loop, so a test waits for the state to settle. */
async function settled(session: VoiceSession, seen: { length: number }): Promise<void> {
  for (let i = 0; i < 1000; i++) {
    if (session.state === "idle" && seen.length > 0) return;
    await new Promise((resolve) => setImmediate(resolve));
  }
  throw new Error("the session never came back to idle");
}

test("VoiceSession: wake, endpoint, transcribe, answer, speak", async () => {
  const { session, model, sink } = pipeline();
  const frames = [wakeFrame(), loud(), loud(), loud(), ...Array.from({ length: 11 }, quiet)];
  for (const frame of frames) await session.push(frame);
  await settled(session, sink.states);

  assert.deepEqual(
    sink.said.map((s) => s.text),
    ["hello"],
  );
  assert.equal(sink.said[0]?.answer.via, "local");
  assert.ok((sink.said[0]?.ms ?? -1) >= 0, "the sink is told how long the answer took");
  assert.deepEqual(sink.states, [["listening"], ["thinking"], ["thinking", "hi"], ["speaking"], ["idle"]]);
  // The wake word cut off whatever was being said, once.
  assert.equal(sink.stops, 1);
  assert.equal(model.calls.length, 1);
  assert.equal(model.calls[0]?.messages.at(-1)?.content, "hi");
});

test("VoiceSession through LocalVoice emits the reply the desktop app reads", async () => {
  // The Status tab's "last reply" card only ever sees events, and the server
  // role speaks through LocalVoice, so this is the path that has to produce one.
  const events: AgentEvent[] = [];
  const voice = new LocalVoice(new Speaker(new FakeTextToSpeech(), new FakeAudioSink()), (event) =>
    events.push(event),
  );
  const { session } = pipeline({ sink: voice });
  const frames = [wakeFrame(), loud(), loud(), loud(), ...Array.from({ length: 11 }, quiet)];
  for (const frame of frames) await session.push(frame);
  await settled(session, events);

  const reply = events.find((event) => event.type === "reply");
  assert.ok(reply?.type === "reply", "a reply event follows the answer");
  assert.equal(reply.text, "hello");
  assert.equal(reply.via, "local");
  assert.ok(reply.ms >= 0, "the reply carries how long the model took");
  assert.deepEqual(
    events.map((event) => event.type),
    ["state", "state", "heard", "state", "reply", "state"],
  );
});

test("VoiceSession: gate true ignores the wake", async () => {
  const { session, model, sink } = pipeline({ gate: async () => true });
  await session.push(wakeFrame());
  assert.equal(session.state, "idle");
  await session.push(loud());
  assert.equal(session.state, "idle");
  assert.deepEqual(sink.states, []);
  assert.equal(model.calls.length, 0);
});

test("VoiceSession: nothing said returns to idle without asking the model", async () => {
  const { session, model, sink } = pipeline();
  await session.push(wakeFrame());
  assert.equal(session.state, "listening");
  // Leading silence is given up on after 2.5 s of 80 ms frames.
  for (let i = 0; i < 40 && session.state === "listening"; i++) await session.push(quiet());
  assert.equal(session.state, "idle");
  assert.deepEqual(sink.states, [["listening"], ["idle"]]);
  assert.equal(model.calls.length, 0);
});

test("VoiceSession: a hallucinated transcript is nothing said", async () => {
  const { session, model, sink } = pipeline({ stt: new FakeSpeechToText("[BLANK_AUDIO]") });
  const answer = await session.utterance([loud()]);
  assert.equal(answer, null);
  assert.deepEqual(sink.said, []);
  assert.equal(model.calls.length, 0);
});

test("VoiceSession: utterance() skips wake and endpointing", async () => {
  const { session, sink, wake } = pipeline({ room: "kitchen" });
  const answer = await session.utterance([loud(), loud()]);
  assert.deepEqual({ text: answer?.text, via: answer?.via }, { text: "hello", via: "local" });
  assert.deepEqual(
    sink.said.map((s) => s.text),
    ["hello"],
  );
  assert.deepEqual(sink.states, [["thinking"], ["thinking", "hi"], ["speaking"], ["idle"]]);
  assert.equal(wake.detectors[0]?.resets, 0);
});

test("VoiceSession: a failed turn is reported to the sink and returns null", async () => {
  const stt = {
    transcribe: async () => {
      throw new Error("whisper fell over");
    },
  };
  const { session, sink } = pipeline({ stt });
  const answer = await session.utterance([loud()]);
  assert.equal(answer, null);
  assert.deepEqual(sink.said, []);
  assert.deepEqual(sink.errors, ["whisper fell over"]);
  assert.equal(session.state, "idle");
});

test("VoiceSession: frames are dropped while speaking unless barge-in is on", async () => {
  const { session, sink, wake } = pipeline();
  sink.speaking = true;
  await session.push(wakeFrame());
  assert.equal(session.state, "idle");
  assert.equal(wake.detectors[0]?.resets, 1);

  const bargeIn = pipeline({ audio: { ...parseConfig({}).audio, bargeIn: true } });
  bargeIn.sink.speaking = true;
  await bargeIn.session.push(wakeFrame());
  assert.equal(bargeIn.session.state, "listening");
});

test("LocalVoice speaks through the speaker and reports the turn as events", async () => {
  const tts = new FakeTextToSpeech();
  const audio = new FakeAudioSink();
  const events: AgentEvent[] = [];
  const voice = new LocalVoice(new Speaker(tts, audio), (event) => events.push(event));

  const text = "The kitchen light is on and the heating is set to twenty one.";
  await voice.say(text, { text, via: "cloud" }, 420);
  assert.deepEqual(
    audio.played.map((wav) => wav.toString()),
    [text],
  );
  assert.equal(voice.isSpeaking(), false);

  voice.onState("listening");
  voice.onState("thinking", "turn on the light");
  voice.onError("the model timed out");
  voice.onState("idle");
  // The desktop app draws its status from exactly these lines, so the reply
  // and the failure both have to be here, not only in the log.
  assert.deepEqual(events, [
    { type: "reply", text, via: "cloud", ms: 420 },
    { type: "state", value: "listening" },
    { type: "heard", text: "turn on the light" },
    { type: "error", message: "the model timed out" },
    { type: "state", value: "idle" },
  ]);

  voice.stop();
  assert.equal(audio.stops, 1);
});
