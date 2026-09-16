# Parlour Extraction Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn `agent/` from the home-assistant repository into `~/Developer/parlour`, a publishable open source voice agent with a provider model, a CLI, tests, CI and a thin desktop app.

**Architecture:** One npm package (`packages/parlour`) holds a pure core (ports, session, router, config), built-in providers behind those ports, integrations (Home Assistant first), the network server and the CLI. The Tauri app (`apps/desktop`) drives the CLI and knows nothing else. nx and pnpm manage the two projects.

**Tech Stack:** TypeScript 5.9 on Node 22 (type stripping for dev, `tsc` for dist), Zod, `node:test`, Biome, pnpm 10, nx, Tauri 2 with React 19 and shadcn/ui, GitHub Actions.

**Spec:** `docs/superpowers/specs/2026-09-16-parlour-extraction-design.md` (copied into the new repo at the same path in Task 1).

## Global Constraints

- Node `>=22`. Dev runs source with `node --experimental-strip-types`; the published package is compiled by `tsc` to `dist/`.
- Relative imports inside `packages/parlour/src` use the `.ts` extension (`allowImportingTsExtensions` + `rewriteRelativeImportExtensions`), `erasableSyntaxOnly`, `verbatimModuleSyntax`, `strict`, `noUncheckedIndexedAccess`. No enums, no parameter properties, no decorators.
- Tests are `*.test.ts` beside the source, run with `node --experimental-strip-types --test "src/**/*.test.ts"`. No test framework dependency.
- Package name `parlour`, desktop package `@parlour/desktop`, product name `Parlour`, bundle id `io.parlour.desktop`, LaunchAgent labels `io.parlour.agent` and `io.parlour.whisper`, Bonjour type `_parlour._tcp`, Keychain service `parlour-connector`, env token `PARLOUR_TOKEN` (fallback `AGENT_TOKEN`), MCP client name `parlour`, model id at `/v1/models` `parlour`.
- Paths: `~/.config/parlour/{config.json,secrets.env,connectors.json}`, `~/Library/Caches/parlour/models/`, `~/Library/Logs/parlour/`. `PARLOUR_HOME` overrides the config directory; `PARLOUR_CONFIG` overrides only the config file.
- Default hostnames in config are `homeassistant.local` and `searxng.local`. `integrations.home-assistant.muteEntity` defaults to `""`.
- Prose (comments, docs, CLI output) is British English with no em dashes. Comments explain why, not what, and match the density of the existing code.
- No references to `stuntdouble`, `home-agent`, `Home Agent`, `@home/agent`, `AGENT_EVENTS`, `agent.config.json` (except in the migration code and its docs), or `.home` hostnames remain in the new repository when done.
- Licence MIT, copyright "Michael Parker".
- Workflow agents do not run `git commit`; the orchestrator commits after each phase. Commit steps below are for a human or inline executor.

---

## Phase 0: the repository (inline, done by the orchestrator)

### Task 1: Create the repository with history

**Files:**
- Create: `~/Developer/parlour/` from `git subtree split -P agent`
- Create: `package.json`, `pnpm-workspace.yaml`, `nx.json`, `biome.json`, `.gitignore`, `.editorconfig`, `.nvmrc`, `LICENSE`
- Move: everything except `desktop/` into `packages/parlour/`; `desktop/` into `apps/desktop/`
- Create: `packages/parlour/project.json`, `apps/desktop/project.json`
- Copy: the spec and this plan into `docs/superpowers/`

- [ ] **Step 1: Split the history**

```bash
cd /Users/mrprkr/Developer/home-assistant/.claude/worktrees/automations-presence-sensing-8ae63c
git subtree split -P agent -b parlour-history
mkdir -p ~/Developer/parlour && cd ~/Developer/parlour && git init -b main
git pull /Users/mrprkr/Developer/home-assistant/.claude/worktrees/automations-presence-sensing-8ae63c parlour-history
git -C /Users/mrprkr/Developer/home-assistant/.claude/worktrees/automations-presence-sensing-8ae63c branch -D parlour-history
```

- [ ] **Step 2: Move into the workspace layout**

```bash
cd ~/Developer/parlour
mkdir -p packages/parlour apps
git mv desktop apps/desktop
for f in $(git ls-files | grep -v '^apps/'); do mkdir -p "packages/parlour/$(dirname "$f")"; git mv "$f" "packages/parlour/$f"; done
git rm -q packages/parlour/pnpm-lock.yaml apps/desktop/pnpm-lock.yaml packages/parlour/pnpm-workspace.yaml apps/desktop/pnpm-workspace.yaml
git mv packages/parlour/.gitignore .gitignore.agent
```

- [ ] **Step 3: Root files**

`package.json`:
```json
{
  "name": "parlour-workspace",
  "private": true,
  "packageManager": "pnpm@10.17.1",
  "engines": { "node": ">=22" },
  "scripts": {
    "build": "nx run-many -t build",
    "typecheck": "nx run-many -t typecheck",
    "lint": "nx run-many -t lint",
    "test": "nx run-many -t test",
    "check": "nx run-many -t typecheck lint test",
    "version:set": "node scripts/set-version.mjs"
  },
  "devDependencies": { "@biomejs/biome": "^2.2.0", "nx": "^21.5.0" }
}
```

`pnpm-workspace.yaml` (carry the `allowBuilds`/`onlyBuiltDependencies` block from the old file, with its comment):
```yaml
packages:
  - packages/*
  - apps/*
```

`nx.json`:
```json
{
  "$schema": "./node_modules/nx/schemas/nx-schema.json",
  "targetDefaults": {
    "build": { "dependsOn": ["^build"], "cache": true, "outputs": ["{projectRoot}/dist"] },
    "typecheck": { "cache": true },
    "lint": { "cache": true },
    "test": { "cache": true }
  },
  "defaultBase": "main"
}
```

`biome.json`:
```json
{
  "$schema": "https://biomejs.dev/schemas/2.2.0/schema.json",
  "files": { "includes": ["packages/**", "apps/desktop/src/**", "scripts/**", "!**/dist", "!**/node_modules", "!**/target"] },
  "formatter": { "indentStyle": "space", "lineWidth": 110 },
  "linter": { "rules": { "recommended": true, "style": { "noNonNullAssertion": "off" } } },
  "javascript": { "formatter": { "quoteStyle": "double" } }
}
```

`.gitignore`: `node_modules/`, `dist/`, `.nx/`, `target/`, `*.log`, `.env`, `.DS_Store`, `apps/desktop/src-tauri/gen/`, `apps/desktop/src-tauri/icons/` (check what the old two `.gitignore`s excluded and merge them; then delete `.gitignore.agent`).

`.nvmrc`: `22`. `.editorconfig`: 2 spaces, LF, final newline. `LICENSE`: MIT, "Copyright (c) 2026 Michael Parker".

`packages/parlour/project.json`:
```json
{ "name": "parlour", "projectType": "library", "sourceRoot": "packages/parlour/src",
  "targets": {
    "build": { "command": "pnpm run build", "options": { "cwd": "packages/parlour" } },
    "typecheck": { "command": "pnpm run typecheck", "options": { "cwd": "packages/parlour" } },
    "lint": { "command": "biome check .", "options": { "cwd": "packages/parlour" } },
    "test": { "command": "pnpm run test", "options": { "cwd": "packages/parlour" } } } }
```
`apps/desktop/project.json` the same shape with `build` = `pnpm run build:ui`, `typecheck`, `lint` = `biome check src`, and `cargo-check` = `cargo check --manifest-path src-tauri/Cargo.toml`.

- [ ] **Step 4: Rename the packages**

