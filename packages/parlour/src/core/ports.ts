import type { Tool } from "./registry.ts";
import type { Completion, Message, ToolSpec } from "./types.ts";

/**
 * The seams between core and everything that touches hardware, a model or the
 * network. Each interface maps onto a class that already existed, so the
 * built-in providers are moves rather than rewrites, and a third party can
 * supply any one of them from an npm package without touching core.
 */

export interface Check {
  name: string;
  status: "ok" | "warn" | "fail";
  detail: string;
}

/** Anything that can tell `parlour doctor` whether it is ready. */
export interface Diagnosable {
  doctor?(): Promise<Check[]>;
}

export interface AudioSource extends Diagnosable {
  /** 16 kHz mono frames, one `FRAME_SAMPLES` block at a time. */
  frames(signal?: AbortSignal): AsyncIterable<Int16Array>;
  close(): void;
}

export interface AudioSink extends Diagnosable {
  play(wav: Buffer, signal?: AbortSignal): Promise<void>;
  stop(): void;
}

export interface WakeWordDetector {
  /** The word that fired, or null. */
  push(frame: Int16Array): Promise<string | null>;
  reset(): void;
}

export interface WakeWordEngine extends Diagnosable {
  load(): Promise<void>;
  /** One detector per stream, so two microphones do not share a refractory period. */
  detector(label: string): WakeWordDetector;
}

export interface SpeechToText extends Diagnosable {
  transcribe(wav: Buffer): Promise<string>;
}

export interface TextToSpeech extends Diagnosable {
  /** Load the model before the first request rather than during it. */
  warm(): Promise<void>;
  render(text: string): Promise<Buffer>;
}

export interface ChatModel extends Diagnosable {
  readonly label: string;
  complete(messages: Message[], tools: ToolSpec[]): Promise<Completion>;
}

/**
 * A System One decision model: state in, typed answers with probabilities out.
 * Used for pre-router triage (escalate vs stay local). It does not generate
 * speech; that stays with ChatModel.
 */
export type DecisionState = string | Record<string, unknown> | unknown[];

/** String, or a structured object the model can refer to by field name. */
export type DecisionInstructions = string | Record<string, unknown>;

export type DecisionQuestion =
  | {
      type: "noul";
      instructions: DecisionInstructions;
      criteria?: { true: string; false: string };
    }
  | {
      type: "choice";
      instructions: DecisionInstructions;
      criteria: Record<string, string | null>;
    }
  | {
      type: "score";
      instructions: DecisionInstructions;
      criteria: string[];
    };

export type DecisionAnswer =
  | { type: "noul"; noul: number }
  | {
      type: "choice";
      choice: string;
      probabilities: Record<string, number>;
      confidence: number;
    }
  | {
      type: "score";
      score: number;
      legend: Record<string, string>;
      probabilities: Record<string, number>;
      confidence: number;
    };

export interface DecisionResult {
  model: string;
  answers: Record<string, DecisionAnswer>;
}

export interface DecisionModel extends Diagnosable {
  readonly label: string;
  evaluate(state: DecisionState, questions: Record<string, DecisionQuestion>): Promise<DecisionResult>;
  /** Release a warm worker or other resources. */
  close?(): void | Promise<void>;
}

export interface SearchResult {
  title: string;
  url: string;
  snippet: string;
}

export interface SearchProvider extends Diagnosable {
  search(query: string, max: number): Promise<SearchResult[]>;
}

/** Where connector tokens go: the Keychain when there is one, a file otherwise. */
export interface SecretStore {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  delete(key: string): Promise<void>;
}

export interface ServiceSpec {
  label: string;
  /** A short human name for status output. */
  what: string;
  program: string[];
  env: Record<string, string>;
  logPath: string;
  /**
   * A model server rather than the agent: it runs at a lower priority and
   * waits longer after a crash, so a model that cannot load does not hold
   * the machine hostage while it keeps trying.
   */
  lowPriority?: boolean;
}

export interface ServiceState {
  label: string;
  what: string;
  installed: boolean;
  running: boolean;
  pid: number | null;
  lastExit: number | null;
  logPath: string;
}

export interface ServiceManager {
  install(specs: ServiceSpec[]): Promise<ServiceState[]>;
  uninstall(labels: string[]): Promise<string[]>;
  /**
   * Stop what is running without forgetting it: the job is still installed
   * and still starts at login. `uninstall` is the one that forgets.
   */
  stop(specs: Pick<ServiceSpec, "label" | "what" | "logPath">[]): Promise<ServiceState[]>;
  restart(specs: ServiceSpec[]): Promise<ServiceState[]>;
  status(specs: Pick<ServiceSpec, "label" | "what" | "logPath">[]): Promise<ServiceState[]>;
  tail(logPath: string, lines: number): Promise<string>;
}

export interface Integration extends Diagnosable {
  readonly name: string;
  tools(): Promise<Tool[]>;
  /** Extra lines for the system prompt. */
  promptContext?(): string[];
  /** True means ignore this wake. Asked after the wake word, before anything is acted on. */
  gate?(): Promise<boolean>;
  close?(): Promise<void>;
}
