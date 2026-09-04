# desktop

The menu bar app: a Tauri shell that starts, stops, configures and watches the
agent in the directory above. It is an interface, not a second implementation.
Every setting it writes is the same `agent.config.json` and `.env` the terminal
uses, and its dependency check runs the agent's own `pnpm doctor`.

```sh
pnpm install
pnpm dev             # against the checkout, with live reload
pnpm build           # Home Agent.app and a dmg, in src-tauri/target/release/bundle
```

`bash ../install.sh` offers to do the build and copy the result into
`/Applications`.

## How it fits together

```text
ui/                 plain HTML, CSS and one module. No framework, no bundler.
  |  invoke()
src-tauri/src/
  main.rs           commands, the tray, and the window
  supervisor.rs     the agent as a child process, and its NDJSON events
  settings.rs       the app's own two facts: which agent, which node
```

The agent emits structured events when `AGENT_EVENTS=1`, so the app knows the
difference between listening and thinking without parsing log text. Anything
that is not an event is log output, which is where a failure to start shows up.

Stopping sends SIGINT rather than SIGKILL, because the agent shuts ffmpeg down
on it and an orphaned ffmpeg holds the microphone.

## Deliberate choices

- **No Tauri plugins.** Everything the app does happens in Rust, where it can
  be reasoned about, so the window's capability list is just `core:default`.
- **The app does not bundle node or the agent.** It drives a checkout that
  `install.sh` has already set up, which keeps one copy of the agent on the
  machine rather than two that can disagree.
- **Icons are generated.** `src-tauri/icons/icon.png` is the only one in git;
  `pnpm icons` derives the rest, and both `dev` and `build` run it first.
