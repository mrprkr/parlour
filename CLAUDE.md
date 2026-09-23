# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

Parlour is a local-first voice assistant for the house that runs on a Mac. One npm package
(`packages/parlour`) holds everything; the desktop app drives its CLI; the iOS app and the phone page
are clients of its server; the website is a Next.js app with the docs in it. `packages/design` holds
the tokens all four interfaces are drawn from. `README.md` is the user-facing tour, `CONTRIBUTING.md`
the conventions, and `apps/site/content/docs/architecture.mdx` the long version of the architecture
section below.

## Commands

pnpm 10 and nx, Node 22+. Run from the repo root unless noted.

```sh
pnpm install
pnpm check                                   # typecheck + lint + test, every project
pnpm build                                   # nx run-many -t build: parlour, the site, the app's UI
pnpm build:desktop                           # Parlour.app and the dmg (nx run desktop:bundle)
pnpm build:appstore                          # the sandboxed Mac App Store build (needs cmake)
pnpm build:ios                               # the iOS app for the simulator (nx run ios:xcodebuild)
pnpm build:all                               # all of the above
pnpm dev:desktop | dev:site | dev:ios        # the app window, the site, or the Xcode project
pnpm emit / pnpm icons                       # design tokens and icons into every surface
pnpm exec nx run-many -t typecheck lint test build   # what CI runs (macOS), then pnpm cargo-check
pnpm exec nx run parlour:test                # one project, one target
pnpm exec biome check --write .              # fix what lint can fix
pnpm changeset                               # record a change to the npm package for the next release
pnpm release:version                         # apply the changesets, then carry the version to the app
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
The Mac App Store build is the `appstore` Cargo feature plus `tauri.appstore.conf.json`: it carries
node, parlour, ffmpeg, whisper-server and llama-server inside the app, and `apps/desktop/appstore/`
stages, signs and uploads it (its README has the detail). Inside the sandbox the CLI notices
`APP_SANDBOX_CONTAINER_ID` (`core/sandbox.ts`) and leaves Homebrew, launchd and the Keychain alone.

Site (`apps/site`, Next.js with fumadocs): the front page in `app/(home)/page.tsx`, the docs in
`content/docs/*.mdx` ordered by `content/docs/meta.json` and served by `app/docs/[[...slug]]/page.tsx`,
where `lib/source.ts` is the content source, `lib/layout.shared.tsx` the shared layout options and
`app/api/search/route.ts` the search endpoint. Looks in `app/globals.css` and the generated
`app/tokens.css`, header, footer, metadata, font and the analytics component in `app/layout.tsx`, the
MDX components in `mdx-components.tsx`, security headers and the fumadocs MDX plugin in `next.config.ts`.
`pnpm -C apps/site dev` locally; `pnpm exec nx run-many -t typecheck lint build -p site` is what CI
runs. Vercel builds it with the Next.js builder, Root Directory `apps/site`.

iOS app (`apps/ios`, SwiftUI): a client of the server's `/health`, `/voice` and `/ask`, with HomeKit,
Bonjour discovery and Apple's on-device model. The Xcode project is generated from `project.yml`, so
`brew install xcodegen` then `pnpm exec nx run ios:app`. There is no iOS job in CI; build it by hand
with `nx run ios:xcodebuild` and `nx run ios:xcodetest`. `apps/ios/README.md` has the detail.

Design system (`packages/design`): `src/tokens.ts` is the one palette, type ramp and session-state
vocabulary, and `src/emit.ts` writes it into the site, the app, the phone page and iOS. Never edit a
generated `tokens.css` or `Tokens.swift`: change the tokens and run `pnpm exec nx run design:emit`.
`design:test` fails when a generated file has drifted, so `pnpm check` catches a missed emit.
The icons (favicon, iOS, macOS, menu bar) are drawn in `src/icon.ts` and rasterised by
`pnpm exec nx run design:icons`; never edit a generated icon either.

## Architecture of `packages/parlour/src`

- `core/` is pure and imports nothing from `providers/`, except `core/builtins.ts`, whose only job
  is to register the built-ins. That file is the seam an embedding program can leave out.
- `core/ports.ts` declares the interfaces for everything that touches hardware, a model or the
  network: `AudioSource`, `AudioSink`, `WakeWordEngine`, `SpeechToText`, `TextToSpeech`,
  `ChatModel`, `DecisionModel`, `SearchProvider`, `SecretStore`, `ServiceManager`, `Integration`. Each may expose
  `doctor(): Promise<Check[]>`; `parlour doctor` is those checks joined together.
- `core/providers.ts` is a registry keyed by `(kind, name)`. Built-ins in `providers/<kind>/<name>.ts`
  call `registerProvider` on import and are listed in `providers/index.ts`. Config picks each slot
  by `provider` name; the rest of the slice passes through untouched to the provider's own Zod
  schema. An unregistered name is `await import`ed as an npm package, which is the whole extension
  mechanism. `secrets` and `service` are chosen by platform, not config.
- `core/plugins.ts` loads the packages in `config.plugins` before anything is resolved: a plugin
  brings providers, skills and integration config at once, and its `integrations` block is merged
  under the one in config. `core/skills.ts` reads markdown skills from `~/.config/parlour/skills`
  and the plugins' own directories; only the names and descriptions go in the prompt, the bodies
  come back through the `read_skill` tool.
- `core/agent.ts` `buildAgent(config, secrets, paths)` resolves every provider, wires the fallback
  voice (`Speaker` = TTS + sink + sentence splitting, `FallbackTextToSpeech` defaults to
  `macos-say`), builds the tool registry (integrations + search + timers) and the `Router`. The
  microphone loop, `parlour text`, the doctor and the server all take one `Agent`; do not build
  providers elsewhere.
- `core/session.ts` is one state machine over 80 ms audio frames: idle → listening → thinking →
  speaking. It does not know where frames come from; every client (local mic, satellite, phone
  page, `/listen` socket) gets its own session keyed by client id. Clients that already know
  utterance boundaries call `utterance(frames)` instead of `push(frame)`.
- `core/router.ts` runs one pipeline for every client: `core/queue.ts` (a lane per client, fair
  across lanes, bounded, newest wins) -> `core/triage.ts` (repair the transcript, resolve
  pronouns, split into tasks) -> `core/tasks.ts` (the list, run in order, replies joined into one)
  -> `core/dispatch.ts`, which is local first: the local model gets the tools plus
  `ask_the_clever_one`, which escalates to the cloud model (Claude, server-side web search, no
  house tools). `core/loop.ts` runs tool rounds up to `llm.maxToolRounds`, every tool in a round
  at once. The `pipeline` config block holds the knobs.
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
- A pull request that changes what `parlour` does ships a changeset (`pnpm changeset`, or write
  `.changeset/<name>.md` by hand with `"parlour": patch|minor|major` in the front matter and one
  line for the changelog). Changes to the site, the app, iOS, tokens or CI alone need none: only
  `parlour` is versioned by changesets, the private packages are not.
- Releasing: `pnpm release:version` turns the changesets into `packages/parlour/CHANGELOG.md` and a
  version, then `set-version.mjs --sync` writes that version into the desktop app's three files.
  `.github/workflows/changesets.yml` runs it on every push to main and keeps a "Release the pending
  changesets" pull request open; merge it, then a `vX.Y.Z` tag on the merge publishes to npm and
  attaches the dmg. `pnpm version:set X.Y.Z` still
  sets a version by hand, and the release workflow refuses a tag that disagrees with the package.

## This is a public repository

Parlour is open source under MIT. Everything pushed here is world readable, permanently, including
commit messages, pull request titles and bodies, issues, comments and code review threads. Write as
though a stranger is reading, because one is.

- Never put Claude session information in a pull request description, a commit message, an issue, a
  comment or any other file in the repository. That means no `claude.ai/code/session_...` links, no
  session ids, no conversation or transcript links, no run or task ids, and no model identifiers.
  They are useless to anyone outside the session and they leak how the work was done.
- Do not paste agent transcripts, internal tool output, reasoning traces or prompts into a pull
  request, an issue or a comment. Describe the change and why, not the process that produced it.
- A pull request body explains what changed, why, and how it was verified. Nothing else belongs in
  it: no credentials, tokens, environment variables, absolute paths from a developer machine,
  internal hostnames or private URLs.
- The same goes for anything the site or the CLI prints: it is public too.

## graphify

This project has a knowledge graph at graphify-out/ with god nodes, community structure, and cross-file relationships.

Rules:
- For codebase questions, first run `graphify query "<question>"` when graphify-out/graph.json exists. Use `graphify path "<A>" "<B>"` for relationships and `graphify explain "<concept>"` for focused concepts. These return a scoped subgraph, usually much smaller than GRAPH_REPORT.md or raw grep output.
- If graphify-out/wiki/index.md exists, use it for broad navigation instead of raw source browsing.
- Read graphify-out/GRAPH_REPORT.md only for broad architecture review or when query/path/explain do not surface enough context.
- After modifying code, run `graphify update .` to keep the graph current (AST-only, no API cost).
