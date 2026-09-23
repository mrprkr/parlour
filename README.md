# Parlour

Parlour is a voice assistant for your home that runs on a Mac you already
own. Say the wake word, ask for what you want, and it answers out loud:
lights, heating, timers, what is on the calendar, and anything else your Home
Assistant can reach. A small model on the Mac handles the house. When a
question is beyond it, a cloud model steps in, and all it ever gets is the
sentence you said, never the audio.

Read more, and the full docs, at
[heyparlour.app](https://heyparlour.app).

## What happens when you speak

```text
"Hey Jarvis"        openWakeWord, in process, always local
  -> record         energy endpointing, stops on 800 ms of silence
  -> speech to text whisper.cpp, small.en, kept warm on this machine (or yap, Apple's own, or Parakeet on MLX)
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

```sh
npm install -g parlour
parlour init
```

`init` asks a handful of questions, fetches the models and checks everything
is in place. [Getting started](https://heyparlour.app/docs/getting-started)
walks through each step, and [the commands](https://heyparlour.app/docs/commands)
cover the rest.

## More than the lights

Home Assistant is where most houses start, but Parlour is not limited to it.
Anything that speaks MCP is a source of tools: a calendar, your notes, a
shopping list, the car, a server you wrote on a Sunday afternoon. Add one with
`parlour mcp add`, or sign the household in to a remote one with
`parlour connectors add`.

Skills teach it how your house works, as plain markdown: what goodnight means,
which room is the study, how you like the heating. Plugins bundle providers,
skills and MCP servers into one npm package, and every stage of the pipeline
can be swapped for one of your own. See
[Skills, MCP and plugins](https://heyparlour.app/docs/skills) and
[Writing a provider](https://heyparlour.app/docs/providers).

## Every room, and your pocket

One Mac does the thinking. Every other room gets a way in: a spare Mac as a
satellite, a Home Assistant Voice PE, the page the server serves to any
phone, or hardware of your own over a socket. Leave the house and
[Parlour for iOS](https://heyparlour.app/docs/ios) comes with you, with
HomeKit and a model on the phone for when home is out of reach.
[Clients](https://heyparlour.app/docs/clients) has how each one connects.

## The repository

```text
packages/parlour   the npm package: core, built-in providers, integrations, server, CLI
packages/design    the tokens and icons every interface is drawn from
apps/desktop       the menu bar app: Tauri, React and a Rust shell that drives the CLI
apps/ios           Parlour for iOS: SwiftUI, a client of the server
apps/site          the website: the front page and the docs, Next.js and MDX
```

pnpm and nx. `pnpm install`, then `pnpm check` runs typecheck, lint and the
tests across every project. A change to the npm package comes with a
changeset: `pnpm changeset` asks which kind of bump it is and writes one line
for the changelog. [CONTRIBUTING.md](CONTRIBUTING.md) has the rest, and we
would be glad of your help.

## Limitations

Parlour is young, and a few things are still on the list:

- **It does not know who is speaking.** Everyone in the house shares one set
  of preferences and one set of connected accounts.
- **It hears itself.** There is no echo cancellation yet, so interrupting a
  reply with the wake word is off by default.
- **There is one server.** If that Mac is off, the other rooms wait for it.
- **Mac only, for now.** The platform-specific parts sit behind interfaces, so
  Linux support is a contribution rather than a rewrite, and one we would
  love to see.

## Licence

MIT. Copyright (c) 2026 Michael Parker.
