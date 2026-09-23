# The Mac App Store build

The same app as the dmg, built differently. The dmg drives a `parlour` that npm
installed, with ffmpeg and whisper from Homebrew and LaunchAgents to keep things
running. None of that is allowed in the App Store: an app there runs in the App
Sandbox, may not install code, may not run programs from outside itself and may
not write LaunchAgents. So this build carries everything inside it and keeps
Parlour running itself.

| | dmg | App Store |
| --- | --- | --- |
| parlour | `npm install -g parlour`, found through a login shell | inside the app, run by the app's own node |
| node, ffmpeg | the person's own, Homebrew for ffmpeg | inside the app |
| whisper-server, llama-server | Homebrew, kept warm by LaunchAgents | inside the app, started by `parlour start` |
| afplay, say | macOS, `/usr/bin` | macOS, `/usr/bin`, which is on the PATH the app gives parlour; a sandboxed app may run system programs, and they inherit its sandbox |
| config, secrets, models, logs | `~/.config/parlour`, `~/Library/...` | the same paths, inside the app's container |
| connector tokens | the Keychain | `secrets.env` in the container |
| open at login | "Start listening when this app opens" plus a LaunchAgent | SMAppService, a Login Item the person can see |
| signing | Developer ID, notarised | Apple Distribution, sandboxed, uploaded |
| macOS | 11 | 13 |

The Rust side is the `appstore` Cargo feature. The parlour side needs no build
flag: macOS sets `APP_SANDBOX_CONTAINER_ID` in every sandboxed process, and
`packages/parlour/src/core/sandbox.ts` is how the CLI knows where it is.

## The files

- `stage.ts` downloads Node and builds ffmpeg, whisper-server and llama-server
  at pinned, hash-checked versions, then deploys the parlour package from this
  checkout with production dependencies only. The builds are cached in `.cache`.
- `../src-tauri/tauri.appstore.conf.json` is merged over `tauri.conf.json`. It
  adds the binaries and the package to the bundle and raises the minimum macOS.
- `../src-tauri/AppStore.entitlements` covers the app: sandbox, microphone,
  network client and server. `AppStoreChild.entitlements` covers everything
  inside it: sandbox plus inherit, and nothing else.
- `package.sh` stages, builds, signs from the inside out, makes the `.pkg`,
  and with `--upload` validates and uploads it.
- `.github/workflows/appstore.yml` runs `package.sh --upload` when started by
  hand from the Actions tab. The header lists the secrets it needs.

## Trying it on your own Mac

```sh
brew install cmake
pnpm build:appstore
open apps/desktop/appstore/out/Parlour.app
```

With no signing variables set, it signs ad hoc and stops before the package.
The result runs sandboxed on the machine that built it, which is the quickest
way to find out what the sandbox refuses before App Review does. Its data goes
in `~/Library/Containers/io.parlour.desktop/Data`.

## One-time setup in the Apple Developer account

1. Register the App ID `io.parlour.desktop` under Identifiers. It needs no extra
   capabilities.
2. Create an **Apple Distribution** certificate and a **Mac Installer
   Distribution** certificate. Export both, with their keys, into one `.p12`.
3. Create a **Mac App Store Connect** provisioning profile for the App ID and
   the distribution certificate.
4. In App Store Connect, create a macOS app with that bundle ID. Set the
   category and the privacy details (microphone, and data sent to Anthropic
   only when the cloud model is turned on).
5. Create an App Store Connect API key with the App Manager role.
6. Add the secrets listed in `appstore.yml` to the repository.

## Things App Review will ask about

- **The sandbox exception in 2.4.5.** Everything that runs is inside the bundle,
  downloads are model weights (data, not code), and nothing starts at login
  without the person choosing it in Settings.
- **Background running.** Parlour keeps listening while its window is closed.
  That is what it is for, it lives in the menu bar, and quitting from the menu
  stops everything it started.
- **The microphone and the local network.** Both have usage strings in
  `Info.plist`. The review notes should say what the wake word is and that
  audio never leaves the Mac unless the cloud model is on.
- **Plugins.** `config.plugins` loads npm packages. Nothing in the sandbox can
  install one, so in this build it is effectively off. The review notes should
  say so rather than leave the reviewer to find the key.
- **Licences.** ffmpeg is built LGPL (`--disable-gpl` is its default, and
  nothing GPL is enabled), and statically linked. The About box, or a licences
  file in the bundle, has to credit ffmpeg, whisper.cpp, llama.cpp and Node, and
  point to where ffmpeg's source and build flags are (`stage.ts`).

## Not done yet

- Apple silicon only, like the dmg. Universal would mean both Node tarballs
  joined with `lipo` and the three builds run twice.
- The Python providers (`parakeet-mlx`, `laya-mlx`) need a Python that the
  sandbox build does not carry, so there they report as unavailable in the
  doctor and whisper is the speech to text.
- `yap` is a separate Homebrew tool, so the same applies to it.
