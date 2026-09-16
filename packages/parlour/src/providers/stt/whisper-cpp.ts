import { z } from "zod";
import type { Check, SpeechToText } from "../../core/ports.ts";
import { defineProvider, type ProviderContext, registerProvider } from "../../core/providers.ts";

export const whisperCppSchema = z.object({
  url: z.string().default("http://127.0.0.1:8910/inference"),
  language: z.string().default("en"),
  timeoutMs: z.number().int().positive().default(20000),
});

export type WhisperCppOptions = z.infer<typeof whisperCppSchema>;

/**
 * whisper.cpp's HTTP server, kept warm by `parlour service install`. Talking
 * to a running server rather than spawning whisper-cli per utterance saves the
 * model load, which on a Mac mini is most of the wall clock for a short
 * sentence.
 */
export function createWhisperCpp(options: WhisperCppOptions, context: ProviderContext): SpeechToText {
  const { url, language, timeoutMs } = options;
  const { log } = context;

  return {
    async transcribe(wav) {
      const form = new FormData();
      form.set("file", new Blob([new Uint8Array(wav)], { type: "audio/wav" }), "utterance.wav");
      form.set("temperature", "0");
      form.set("response_format", "json");
      form.set("language", language);

      const started = Date.now();
      const response = await fetch(url, {
        method: "POST",
        body: form,
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (!response.ok) throw new Error(`whisper ${response.status}: ${await response.text()}`);

      const body = (await response.json()) as { text?: string };
      const text = (body.text ?? "").trim();
      log.debug(`transcribed in ${Date.now() - started}ms:`, text);
      return text;
    },

    async doctor(): Promise<Check[]> {
      // The inference route only answers POSTs; the root serves a page, and
      // answering it at all is what says the server is up.
      const up = await reachable(url.replace(/\/inference$/, ""));
      return [
        {
          name: "whisper server",
          status: up ? "ok" : "fail",
          detail: up ? url : `${url}. Start it with parlour service install, or whisper-server by hand.`,
        },
      ];
    },
  };
}

async function reachable(url: string): Promise<boolean> {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(4000) });
    return response.ok;
  } catch {
    return false;
  }
}

export const whisperCpp = defineProvider<SpeechToText>({
  kind: "stt",
  name: "whisper-cpp",
  description: "whisper.cpp's HTTP server, on this machine or another on the network",
  schema: whisperCppSchema,
  create: (options, context) => createWhisperCpp(options as WhisperCppOptions, context),
});

registerProvider(whisperCpp);
