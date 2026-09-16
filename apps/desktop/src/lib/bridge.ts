/**
 * The Rust side, typed. Every capability the window has lives behind one of
 * these, so a component never reaches for `invoke` itself and a change to a
 * command signature shows up here as a type error rather than at runtime.
 */
import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";

// ------------------------------------------------------------------- shapes

/** Where the agent is and what runs it. The app's only two facts of its own. */
export interface Settings {
  agentDir: string;
  nodePath: string;
}

export type AgentState = "stopped" | "idle" | "listening" | "thinking" | "speaking";

export interface Status {
  running: boolean;
  state: AgentState | string;
  lastHeard?: string | null;
  lastReply?: string | null;
  /** Which model answered last. */
  via?: "local" | "cloud" | null;
  tools: number;
  cloud: boolean;
  error?: string | null;
}

export interface SecretsPresent {
  haToken: boolean;
  anthropicKey: boolean;
  braveKey: boolean;
  agentToken: boolean;
}

export interface Network {
  /** What to type into a phone, or point Home Assistant at. */
  url: string;
  /** Without a token the agent answers loopback only. */
  tokenSet: boolean;
  port: number;
}

export interface Microphone {
  granted: boolean;
  detail: string;
}

/** Which pieces of the install are in place. What the onboarding draws. */
export interface Readiness {
  agentDir: string;
  agentDirOk: boolean;
  candidates: string[];
  nodePath: string;
  nodeVersion: string | null;
  nodeOk: boolean;
  packages: boolean;
  models: boolean;
  config: boolean;
  ffmpeg: boolean;
  whisper: boolean;
  homebrew: boolean;
  /** Nothing left for the install step to do. */
  installed: boolean;
}

/** One line of the agent's own doctor. */
export interface Check {
  name: string;
  ok: boolean;
  detail: string;
  /** A failed optional check is a warning, not a fault. */
  required: boolean;
}

/** A remote MCP server the household has signed in to. */
export interface Connector {
  name: string;
  url: string;
  signedIn: boolean;
}

/** One line from scripts/setup.sh, already labelled. */
export interface SetupEvent {
  kind: "step" | "ok" | "warn" | "fail" | "log" | "done";
  text: string;
}

/**
 * The agent's own config file, edited in place rather than shadowed. Only the
 * parts the window touches are named; everything else is carried through a
 * read and a write untouched, which is why the index signature is here.
 */
export interface AgentConfig {
  [key: string]: unknown;
  audio?: { inputDevice?: string; silenceMs?: number; [key: string]: unknown };
  wake?: { words?: string[]; threshold?: number; [key: string]: unknown };
  tts?: { voice?: string; [key: string]: unknown };
  llm?: {
    local?: { baseUrl?: string; model?: string; [key: string]: unknown };
    cloud?: { enabled?: boolean; model?: string; [key: string]: unknown };
    [key: string]: unknown;
  };
  homeAssistant?: { baseUrl?: string; [key: string]: unknown };
}

/**
 * A secret to write. `null` means leave whatever is there alone, which is what
 * an untouched password box means; `""` deliberately clears it.
 */
export type SecretEdit = string | null;

// ----------------------------------------------------------------- commands

export const getSettings = () => invoke<Settings>("get_settings");
export const setSettings = (next: Settings) => invoke<Settings>("set_settings", { next });

export const getStatus = () => invoke<Status>("status");
export const startAgent = () => invoke<void>("start_agent");
export const stopAgent = () => invoke<void>("stop_agent");
export const getLogs = () => invoke<string[]>("logs");

export const readAgentConfig = () => invoke<string>("read_agent_config");
export const writeAgentConfig = (config: AgentConfig) =>
  invoke<void>("write_agent_config", { json: JSON.stringify(config) });

export const secretsPresent = () => invoke<SecretsPresent>("secrets_present");
export const writeSecrets = (secrets: {
  haToken?: SecretEdit;
  anthropicKey?: SecretEdit;
  braveKey?: SecretEdit;
  agentToken?: SecretEdit;
}) =>
  invoke<void>("write_secrets", {
    haToken: secrets.haToken ?? null,
    anthropicKey: secrets.anthropicKey ?? null,
    braveKey: secrets.braveKey ?? null,
    agentToken: secrets.agentToken ?? null,
  });

export const getNetwork = () => invoke<Network>("network");

export const getConnectors = () => invoke<Connector[]>("connectors");
export const connectorAdd = (name: string, url: string, scope: string | null) =>
  invoke<void>("connector_add", { name, url, scope });
export const connectorRemove = (name: string) => invoke<void>("connector_remove", { name });

export const runDoctor = () => invoke<Check[]>("run_doctor");
export const audioDevices = () => invoke<string[]>("audio_devices");

export const setupStatus = () => invoke<Readiness>("setup_status");
export const runSetup = (wakeWord: string | null) => invoke<boolean>("run_setup", { wakeWord });

export const microphoneCheck = (device: string | null) =>
  invoke<Microphone>("microphone_check", { device });
export const openPrivacySettings = () => invoke<void>("open_privacy_settings");

// ------------------------------------------------------------------- events

export const onAgentStatus = (fn: (status: Status) => void): Promise<UnlistenFn> =>
  listen<Status>("agent://status", (event) => fn(event.payload));

export const onAgentLog = (fn: (line: string) => void): Promise<UnlistenFn> =>
  listen<string>("agent://log", (event) => fn(event.payload));

export const onAgentError = (fn: (message: string) => void): Promise<UnlistenFn> =>
  listen<string>("agent://error", (event) => fn(String(event.payload)));

export const onSetupEvent = (fn: (event: SetupEvent) => void): Promise<UnlistenFn> =>
  listen<SetupEvent>("setup://event", (event) => fn(event.payload));

// ------------------------------------------------------------------ helpers

/**
 * ffmpeg names inputs by index and the agent's config wants that index, so a
 * device line like "[0] MacBook Pro Microphone" becomes ":0".
 */
export function deviceValue(line: string, fallback: string): string {
  const index = /^\[(\d+)\]/.exec(line)?.[1];
  return index ? `:${index}` : fallback;
}

/** 24 random bytes as hex, which is what the network token has always been. */
export function mintToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  return [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}
