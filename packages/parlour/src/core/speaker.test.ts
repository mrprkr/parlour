import assert from "node:assert/strict";
import { test } from "node:test";
import type { Logger } from "./logger.ts";
import type { AudioSink, TextToSpeech } from "./ports.ts";
import { FallbackTextToSpeech, Speaker } from "./speaker.ts";

const silentLog: Logger = { debug() {}, info() {}, warn() {}, error() {} };

const echoTts: TextToSpeech = { warm: async () => {}, render: async (text) => Buffer.from(text) };

/** Two sentences, each past the length that would make `sentences()` glue them. */
const TWO =
  "A long enough first sentence to stand alone here ok. Second long enough sentence to stand alone here too.";

test("FallbackTextToSpeech uses the fallback when the primary throws, and retries the primary", async () => {
  let calls = 0;
  const primary: TextToSpeech = {
    warm: async () => {},
    render: async () => {
      calls++;
      throw new Error("no");
    },
  };
  const fallback: TextToSpeech = { warm: async () => {}, render: async () => Buffer.from("f") };
  const tts = new FallbackTextToSpeech(primary, fallback, silentLog);
  assert.equal((await tts.render("a")).toString(), "f");
  await tts.render("b");
  assert.equal(calls, 2);
});

test("FallbackTextToSpeech warns once, not on every reply", async () => {
  let warnings = 0;
  const log: Logger = { ...silentLog, warn: () => warnings++ };
  const primary: TextToSpeech = {
    warm: async () => {
      throw new Error("no model");
    },
    render: async () => {
      throw new Error("still no model");
    },
  };
  const tts = new FallbackTextToSpeech(primary, echoTts, log);
  await tts.warm();
  await tts.render("a");
  await tts.render("b");
  assert.equal(warnings, 1);
});

test("FallbackTextToSpeech prefers the primary when it works", async () => {
  const fallback: TextToSpeech = { warm: async () => {}, render: async () => Buffer.from("fallback") };
  const tts = new FallbackTextToSpeech(echoTts, fallback, silentLog);
  assert.equal((await tts.render("primary")).toString(), "primary");
});

test("FallbackTextToSpeech reports on behalf of both voices", async () => {
  const primary: TextToSpeech = {
    ...echoTts,
    doctor: async () => [{ name: "Kokoro", status: "ok", detail: "" }],
  };
  const fallback: TextToSpeech = {
    ...echoTts,
    doctor: async () => [{ name: "say", status: "ok", detail: "" }],
  };
  const tts = new FallbackTextToSpeech(primary, fallback, silentLog);
  assert.deepEqual(
    (await tts.doctor()).map((check) => check.name),
    ["Kokoro", "say"],
  );
});

test("Speaker plays one sentence per render and stops on abort", async () => {
  const played: string[] = [];
  const sink: AudioSink = {
    play: async (wav) => {
      played.push(wav.toString());
    },
    stop: () => {},
  };
  const speaker = new Speaker(echoTts, sink);
  await speaker.say(TWO);
  assert.equal(played.length, 2);
  assert.ok(!speaker.isSpeaking());
});

test("Speaker says nothing for an empty reply", async () => {
  let plays = 0;
  const sink: AudioSink = {
    play: async () => {
      plays++;
    },
    stop: () => {},
  };
  await new Speaker(echoTts, sink).say("   ");
  assert.equal(plays, 0);
});

test("Speaker stop() cuts the current sentence and skips the rest", async () => {
  let started = 0;
  let stopped = 0;
  let renders = 0;
  let slowRenderDone = false;
  // The second sentence is prefetched while the first plays. Its render is
  // slow, and stop() must not wait for it: the session is waiting on say() to
  // hand the microphone back.
  const tts: TextToSpeech = {
    warm: async () => {},
    render: (text) => {
      renders++;
      if (renders === 1) return Promise.resolve(Buffer.from(text));
      return new Promise((resolve) =>
        setTimeout(() => {
          slowRenderDone = true;
          resolve(Buffer.from(text));
        }, 200),
      );
    },
  };
  const sink: AudioSink = {
    play: (_wav, signal) =>
      new Promise<void>((resolve) => {
        started++;
        signal?.addEventListener("abort", () => resolve(), { once: true });
      }),
    stop: () => {
      stopped++;
    },
  };
  const speaker = new Speaker(tts, sink);
  const saying = speaker.say(TWO);
  // The first render is asynchronous, so give the first play a moment to begin.
  await new Promise((resolve) => setImmediate(resolve));
  assert.ok(speaker.isSpeaking());
  speaker.stop();
  await saying;
  assert.equal(started, 1);
  assert.equal(stopped, 1);
  assert.ok(!speaker.isSpeaking());
  assert.ok(!slowRenderDone, "say() waited for a render it was never going to play");
});

test("Speaker starts no render after stop()", async () => {
  const rendered: string[] = [];
  const counting: TextToSpeech = {
    warm: async () => {},
    render: async (text) => {
      rendered.push(text);
      return Buffer.from(text);
    },
  };
  const sink: AudioSink = {
    play: (_wav, signal) =>
      new Promise<void>((resolve) => {
        signal?.addEventListener("abort", () => resolve(), { once: true });
      }),
    stop: () => {},
  };
  const speaker = new Speaker(counting, sink);
  const saying = speaker.say(`${TWO} And a third sentence long enough to stand on its own as well.`);
  await new Promise((resolve) => setImmediate(resolve));
  speaker.stop();
  await saying;
  // The second sentence was already rendering while the first played. That is
  // the prefetch and it is fine, but the third must never start.
  assert.equal(rendered.length, 2);
});

test("Speaker honours the caller's own signal", async () => {
  const controller = new AbortController();
  let started = 0;
  const sink: AudioSink = {
    play: (_wav, signal) =>
      new Promise<void>((resolve) => {
        started++;
        signal?.addEventListener("abort", () => resolve(), { once: true });
      }),
    stop: () => {},
  };
  const speaker = new Speaker(echoTts, sink);
  const saying = speaker.say(TWO, controller.signal);
  await new Promise((resolve) => setImmediate(resolve));
  controller.abort();
  await saying;
  assert.equal(started, 1);
});

test("Speaker lets a failed render surface and is ready to speak again", async () => {
  const failing: TextToSpeech = {
    warm: async () => {},
    render: async () => {
      throw new Error("no voice");
    },
  };
  const sink: AudioSink = { play: async () => {}, stop: () => {} };
  const speaker = new Speaker(failing, sink);
  await assert.rejects(speaker.say("Hello there."), /no voice/);
  assert.ok(!speaker.isSpeaking());
});
