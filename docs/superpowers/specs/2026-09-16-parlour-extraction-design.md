# Parlour: extracting the voice agent into its own repository

Date: 2026-09-16. Status: approved in conversation, awaiting written review.

## Goal

Move `agent/` out of the Home Assistant config repository into a public,
open source project called **Parlour** that a stranger can install with one
command, run on their own Mac, point at their own Home Assistant, and
contribute a new engine to without editing the core.

## Decisions already made

| Decision | Choice |
| --- | --- |
| Name | Parlour. npm `parlour`, `github.com/mrprkr/parlour`, `Parlour.app`, bundle id `io.parlour.desktop`. Free on npm, PyPI, GitHub, the HA forum and HACS. |
| Platform | macOS server and menu bar app in this release. Platform specifics behind interfaces so Linux is a contribution path, not a deliverable. |
| Repository | Created locally at `~/Developer/parlour` with the nine `agent/` commits preserved via `git subtree split`. Nothing pushed to GitHub until the owner says so. |
| Licence | MIT. |
| Shape | One publishable package plus the desktop app (approach C), not a package per provider. |
| Tooling | TypeScript, pnpm, nx, Biome, `node --test`. |

## Repository layout

```text
parlour/
  packages/parlour/          npm "parlour": core, built-in providers, integrations, server, CLI
    src/core/                ports.ts, providers.ts, config.ts, paths.ts, session.ts, router.ts,
                             loop.ts, registry.ts, speaker.ts, prompt.ts, events.ts, logger.ts, timers.ts
    src/providers/           audio/ffmpeg.ts, audio/afplay.ts, wake/openwakeword.ts,
                             stt/whisper-cpp.ts, tts/kokoro.ts, tts/macos-say.ts,
                             llm/openai-compatible.ts, llm/anthropic.ts,
                             search/searxng.ts, search/brave.ts,
                             secrets/macos-keychain.ts, secrets/file.ts, service/launchd.ts
    src/integrations/        home-assistant/, mcp/, connectors/
    src/server/              http.ts, listen.ts (WS), openai.ts (/v1), web/, discovery.ts, satellite.ts
    src/cli/                 main.ts, init.ts, setup.ts, doctor.ts, service.ts, connectors.ts,
                             config.ts, secrets.ts, models.ts, text.ts
    src/testing/             fakes for ChatModel, SpeechToText, TextToSpeech, AudioSink, WakeWordEngine
    bin/parlour-dev          runs src/cli/main.ts from source with type stripping
    package.json, tsconfig.json, project.json
  apps/desktop/              the Tauri menu bar app (React, shadcn/ui, Rust shell)
  docs/                      architecture, providers, clients, home-assistant, desktop, tuning
  .github/workflows/         ci.yml, release.yml; issue and PR templates
  nx.json, pnpm-workspace.yaml, biome.json, one pnpm-lock.yaml
  README.md, LICENSE, CONTRIBUTING.md, CODE_OF_CONDUCT.md, SECURITY.md, CHANGELOG.md
```

## Core ports

`src/core/ports.ts` declares the interfaces. Each maps onto a class that
already exists, so the built-in providers are moves, not rewrites.

