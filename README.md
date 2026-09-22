# Parlour

Parlour is a voice assistant for your home that runs on a Mac you already
own. Say the wake word, ask for what you want, and it answers out loud:
lights, heating, timers, what is on the calendar, and anything else your Home
Assistant can reach. A small model on the Mac handles the house. When a
question is beyond it, a cloud model steps in, and all it ever gets is the
sentence you said, never the audio.

You can read the short version at
[heyparlour.app](https://heyparlour.app).

## What happens when you speak

```text
"Hey Jarvis"        openWakeWord, in process, always local
  -> record         energy endpointing, stops on 800 ms of silence
  -> speech to text whisper.cpp, small.en, kept warm on this machine
  -> the queue      one lane per room, so two satellites never wait on each other
  -> triage         the words repaired, and the request split into a list of tasks
  -> the model      a local model with tools, over the OpenAI API, one task at a time
       -> tools     Home Assistant over MCP, plus timers, search and connectors
       -> escalate  Claude, when the local model says it is out of its depth
  -> text to speech Kokoro, in process
  -> the speakers
```

Every stage is a provider behind a small interface, and you pick each one by
name in a single config file. The built-in choices are the fastest things we
have found for Apple silicon. If you would rather use something else, it is an
npm package away: see [the provider guide](https://heyparlour.app/docs/providers).

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

`init` walks you through it with arrow keys and a handful of questions: what
this machine is, which local model to run, your Home Assistant, an Anthropic
key if you would like the cloud behind it, and preferences like the wake word
and the voice. Escape goes back a question, and nothing is downloaded or
written until a last screen has shown every answer and you have said yes. It
writes `~/.config/parlour/config.json` and `secrets.env`, offers to run
Parlour at login, and finishes by running `parlour doctor` so you know
everything is in place. Changed your mind later? Run `init` again: every
answer defaults to what is already set.

**The local model comes with it.** `init` looks at how much memory the Mac
has, suggests the largest model it can hold comfortably, downloads it, and
keeps [llama.cpp](https://github.com/ggml-org/llama.cpp) serving it at login
alongside whisper. Nothing to install by hand and nothing to remember to
start. `parlour models suggest` shows the catalogue and which one it would
pick.

If you would rather run the model yourself, say so and point
`llm.local.baseUrl` at whatever you have: [LM Studio](https://lmstudio.ai)
(`init` still offers to install it), Ollama, or a box in the cupboard.
Anything that speaks the OpenAI chat completions API will do.

**Home Assistant** gets its own part of `init`: it looks for your Home
Assistant on the network, tells you exactly where to make a long lived token,
checks the token as you paste it, and checks the MCP Server integration is
switched on. Each of those fails in the same silent way, so each one is
checked as it is answered rather than all three landing in `parlour doctor`
half an hour later. Say no and the house is left out entirely.

**The cloud is optional.** Leave the Anthropic key empty and Parlour runs
local only: the local model keeps every tool, answers everything itself, and
not a word leaves the house.

## The commands

```text
parlour init [--yes] [--no-deps] [--no-service] [--porcelain]   dependencies, models, config, secrets, service or app
parlour start [--events]                         the server or the satellite, per config.role
parlour stop                                     stop it, until the next login
parlour restart                                  after editing config.json or a secret
parlour text                                     everything but the microphone
parlour doctor [--json]                          which of the moving parts is down
parlour service install|uninstall|stop|restart|status|logs
parlour connectors add <name> <url>|list|remove <name>
parlour mcp add <name> --url <url>|-- <command>...|list|remove <name>
parlour skills list|show <name>|new <name>|path
parlour plugins add <package>|list|remove <package>
parlour models fetch [--llm auto]|suggest
parlour config path|show|write|edit
parlour secrets status|set <NAME>
```

`parlour <command> --help` shows the flags for each one. `parlour connectors
add` signs your household in to a remote MCP server (a calendar, say) and
keeps the tokens in your Keychain. The `connectors` integration that loads
them is on by default, and if a hand-written config leaves it out,
`parlour doctor` will let you know.

## House rules, other people's tools

The house knows how to call a tool. It does not know that goodnight means
the porch light stays on and the rest go off. That is a skill: a markdown
file in `~/.config/parlour/skills` with a name, a sentence saying when it
applies, and the rule itself.

```md
---
name: bedtime
description: What goodnight means in this house
---

Turn off the kitchen, hall and lounge lights, leave the porch light on,
and set the thermostat to 17. Say "goodnight" and nothing else.
```

Only the name and the sentence sit in the prompt; the model fetches the
body when it decides the rule applies, so a house can have thirty rules
without every answer getting slower. `parlour skills new bedtime` writes
the file and `parlour skills list` shows what the model can see.

Anything that speaks MCP is a source of tools, added with
`parlour mcp add <name> --url <url>` or, for a server this machine starts,
`parlour mcp add <name> -- npx -y @someone/notes-mcp`. A plugin is one npm
package bringing providers, skills and MCP servers together:
`parlour plugins add parlour-plugin-car`. All three are in
[Skills, MCP and plugins](https://heyparlour.app/docs/skills).

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
[the clients page](https://heyparlour.app/docs/clients).

## Documentation

The docs live at [heyparlour.app/docs](https://heyparlour.app/docs), and
in `apps/site/content/docs` in this repository.

| Page | What it covers |
| --- | --- |
| [Architecture](https://heyparlour.app/docs/architecture) | The ports, the provider registry, the session state machine, and why the pieces are the pieces. |
| [Writing a provider](https://heyparlour.app/docs/providers) | Writing a provider or an integration as an npm package, with a worked example. |
| [Skills, MCP and plugins](https://heyparlour.app/docs/skills) | House rules as markdown, somebody else's tools over MCP, and one package that brings both. |
| [Clients](https://heyparlour.app/docs/clients) | Satellites, the phone page, custom hardware, `/ask`, and Bonjour. |
| [Home Assistant](https://heyparlour.app/docs/home-assistant) | The MCP Server integration, the OpenAI Conversation integration, muting, and moving over from the old config. |
| [The menu bar app](https://heyparlour.app/docs/desktop) | What the app does, how it drives the CLI, and running it against a checkout. |
| [Tuning](https://heyparlour.app/docs/tuning) | Which setting to turn when it keeps waking up for the television. |
| [Your own wake word](https://heyparlour.app/docs/wake-word) | Training a wake word of your own, and dropping it in. |

## The repository

```text
packages/parlour   the npm package: core, built-in providers, integrations, server, CLI
apps/desktop       the menu bar app: Tauri, React and a Rust shell that drives the CLI
apps/site          the website: the front page and the docs, Next.js and MDX
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
