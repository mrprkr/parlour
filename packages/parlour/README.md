# parlour

A voice assistant for your home that runs on a Mac you already own. Say the
wake word and ask: it hears you with a local wake word and whisper.cpp,
thinks with a local model that has tools, speaks back with a local voice,
and only hands a question to a cloud model when the local one says it is out
of its depth. It controls Home Assistant over MCP, and reaches anything else
that has an MCP server too.

You will need a Mac with Node 22 or later and [Homebrew](https://brew.sh).
`init` fetches the rest (ffmpeg, whisper.cpp and the models) through `brew`.

```sh
npm install -g parlour
parlour init          # dependencies, models, config, secrets, and a service or the app
parlour text          # have a conversation in the terminal, no microphone needed
parlour start         # the real thing
```

Day to day:

```sh
parlour doctor            which of the moving parts is down, and how to fix it
parlour service status    is it running, and does it start at login
parlour service logs      what it has been saying
parlour config edit       ~/.config/parlour/config.json
parlour secrets status    which secrets are set, never their values
parlour connectors list   the accounts your household has signed in to
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

- [Architecture](https://github.com/mrprkr/parlour/blob/main/docs/architecture.md)
- [Writing a provider](https://github.com/mrprkr/parlour/blob/main/docs/providers.md)
- [Clients: satellites, phones, hardware, automations](https://github.com/mrprkr/parlour/blob/main/docs/clients.md)
- [Home Assistant](https://github.com/mrprkr/parlour/blob/main/docs/home-assistant.md)
- [The menu bar app](https://github.com/mrprkr/parlour/blob/main/docs/desktop.md)
- [Tuning](https://github.com/mrprkr/parlour/blob/main/docs/tuning.md)
- [Your own wake word](https://github.com/mrprkr/parlour/blob/main/docs/wake-word.md)

MIT. Copyright (c) 2026 Michael Parker.
