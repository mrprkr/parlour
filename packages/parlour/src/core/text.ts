/**
 * What a reply looks like once it is going to be heard rather than read. The
 * model writes for a screen, whisper hears things that were never said, and
 * both need tidying before anything is spoken or acted on.
 */

/** Speaking a reply this short and then stopping sounds broken, so glue it on. */
const MIN_CHUNK = 40;

/**
 * A reply, cut into speakable pieces. Latency is cumulative and synthesis is
 * the last link in it, so the first sentence goes to the speakers while the
 * rest is still being made.
 */
export function sentences(text: string): string[] {
  const clean = speakable(text);
  if (!clean) return [];

  const pieces = clean.match(/[^.!?…]+(?:[.!?…]+["')\]]*|$)/g) ?? [clean];
  const out: string[] = [];
  for (const piece of pieces) {
    const part = piece.trim();
    if (!part) continue;
    const last = out.at(-1);
    if (last !== undefined && last.length < MIN_CHUNK) out[out.length - 1] = `${last} ${part}`;
    else out.push(part);
  }
  return out;
}

/**
 * Models write for a screen even when told not to. Nothing here should be read
 * out as punctuation.
 */
export function speakable(text: string): string {
  const spoken = tidy(text.replace(/```[\s\S]*?```/g, " "));
  // A reply that was nothing but a code block still has to say something.
  return spoken || tidy(text.replaceAll("```", " "));
}

function tidy(text: string): string {
  return text
    .replace(/`([^`]*)`/g, "$1")
    .replace(/\*\*?([^*]+)\*\*?/g, "$1")
    .replace(/(^|\s)_([^_]+)_(?=\s|$)/g, "$1$2")
    .replace(/^\s*#{1,6}\s+/gm, "")
    .replace(/^\s*[-*+]\s+/gm, "")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Qwen and friends emit their reasoning inline. It must never be spoken, and
 * every local back end has the habit, so it is tidied here rather than in one
 * provider.
 */
export function stripThinking(text: string): string {
  return text.replace(/<think>[\s\S]*?<\/think>/g, "").trim();
}

/** Whisper hallucinates these on silence. Treat them as nothing said. */
const NOISE = /^[\s.,!?]*(\[.*\]|\(.*\)|thanks? for watching|you|thank you|bye)?[\s.,!?]*$/i;

export function isNoise(text: string): boolean {
  return NOISE.test(text);
}
