import { KokoroTTS } from "kokoro-js";
import { logger } from "../logger.ts";

const log = logger("tts");

const MODEL = "onnx-community/Kokoro-82M-v1.0-ONNX";

/**
 * Quantised weights on the CPU. fp32 sounds no better coming out of a speaker
 * across the room and takes long enough on a Mac mini that the pause before the
 * reply is audible.
 */
const DTYPE = "q8";

type VoiceId = NonNullable<Parameters<KokoroTTS["generate"]>[1]>["voice"];

let loading: Promise<KokoroTTS> | undefined;

/**
 * Loaded once and shared by every client. The first call downloads the model
 * into the transformers.js cache, which is why the agent warms it up rather
 * than waiting for someone to ask a question.
 */
export function loadKokoro(): Promise<KokoroTTS> {
  loading ??= KokoroTTS.from_pretrained(MODEL, { dtype: DTYPE, device: "cpu" })
    .then((tts) => {
      log.info(`Kokoro ready (${MODEL}, ${DTYPE})`);
      return tts;
    })
    .catch((error: unknown) => {
      // Let the next reply try again: a failed download is usually the network,
      // not the model.
      loading = undefined;
      throw error;
    });
  return loading;
}

export async function renderKokoro(text: string, voice: string, speed: number): Promise<Buffer> {
  const tts = await loadKokoro();
  if (!Object.hasOwn(tts.voices, voice)) {
    throw new Error(`unknown Kokoro voice "${voice}", try one of: ${Object.keys(tts.voices).join(", ")}`);
  }
  const audio = await tts.generate(text, { voice: voice as VoiceId, speed });
  return Buffer.from(audio.toWav());
}