```ts
export interface AudioSource { frames(signal?: AbortSignal): AsyncIterable<Int16Array>; close(): void }
export interface AudioSink { play(wav: Buffer, signal?: AbortSignal): Promise<void>; stop(): void }
export interface WakeWordEngine { load(): Promise<void>; detector(label: string): WakeWordDetector }
export interface WakeWordDetector { push(frame: Int16Array): Promise<string | null>; reset(): void }
export interface SpeechToText { transcribe(wav: Buffer): Promise<string> }
export interface TextToSpeech { warm(): Promise<void>; render(text: string): Promise<Buffer> }
export interface ChatModel { readonly label: string; complete(messages: Message[], tools: ToolSpec[]): Promise<Completion> }
export interface SearchProvider { search(query: string, max: number): Promise<SearchResult[]> }
export interface SecretStore { get(key: string): Promise<string | null>; set(key: string, value: string): Promise<void>; delete(key: string): Promise<void> }
export interface ServiceManager { install(specs: ServiceSpec[]): Promise<ServiceState[]>; uninstall(): Promise<string[]>; restart(): Promise<ServiceState[]>; status(): Promise<ServiceState[]>; tail(label: string, lines: number): Promise<string> }
export interface Integration {
  readonly name: string;
  tools(): Promise<Tool[]>;
  /** Extra lines for the system prompt. */
  promptContext?(): string[];
  /** Return true to ignore this wake. Checked after the wake word, before anything is acted on. */
  gate?(): Promise<boolean>;
  close?(): Promise<void>;
}
export interface Check { name: string; status: "ok" | "warn" | "fail"; detail: string }
```

Every provider and integration may also expose `doctor(): Promise<Check[]>`.

Speaking is composed in core: `Speaker` = `TextToSpeech` + `AudioSink` +
sentence splitting + abort. The "fall back to `say` when Kokoro fails" rule
becomes `FallbackTextToSpeech(primary, fallback)` in core, configured by
`tts.fallback`, rather than logic inside the Kokoro provider.

Timers stay in core: they are the one tool that must keep working when the
network does not.

## Provider resolution

`src/core/providers.ts` holds a registry keyed by `(kind, name)` where kind is
one of `audioSource`, `audioSink`, `wake`, `stt`, `tts`, `llm`, `search`,
`secrets`, `service`, `integration`. Built-ins register at import. Config
selects by name. If a name is not registered, core does `await import(name)`
and expects a default export `{ kind, name, create(options, context) }`, so a
third-party provider is an npm package and needs no change here. `context`
gives a provider the resolved paths, the secrets, a logger and the event
emitter.

`secrets` and `service` are not chosen in config. Core picks them by platform:
`macos-keychain` when `security` is on the PATH, otherwise `file`; `launchd`
on macOS, and an error naming the gap elsewhere. A Linux contribution adds a
`systemd` service provider and registers it for `linux`.

`parlour doctor` concatenates the `doctor()` output of everything configured,
plus core checks (config parses, token present when the server is not on
loopback).

## Configuration

Zod schema, every key optional with a default. Lives at
`$PARLOUR_HOME/config.json`, default `~/.config/parlour/config.json`.

```jsonc
{
  "name": "Parlour",
  "locale": "en-GB",
  "role": "server",                                   // or "satellite"
  "audio": { "source": "ffmpeg", "sink": "afplay", "inputDevice": ":0", "outputDevice": null,
             "silenceMs": 800, "maxUtteranceMs": 15000, "silenceThreshold": 0.012, "bargeIn": false },
  "wake": { "provider": "openwakeword", "words": ["hey_jarvis"], "threshold": 0.5, "refractoryMs": 1500 },
  "stt": { "provider": "whisper-cpp", "url": "http://127.0.0.1:8910/inference", "language": "en", "timeoutMs": 20000 },
  "tts": { "provider": "kokoro", "voice": "bf_emma", "speed": 1.0, "fallback": "macos-say" },
  "llm": {
    "local": { "provider": "openai-compatible", "baseUrl": "http://127.0.0.1:1234/v1", "model": "qwen3-8b-mlx", "temperature": 0.3, "timeoutMs": 30000 },
    "cloud": { "provider": "anthropic", "enabled": true, "model": "claude-opus-5", "maxTokens": 1024, "onLocalFailure": true },
    "maxToolRounds": 6
  },
  "search": { "provider": "searxng", "url": "http://searxng.local:8080", "maxResults": 5 },
  "integrations": {
    "home-assistant": { "url": "http://homeassistant.local:8123", "mcp": true, "rest": true, "muteEntity": "" },
    "mcp": { "servers": {} },
    "connectors": {}
  },
  "server": { "enabled": true, "port": 8765, "host": "0.0.0.0", "web": true },
  "discovery": { "enabled": true, "name": "" },
  "satellite": { "serverUrl": "", "room": "", "localWake": false, "retryMs": 15000 }
}
```

