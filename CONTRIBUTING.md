# Contributing

Thank you. Parlour is one person's house made general, and the parts most
worth contributing are the ones that make it somebody else's: a provider for
a different engine, an integration for a different platform, Linux.

## Setting up

Node 22 or later, pnpm 10, and for the desktop app a Rust toolchain.

```sh
git clone https://github.com/mrprkr/parlour.git
cd parlour
pnpm install
pnpm check                      # typecheck, lint and test, both projects
```

The CLI runs from source with type stripping, no build step:

```sh
packages/parlour/bin/parlour-dev doctor
packages/parlour/bin/parlour-dev text
PARLOUR_HOME=$(mktemp -d) PARLOUR_SKIP_MODELS=1 \
  packages/parlour/bin/parlour-dev init --yes --no-deps --no-service
```

`PARLOUR_HOME` keeps an experiment's config and secrets away from your real
ones, but not its LaunchAgents: `io.parlour.agent` and `io.parlour.whisper`
are one per user, and an `init` without `--no-service` would replace the
ones running your house with ones that start this checkout against the
scratch directory. `PARLOUR_SKIP_MODELS=1` skips the model download, which
is otherwise a gigabyte into the same throwaway directory. If you have
already done it the other way, `parlour service uninstall` and then
`parlour init` from your real install puts things back.

`pnpm -C packages/parlour build` compiles to `dist/`, which is what `npm
publish` ships and what `node dist/cli/main.js` runs.

For the app, `pnpm -C apps/desktop app` runs the window from the checkout
with live reload. The CLI it drives is whichever `parlour` its settings name,
the global install by default; to have it run this checkout, set **The
parlour command** on its Settings tab to the absolute path of
`packages/parlour/bin/parlour-dev`. See
[docs/desktop.md](docs/desktop.md#running-the-app-against-a-checkout).
`pnpm exec nx run desktop:cargo-check` is what CI runs on the Rust.

## Where things go

| Change | Where |
| --- | --- |
| A new engine for an existing port | `packages/parlour/src/providers/<kind>/<name>.ts`, registered in `providers/index.ts`. Or an npm package, which needs no change here at all: see [docs/providers.md](docs/providers.md). |
| A new source of tools | `packages/parlour/src/integrations/<name>/`, same choice. |
| A new port | `core/ports.ts`, a slot in `core/config.ts`, wiring in `core/agent.ts`, a fake in `testing/`. Open an issue first; a port is a promise to every provider. |
| Linux | A `systemd` service provider and audio providers that do not need avfoundation. `core/paths.ts` already follows XDG. |
| A CLI command | `packages/parlour/src/cli/<name>.ts` exporting a `Command`, listed in `cli/main.ts`. |
| The app | `apps/desktop`. It drives the CLI; if the CLI cannot do it, add that first. |

## The rules

- **TypeScript, strict.** Relative imports inside `packages/parlour/src` use
  the `.ts` extension. No enums, no parameter properties, no decorators:
  the source runs under Node's type stripping, which erases types and
  nothing else.
- **Tests beside the source**, `*.test.ts`, with `node:test` and
  `node:assert/strict`. No test framework. Providers that need hardware, a
  model or a network are not unit tested; each has a `doctor()` instead,
  which is the part to get right.
- **Biome** formats and lints. `pnpm lint`, or `pnpm exec biome check
  --write .` to fix what it can.
- **Prose is British English with no em dashes**, in comments, docs and
  everything the CLI prints. Comments explain why, not what.
- **Nothing secret in config.** Tokens and keys are read from `secrets.env`
  or the environment, never from `config.json`, and never printed.
- **Every step the doctor cannot see is a step that will break silently.**
  A provider that depends on a binary, a file or a port checks for it in
  `doctor()` and says what to do about it.

## Pull requests

One change per pull request. Say what it does and why in the description,
and note anything you could not test (a Linux change from a Mac, say). CI
runs typecheck, lint, the tests, the build and `cargo check`; a green run
is required.

Commit messages are a sentence in the imperative, the way the history
already reads: "Move the agent into a workspace and call it Parlour".

## Releasing

Maintainers only. `pnpm version:set X.Y.Z` bumps both packages and the app;
`CHANGELOG.md` is written by hand; a `vX.Y.Z` tag publishes the package to
npm and attaches the dmg to a GitHub release.
