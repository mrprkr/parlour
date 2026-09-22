# Contributing

Thanks for being here. Parlour started as one person's house made general,
and the contributions that help most are the ones that make it work in
somebody else's: a provider for a different engine, an integration for a
different platform, Linux. If you are not sure where to begin, a new voice
or a new speech to text engine is a self-contained afternoon, and
[the provider guide](https://heyparlour.app/docs/providers) walks you through one.

## Setting up

You will need Node 22 or later, pnpm 10, and a Rust toolchain if you want to
work on the desktop app.

```sh
git clone https://github.com/mrprkr/parlour.git
cd parlour
pnpm install
pnpm check                      # typecheck, lint and test, every project
```

The CLI runs straight from source with type stripping, so there is no build
step while you work:

```sh
packages/parlour/bin/parlour-dev doctor
packages/parlour/bin/parlour-dev text
PARLOUR_HOME=$(mktemp -d) PARLOUR_SKIP_MODELS=1 \
  packages/parlour/bin/parlour-dev init --yes --no-deps --no-service
```

A word about that last one. `PARLOUR_HOME` keeps an experiment's config and
secrets away from your real ones, but LaunchAgents are one per user, not per
home: `io.parlour.agent` and `io.parlour.whisper` would be replaced by ones
that start this checkout against the scratch directory, which is why the
command has `--no-service`. `PARLOUR_SKIP_MODELS=1` skips the gigabyte of
models that would otherwise land in the throwaway directory. If you have
already done it the other way round, `parlour service uninstall` followed by
`parlour init` from your real install puts things back.

`pnpm -C packages/parlour build` compiles to `dist/`, which is what
`npm publish` ships and what `node dist/cli/main.js` runs.

For the app, `pnpm -C apps/desktop app` opens the window from the checkout
with live reload. The CLI it drives is whichever `parlour` its settings point
at, which is the global install by default. To have it run this checkout, set
**The parlour command** on the Settings tab to the absolute path of
`packages/parlour/bin/parlour-dev`; there is more in
[the menu bar app page](https://heyparlour.app/docs/desktop#running-the-app-against-a-checkout).
`pnpm exec nx run desktop:cargo-check` is what CI runs on the Rust side.

## Where things go

| Change | Where |
| --- | --- |
| A new engine for an existing port | `packages/parlour/src/providers/<kind>/<name>.ts`, registered in `providers/index.ts`. Or an npm package, which needs no change here at all: see [the provider guide](https://heyparlour.app/docs/providers). |
| A new source of tools | `packages/parlour/src/integrations/<name>/`, same choice. |
| A new port | `core/ports.ts`, a slot in `core/config.ts`, wiring in `core/agent.ts`, a fake in `testing/`. Please open an issue first; a port is a promise to every provider. |
| Linux | A `systemd` service provider and audio providers that do not need avfoundation. `core/paths.ts` already follows XDG, so that part is done. |
| A CLI command | `packages/parlour/src/cli/<name>.ts` exporting a `Command`, listed in `cli/main.ts`. |
| The app | `apps/desktop`. It drives the CLI, so if the CLI cannot do it yet, add that first. |
| The website | `apps/site`. A Next.js app with one route; words in `app/page.tsx`, looks in `app/globals.css`. |
| The iOS app | `apps/ios`. A client of the server's routes, so if the server cannot do it yet, add that first. Generate the Xcode project with `nx run ios:generate`. |
| A colour, a size or a state | `packages/design/src/tokens.ts`, then `nx run design:emit`. Nothing else in the repository declares a colour; the `tokens.css` and `Tokens.swift` files are generated and checked in. |

## How we write it

- **TypeScript, strict.** Relative imports inside `packages/parlour/src` use
  the `.ts` extension. No enums, no parameter properties, no decorators: the
  source runs under Node's type stripping, which erases types and nothing
  else.
- **Tests next to the source**, as `*.test.ts`, with `node:test` and
  `node:assert/strict`. No test framework. Providers that need hardware, a
  model or a network are not unit tested; each has a `doctor()` instead, and
  that is the part worth getting right.
- **Biome** formats and lints. `pnpm lint`, or `pnpm exec biome check
  --write .` to fix what it can.
- **British English with no em dashes**, in comments, docs and everything the
  CLI prints. Comments explain why, not what.
- **Nothing secret in config.** Tokens and keys come from `secrets.env` or
  the environment, never from `config.json`, and are never printed.
- **If the doctor cannot see it, it will break silently.** A provider that
  depends on a binary, a file or a port checks for it in `doctor()` and says
  what to do about it.

## Pull requests

One change per pull request, please. Say what it does and why in the
description (the diff already says what), and mention anything you could not
test yourself, such as a Linux change made from a Mac. CI runs typecheck,
lint, the tests, the build and `cargo check`, and needs to be green before we
merge. On main it also bundles the app the way a release does, minus the
signing, so a tag is never the first time that build runs.

Commit messages are a sentence in the imperative, the way the history
already reads: "Move the agent into a workspace and call it Parlour".

If the pull request changes what the `parlour` package does, add a changeset:
run `pnpm changeset`, pick patch, minor or major, and write the one line you
would want to read in the changelog. It is a small file in `.changeset/`;
commit it with the change. Changes to the site, the app, the iOS app, the
design tokens or CI need none.

## Releasing

For maintainers. `pnpm release:version` gathers the changesets into
`packages/parlour/CHANGELOG.md`, bumps the package, and writes the same
version into the desktop app's `tauri.conf.json`,
`Cargo.toml` and `Cargo.lock`. You rarely run it yourself: on every push to
main, [`.github/workflows/changesets.yml`](.github/workflows/changesets.yml)
runs it and keeps a "Release the pending changesets" pull request up to date.
Merge that, then push a `vX.Y.Z` tag on the merge commit: it
publishes the package to npm and attaches the dmg to a GitHub release, with
notes generated from the pull requests since the last tag. `pnpm version:set
X.Y.Z` sets a version by hand when there are no changesets to go on.

The dmg is signed with a Developer ID certificate and notarised, so it opens
on a machine that has never seen this repository. That rests on six
repository secrets, which
[`.github/workflows/release.yml`](.github/workflows/release.yml) lists and
explains: the certificate and its password, the signing identity, and an
Apple ID with an app-specific password and a team. The workflow checks all
six before it builds anything, because a tag that fails is better than a
release nobody can open. The certificate lasts five years and the
app-specific password until somebody revokes it, so both will eventually be
the reason a release stops.

Tauri signs and notarises `Parlour.app` itself; `scripts/notarise.sh` does
the dmg, which Tauri signs but leaves without a ticket, and then asks
Gatekeeper about both. Run it by hand against a build of your own if you ever
need to check the signing outside a release.

The preflight only sees whether each secret is set, not whether it is right,
so run the release workflow by hand (Actions, Release, Run workflow) after
setting or rotating any of them. A manual run builds, signs and notarises the
app and stops: nothing goes to npm and no release is created, which makes it
a rehearsal you can spend freely rather than a version number you cannot get
back.