Per-provider options are validated by the provider's own Zod schema, which it
exports alongside `create`, so core does not know Kokoro has a `voice`.

Secrets stay in the environment, loaded from `$PARLOUR_HOME/secrets.env`
(mode 600): `HA_TOKEN`, `ANTHROPIC_API_KEY`, `PARLOUR_TOKEN` (was
`AGENT_TOKEN`), `BRAVE_API_KEY`, `LOG_LEVEL`. `AGENT_TOKEN` is read as a
fallback for one release.

Defaults use `.local` hostnames. `muteEntity` defaults to empty, meaning no
mute gate; a house that wants one names the entity.

### Migration

`parlour init` looks for `agent.config.json` in the working directory and, if
found, offers to convert it: `homeAssistant` to `integrations.home-assistant`,
`mcpServers` to `integrations.mcp.servers`, `search.searxngUrl` to
`search.url`, `muteEntity` to `integrations.home-assistant.muteEntity`,
provider keys added, then written to the new path. `.env` is copied to
`secrets.env` with `AGENT_TOKEN` renamed. `connectors.json` is moved.

## Paths

`src/core/paths.ts`, overridable with `PARLOUR_HOME` (config, secrets,
connectors) and `PARLOUR_CONFIG` (just the config file).

| What | Where |
| --- | --- |
| `config.json`, `secrets.env`, `connectors.json` | `~/.config/parlour/` |
| Models | `~/Library/Caches/parlour/models/{openwakeword,whisper,kokoro}` |
| Logs | `~/Library/Logs/parlour/{agent,whisper}.log` |
| LaunchAgent labels | `io.parlour.agent`, `io.parlour.whisper` |
| Bonjour service type | `_parlour._tcp` |
| Keychain service | `parlour-connector` |
| App settings | `~/Library/Application Support/io.parlour.desktop/settings.json` |

## The CLI

Published as `parlour` with `bin: { parlour: "dist/cli/main.js" }`. Compiled
by `tsc` to `dist/`. Node 22 or later.

```text
parlour init [--yes] [--no-deps] [--porcelain]   dependencies, models, config, secrets, service or app
parlour start [--events]                         server or satellite, per config.role
parlour text                                     everything but the microphone
parlour doctor [--json]
parlour service install|uninstall|restart|status|logs
parlour connectors add <name> <url> [--scope]|list|remove <name>  [--json]
parlour models fetch
parlour config path|show [--json]|write (JSON on stdin)|edit
parlour secrets status [--json]|set <NAME> (value on stdin)
parlour --version
```

`init` has two halves, as today: `setup.ts` (no questions: Homebrew's
ffmpeg and whisper.cpp unless `--no-deps`, models, whisper LaunchAgent) and
the questions (Home Assistant address and token, Anthropic key, network
token, wake word, voice, microphone, local model, app or LaunchAgent). Both
halves are TypeScript. `--porcelain` prints one JSON line per event for the
app. `--yes` takes every default and stops only for the secrets.

`bin/parlour-dev` runs `src/cli/main.ts` with `--experimental-strip-types` for
contributors and for the app when pointed at a checkout.

## Home Assistant as an integration

`src/integrations/home-assistant/index.ts` implements `Integration`:

- `tools()`: the MCP server at `${url}/mcp_server/sse` with `HA_TOKEN` (when
  `mcp` is true) and the two REST tools `ha_get_state` and `ha_call_service`
  (when `rest` is true).
- `promptContext()`: one line saying the house is reachable through tools.
- `gate()`: when `muteEntity` is set, reads it over REST and returns true if
  it is `on`, emitting a `muted` event.
