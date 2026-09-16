import type { KokoroTTS } from "kokoro-js";
import { z } from "zod";
import type { Logger } from "../../core/logger.ts";
import type { Check, TextToSpeech } from "../../core/ports.ts";
import { defineProvider, type ProviderContext, registerProvider } from "../../core/providers.ts";
import { speakable } from "../../core/text.ts";
import { isKokoroVoiceId } from "./voices.ts";

export const kokoroSchema = z.object({
  voice: z.string().default("bf_emma"),
  speed: z.number().positive().default(1),
});

export type KokoroOptions = z.infer<typeof kokoroSchema>;

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
 *
 * kokoro-js is imported here rather than at the top so that registering this
 * provider costs nothing and a broken onnxruntime cannot stop the fallback
 * voice from loading. The fallback exists for exactly that day.
 */
export function loadKokoro(log: Logger): Promise<KokoroTTS> {
  loading ??= import("kokoro-js")
    .then(({ KokoroTTS }) => KokoroTTS.from_pretrained(MODEL, { dtype: DTYPE, device: "cpu" }))
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

export async function renderKokoro(text: string, voice: string, speed: number, log: Logger): Promise<Buffer> {
  const tts = await loadKokoro(log);
  if (!Object.hasOwn(tts.voices, voice)) {
    throw new Error(`unknown Kokoro voice "${voice}", try one of: ${Object.keys(tts.voices).join(", ")}`);
  }
  const audio = await tts.generate(text, { voice: voice as VoiceId, speed });
  return Buffer.from(audio.toWav());
}

/** Renders and nothing more. Falling back to another voice is core's job. */
export function createKokoro(options: KokoroOptions, context: ProviderContext): TextToSpeech {
  const { voice, speed } = options;
  const { log } = context;

  return {
    async warm() {
      await loadKokoro(log);
    },

    render(text) {
      return renderKokoro(speakable(text), voice, speed, log);
    },

    async doctor(): Promise<Check[]> {
      // The voice list lives inside the model, so without loading it the most
      // that can be checked is the shape of the id. A macOS voice name here is
      // the usual mistake after switching providers.
      const plausible = isKokoroVoiceId(voice);
      return [
        {
          name: "Kokoro",
          status: plausible ? "ok" : "warn",
          detail: plausible
            ? `voice ${voice}, ${MODEL} (${DTYPE}), downloaded on first use`
            : `"${voice}" is not a Kokoro voice id (they look like af_heart or bm_george), so the fallback voice will speak instead`,
        },
      ];
    },
  };
}

export const kokoro = defineProvider<TextToSpeech>({
  kind: "tts",
  name: "kokoro",
  description: "Kokoro, a small neural voice that runs on the CPU",
  schema: kokoroSchema,
  create: (options, context) => createKokoro(options as KokoroOptions, context),
});

registerProvider(kokoro);
