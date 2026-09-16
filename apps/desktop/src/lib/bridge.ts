/**
 * The Rust side, typed. Every capability the window has lives behind one of
 * these, so a component never reaches for `invoke` itself and a change to a
 * command signature shows up here as a type error rather than at runtime.
 *
 * Most of what the window wants is not the app's at all but Parlour's, and
 * for that there is one command, `parlour(args, stdin)`, which runs the CLI.
 * The typed wrappers below it are the only callers, so the JSON the CLI
 * prints is parsed in exactly one place per command.
 */
import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";

// ------------------------------------------------------------------- shapes

/** Where `parlour` is and whether to start it with the app. The app's only two facts of its own. */
export interface Settings {
  parlourBin: string;
  autostart: boolean;
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

/** What `parlour secrets status --json` prints: which are set, never their values. */
export interface SecretsStatus {
  HA_TOKEN: boolean;
  ANTHROPIC_API_KEY: boolean;
  PARLOUR_TOKEN: boolean;
  BRAVE_API_KEY: boolean;
}

export interface Network {
  /** What to type into a phone, or point Home Assistant at. */
  url: string;
  /** Without a token Parlour answers loopback only. */
  tokenSet: boolean;
  port: number;
}

export interface Microphone {
  granted: boolean;
  detail: string;
}

/** What running the CLI produced. The exit code means what each command says it means. */
interface CliOutput {
  code: number;
  stdout: string;
  stderr: string;
}

/** Which pieces of the install are in place. What the onboarding draws. */
export interface Readiness {
  parlourBin: string;
  parlourVersion: string | null;
  parlourOk: boolean;
  nodeVersion: string | null;
  nodeOk: boolean;
  ffmpeg: boolean;
  /** Whether `parlour init` has written a config yet. */
  config: boolean;
  /** Nothing left for the install step to do. */
  installed: boolean;
}

/** One line of `parlour doctor --json`. */
export interface Check {
  name: string;
  status: "ok" | "warn" | "fail";
  detail: string;
}

/** A remote MCP server the household has signed in to. */
export interface Connector {
  name: string;
  url: string;
  signedIn: boolean;
}

/** One line of `parlour init --porcelain`, or of the CLI install, already labelled. */
export interface SetupEvent {
  kind: "step" | "ok" | "warn" | "fail" | "log" | "done";
  text: string;
}

/**
 * Parlour's own config, as `parlour config show --json` prints it with every
 * default filled in, and as `parlour config write` takes it back. Only the
 * parts the window touches are named; everything else is carried through a
 * read and a write untouched, which is why the index signatures are here.
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
  integrations?: {
    "home-assistant"?: { url?: string; [key: string]: unknown };
    [key: string]: unknown;
  };
  server?: { port?: number; host?: string; [key: string]: unknown };
}

// ----------------------------------------------------------------- commands

export const getSettings = () => invoke<Settings>("get_settings");
export const setSettings = (next: Settings) => invoke<Settings>("set_settings", { next });

export const getStatus = () => invoke<Status>("status");
export const startAgent = () => invoke<void>("start_agent");
export const stopAgent = () => invoke<void>("stop_agent");
export const getLogs = () => invoke<string[]>("logs");

const run = (args: string[], stdin?: string) => invoke<CliOutput>("parlour", { args, stdin: stdin ?? null });

/** The CLI's one-line failure, which it prints last on stderr with a `parlour:` in front. */
function failure(output: CliOutput): string {
  const last = output.stderr
    .split("\n")
    .reverse()
    .find((line) => line.trim() !== "");
  return last ? last.trim().replace(/^parlour: /, "") : `parlour exited ${output.code}`;
}

/** Runs the CLI and resolves with its stdout, or rejects with its one-line failure. */
export async function parlour(args: string[], stdin?: string): Promise<string> {
  const output = await run(args, stdin);
  if (output.code !== 0) throw new Error(failure(output));
  return output.stdout;
}

export const hostName = () => invoke<string>("host_name");
export const audioDevices = () => invoke<string[]>("audio_devices");

export const setupStatus = () => invoke<Readiness>("setup_status");
/** `parlour init`, taking every default. `deps` lets it use Homebrew. */
export const runSetup = (deps: boolean) => invoke<boolean>("run_setup", { deps });
export const installCli = () => invoke<boolean>("install_cli");

export const microphoneCheck = (device: string | null) => invoke<Microphone>("microphone_check", { device });
export const openPrivacySettings = () => invoke<void>("open_privacy_settings");

// -------------------------------------------------------------- through the CLI

export const readConfig = async (): Promise<AgentConfig> =>
  JSON.parse(await parlour(["config", "show", "--json"])) as AgentConfig;

export const writeConfig = async (config: AgentConfig): Promise<void> => {
  await parlour(["config", "write"], JSON.stringify(config));
};

export const secretsStatus = async (): Promise<SecretsStatus> =>
  JSON.parse(await parlour(["secrets", "status", "--json"])) as SecretsStatus;

/** The value goes on stdin, never on the command line. An empty value removes the secret. */
export const setSecret = async (name: keyof SecretsStatus, value: string): Promise<void> => {
  await parlour(["secrets", "set", name], `${value}\n`);
};

/** The doctor exits 1 to say there is something to fix, and its list is what says what. */
export const runDoctor = async (): Promise<Check[]> => {
  const output = await run(["doctor", "--json"]);
  if (!output.stdout.trimStart().startsWith("[")) throw new Error(failure(output));
  return JSON.parse(output.stdout) as Check[];
};

export const getConnectors = async (): Promise<Connector[]> =>
  JSON.parse(await parlour(["connectors", "list", "--json"])) as Connector[];

/**
 * Starts a sign in. The browser opens, Parlour's loopback listener catches the
 * redirect, and the tokens land in the Keychain. This resolves when the sign
 * in is finished, or rejects when the CLI gives up waiting for it.
 */
export const connectorAdd = (name: string, url: string, scope: string | null): Promise<string> =>
  parlour(["connectors", "add", name, url, ...(scope ? [`--scope=${scope}`] : [])]);

export const connectorRemove = async (name: string): Promise<void> => {
  await parlour(["connectors", "remove", name]);
};

/**
 * Where the rest of the house should point. The hostname comes from the
 * machine rather than the config, because that is the part a person has to
 * type into a phone and the part they always get wrong.
 */
export const getNetwork = async (): Promise<Network> => {
  const [config, secrets, host] = await Promise.all([readConfig(), secretsStatus(), hostName()]);
  const port = config.server?.port ?? 8765;
  return { url: `http://${host}:${port}`, tokenSet: secrets.PARLOUR_TOKEN, port };
};

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
 * ffmpeg names inputs by index and Parlour's config wants that index, so a
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