`packages/parlour/package.json`: name `parlour`, version `0.1.0`, `private` removed, description "A local-first voice agent for the house: wake word, speech to text, a local model with tools, and a cloud model behind it", `license: "MIT"`, `bin: { "parlour": "dist/cli/main.js" }`, `files: ["dist", "web", "README.md", "LICENSE"]`, `exports: { ".": "./dist/index.js", "./testing": "./dist/testing/index.js" }`, scripts:
```json
{
  "dev": "node --experimental-strip-types --watch src/cli/main.ts start",
  "build": "tsc -p tsconfig.build.json && cp -R src/server/web dist/server/web",
  "typecheck": "tsc --noEmit",
  "test": "node --experimental-strip-types --test \"src/**/*.test.ts\"",
  "lint": "biome check ."
}
```
Add `tsconfig.build.json` extending `tsconfig.json` with `noEmit: false`, `outDir: dist`, `declaration: true`, `exclude: ["src/**/*.test.ts"]`, and `rewriteRelativeImportExtensions: true` so `.ts` imports become `.js` in dist.
`apps/desktop/package.json`: name `@parlour/desktop`. `Cargo.toml`: name `parlour-desktop`, description "Menu bar app for Parlour". `tauri.conf.json`: productName `Parlour`, identifier `io.parlour.desktop`, window title `Parlour`, shortDescription "Parlour, and the switch that starts it".

- [ ] **Step 5: Install, check, commit**

```bash
cd ~/Developer/parlour && pnpm install && pnpm -C packages/parlour typecheck && pnpm -C apps/desktop typecheck
mkdir -p docs/superpowers/specs docs/superpowers/plans && cp <spec> docs/superpowers/specs/ && cp <plan> docs/superpowers/plans/
git add -A && git commit -m "Move the agent into a workspace and call it Parlour"
```

---

## Phase 1: the foundation (two tasks, parallel)

### Task 2: Ports, provider registry, paths, secrets

**Files:**
- Create: `packages/parlour/src/core/types.ts` (moved from `src/llm/types.ts`, unchanged)
- Create: `packages/parlour/src/core/registry.ts` (moved from `src/tools/registry.ts`, unchanged)
- Create: `packages/parlour/src/core/logger.ts` (moved from `src/logger.ts`)
- Create: `packages/parlour/src/core/events.ts`
- Create: `packages/parlour/src/core/ports.ts`
- Create: `packages/parlour/src/core/providers.ts`, `providers.test.ts`
- Create: `packages/parlour/src/core/paths.ts`, `paths.test.ts`
- Create: `packages/parlour/src/core/secrets.ts`, `secrets.test.ts`
- Delete: `src/llm/types.ts`, `src/tools/registry.ts`, `src/logger.ts`, `src/events.ts` (leave other old files in place; later tasks move them)

**Interfaces produced:**

`core/ports.ts`:
```ts
import type { Completion, Message, ToolSpec } from "./types.ts";
import type { Tool } from "./registry.ts";

export interface Check { name: string; status: "ok" | "warn" | "fail"; detail: string }
export interface Diagnosable { doctor?(): Promise<Check[]> }

export interface AudioSource extends Diagnosable { frames(signal?: AbortSignal): AsyncIterable<Int16Array>; close(): void }
export interface AudioSink extends Diagnosable { play(wav: Buffer, signal?: AbortSignal): Promise<void>; stop(): void }
export interface WakeWordDetector { push(frame: Int16Array): Promise<string | null>; reset(): void }
export interface WakeWordEngine extends Diagnosable { load(): Promise<void>; detector(label: string): WakeWordDetector }
export interface SpeechToText extends Diagnosable { transcribe(wav: Buffer): Promise<string> }
export interface TextToSpeech extends Diagnosable { warm(): Promise<void>; render(text: string): Promise<Buffer> }
export interface ChatModel extends Diagnosable { readonly label: string; complete(messages: Message[], tools: ToolSpec[]): Promise<Completion> }
export interface SearchResult { title: string; url: string; snippet: string }
export interface SearchProvider extends Diagnosable { search(query: string, max: number): Promise<SearchResult[]> }
export interface SecretStore { get(key: string): Promise<string | null>; set(key: string, value: string): Promise<void>; delete(key: string): Promise<void> }
export interface ServiceSpec { label: string; what: string; program: string[]; env: Record<string, string>; logPath: string }
export interface ServiceState { label: string; what: string; installed: boolean; running: boolean; pid: number | null; lastExit: number | null; logPath: string }
export interface ServiceManager {
  install(specs: ServiceSpec[]): Promise<ServiceState[]>;
  uninstall(labels: string[]): Promise<string[]>;
  restart(specs: ServiceSpec[]): Promise<ServiceState[]>;
  status(specs: Pick<ServiceSpec, "label" | "what" | "logPath">[]): Promise<ServiceState[]>;
  tail(logPath: string, lines: number): Promise<string>;
}
export interface Integration extends Diagnosable {
  readonly name: string;
  tools(): Promise<Tool[]>;
  promptContext?(): string[];
  /** True means ignore this wake. Asked after the wake word, before anything is acted on. */
  gate?(): Promise<boolean>;
  close?(): Promise<void>;
}
```

`core/providers.ts`:
```ts
import type { z } from "zod";
export type ProviderKind = "audioSource" | "audioSink" | "wake" | "stt" | "tts" | "llm" | "search" | "secrets" | "service" | "integration";
export interface ProviderContext { paths: Paths; secrets: Secrets; log: Logger; emit: (event: AgentEvent) => void; /** The whole config, for providers that need more than their own slice. */ config: unknown }
export interface ProviderDefinition<T = unknown> {
  kind: ProviderKind; name: string; description: string;
  /** Validates the provider's own slice of config. Defaults to "anything". */
  schema?: z.ZodType; 
  create(options: unknown, context: ProviderContext): T | Promise<T>;
}
export function defineProvider<T>(definition: ProviderDefinition<T>): ProviderDefinition<T>
export function registerProvider(definition: ProviderDefinition): void   // throws on duplicate (kind, name)
export function registeredProviders(kind?: ProviderKind): ProviderDefinition[]
export function clearProviders(): void   // tests only
export class UnknownProviderError extends Error { constructor(kind: ProviderKind, name: string, available: string[]) }
export async function resolveProvider<T>(kind: ProviderKind, name: string, options: unknown, context: ProviderContext): Promise<T>
```
`resolveProvider` looks up `(kind, name)`; if missing and `name` contains no `/`-traversal (`..`) it does `await import(name)` and accepts `mod.default` when `mod.default.kind === kind`; registers it; otherwise throws `UnknownProviderError`. Options are parsed with `definition.schema?.parse(options) ?? options` before `create`.

`core/paths.ts`:
```ts
export interface Paths { home: string; configFile: string; secretsFile: string; connectorsFile: string; cacheDir: string; modelsDir: string; logsDir: string }
export function resolvePaths(env: NodeJS.ProcessEnv = process.env, platform: NodeJS.Platform = process.platform): Paths
```
`home` = `env.PARLOUR_HOME ?? join(homedir(), ".config", "parlour")`. `configFile` = `env.PARLOUR_CONFIG ?? join(home, "config.json")`. `cacheDir` = darwin: `~/Library/Caches/parlour`, else `${XDG_CACHE_HOME ?? ~/.cache}/parlour`. `modelsDir` = `join(cacheDir, "models")`. `logsDir` = darwin: `~/Library/Logs/parlour`, else `${XDG_STATE_HOME ?? ~/.local/state}/parlour/logs`.

`core/secrets.ts`:
```ts
export interface Secrets { haToken?: string; anthropicKey?: string; braveKey?: string; token?: string; logLevel?: string }
export function parseEnvFile(text: string): Record<string, string>   // KEY=value, # comments, optional quotes, no interpolation
export function loadSecrets(paths: Paths, env: NodeJS.ProcessEnv = process.env): Secrets   // file first, env overrides; token = PARLOUR_TOKEN ?? AGENT_TOKEN
export function writeSecret(paths: Paths, key: string, value: string | null): void   // rewrites secrets.env preserving other keys and comments, mode 0o600; null deletes
```

