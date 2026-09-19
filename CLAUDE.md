# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

Parlour is a local-first voice assistant for the house that runs on a Mac. One npm package
(`packages/parlour`) holds everything; the desktop app drives its CLI; the website is a Next.js app with
the docs in it. `README.md` is the user-facing tour, `CONTRIBUTING.md` the conventions, and
`apps/site/content/docs/architecture.mdx` the long version of the architecture section below.

## Commands

pnpm 10 and nx, Node 22+. Run from the repo root unless noted.

```sh
pnpm install
pnpm check                                   # typecheck + lint + test, every project
pnpm build                                   # nx run-many -t build
pnpm exec nx run-many -t typecheck lint test build   # what CI runs (macOS), then desktop:cargo-check
pnpm exec nx run parlour:test                # one project, one target
pnpm exec biome check --write .              # fix what lint can fix
```

Inside `packages/parlour`:

```sh
pnpm test                                    # node --test over src/**/*.test.ts
node --experimental-strip-types --test src/core/session.test.ts    # a single test file
bin/parlour-dev <command>                    # run the CLI from source, no build step
pnpm build                                   # tsc to dist/, which is what npm publishes
```

Keep experiments away from the real install: `PARLOUR_HOME=$(mktemp -d) PARLOUR_SKIP_MODELS=1
bin/parlour-dev init --yes --no-deps --no-service`. LaunchAgents are per user, not per home, so
never run `init` without `--no-service` against a scratch home.

Desktop app (`apps/desktop`, Tauri + React + Tailwind): `pnpm -C apps/desktop app` for the window
with live reload; `pnpm exec nx run desktop:cargo-check` for the Rust side. It only ever shells out
to the `parlour` CLI, so a capability the app needs must exist in the CLI first. Release builds are
signed and notarised: `src-tauri/Entitlements.plist` and the `macOS` block in `tauri.conf.json` are
what allow it, and `scripts/notarise.sh` does the dmg, which Tauri signs but does not notarise.

Site (`apps/site`, Next.js): the front page in `app/page.tsx`, the docs in `content/docs/*.mdx` served
by `app/docs/[slug]` from the list in `app/docs/pages.ts`, looks in `app/globals.css`, header, footer,
metadata, font and the analytics component in `app/layout.tsx`, security headers and the MDX plugins in
`next.config.ts`.
`pnpm -C apps/site dev` locally; `pnpm exec nx run-many -t typecheck lint build -p site` is what CI
runs. Vercel builds it with the Next.js builder, Root Directory `apps/site`.

## Architecture of `packages/parlour/src`

- `core/` is pure and imports nothing from `providers/`, except `core/builtins.ts`, whose only job
  is to register the built-ins. That file is the seam an embedding program can leave out.
- `core/ports.ts` declares the interfaces for everything that touches hardware, a model or the
  network: `AudioSource`, `AudioSink`, `WakeWordEngine`, `SpeechToText`, `TextToSpeech`,
  `ChatModel`, `SearchProvider`, `SecretStore`, `ServiceManager`, `Integration`. Each may expose
  `doctor(): Promise<Check[]>`; `parlour doctor` is those checks joined together.
- `core/providers.ts` is a registry keyed by `(kind, name)`. Built-ins in `providers/<kind>/<name>.ts`
  call `registerProvider` on import and are listed in `providers/index.ts`. Config picks each slot
  by `provider` name; the rest of the slice passes through untouched to the provider's own Zod
  schema. An unregistered name is `await import`ed as an npm package, which is the whole extension
  mechanism. `secrets` and `service` are chosen by platform, not config.
- `core/agent.ts` `buildAgent(config, secrets, paths)` resolves every provider, wires the fallback
  voice (`Speaker` = TTS + sink + sentence splitting, `FallbackTextToSpeech` defaults to
  `macos-say`), builds the tool registry (integrations + search + timers) and the `Router`. The
  microphone loop, `parlour text`, the doctor and the server all take one `Agent`; do not build
  providers elsewhere.
- `core/session.ts` is one state machine over 80 ms audio frames: idle → listening → thinking →
  speaking. It does not know where frames come from; every client (local mic, satellite, phone
  page, `/listen` socket) gets its own session keyed by client id. Clients that already know
  utterance boundaries call `utterance(frames)` instead of `push(frame)`.
- `core/router.ts` is local first: the local model gets the tools plus `ask_the_clever_one`, which
  escalates to the cloud model (Claude, server-side web search, no house tools). `core/loop.ts`
  runs tool rounds up to `llm.maxToolRounds`.
- `integrations/` (`home-assistant`, `mcp`, `connectors`) are named sources of tools, prompt lines
  and a mute `gate()`.
- `server/` is the HTTP + WebSocket server (`/v1` OpenAI-compatible, `/listen` raw PCM, `/ask`,
  the phone page at `/`), Bonjour discovery and the satellite role. Everything needs
  `PARLOUR_TOKEN`; without it the server binds loopback only.
- `cli/` is one file per command exporting a `Command`, listed in `cli/main.ts`.
- `testing/` holds a fake for every port, published as `parlour/testing`.
- Config is a Zod schema in `core/config.ts` where every key has a default. Secrets come only from
  `secrets.env` or the environment, never `config.json`. Paths are in `core/paths.ts`
  (`~/.config/parlour`, or `$PARLOUR_HOME`).

Adding a new port means `core/ports.ts`, a slot in `core/config.ts`, wiring in `core/agent.ts`
and a fake in `testing/`; open an issue first, a port is a promise to every provider.

## Conventions that affect code

- The source runs under Node's type stripping: relative imports inside `packages/parlour/src` use
  the `.ts` extension; no enums, parameter properties or decorators.
- Tests sit next to the source as `*.test.ts` using `node:test` and `node:assert/strict`, no
  framework. Providers that need hardware, a model or the network are not unit tested; they get a
  `doctor()` instead, and anything a provider depends on (binary, file, port) must be checked there.
- Biome formats and lints (double quotes, 110 columns, 2-space).
- British English, no em dashes, in comments, docs and CLI output. Comments explain why, not what.
- Commit messages are one imperative sentence, as the history reads. One change per pull request.
- Releasing: `pnpm version:set X.Y.Z`, then a `vX.Y.Z` tag publishes, with notes from the pull requests.

## graphify

This project has a knowledge graph at graphify-out/ with god nodes, community structure, and cross-file relationships.

Rules:
- For codebase questions, first run `graphify query "<question>"` when graphify-out/graph.json exists. Use `graphify path "<A>" "<B>"` for relationships and `graphify explain "<concept>"` for focused concepts. These return a scoped subgraph, usually much smaller than GRAPH_REPORT.md or raw grep output.
- If graphify-out/wiki/index.md exists, use it for broad navigation instead of raw source browsing.
- Read graphify-out/GRAPH_REPORT.md only for broad architecture review or when query/path/explain do not surface enough context.
- After modifying code, run `graphify update .` to keep the graph current (AST-only, no API cost).
