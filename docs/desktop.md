# The menu bar app

`apps/desktop` is a Tauri app: a Rust shell around the `parlour` command,
with the window as the only interface. It exists so that the day-to-day
operations (start, stop, is it listening, what did it just hear, why is it
not answering) do not need a terminal. It is an interface, not a second
implementation: everything it knows about Parlour it learns by running the
CLI, and every setting it writes goes through `parlour config write`, so the
app and the terminal cannot end up with different ideas about the same house.

## Building it

Node 22, pnpm, and a Rust toolchain (`rustup`).

```sh
pnpm install
pnpm -C apps/desktop app        # against the checkout, with live reload
pnpm -C apps/desktop build      # Parlour.app and a dmg, in apps/desktop/src-tauri/target/release/bundle
```

The build is unsigned. Copy `Parlour.app` into `/Applications` and, the first
time, open it with a right click. Signing and notarising are a follow-up.

The app does not bundle Node or the package. It expects `parlour` to be on
the login shell's PATH, or in `/opt/homebrew/bin`, `/usr/local/bin` or
`~/.npm-global/bin`, and offers to run `npm install -g parlour` at its own
version when it is not. One copy of Parlour on the machine rather than two
that can disagree.

## The tabs

| Tab | What is on it |
| --- | --- |
| Onboarding | Opens itself on a machine that is not set up yet, and from **Run setup again** in Settings after that. Four steps: find or install `parlour`, an Install button that runs `parlour init --porcelain --yes` with its output live, the answers, and the doctor. |
| Status | A dot that follows Parlour through idle, listening, thinking and speaking, the last thing it heard, the last thing it said and which model said it, and a Check button that runs `parlour doctor --json`. |
| Settings | Wake word, sensitivity, microphone, silence timeout, voice, both models, the Home Assistant address, and the secrets. Reads `parlour config show --json`, writes through `parlour config write` and `parlour secrets set`. |
| Connectors | What the house has signed in to, and a form to add another. `parlour connectors` with buttons. |
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
on it and an orphaned ffmpeg holds the microphone.

The app's own settings live at
`~/Library/Application Support/io.parlour.desktop/settings.json`:
`{ "parlourBin": "/opt/homebrew/bin/parlour", "autostart": false }`.

## Two rules worth knowing

- **The app and the LaunchAgent are alternatives.** Two copies of Parlour
  means two processes fighting over one microphone and one port. `parlour
  init` asks which you want and sets up only that one; from the app,
  `init` leaves the agent to the app. `parlour service status` says whether a
  LaunchAgent exists, and `parlour service uninstall` removes it.
- **Microphone permission belongs to whatever starts it.** macOS grants it
  to the process that is held responsible, which for anything the app spawns
  is the app. Onboarding asks as soon as it can, by opening the device for a
  fraction of a second, which is what makes the system prompt appear; the
  bundle carries the `NSMicrophoneUsageDescription` the prompt needs, without
  which macOS refuses rather than asks. The grant is recorded against the
  bundle identifier, so it survives rebuilds, and it covers Parlour because
  Parlour is the app's child. A LaunchAgent is a separate grant, and it asks
  the first time it runs.

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