`core/events.ts`: same `AgentEvent` union as before plus `enableEvents(): void`; `emit` is a no-op until enabled.

- [ ] **Step 1: Write the failing tests**

`providers.test.ts`:
```ts
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { clearProviders, defineProvider, registerProvider, resolveProvider, registeredProviders, UnknownProviderError } from "./providers.ts";
import { z } from "zod";

const context = { paths: {} as never, secrets: {}, log: console as never, emit: () => {}, config: {} };
beforeEach(() => clearProviders());

test("a registered provider is created with parsed options", async () => {
  registerProvider(defineProvider({ kind: "stt", name: "fake", description: "", schema: z.object({ url: z.string().default("x") }), create: (o) => ({ options: o }) }));
  const made = await resolveProvider<{ options: unknown }>("stt", "fake", {}, context);
  assert.deepEqual(made.options, { url: "x" });
});
test("duplicate registration throws", () => {
  const def = defineProvider({ kind: "tts", name: "dup", description: "", create: () => ({}) });
  registerProvider(def);
  assert.throws(() => registerProvider(def), /already registered/);
});
test("an unknown name that is not importable names the alternatives", async () => {
  registerProvider(defineProvider({ kind: "tts", name: "kokoro", description: "", create: () => ({}) }));
  await assert.rejects(resolveProvider("tts", "nope-not-a-package", {}, context), (e: unknown) => e instanceof UnknownProviderError && /kokoro/.test((e as Error).message));
});
test("registeredProviders filters by kind", () => {
  registerProvider(defineProvider({ kind: "tts", name: "a", description: "", create: () => ({}) }));
  registerProvider(defineProvider({ kind: "stt", name: "b", description: "", create: () => ({}) }));
  assert.deepEqual(registeredProviders("stt").map((p) => p.name), ["b"]);
});
```

`paths.test.ts`:
```ts
test("defaults on darwin", () => {
  const p = resolvePaths({ HOME: "/Users/x" }, "darwin");
  assert.equal(p.configFile, "/Users/x/.config/parlour/config.json");
  assert.equal(p.modelsDir, "/Users/x/Library/Caches/parlour/models");
  assert.equal(p.logsDir, "/Users/x/Library/Logs/parlour");
});
test("PARLOUR_HOME moves config, secrets and connectors but not the cache", () => {
  const p = resolvePaths({ HOME: "/Users/x", PARLOUR_HOME: "/srv/parlour" }, "darwin");
  assert.equal(p.secretsFile, "/srv/parlour/secrets.env");
  assert.equal(p.connectorsFile, "/srv/parlour/connectors.json");
  assert.equal(p.cacheDir, "/Users/x/Library/Caches/parlour");
});
test("PARLOUR_CONFIG overrides only the config file", () => {
  const p = resolvePaths({ HOME: "/Users/x", PARLOUR_CONFIG: "/tmp/c.json" }, "darwin");
  assert.equal(p.configFile, "/tmp/c.json");
  assert.equal(p.secretsFile, "/Users/x/.config/parlour/secrets.env");
});
test("linux follows XDG", () => {
  const p = resolvePaths({ HOME: "/home/x", XDG_CACHE_HOME: "/c" }, "linux");
  assert.equal(p.modelsDir, "/c/parlour/models");
});
```
Note: `resolvePaths` must read `HOME` from the `env` argument, not `os.homedir()`, so tests can control it.

`secrets.test.ts` (use `mkdtempSync` in `os.tmpdir()`):
```ts
test("parseEnvFile handles comments, quotes and blanks", () => {
  assert.deepEqual(parseEnvFile('# c\nA=1\nB="two words"\n\nC=\'x\'\n'), { A: "1", B: "two words", C: "x" });
});
test("env overrides file, and AGENT_TOKEN is the fallback for PARLOUR_TOKEN", () => {
  writeFileSync(paths.secretsFile, "HA_TOKEN=file\nAGENT_TOKEN=old\n");
  const s = loadSecrets(paths, { HA_TOKEN: "env" });
  assert.equal(s.haToken, "env"); assert.equal(s.token, "old");
  assert.equal(loadSecrets(paths, { PARLOUR_TOKEN: "new" }).token, "new");
});
test("writeSecret keeps other lines and sets mode 600", () => {
  writeFileSync(paths.secretsFile, "# keep\nA=1\n");
  writeSecret(paths, "B", "2"); writeSecret(paths, "A", null);
  assert.equal(readFileSync(paths.secretsFile, "utf8"), "# keep\nB=2\n");
  assert.equal(statSync(paths.secretsFile).mode & 0o777, 0o600);
});
```

- [ ] **Step 2: Run, see them fail** — `pnpm -C packages/parlour test` fails with module not found.
- [ ] **Step 3: Implement** the four modules per the interfaces above. Move `types.ts`, `registry.ts`, `logger.ts` into `core/` with `git mv`; fix nothing else yet (old files keep importing the old paths; they are deleted in later tasks, and typecheck for the package as a whole is only required to pass again at the end of Phase 3). To keep `pnpm test` green meanwhile, the test script only picks up `*.test.ts`, which is fine.
- [ ] **Step 4: Run tests, pass.**
- [ ] **Step 5: Commit** `feat(core): ports, provider registry, paths and secrets`.

### Task 3: Configuration schema and migration

**Files:**
- Create: `packages/parlour/src/core/config.ts`, `config.test.ts`
- Create: `packages/parlour/src/core/migrate.ts`, `migrate.test.ts`
- Delete: `packages/parlour/src/config.ts`, `agent.config.example.json`, `.env.example`
- Create: `packages/parlour/config.example.json`, `packages/parlour/secrets.example.env`

**Interfaces produced:**
```ts
// core/config.ts
export const ProviderSlice = z.object({ provider: z.string() }).passthrough();
export const ConfigSchema = z.object({
  name: z.string().default("Parlour"),
  locale: z.string().default("en-GB"),
  role: z.enum(["server", "satellite"]).default("server"),
  audio: z.object({ source: z.string().default("ffmpeg"), sink: z.string().default("afplay"), inputDevice: z.string().default(":0"), outputDevice: z.string().optional(), sampleRate: z.literal(16000).default(16000), silenceMs: ..., maxUtteranceMs: ..., silenceThreshold: ..., bargeIn: ... }).default({}),
  wake: ProviderSlice.extend({ provider: z.string().default("openwakeword"), words: z.array(z.string()).default(["hey_jarvis"]), threshold: ..., refractoryMs: ... }).default({}),
  stt: ProviderSlice.extend({ provider: z.string().default("whisper-cpp") }).default({}),
  tts: ProviderSlice.extend({ provider: z.string().default("kokoro"), fallback: z.string().nullable().default("macos-say"), voice: z.string().default("bf_emma"), speed: z.number().positive().default(1) }).default({}),
  llm: z.object({
    local: ProviderSlice.extend({ provider: z.string().default("openai-compatible") }).default({}),
    cloud: ProviderSlice.extend({ provider: z.string().default("anthropic"), enabled: z.boolean().default(true), onLocalFailure: z.boolean().default(true) }).default({}),
    maxToolRounds: z.number().int().positive().default(6),
  }).default({}),
  search: ProviderSlice.extend({ provider: z.string().default("searxng"), maxResults: z.number().int().positive().default(5) }).default({}),
  integrations: z.record(z.unknown()).default({ "home-assistant": {} }),
  server: (as before), discovery: (as before), satellite: (as before),
});
export type Config = z.infer<typeof ConfigSchema>;
export function parseConfig(raw: unknown): Config;
export function loadConfig(paths: Paths): { config: Config; raw: Record<string, unknown>; exists: boolean }; // missing file = defaults
export function writeConfig(paths: Paths, config: Record<string, unknown>): void;  // pretty JSON, mkdir -p
```
Provider-specific keys (`url`, `baseUrl`, `model`, `voice`...) pass through `ProviderSlice` and are validated by each provider's own schema in Task 4-6. `integrations` is a record so an integration can be any npm package; each integration parses its own slice.

