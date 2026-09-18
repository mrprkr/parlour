# Parlour

Parlour is a voice assistant for your home that runs on a Mac you already
own. Say the wake word, ask for what you want, and it answers out loud:
lights, heating, timers, what is on the calendar, and anything else your Home
Assistant can reach. A small model on the Mac handles the house. When a
question is beyond it, a cloud model steps in, and all it ever gets is the
sentence you said, never the audio.

You can read the short version at
[parlour-mrprkr-team.vercel.app](https://parlour-mrprkr-team.vercel.app).

## What happens when you speak

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

Every stage is a provider behind a small interface, and you pick each one by
name in a single config file. The built-in choices are the fastest things we
have found for Apple silicon. If you would rather use something else, it is an
npm package away: see [docs/providers.md](docs/providers.md).

## Getting started

You will need a Mac with Node 22 or later and [Homebrew](https://brew.sh).
`init` fetches the rest for you (ffmpeg, whisper.cpp and the models) through
`brew`.

```sh
npm install -g parlour
parlour init
parlour text          # have a conversation in the terminal, no microphone needed
parlour start         # the real thing, unless init already set it to run at login
```

`init` walks you through it: your Home Assistant address and token, an
Anthropic key if you would like the cloud behind it, and a few preferences
like the wake word and the voice. It writes `~/.config/parlour/config.json`
and `secrets.env`, offers to run Parlour at login, and finishes by running
`parlour doctor` so you know everything is in place. Changed your mind about
something? Run `init` again.

For the local model, [LM Studio](https://lmstudio.ai) is the easy option, and
anything that speaks the OpenAI chat completions API works too. `init` offers
to install LM Studio; you load a model and switch its server on.

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

`parlour <command> --help` shows the flags for each one. `parlour connectors
add` signs your household in to a remote MCP server (a calendar, say) and
keeps the tokens in your Keychain. The `connectors` integration that loads
them is on by default, and if a hand-written config leaves it out,
`parlour doctor` will let you know.

## One server, any number of rooms

One machine runs the models, holds the tokens and does the answering.
Everything else with a microphone is a client of it, and the server's own
microphone is just one client among them, with no special privileges.

| Client | How it connects | Who does the wake word |
| --- | --- | --- |
| The server's microphone | In process. | Parlour, openWakeWord. |
| A satellite | `role: "satellite"`. Finds the server with Bonjour and holds a socket open. | The server, over the stream. Or the satellite itself, with `localWake`. |
| Home Assistant, and every Voice PE satellite through it | The OpenAI-compatible endpoint at `/v1`. | The Voice PE, on device. Home Assistant does speech to text and speech back. |
| A phone | The page the server serves at `/`. Hold the button. | Nobody. Your thumb is a better endpoint detector, and the phone is not listening to the room all day. |
| Custom hardware | The socket at `/listen`, raw 16 kHz mono PCM. | The server, or the device. Its choice. |
| An automation | `POST /ask` with text, an answer back as text. | Nobody. |

All of them need `PARLOUR_TOKEN`. Without it the server only listens on
loopback and does not advertise itself, because a voice assistant on an open
port can turn the heating on and read your shopping list. The details are in
[docs/clients.md](docs/clients.md).

## Documentation

| Page | What it covers |
| --- | --- |
| [docs/architecture.md](docs/architecture.md) | The ports, the provider registry, the session state machine, and why the pieces are the pieces. |
| [docs/providers.md](docs/providers.md) | Writing a provider or an integration as an npm package, with a worked example. |
| [docs/clients.md](docs/clients.md) | Satellites, the phone page, custom hardware, `/ask`, and Bonjour. |
| [docs/home-assistant.md](docs/home-assistant.md) | The MCP Server integration, the OpenAI Conversation integration, muting, and moving over from the old config. |
| [docs/desktop.md](docs/desktop.md) | The menu bar app. |
| [docs/tuning.md](docs/tuning.md) | Which setting to turn when it keeps waking up for the television. |

## The repository

```text
packages/parlour   the npm package: core, built-in providers, integrations, server, CLI
apps/desktop       the menu bar app: Tauri, React and a Rust shell that drives the CLI
apps/site          the website, one page and one stylesheet
docs/              the pages above
```

pnpm and nx. `pnpm install`, then `pnpm check` runs typecheck, lint and the
tests across every project. [CONTRIBUTING.md](CONTRIBUTING.md) has the rest,
and we would be glad of your help.

## What Parlour does not do, on purpose

- **Tell voices apart.** Everyone in the house is the same user.
- **Cancel its own echo.** Which is why barge-in is off by default.
- **Fail over.** There is one server. If it is off, the satellites wait for
  it rather than electing a new one; a house with two brains that disagree is
  worse than a house with none.
- **Per-person connectors.** Tokens belong to the household. A satellite
  cannot tell who is talking, so neither can Parlour.
- **Linux.** Not yet. The platform-specific parts (the service manager, the
  secret store, audio in and out) sit behind interfaces, so it is a
  contribution rather than a rewrite, and one we would love to see.

## Licence

MIT. Copyright (c) 2026 Michael Parker.
