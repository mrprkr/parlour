# parlour

A voice assistant for your home that runs on a Mac you already own. Say the
wake word and ask: it hears you with a local wake word and whisper.cpp,
thinks with a local model that has tools, speaks back with a local voice,
and only hands a question to a cloud model when the local one says it is out
of its depth. It controls Home Assistant over MCP, and reaches anything else
that has an MCP server too.

You will need a Mac with Node 22 or later and [Homebrew](https://brew.sh).
`init` fetches the rest (ffmpeg, whisper.cpp, llama.cpp and the models)
through `brew`, including a local model sized to the machine, so there is
nothing to install by hand and nothing to remember to start.

```sh
npm install -g parlour
parlour init          # dependencies, models, config, secrets, and a service or the app
parlour text          # have a conversation in the terminal, no microphone needed
parlour start         # the real thing
```

Day to day:

```sh
parlour doctor            which of the moving parts is down, and how to fix it
parlour restart           after editing config.json or a secret
parlour stop              until the next login
parlour service status    is it running, and does it start at login
parlour service logs      what it has been saying
parlour config edit       ~/.config/parlour/config.json
parlour secrets status    which secrets are set, never their values
parlour connectors list   the accounts your household has signed in to
parlour models suggest    which local model fits this machine
parlour models fetch      the wake word and whisper models
```

`parlour <command> --help` shows each command's flags. `PARLOUR_HOME` moves
the config directory; `--config <file>` or `PARLOUR_CONFIG` moves just the
config file.

## As a library

Every stage is a provider behind a port, and a third-party provider is
simply an npm package whose default export is a `defineProvider({...})`:

```ts
import { defineProvider, type TextToSpeech } from "parlour";

export default defineProvider<TextToSpeech>({
  kind: "tts",
  name: "parlour-tts-example",
  description: "An example voice",
  create: (options, context) => ({ warm: async () => {}, render: async (text) => renderSomehow(text) }),
});
```

Name it in config as `"tts": { "provider": "parlour-tts-example" }` and
Parlour loads it on first use, with no change to Parlour itself. Fakes for
every port are exported from `parlour/testing` so you can test yours without
hardware.

## Documentation

The rest lives in the repository:

- [Architecture](https://heyparlour.app/docs/architecture)
- [Writing a provider](https://heyparlour.app/docs/providers)
- [Clients: satellites, phones, hardware, automations](https://heyparlour.app/docs/clients)
- [Home Assistant](https://heyparlour.app/docs/home-assistant)
- [The menu bar app](https://heyparlour.app/docs/desktop)
- [Tuning](https://heyparlour.app/docs/tuning)
- [Your own wake word](https://heyparlour.app/docs/wake-word)

MIT. Copyright (c) 2026 Michael Parker.