```ts
// core/migrate.ts
export function isLegacyConfig(raw: unknown): boolean;  // has "homeAssistant" or "mcpServers" or "connectorsFile" or tts.engine
export function migrateLegacyConfig(raw: Record<string, unknown>): Record<string, unknown>;
export function migrateLegacyEnv(text: string): string;  // AGENT_TOKEN= -> PARLOUR_TOKEN=
```
Migration rules: `homeAssistant.baseUrl` -> `integrations["home-assistant"].url`; `homeAssistant.useMcp` -> `.mcp`; `muteEntity` -> `integrations["home-assistant"].muteEntity`; `mcpServers` -> `integrations.mcp.servers`; `connectorsFile` dropped; `search.searxngUrl` -> `search.url`; `tts.engine: "say"` -> `tts.provider: "macos-say"`, `"kokoro"` -> `"kokoro"`; `wake.modelDir` dropped; every provider slice gains its default `provider` if absent.

- [ ] **Step 1: Tests**

```ts
test("an empty object is a complete config", () => {
  const c = parseConfig({});
  assert.equal(c.tts.provider, "kokoro"); assert.equal(c.tts.fallback, "macos-say");
  assert.deepEqual(Object.keys(c.integrations), ["home-assistant"]);
});
test("provider slices keep unknown keys", () => {
  assert.equal((parseConfig({ stt: { url: "http://x" } }).stt as { url?: string }).url, "http://x");
});
test("loadConfig without a file returns defaults and exists=false", ...);
test("migrateLegacyConfig moves the house into an integration", () => {
  const out = migrateLegacyConfig({ homeAssistant: { baseUrl: "http://h:8123", useMcp: false }, muteEntity: "input_boolean.m", mcpServers: { a: { transport: "stdio", command: "x" } }, search: { provider: "searxng", searxngUrl: "http://s" }, tts: { engine: "say", voice: "Daniel" }, connectorsFile: "connectors.json" });
  assert.deepEqual(out.integrations, { "home-assistant": { url: "http://h:8123", mcp: false, muteEntity: "input_boolean.m" }, mcp: { servers: { a: { transport: "stdio", command: "x" } } } });
  assert.equal((out.search as { url: string }).url, "http://s");
  assert.equal((out.tts as { provider: string }).provider, "macos-say");
  assert.equal("connectorsFile" in out, false);
  assert.doesNotThrow(() => parseConfig(out));
});
test("migrateLegacyEnv renames the token", () => { assert.equal(migrateLegacyEnv("AGENT_TOKEN=abc\nHA_TOKEN=x\n"), "PARLOUR_TOKEN=abc\nHA_TOKEN=x\n"); });
```
- [ ] **Step 2: Run, fail. Step 3: Implement. Step 4: Pass.**
- [ ] **Step 5:** Write `config.example.json` (the spec's example, exactly) and `secrets.example.env` (the old `.env.example` with `AGENT_TOKEN` renamed, `openssl rand -hex 24` kept, and the "copy to" line pointing at `~/.config/parlour/secrets.env`).
- [ ] **Step 6: Commit** `feat(core): config schema and legacy migration`.

---

## Phase 2: providers and integrations (five tasks, parallel; each consumes Tasks 2 and 3)

Every provider file ends with `registerProvider(defineProvider({...}))` and the aggregate `src/providers/index.ts` (created in Task 8) imports them all for side effects. Each task creates its own files only; do not touch `src/providers/index.ts` (Task 8 owns it).

### Task 4: Audio and wake word providers

**Files:**
- Create: `src/providers/audio/ffmpeg.ts` (from `src/audio/capture.ts` class `Microphone`), `src/providers/audio/afplay.ts` (from `src/tts/play.ts`), `src/core/audio.ts` (`FRAME_SAMPLES`, `FRAME_MS`, `rms`, `toWav`, `wavToFrames`, `decodeToWav` from `src/audio/decode.ts`), `src/core/endpoint.ts` (moved), `src/core/endpoint.test.ts`, `src/providers/wake/openwakeword.ts` (from `src/audio/wake.ts`)
- Delete: `src/audio/*`, `src/tts/play.ts`

**Produces:**
- `ffmpeg`: `kind: "audioSource"`, schema `{ inputDevice: string = ":0", sampleRate: 16000 }`, `create` returns `AudioSource`; `doctor()` checks `ffmpeg` on PATH ("brew install ffmpeg. It is how the microphone is read.").
- `afplay`: `kind: "audioSink"`, `create` returns `AudioSink` whose `play` writes a temp WAV and runs `afplay`, `stop` kills it. `doctor()` checks `afplay` exists.
- `openwakeword`: `kind: "wake"`, schema `{ words: string[], threshold, refractoryMs }`, uses `context.paths.modelsDir + "/openwakeword"`. `create` returns `WakeWordEngine` where `load()` opens the sessions and `detector(label)` returns the existing `WakeWord` class (which already satisfies `WakeWordDetector`). `doctor()` reports which of `melspectrogram.onnx`, `embedding_model.onnx` and each `${word}.onnx` is missing, detail "parlour models fetch".
- `core/audio.ts` exports `FRAME_SAMPLES = 1280`, `FRAME_MS = 80`, `rms`, `toWav`, `wavToFrames`, `decodeToWav`.

- [ ] **Step 1: Endpointer tests** (pure, no hardware):
```ts
const loud = () => new Int16Array(1280).fill(3000); const quiet = () => new Int16Array(1280);
test("gives up on leading silence", () => { const e = new Endpointer({ frameMs: 80, silenceMs: 800, maxUtteranceMs: 15000, silenceThreshold: 0.012, leadingSilenceMs: 240 }); assert.equal(e.push(quiet()), "listening"); assert.equal(e.push(quiet()), "listening"); assert.equal(e.push(quiet()), "empty"); });
test("finishes after speech then silence", () => { ...loud x2 then quiet x10 -> "done", frames.length === 12 });
test("caps the utterance", () => { ...loud forever -> "done" at maxUtteranceMs });
```
- [ ] **Step 2-4:** move, adapt, pass. `toWav`/`wavToFrames` get a round-trip test in `core/audio.test.ts`.
- [ ] **Step 5: Commit** `feat(providers): ffmpeg, afplay and openWakeWord behind ports`.

### Task 5: Speech providers and the speaker

**Files:**
- Create: `src/providers/stt/whisper-cpp.ts` (from `src/stt/whisper.ts`), `src/providers/tts/kokoro.ts` (from `src/tts/kokoro.ts`), `src/providers/tts/macos-say.ts` (from `src/tts/say.ts`), `src/core/speaker.ts`, `src/core/speaker.test.ts`, `src/core/text.ts` (`sentences`, `speakable`, `isNoise`), `src/core/text.test.ts`
- Delete: `src/stt/*`, `src/tts/*`

**Produces:**
- `whisper-cpp`: `kind: "stt"`, schema `{ url = "http://127.0.0.1:8910/inference", language = "en", timeoutMs = 20000 }` -> `SpeechToText`. `doctor()` GETs the url minus `/inference`; fail detail "`${url}`. Start it with parlour service install, or whisper-server by hand."
- `kokoro`: `kind: "tts"`, schema `{ voice = "bf_emma", speed = 1 }` -> `TextToSpeech`; `warm()` loads the model; `render` throws on failure (no fallback inside).
- `macos-say`: `kind: "tts"`, schema `{ voice?: string, speed = 1 }` -> `TextToSpeech`; `render` uses `say -o` to AIFF then `decodeToWav`. If given a Kokoro-style voice id (`isKokoroVoiceId`), use the system default voice.
- `core/speaker.ts`:
```ts
export class FallbackTextToSpeech implements TextToSpeech { constructor(primary: TextToSpeech, fallback: TextToSpeech, log: Logger); warm(); render(text) /* primary, on throw warn once and use fallback, keep retrying primary next time */ }
export class Speaker { constructor(tts: TextToSpeech, sink: AudioSink); say(text: string, signal?: AbortSignal): Promise<void> /* sentences(), render each, play each, abortable */; stop(): void; isSpeaking(): boolean }
```
- `core/text.ts`: `sentences`, `speakable`, `isNoise` exactly as they are now.

- [ ] **Step 1: Tests**
```ts
// text.test.ts
test("sentences glues short fragments", () => assert.deepEqual(sentences("Yes. The kitchen light is on and the heating is set to twenty one."), ["Yes. The kitchen light is on and the heating is set to twenty one."]));
test("sentences splits long replies", () => assert.equal(sentences("First sentence that is comfortably long enough on its own. Second sentence that is also long enough to stand.").length, 2));
test("speakable strips markdown", () => assert.equal(speakable("**Done.** See `light.kitchen`"), "Done. See light.kitchen"));
test("isNoise catches whisper hallucinations", () => { assert.ok(isNoise("[BLANK_AUDIO]")); assert.ok(isNoise(" Thank you. ")); assert.ok(!isNoise("turn on the light")); });
// speaker.test.ts with fakes
test("FallbackTextToSpeech uses the fallback when the primary throws, and retries the primary", async () => { let calls = 0; const primary = { warm: async () => {}, render: async () => { calls++; throw new Error("no") } }; const fallback = { warm: async () => {}, render: async () => Buffer.from("f") }; const tts = new FallbackTextToSpeech(primary, fallback, silentLog); assert.equal((await tts.render("a")).toString(), "f"); await tts.render("b"); assert.equal(calls, 2); });
test("Speaker plays one sentence per render and stops on abort", async () => { const played: string[] = []; const sink = { play: async (w: Buffer) => { played.push(w.toString()) }, stop: () => {} }; const tts = { warm: async () => {}, render: async (t: string) => Buffer.from(t) }; const s = new Speaker(tts, sink); await s.say("A long enough first sentence to stand alone here ok. Second long enough sentence to stand alone here too."); assert.equal(played.length, 2); });
```
- [ ] **Step 2-4:** implement, pass. **Step 5: Commit** `feat(providers): whisper.cpp, Kokoro and say behind ports; speaker in core`.

### Task 6: Language model and search providers, the loop and the router

**Files:**
- Create: `src/providers/llm/openai-compatible.ts`, `src/providers/llm/anthropic.ts`, `src/providers/search/searxng.ts`, `src/providers/search/brave.ts`, `src/core/loop.ts` (moved), `src/core/loop.test.ts`, `src/core/router.ts` (moved, constructor changed), `src/core/router.test.ts`, `src/core/prompt.ts` (moved), `src/core/search.ts` (`searchTool(provider: SearchProvider, max: number): Tool`)
- Delete: `src/llm/*`, `src/tools/websearch.ts`, `src/prompt.ts`

**Produces:**
- `openai-compatible`: `kind: "llm"`, schema `{ baseUrl = "http://127.0.0.1:1234/v1", model = "qwen3-8b-mlx", temperature = 0.3, timeoutMs = 30000, apiKeyEnv?: string }` -> `ChatModel`. `doctor()` GETs `/models`, detail lists served ids vs configured (as the old doctor did).
- `anthropic`: `kind: "llm"`, schema `{ model = "claude-opus-5", maxTokens = 1024, webSearch = true }`, takes the key from `context.secrets.anthropicKey`; `create` throws `Error("ANTHROPIC_API_KEY is not set")` if missing. `doctor()` warns when no key.
- `searxng`: `kind: "search"`, schema `{ url = "http://searxng.local:8080" }`; `brave`: schema `{}` and `context.secrets.braveKey`, throws if missing. Both return `SearchProvider`.
- `core/prompt.ts`: `systemPrompt(name: string, extra: string[]): string` (drops the `Config` parameter), `ESCALATE_TOOL`, `escalateSpec` unchanged.
- `core/router.ts`:
```ts
export interface RouterOptions { name: string; local: ChatModel; cloud: ChatModel | null; registry: ToolRegistry; maxToolRounds: number; onLocalFailure: boolean; promptContext?: () => string[] }
export class Router { constructor(options: RouterOptions); ask(text, { session?, room? }): Promise<Answer>; reset(key?) }
```
- `core/search.ts`: `searchTool(provider, maxResults)` returns the `web_search` tool with the same description and formatting as before.

- [ ] **Step 1: Tests** using a `FakeChatModel` (define inline for now; Task 9 moves it to `src/testing/`):
```ts
class FakeChatModel implements ChatModel { label = "fake"; constructor(private script: Completion[]) {} async complete() { const next = this.script.shift(); if (!next) throw new Error("script exhausted"); return next; } }
test("runTurn runs tools until the model stops calling them", async () => { const registry = new ToolRegistry().add(defineTool("t", "", { type: "object" }, async () => "ran")); const model = new FakeChatModel([{ text: "", toolCalls: [{ id: "1", name: "t", args: {} }] }, { text: "done", toolCalls: [] }]); const r = await runTurn({ model, messages: [], tools: [], registry, maxRounds: 3, allowEscalation: false }); assert.equal(r.text, "done"); assert.equal(r.messages.filter((m) => m.role === "tool").length, 1); });
test("runTurn stops at the round limit with the apology", ...);
test("runTurn returns escalateTo when the local model asks", ...);
test("Router answers locally and remembers history per session", ...);
test("Router escalates to the cloud model with the rewritten question", ...);
test("Router falls back to cloud when local throws and onLocalFailure", ...);
test("Router says so when local throws and there is no cloud", ...);
test("Router forgets a session after CONTEXT_TTL", ...);  // inject a clock: RouterOptions gets `now?: () => number`
```
- [ ] **Step 2-4** implement, pass. **Step 5: Commit** `feat(core): router and loop over ChatModel ports; llm and search providers`.

### Task 7: Integrations and the secret store

**Files:**
- Create: `src/integrations/home-assistant/index.ts`, `index.test.ts`; `src/integrations/mcp/index.ts` (from `src/tools/mcp.ts`: `McpTools` class stays, plus the integration definition reading `servers`), `src/integrations/connectors/{index,store,oauth,cli}.ts` (moved; `cli.ts` becomes a library `addConnector/listConnectors/removeConnector` used by Task 11), `src/providers/secrets/macos-keychain.ts`, `src/providers/secrets/file.ts`, `src/providers/secrets/index.ts` exporting `pickSecretStore(paths): SecretStore`
- Delete: `src/tools/mcp.ts`, `src/tools/homeassistant.ts`, `src/connectors/*`

**Produces:**
- `home-assistant` integration: `kind: "integration"`, schema `{ url = "http://homeassistant.local:8123", mcp = true, rest = true, muteEntity = "" }`. `create(options, ctx)` returns `Integration` with `tools()` = MCP tools from `${url}/mcp_server/sse` with `ctx.secrets.haToken` (when `mcp`) plus `ha_get_state` and `ha_call_service` (when `rest`); returns `[]` with a warning when no token. `gate()` returns `false` when `muteEntity` is empty; otherwise `isOn(muteEntity)`, emitting `{ type: "muted" }` when true. `promptContext()` = `["The house is controlled through tools. Use them rather than guessing what is on."]`. `doctor()`: token present; `${url}/api/` reachable with the token; MCP endpoint answers (when `mcp`).
  The HTTP calls go through an injectable `fetch` (`options.fetch ?? globalThis.fetch`) so the gate is testable.
- `mcp` integration: schema `{ servers: z.record(McpServer) }` (the `McpServer` union moves here). `close()` closes clients.
- `connectors` integration: reads `ctx.paths.connectorsFile`, uses `pickSecretStore`, same behaviour as `connectorTools`.
- `macos-keychain` `SecretStore` (`security add/find/delete-generic-password`, service `parlour-connector`); `file` `SecretStore` (`<home>/connector-secrets/<key>`, mode 600). `pickSecretStore` returns keychain when `security` is on PATH and platform is darwin.
- MCP client name `parlour`, version from `package.json`.

- [ ] **Step 1: Tests**
```ts
test("gate is off when muteEntity is empty", async () => { const i = await createHomeAssistant({ muteEntity: "" }, ctxWith({ haToken: "t" }, fetchNever)); assert.equal(await i.gate!(), false); });
test("gate reads the entity and emits muted", async () => { const events: AgentEvent[] = []; const fetch = async () => new Response(JSON.stringify({ state: "on", attributes: {} })); const i = await createHomeAssistant({ muteEntity: "input_boolean.m" }, ctxWith({ haToken: "t" }, fetch, (e) => events.push(e))); assert.equal(await i.gate!(), true); assert.deepEqual(events.map((e) => e.type), ["muted"]); });
test("gate fails open when the house is unreachable", ...);
test("without a token there are no tools and no throw", ...);
test("rest tools are named ha_get_state and ha_call_service", ...); // with rest: true, mcp: false
```
- [ ] **Step 2-4** implement, pass. **Step 5: Commit** `feat(integrations): Home Assistant, MCP servers and connectors as integrations`.

### Task 8: Service manager, timers, providers index

**Files:**
- Create: `src/providers/service/launchd.ts` (from `src/service.ts`), `src/providers/service/index.ts` exporting `pickServiceManager(): ServiceManager` (launchd on darwin, otherwise an object whose every method throws `Error("Services are only supported on macOS so far. A systemd provider would be a welcome contribution.")`), `src/core/timers.ts` (moved), `src/core/timers.test.ts`, `src/core/services.ts` (`serviceSpecs(config, paths, parlourBin: string): Promise<ServiceSpec[]>` building the agent spec `[parlourBin, "start"]` with `PARLOUR_HOME` in env, and the whisper spec when role is server and `whisper-server` plus a model in `paths.modelsDir/whisper` exist), `src/providers/index.ts` (imports every provider and integration module for side effects, in a fixed order), `src/index.ts` (public API: re-exports from `core/ports.ts`, `core/providers.ts`, `core/config.ts`, `core/paths.ts`, `core/registry.ts`, `core/types.ts`, `core/events.ts`)
- Delete: `src/service.ts`

`launchd` implements `ServiceManager` with the same plist content as today (`KeepAlive` SuccessfulExit false/Crashed true, `ThrottleInterval` 10, `ProcessType` Interactive, spelled out PATH), labels from `ServiceSpec.label`, logs at `spec.logPath`, rotation at 8 MB on install.

- [ ] **Step 1: Timers test** (`set_timer` then a fake clock fires `announce`; `list_timers`; `cancel_timer`). Timers get an injectable `setTimeout` via constructor option for the test.
- [ ] **Step 2-4** implement, pass. **Step 5: Commit** `feat: launchd service manager, timers, provider index`.

---

## Phase 3: assembly, server, CLI (sequential: 9, then 10 and 11 in parallel)

### Task 9: VoiceSession, the agent assembly, the testing fakes

**Files:**
- Create: `src/core/session.ts` (from `src/voice/session.ts`), `session.test.ts`, `src/core/agent.ts`, `agent.test.ts`, `src/testing/index.ts` (`FakeChatModel`, `FakeSpeechToText`, `FakeTextToSpeech`, `FakeAudioSink`, `FakeWakeWordEngine` (fires on frames whose first sample is `-1`), `silentLogger`)
- Delete: `src/voice/*`, `src/index.ts` old wiring (replaced by `core/agent.ts` and Task 11's CLI)

**Produces:**
```ts
// core/session.ts
export interface VoiceSessionOptions { audio: Config["audio"]; router: Router; wake: WakeWordDetector; stt: SpeechToText; sink: VoiceSink; id: string; room?: string; gate?: () => Promise<boolean> }
export class VoiceSession { push(frame): Promise<void>; utterance(frames): Promise<Answer | null>; get state() }
// VoiceSink unchanged: say(text, answer), isSpeaking(), stop(), onState?(state, detail?)

// core/agent.ts
export interface Agent {
  config: Config; paths: Paths; router: Router; registry: ToolRegistry;
  wake: WakeWordEngine; stt: SpeechToText; tts: TextToSpeech; sink: AudioSink; speaker: Speaker;
  integrations: Integration[]; gate(): Promise<boolean>; status(): { tools: number; cloud: boolean };
  doctor(): Promise<Check[]>; close(): Promise<void>;
}
export interface BuildOptions { audio?: boolean /* default true; false skips source/sink/wake for text mode */ }
export async function buildAgent(config: Config, secrets: Secrets, paths: Paths, options?: BuildOptions): Promise<Agent>
```
`buildAgent` resolves every provider through `resolveProvider`, wires `FallbackTextToSpeech` when `tts.fallback` is set, builds the registry (integration tools, `searchTool` when `search.provider !== "none"`, timers announcing through `speaker.say`), the `Router` with `promptContext` concatenating every integration's, and `gate()` = any integration gate true. It imports `../providers/index.ts` for side effects.

- [ ] **Step 1: Tests**
```ts
test("VoiceSession: wake, endpoint, transcribe, answer, speak", async () => { /* FakeWakeWordEngine detector, frames: [wakeFrame, loud x3, quiet x11]; FakeSpeechToText returns "hi"; router built on FakeChatModel [{text:"hello",toolCalls:[]}]; sink records say(); await until state idle; assert said ["hello"] and states listening->thinking->speaking->idle */ });
test("VoiceSession: gate true ignores the wake", ...);
test("VoiceSession: nothing said returns to idle without asking the model", ...);
test("VoiceSession: utterance() skips wake and endpointing", ...);
test("buildAgent with fake providers registered wires the registry and the gate", async () => { /* clearProviders(); register fakes for every kind under the names in a config; buildAgent; assert status().tools includes fake integration tool; assert gate() reflects fake integration */ });
```
- [ ] **Step 2-4** implement, pass. Also: `pnpm -C packages/parlour typecheck` must pass at the end of this task once Tasks 10 and 11 land; for this task, everything under `src/core`, `src/providers`, `src/integrations`, `src/testing` typechecks.
- [ ] **Step 5: Commit** `feat(core): voice session over ports and the agent assembly`.

### Task 10: The server, discovery and the satellite

**Files:**
- Create: `src/server/index.ts` (from old `src/server/index.ts`), `src/server/index.test.ts`, `src/server/web/*` (moved), `src/server/discovery.ts` (from `src/discovery/index.ts`), `src/server/satellite.ts` (from `src/satellite/index.ts`)
- Delete: old `src/discovery`, `src/satellite`

**Produces:**
```ts
export interface ServerDeps { config: Config; token: string | undefined; agent: Pick<Agent, "router" | "wake" | "stt" | "tts" | "gate" | "status"> }
export async function startServer(deps: ServerDeps): Promise<{ close(): Promise<void>; port: number; host: string } | null>
export function runSatellite(config: Config, secrets: Secrets, paths: Paths): Promise<void>   // resolves audioSource/audioSink/wake providers itself
```
Changes: `VoiceSession` constructed with `stt: deps.agent.stt`, `wake: deps.agent.wake.detector(id)`, `gate: deps.agent.gate`; synth via `deps.agent.tts.render`; `/v1/models` id `parlour`, `owned_by: "parlour"`; log line about `PARLOUR_TOKEN`; Bonjour type `parlour`; satellite uses providers for mic/speaker/wake.

- [ ] **Step 1: Tests** (start on port 0 with a fake agent; `token` undefined vs set)
```ts
test("without a token the server binds to loopback", ...);  // returned host === "127.0.0.1" even when config.server.host is 0.0.0.0
test("/health needs no token; /ask needs one", ...);         // 200 then 401 then 200 with bearer
test("/ask returns the router's answer with via", ...);
test("/v1/chat/completions returns an OpenAI shaped reply and model parlour", ...);
test("/v1/models lists parlour", ...);
```
Discovery is not started in tests (`config.discovery.enabled = false`).
- [ ] **Step 2-4** implement, pass. **Step 5: Commit** `feat(server): the agent on the network, over the ports`.

### Task 11: The CLI

**Files:**
- Create: `src/cli/main.ts`, `src/cli/args.ts` (`node:util` `parseArgs` wrapper), `src/cli/start.ts`, `src/cli/text.ts`, `src/cli/doctor.ts`, `src/cli/service.ts`, `src/cli/connectors.ts`, `src/cli/config.ts`, `src/cli/secrets.ts`, `src/cli/models.ts`, `src/cli/setup.ts`, `src/cli/init.ts`, `src/cli/prompts.ts` (readline questions: `ask`, `confirm`, `secret`), `src/cli/output.ts` (`porcelain` and human printers), `src/cli/cli.test.ts`, `bin/parlour-dev` (`#!/bin/sh` running `node --experimental-strip-types "$(dirname "$0")/../src/cli/main.ts" "$@"`)
- Delete: `install.sh`, `scripts/setup.sh`, `scripts/fetch-models.sh`, `scripts/whisper-server.sh`, old `src/doctor.ts`, old `src/connectors/cli.ts` remnants

**Behaviour** (all commands honour `--config`, `PARLOUR_HOME`, `PARLOUR_CONFIG`; `--json` where listed prints one JSON document; errors exit 1 with one line on stderr):
- `parlour start [--events]`: `enableEvents()` when flagged; role satellite -> `runSatellite`; else `buildAgent`, `startServer`, then the local microphone loop (`micMode` from the old `index.ts`, using `agent.sink`/`agent.speaker` through a `LocalVoice` sink). SIGINT closes cleanly.
- `parlour text`: `buildAgent(..., { audio: false })` then the old `textMode` REPL (`/quit`, `/reset`).
- `parlour doctor [--json]`: `[...coreChecks, ...await agent.doctor()]` where core checks are: config file parses (or "using defaults"), token set when `server.host !== "127.0.0.1"`, service state. Human output: `ok    name   detail` columns like today; exit 1 if any `fail`.
- `parlour service install|uninstall|restart|status|logs [--lines N]`: `serviceSpecs(config, paths, process.argv[1] resolved to the installed bin)` and `pickServiceManager()`.
- `parlour connectors add <name> <url> [--scope s] | list [--json] | remove <name>`.
- `parlour models fetch [--wake w1,w2] [--whisper ggml-small.en.bin]`: ports `fetch-models.sh` to TS (`fetch` + stream to file, skip if present), into `paths.modelsDir`.
- `parlour config path | show [--json] | write | edit`: `write` reads JSON from stdin, validates with `parseConfig`, writes; `edit` opens `$EDITOR`.
- `parlour secrets status [--json] | set <NAME>`: status prints which of `HA_TOKEN`, `ANTHROPIC_API_KEY`, `PARLOUR_TOKEN`, `BRAVE_API_KEY` are set (never values); `set` reads the value from stdin (trimmed), empty deletes.
- `parlour init [--yes] [--no-deps] [--porcelain]`: (1) if `agent.config.json` exists in cwd and no config at `paths.configFile`, offer migration (Task 3); (2) `runSetup(options, report)` from `setup.ts`: Homebrew node/ffmpeg/whisper-cpp unless `--no-deps`, `parlour models fetch`, whisper service via `pickServiceManager()`; (3) questions with defaults (skipped under `--yes` except `HA_TOKEN` and `PARLOUR_TOKEN`): role, room (satellite), HA url + token (verified with `GET /api/`), Anthropic key, network token (offer `randomBytes(24).toString("hex")`), wake word, voice, microphone (list via `ffmpeg -list_devices`), local model url + name, "app or LaunchAgent"; (4) write config and secrets; (5) `service install` if chosen; (6) run doctor and print it. `--porcelain` prints `{"kind":"step|ok|warn|fail|log|done","text":...}` JSON lines (the desktop app parses these; note the change from the old `step text` plain lines).
- `parlour --version`, `parlour --help`.
- `main.ts` catches `UnknownProviderError` and prints its message with the list of registered names.

- [ ] **Step 1: Tests** (`cli.test.ts` spawns `bin/parlour-dev` with `PARLOUR_HOME` in a temp dir):
```ts
test("--version prints the package version", ...);
test("config show --json prints defaults when no file exists", ...);
test("config write validates and round-trips", ...);   // pipe {"name":"Test"} then show --json -> name Test; pipe {"role":"bogus"} -> exit 1
test("secrets set and status never print the value", ...);
test("init --porcelain --yes --no-deps in a temp home writes config without touching Homebrew", ...);  // set HA_TOKEN and PARLOUR_TOKEN via env so no prompt; models fetch is skipped with PARLOUR_SKIP_MODELS=1 (a test-only env var, documented in setup.ts)
```
- [ ] **Step 2-4** implement, pass, and `pnpm -C packages/parlour typecheck && pnpm -C packages/parlour build` pass; `node dist/cli/main.js --version` prints `0.1.0`.
- [ ] **Step 5: Commit** `feat(cli): parlour init, start, text, doctor, service, connectors, config, secrets, models`.

---

## Phase 4: app, docs, CI, the old repo (four tasks, parallel)

### Task 12: The desktop app drives the CLI

**Files:**
- Modify: `apps/desktop/src-tauri/src/settings.rs` (`Settings { parlour_bin: String, autostart: bool }`, `detect_parlour() -> Option<PathBuf>` via login shell `command -v parlour` then `/opt/homebrew/bin`, `/usr/local/bin`, `~/.npm-global/bin`; `looks_valid()` = file exists and executable)
- Modify: `apps/desktop/src-tauri/src/supervisor.rs` (spawn `parlour_bin start --events`; unchanged pump and status)
- Modify: `apps/desktop/src-tauri/src/setup.rs` (`run` spawns `parlour_bin init --porcelain --yes --no-deps?` and parses JSON lines into `setup://event`; `inspect` returns `Readiness { parlourBin, parlourVersion, parlourOk, nodeVersion, nodeOk, installed }` by running `parlour --version` and `node -v`; add `install_cli(app)` running `sh -lc "npm install -g parlour@<app version>"` streamed as `setup://event`)
- Modify: `apps/desktop/src-tauri/src/main.rs`: keep `get_settings`, `set_settings`, `status`, `start_agent`, `stop_agent`, `logs`, `audio_devices`, `microphone_check`, `open_privacy_settings`, `setup_status`, `run_setup`; add `parlour(args: Vec<String>, stdin: Option<String>) -> Result<String, String>` and `install_cli`; remove `read_agent_config`, `write_agent_config`, `secrets_present`, `write_secrets`, `network`, `connectors`, `connector_add`, `connector_remove`, `agent_command`, `run_doctor`. `network` is reimplemented in TS from `parlour config show --json` + hostname (`hostname` command stays in Rust as `host_name`).
- Modify: `apps/desktop/src/lib/bridge.ts`: `Settings { parlourBin; autostart }`, `parlour(args, stdin?)`, typed wrappers `readConfig() = JSON.parse(await parlour(["config","show","--json"]))`, `writeConfig(c) = parlour(["config","write"], JSON.stringify(c))`, `secretsStatus()`, `setSecret(name, value)`, `runDoctor() = parlour(["doctor","--json"])`, `getConnectors()`, `connectorAdd`, `connectorRemove`, `installCli()`; `Check` becomes `{ name; status: "ok"|"warn"|"fail"; detail }`; `AgentConfig` keys updated (`integrations["home-assistant"].url`, `tts.voice`, `llm.local.baseUrl`...).
- Modify: panels: `SettingsPanel.tsx` (new config keys, `Check.status`), `StatusPanel.tsx` (`Check.status`), `ConnectorsPanel.tsx` (new bridge calls), `Onboarding.tsx` (step 1 "Parlour" detect/install replaces "Where the agent is"; `SetupEvent` from JSON lines; four steps still), `App.tsx` (rename strings).
- Modify: `tauri.conf.json`, `Info.plist` (`NSMicrophoneUsageDescription` mentions Parlour), `capabilities/default.json` (unchanged unless commands renamed), `index.html` title.

- [ ] **Step 1:** `cargo check` and `pnpm -C apps/desktop typecheck` pass before; make the Rust changes; `cargo check` passes.
- [ ] **Step 2:** bridge and panels; `pnpm -C apps/desktop typecheck && pnpm -C apps/desktop build:ui` pass.
- [ ] **Step 3:** `grep -ri "home agent\|home-agent\|stuntdouble\|agent_dir\|agentDir\|nodePath" apps/desktop/src apps/desktop/src-tauri/src` returns nothing.
- [ ] **Step 4: Commit** `feat(desktop): drive the parlour CLI and know nothing else`.

### Task 13: Documentation and community files

**Files:**
- Create: `README.md` (root), `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md` (Contributor Covenant 2.1, contact michael@stuntdouble.io), `SECURITY.md` (report privately via GitHub security advisories; what counts: token handling, the network server, connectors), `CHANGELOG.md` (`## 0.1.0` "First public release, extracted from a private Home Assistant configuration."), `.github/ISSUE_TEMPLATE/bug.yml`, `.github/ISSUE_TEMPLATE/feature.yml`, `.github/PULL_REQUEST_TEMPLATE.md`, `docs/architecture.md`, `docs/providers.md`, `docs/clients.md`, `docs/home-assistant.md`, `docs/desktop.md`, `docs/tuning.md`, `packages/parlour/README.md` (short: install, commands, link to root docs)
- Delete: `packages/parlour/README.md` old content, `apps/desktop/README.md` (fold into `docs/desktop.md`)

Source material: `docs/home-agent.md` from the home-assistant repo (path given to the agent). Rewrite, do not copy: every command becomes a `parlour ...` command; every path becomes the new path; `AGENT_TOKEN` becomes `PARLOUR_TOKEN`; "the Mac mini" becomes "the machine that runs Parlour"; the house-specific mute section becomes "Muting" in `home-assistant.md` describing `muteEntity`. `providers.md` includes a complete worked example of a third-party TTS provider package (`package.json` with `"type": "module"`, `index.ts` exporting `default defineProvider({...})`, and the config line `"tts": { "provider": "parlour-tts-piper" }`). README quick start:

```sh
npm install -g parlour
parlour init
parlour text          # try it without a microphone
parlour start         # the real thing
```

- [ ] **Step 1:** Write everything. **Step 2:** `grep -rn "pnpm run doctor\|install.sh\|agent.config.json\|AGENT_TOKEN\|home-agent\|stuntdouble" README.md docs CONTRIBUTING.md` returns only the migration mention in `docs/home-assistant.md` and `CHANGELOG.md`. **Step 3: Commit** `docs: README, guides and community files`.

### Task 14: CI, release, version script

**Files:**
- Create: `.github/workflows/ci.yml`, `.github/workflows/release.yml`, `scripts/set-version.mjs`, `.github/dependabot.yml` (npm, cargo, github-actions, weekly)

`ci.yml`: on `push` to `main` and `pull_request`; job `check` on `macos-latest`: checkout, `pnpm/action-setup@v4`, `actions/setup-node@v4` node 22 with pnpm cache, `dtolnay/rust-toolchain@stable`, `Swatinem/rust-cache@v2` with `workspaces: apps/desktop/src-tauri`, `pnpm install --frozen-lockfile`, `pnpm exec nx run-many -t typecheck lint test build`, `pnpm exec nx run desktop:cargo-check`.
`release.yml`: on `push` tags `v*`; job `publish`: same setup, `pnpm install`, `pnpm -C packages/parlour build`, `npm publish --provenance --access public` in `packages/parlour` with `NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}` and `id-token: write`; job `app`: `pnpm -C apps/desktop build`, upload `apps/desktop/src-tauri/target/release/bundle/dmg/*.dmg` with `softprops/action-gh-release@v2`, `generate_release_notes: true`.
`scripts/set-version.mjs`: takes `X.Y.Z`, validates semver, rewrites `version` in `packages/parlour/package.json`, `apps/desktop/package.json`, `apps/desktop/src-tauri/tauri.conf.json` and `apps/desktop/src-tauri/Cargo.toml` (`^version = ".*"` in `[package]`), prints the files touched.

- [ ] **Step 1:** Write them. **Step 2:** `node scripts/set-version.mjs 0.1.0` is a no-op diff; `pnpm exec nx run-many -t typecheck lint test build` passes locally. **Step 3: Commit** `ci: check on pull requests, release on tags`.

### Task 15: The home-assistant repository lets go

**Files** (in `/Users/mrprkr/Developer/home-assistant/.claude/worktrees/automations-presence-sensing-8ae63c`):
- Delete: `agent/`
- Rewrite: `docs/home-agent.md`
- Modify: `CLAUDE.md` layout table row for `agent/`; `README.md` layout row and the paragraph at lines 49-50

`docs/home-agent.md` after: title "Parlour", one paragraph (the voice agent now lives at `~/Developer/parlour`, to be published as github.com/mrprkr/parlour), then "What this repository provides": `packages/home_agent.yaml` (`input_boolean.home_agent_muted` following `input_boolean.sleeping`; Parlour reads it when `integrations.home-assistant.muteEntity` names it), the MCP Server integration, the OpenAI Conversation integration pointed at `http://<parlour host>:8765/v1` with model `parlour` and the `PARLOUR_TOKEN` as the key, and the `/ask` endpoint example for automations. Keep it under 60 lines.

- [ ] **Step 1:** `git rm -r agent`, write docs, edit tables. **Step 2:** `yamllint --strict .` still passes (no YAML changed). **Step 3: Commit** `Move the voice agent out to Parlour`.

---

## Phase 5: verification

### Task 16: Whole-repository checks

- [ ] `pnpm install --frozen-lockfile` from a clean `node_modules`.
- [ ] `pnpm exec nx run-many -t typecheck lint test build` passes.
- [ ] `pnpm exec nx run desktop:cargo-check` passes.
- [ ] `node packages/parlour/dist/cli/main.js --version` prints `0.1.0`; `PARLOUR_HOME=$(mktemp -d) node packages/parlour/dist/cli/main.js doctor` runs and names missing things rather than crashing.
- [ ] `grep -rIn "stuntdouble\|home-agent\|Home Agent\|@home/agent\|AGENT_EVENTS\|\.home:" --exclude-dir=node_modules --exclude-dir=dist --exclude-dir=target --exclude-dir=.git .` returns only `CHANGELOG.md`, `docs/home-assistant.md` (migration) and `src/core/migrate.ts`.
- [ ] `git status` clean after commits; `git log --oneline | wc -l` is at least 9 (history) plus the new commits.
