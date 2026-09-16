import type { Logger } from "../core/logger.ts";
import type {
  AudioSink,
  AudioSource,
  ChatModel,
  Check,
  Integration,
  SearchProvider,
  SearchResult,
  SecretStore,
  ServiceManager,
  ServiceSpec,
  ServiceState,
  SpeechToText,
  TextToSpeech,
  WakeWordDetector,
  WakeWordEngine,
} from "../core/ports.ts";
import type { Tool } from "../core/registry.ts";
import type { Completion, Message, ToolSpec } from "../core/types.ts";

/**
 * Stand-ins for everything that needs hardware, a model or the network.
 * Published as `parlour/testing` so a third-party provider or integration can
 * test itself against the same pipeline the built-ins are tested against.
 * Each one records what it was asked, so a test can read both sides.
 */

/** Answers from a script, in order, and throws when the script runs out. */
export class FakeChatModel implements ChatModel {
  readonly label: string;
  readonly calls: { messages: Message[]; tools: string[] }[] = [];
  readonly #script: Completion[];

  constructor(script: Completion[], label = "fake") {
    this.label = label;
    this.#script = [...script];
  }

  async complete(messages: Message[], tools: ToolSpec[]): Promise<Completion> {
    // A copy: the loop keeps appending to the array it handed over.
    this.calls.push({ messages: [...messages], tools: tools.map((tool) => tool.name) });
    const next = this.#script.shift();
    if (!next) throw new Error("script exhausted");
    return next;
  }
}

/** Hears the same thing whatever it is given. */
export class FakeSpeechToText implements SpeechToText {
  readonly heard: Buffer[] = [];
  readonly #text: string;

  constructor(text = "hello") {
    this.#text = text;
  }

  async transcribe(wav: Buffer): Promise<string> {
    this.heard.push(wav);
    return this.#text;
  }
}

/** Renders the text itself as the audio, so what was said can be read back. */
export class FakeTextToSpeech implements TextToSpeech {
  readonly rendered: string[] = [];
  warmed = false;

  async warm(): Promise<void> {
    this.warmed = true;
  }

  async render(text: string): Promise<Buffer> {
    this.rendered.push(text);
    return Buffer.from(text);
  }
}

/** Plays back a scripted set of frames, then ends, as a microphone never does. */
export class FakeAudioSource implements AudioSource {
  closed = false;
  readonly #frames: Int16Array[];

  constructor(frames: Int16Array[] = []) {
    this.#frames = frames;
  }

  async *frames(signal?: AbortSignal): AsyncIterable<Int16Array> {
    for (const frame of this.#frames) {
      if (signal?.aborted || this.closed) return;
      yield frame;
    }
  }

  close(): void {
    this.closed = true;
  }
}

/** Keeps what it was asked to play and honours the abort signal. */
export class FakeAudioSink implements AudioSink {
  readonly played: Buffer[] = [];
  stops = 0;

  async play(wav: Buffer, signal?: AbortSignal): Promise<void> {
    if (signal?.aborted) return;
    this.played.push(wav);
  }

  stop(): void {
    this.stops += 1;
  }
}

/** Fires on any frame whose first sample is -1, which no microphone produces by accident. */
export const WAKE_SAMPLE = -1;

/** A frame that wakes a `FakeWakeWordEngine` detector. */
export function wakeFrame(samples = 1280): Int16Array {
  const frame = new Int16Array(samples);
  frame[0] = WAKE_SAMPLE;
  return frame;
}

export class FakeWakeWordDetector implements WakeWordDetector {
  readonly label: string;
  resets = 0;
  readonly #word: string;

  constructor(label: string, word: string) {
    this.label = label;
    this.#word = word;
  }

  async push(frame: Int16Array): Promise<string | null> {
    return frame[0] === WAKE_SAMPLE ? this.#word : null;
  }

  reset(): void {
    this.resets += 1;
  }
}

export class FakeWakeWordEngine implements WakeWordEngine {
  loaded = false;
  readonly detectors: FakeWakeWordDetector[] = [];
  readonly #word: string;

  constructor(word = "hey_jarvis") {
    this.#word = word;
  }