- `doctor()`: reachability of `url`, token present, MCP endpoint answers.

`mcp` and `connectors` are integrations of the same shape. Core's
`VoiceSession` asks every integration's `gate()` after the wake word.

## Server and clients

Unchanged in behaviour: `/health`, `/ask`, `/listen` (WS, wake and push
modes), `/v1/chat/completions` and `/v1/models` for Home Assistant's OpenAI
Conversation integration, the phone page at `/`, Bonjour advertisement, the
satellite role. Auth: `PARLOUR_TOKEN` required to bind beyond loopback. The
model name reported at `/v1/models` becomes `parlour`.

## The desktop app

The Rust shell only knows the path to the `parlour` binary. Everything else
goes through the CLI's `--json` and stdin interfaces above. `settings.rs`
becomes `{ parlour_bin, autostart }`. `main.rs` keeps the tray, the window,
the supervisor and gains one generic `parlour(args, stdin)` command; the
bespoke config, secrets, doctor and connectors commands are removed.
`supervisor.rs` runs `parlour start --events` and parses the same NDJSON.

Onboarding step 1 detects `parlour` and Node 22 or later in the login shell's
PATH. If missing, an Install button runs `npm install -g parlour@<app version>`
with output streamed. Steps 2 to 4 are the existing Install (`parlour init
--porcelain`), answers and doctor.

The app does not bundle Node or the package.

Identity: product name `Parlour`, identifier `io.parlour.desktop`, version
shared with the package.

## Testing

`node --test` over `src/**/*.test.ts`. Fakes in `src/testing/` exported from
the package as `parlour/testing`.

Covered: config defaults, provider schemas and migration; paths; provider
resolution including `import()`; `Router`; `runTurn`; `ToolRegistry`;
`Endpointer`; `sentences()`; `FallbackTextToSpeech`; `VoiceSession` with
fakes; server auth and the `/ask` and `/v1/chat/completions` shapes; the
Home Assistant gate; the CLI's config migration.

Not unit tested: providers that need hardware, a model or a network service.
Each has a `doctor()` check instead.

## CI and release

- `ci.yml` on push and pull request, `macos-latest`: `pnpm install
  --frozen-lockfile`, `nx run-many -t typecheck lint test build`, `cargo
  check` in `apps/desktop/src-tauri`.
- `release.yml` on tag `v*`: build, `npm publish --provenance` (needs
  `NPM_TOKEN`), `tauri build`, GitHub release with `Parlour.dmg` attached.
  Unsigned; notarisation is a documented follow-up.
- Version bump: `pnpm version:set X.Y.Z` updates both `package.json` files and
  `tauri.conf.json`. `CHANGELOG.md` by hand. First release `0.1.0`.

## Documentation

`README.md`: what it is in three sentences, the loop diagram, a 60 second
quick start, the clients table, links. `docs/` adapted from `home-agent.md`:
`architecture.md` (ports, providers, the session state machine),
`providers.md` (how to write one, with a worked example), `clients.md`
(satellites, phone, custom hardware, `/ask`), `home-assistant.md` (MCP Server
integration, OpenAI Conversation, mute entity), `desktop.md`, `tuning.md`.
`CONTRIBUTING.md`, `CODE_OF_CONDUCT.md` (Contributor Covenant 2.1),
`SECURITY.md`, issue and PR templates. British English, no em dashes.

## The Home Assistant repository

On branch `claude/agent-repo-extraction-f76c3c`: remove `agent/`; rewrite
`docs/home-agent.md` as a short page pointing at Parlour and keeping the
HA-side setup; update the `agent/` rows in `CLAUDE.md` and `README.md`.
`packages/home_agent.yaml` stays. Committed, not pushed.

## Out of scope

Linux and Docker, speaker identification, echo cancellation, per-person
connectors, signing and notarising the app, a Homebrew tap, publishing to
GitHub or npm (the owner does that when ready).
