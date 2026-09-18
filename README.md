# Parlour

A voice agent for the house that runs on a Mac you already own. It listens for
a wake word, answers out loud, controls Home Assistant, and reaches anything
else through MCP. A small local model handles the house; a cloud model handles
the questions the local one should not attempt, and only ever receives the
sentence, never the audio.

## The loop

```text
"Hey Jarvis"        openWakeWord, in process, always local
  -> record         energy endpointing, stops on 800 ms of silence
  -> speech to text whisper.cpp, small.en, kept warm on this machine
  -> the model      a local model with tools, over the OpenAI API
       -> tools     Home Assistant over MCP, plus timers, search and connectors
       -> escalate  Claude, when the local model says it is out of its depth
  -> text to speech Kokoro, in process
  -> the speakers
```

Every stage is a provider behind an interface, chosen by name in one config
file. The built-in ones are the fastest thing that runs on Apple silicon; a
different one is an npm package away. See [docs/providers.md](docs/providers.md).

The short version lives at [parlour-mrprkr-team.vercel.app](https://parlour-mrprkr-team.vercel.app).

## Quick start

macOS with Node 22 or later and [Homebrew](https://brew.sh). Everything
else (ffmpeg, whisper.cpp, the models) is fetched by `init` through `brew`.

```sh
npm install -g parlour
parlour init
parlour text          # try it without a microphone
parlour start         # the real thing, unless init already runs it at login
```

`init` asks for the Home Assistant address and token, an Anthropic key if you
want the cloud behind it, and a handful of preferences. It writes
`~/.config/parlour/config.json` and `secrets.env`, offers to run Parlour at
login, and finishes with `parlour doctor`. Run it again to change your mind.

The local model is [LM Studio](https://lmstudio.ai) or anything else that
speaks the OpenAI chat completions API. `init` offers to install it; you load
a model and turn its server on.

## The commands

```text
parlour init [--yes] [--no-deps] [--no-service] [--porcelain]   dependencies, models, config, secrets, service or app
parlour start [--events]                         the server or the satellite, per config.role
parlour text                                     everything but the microphone
parlour doctor [--json]                          which of the moving parts is down
parlour service install|uninstall|restart|status|logs
parlour connectors add <name> <url>|list|remove <name>
parlour models fetch
parlour config path|show|write|edit
parlour secrets status|set <NAME>
```

`parlour <command> --help` prints the flags for each. `parlour connectors
add` signs the house in to a remote MCP server and keeps the tokens in the
Keychain; the `connectors` integration that loads them is on by default, and
`parlour doctor` says so if a config written by hand has left it out.

## One server, any number of clients

One machine runs the models, holds the tokens and answers. Everything else
with a microphone is a client of it, and the server's own microphone is one
client among these and not a privileged one.

| Client | How it connects | Who does the wake word |
| --- | --- | --- |
| The server's microphone | In process. | Parlour, openWakeWord. |
| A satellite | `role: "satellite"`. Finds the server with Bonjour, holds a socket open. | The server, over the stream. Optionally the satellite, with `localWake`. |
| Home Assistant, and every Voice PE satellite through it | The OpenAI-compatible endpoint at `/v1`. | The Voice PE, on device. Home Assistant does speech to text and speech back. |
| A phone | The page the server serves at `/`. Hold the button. | Nobody. A thumb is a better endpoint detector, and the phone is not listening to the room all day. |
| Custom hardware | The socket at `/listen`, raw 16 kHz mono PCM. | The server, or the device, its choice. |
| An automation | `POST /ask` with text, an answer back as text. | Nobody. |

Every one of them needs `PARLOUR_TOKEN`. Without it the server binds to
loopback and does not advertise itself, because a voice agent on an open port
can turn the heating on and read the shopping list. Details in
[docs/clients.md](docs/clients.md).

## Documentation

| Page | What it covers |
| --- | --- |
| [docs/architecture.md](docs/architecture.md) | The ports, the provider registry, the session state machine, and why the pieces are the pieces. |
| [docs/providers.md](docs/providers.md) | Writing a provider or an integration as an npm package, with a worked example. |
| [docs/clients.md](docs/clients.md) | Satellites, the phone page, custom hardware, `/ask`, and Bonjour. |
| [docs/home-assistant.md](docs/home-assistant.md) | The MCP Server integration, the OpenAI Conversation integration, muting, and migrating from the old config. |
| [docs/desktop.md](docs/desktop.md) | The menu bar app. |
| [docs/tuning.md](docs/tuning.md) | Which setting to turn when it fires at the television. |

## The repository

```text
packages/parlour   the npm package: core, built-in providers, integrations, server, CLI
apps/desktop       the menu bar app: Tauri, React and a Rust shell that drives the CLI
docs/              the pages above
```

pnpm and nx. `pnpm install`, then `pnpm check` runs typecheck, lint and the
tests across both projects. [CONTRIBUTING.md](CONTRIBUTING.md) has the rest.

## What is deliberately missing

- **Speaker identification.** Everyone in the house is the same user.
- **Acoustic echo cancellation.** Which is why barge-in is off by default.
- **Failover.** One server. If it is off, the satellites wait for it rather
  than electing a new one; a house with two brains that disagree is worse
  than a house with none.
- **Per-person connectors.** Tokens belong to the household. A satellite
  cannot tell who is talking, so neither can Parlour.
- **Linux.** The platform-specific parts (the service manager, the secret
  store, audio in and out) sit behind interfaces so it is a contribution
  rather than a rewrite. Nobody has made it yet.

## Licence

MIT. Copyright (c) 2026 Michael Parker.
