/**
 * Shared by the Kokoro voice and the macOS fallback. It lives here rather than
 * in kokoro.ts so that loading the fallback never loads, or registers, the
 * voice it exists to stand in for.
 */

/** Kokoro voice ids look like af_heart or bm_george. macOS voice names do not. */
export function isKokoroVoiceId(voice: string): boolean {
  return /^[ab][fm]_/.test(voice);
}
