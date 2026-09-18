# The menu bar app

`apps/desktop` is a Tauri app: a Rust shell around the `parlour` command,
with a window as its only interface. It exists so that the everyday things
(start, stop, is it listening, what did it just hear, why is it not
answering) never need a terminal. It is an interface rather than a second
implementation: everything it knows about Parlour it learns by running the
CLI, and every setting it writes goes through `parlour config write`, so the
app and the terminal can never end up with different ideas about the same
house.

## Building it

You will need Node 22, pnpm, and a Rust toolchain (`rustup`).

```sh
pnpm install
pnpm -C apps/desktop app        # the window from the checkout, with live reload
pnpm -C apps/desktop build      # Parlour.app and a dmg, in apps/desktop/src-tauri/target/release/bundle
```

Live reload covers the window. The CLI it drives is whichever `parlour` the
app's settings point at, which on a fresh machine is the globally installed
one rather than the checkout: see
[Running the app against a checkout](#running-the-app-against-a-checkout).

The build is unsigned for now. Copy `Parlour.app` into `/Applications` and,
the first time, open it with a right click. Signing and notarising are on
the list.

The app does not bundle Node or the package. It expects `parlour` to be on
your login shell's PATH, or in `/opt/homebrew/bin`, `/usr/local/bin` or
`~/.npm-global/bin`, and offers to run `npm install -g parlour` at its own
version when it cannot find one. One copy of Parlour on the machine is
better than two that can disagree.

## The tabs

| Tab | What you will find there |
| --- | --- |
| Onboarding | Opens itself on a machine that is not set up yet, and from **Run setup again** in Settings after that. Four steps: find or install `parlour`, an Install button that runs `parlour init --porcelain --yes` with its output live, the questions, and the doctor. |
| Status | A dot that follows Parlour through idle, listening, thinking and speaking, the last thing it heard, the last thing it said and which model said it, and a Check button that runs `parlour doctor --json`. |
| Settings | Wake word, sensitivity, microphone, silence timeout, voice, both models, the Home Assistant address, and the secrets. It reads `parlour config show --raw` (the file as written, so saving does not freeze every default into it) and writes through `parlour config write` and `parlour secrets set`. |
| Connectors | What your household has signed in to, and a form to add another. `parlour connectors`, with buttons. |
| Logs | Parlour's output, live. |

## How it fits together

```text
src/
  App.tsx           the header, the tabs, and the state the panels read
  panels/           one file per tab, plus the onboarding overlay
  lib/bridge.ts     every Rust command, typed. Nothing else calls invoke()
  components/ui/    shadcn primitives
  |  invoke()
src-tauri/src/
  main.rs           the tray, the window, and one generic parlour(args, stdin) command
  supervisor.rs     parlour start --events as a child process, and its NDJSON events
  setup.rs          parlour init --porcelain, and npm install -g parlour, streamed
  settings.rs       the app's own two facts: where parlour is, and whether to start it
```

The Rust side knows the path to the `parlour` binary and nothing else. The
window asks for config, secrets, the doctor and the connectors through the
CLI's `--json` and stdin interfaces, and the supervisor reads the NDJSON that
`parlour start --events` prints (`ready`, `state`, `heard`, `reply`, `muted`,
`error`) rather than scraping log text. Anything on stdout that is not an
event is log output, which is where a failure to start shows up.

Stopping sends SIGINT rather than SIGKILL, because Parlour shuts ffmpeg down
on it, and an orphaned ffmpeg would keep hold of the microphone.

The app's own settings live at
`~/Library/Application Support/io.parlour.desktop/settings.json`:
`{ "parlourBin": "/opt/homebrew/bin/parlour", "autostart": false }`.

## Running the app against a checkout

`pnpm -C apps/desktop app` reloads the window from the checkout, but every
CLI call goes to the `parlourBin` in `settings.json`, which the app fills in
by asking your login shell for `parlour`. So a change to `packages/parlour`
is not what the app exercises until you point it there.
`packages/parlour/bin/parlour-dev` runs the CLI from source for exactly this
purpose. Put its absolute path in **The parlour command** on the Settings
tab (or on the onboarding's first step), which takes effect at once, or
write it to the file and restart the app, which reads the file once at
launch:

```json
{ "parlourBin": "/path/to/parlour/packages/parlour/bin/parlour-dev", "autostart": false }
```

The path is kept for as long as it is executable, so the app will not swap
it back for the global copy behind your back. The dev build and the
installed `Parlour.app` share the same settings file, so when you are done,
put the global path back, or delete the file and let the app find `parlour`
again.

## Two things worth knowing

- **The app and the LaunchAgent are alternatives, not a pair.** Two copies
  of Parlour means two processes fighting over one microphone and one port.
  `parlour init` asks which you want and sets up only that one; when the app
  runs `init`, it leaves the agent to the app. `parlour service status`
  tells you whether a LaunchAgent exists, and `parlour service uninstall`
  removes it.
- **Microphone permission belongs to whatever starts it.** macOS grants it
  to the process it holds responsible, which for anything the app spawns is
  the app. Onboarding asks as soon as it can, by opening the device for a
  fraction of a second, which is what makes the system prompt appear. The
  bundle carries the `NSMicrophoneUsageDescription` that prompt needs;
  without it macOS refuses rather than asks. The grant is recorded against
  the bundle identifier, so it survives rebuilds, and it covers Parlour
  because Parlour is the app's child. A LaunchAgent is a separate grant, and
  it asks the first time it runs.

## Deliberate choices

- **No Tauri plugins.** Everything the app does happens in Rust, where it can
  be reasoned about, so the window's capability list is just `core:default`.
- **A menu bar app in the strict sense.** The activation policy is
  Accessory, so there is no Dock icon and no menu bar of its own, and the
  tray is the way back to the window. Closing the window leaves Parlour
  running; quitting from the tray stops it properly.
- **Icons are generated.** `src-tauri/icon.png` is the only one in git;
  `pnpm icons` derives the rest into `src-tauri/icons/`, and both `app` and
  `build` run it first. The source sits outside that directory on purpose:
  `tauri icon` writes an `icon.png` into its output, so a source kept there
  would rewrite itself on every build and leave the working tree dirty.