  async load(): Promise<void> {
    this.loaded = true;
  }

  detector(label: string): FakeWakeWordDetector {
    const detector = new FakeWakeWordDetector(label, this.#word);
    this.detectors.push(detector);
    return detector;
  }
}

export interface FakeIntegrationOptions {
  name?: string;
  tools?: Tool[];
  promptContext?: string[];
  checks?: Check[];
}

/** An integration whose gate is a flag the test can flip. */
export class FakeIntegration implements Integration {
  readonly name: string;
  /** What `gate()` answers. True means ignore the wake. */
  muted = false;
  closed = false;
  readonly #tools: Tool[];
  readonly #promptContext: string[];
  readonly #checks: Check[];

  constructor(options: FakeIntegrationOptions = {}) {
    this.name = options.name ?? "fake";
    this.#tools = options.tools ?? [];
    this.#promptContext = options.promptContext ?? [];
    this.#checks = options.checks ?? [];
  }

  async tools(): Promise<Tool[]> {
    return this.#tools;
  }

  promptContext(): string[] {
    return this.#promptContext;
  }

  async gate(): Promise<boolean> {
    return this.muted;
  }

  async doctor(): Promise<Check[]> {
    return this.#checks;
  }

  async close(): Promise<void> {
    this.closed = true;
  }
}

/** Answers every query with the same results, trimmed to the limit it was given. */
export class FakeSearchProvider implements SearchProvider {
  readonly asked: { query: string; max: number }[] = [];
  readonly #results: SearchResult[];

  constructor(results: SearchResult[] = []) {
    this.#results = results;
  }

  async search(query: string, max: number): Promise<SearchResult[]> {
    this.asked.push({ query, max });
    return this.#results.slice(0, max);
  }
}

/** A Map standing in for the Keychain, so a test can read what was stored. */
export class FakeSecretStore implements SecretStore {
  readonly values = new Map<string, string>();

  constructor(initial: Record<string, string> = {}) {
    for (const [key, value] of Object.entries(initial)) this.values.set(key, value);
  }

  async get(key: string): Promise<string | null> {
    return this.values.get(key) ?? null;
  }

  async set(key: string, value: string): Promise<void> {
    this.values.set(key, value);
  }

  async delete(key: string): Promise<void> {
    this.values.delete(key);
  }
}

/**
 * Tracks which services are installed and running without touching launchd.
 * Everything installed is reported running, since a supervisor that keeps
 * things alive is the case the callers are written for.
 */
export class FakeServiceManager implements ServiceManager {
  readonly installed = new Map<string, ServiceSpec>();
  readonly restarts: string[] = [];
  readonly tailed: { logPath: string; lines: number }[] = [];
  /** What `tail()` answers, keyed by log path. */
  readonly logs = new Map<string, string>();

  async install(specs: ServiceSpec[]): Promise<ServiceState[]> {
    for (const spec of specs) this.installed.set(spec.label, spec);
    return this.status(specs);
  }

  async uninstall(labels: string[]): Promise<string[]> {
    // Only what was actually there, as launchd reports only what it removed.
    return labels.filter((label) => this.installed.delete(label));
  }

  async restart(specs: ServiceSpec[]): Promise<ServiceState[]> {
    for (const spec of specs) {
      this.installed.set(spec.label, spec);
      this.restarts.push(spec.label);
    }
    return this.status(specs);
  }

  async status(specs: Pick<ServiceSpec, "label" | "what" | "logPath">[]): Promise<ServiceState[]> {
    return specs.map((spec) => {
      const installed = this.installed.has(spec.label);
      return {
        label: spec.label,
        what: spec.what,
        installed,
        running: installed,
        pid: installed ? 1000 : null,
        lastExit: null,
        logPath: spec.logPath,
      };
    });
  }

  async tail(logPath: string, lines: number): Promise<string> {
    this.tailed.push({ logPath, lines });
    return this.logs.get(logPath) ?? "";
  }
}

/** A logger that says nothing, for tests that are not about what gets logged. */
export const silentLogger: Logger = { debug() {}, info() {}, warn() {}, error() {} };
