# parlour

A local-first voice agent for the house: wake word, speech to text, a local
model with tools, speech back, and a cloud model behind it for the questions
the local one should not attempt. It controls Home Assistant over MCP and
reaches anything else through MCP too.

macOS with Node 22 or later. The rest (ffmpeg, whisper.cpp, the models) is
fetched by `init`.

```sh
npm install -g parlour
parlour init          # dependencies, models, config, secrets, a service or the app
parlour text          # try it without a microphone
parlour start         # the real thing
```

Day to day:

```sh
parlour doctor            which of the moving parts is down
parlour service status    is it running, and does it start at login
parlour service logs      what it has been saying
parlour config edit       ~/.config/parlour/config.json
parlour secrets status    which secrets are set, never their values
parlour connectors list   the household's connected accounts
parlour models fetch      the wake word and whisper models
```

`parlour <command> --help` prints each command's flags. `PARLOUR_HOME` moves
the config directory; `--config <file>` or `PARLOUR_CONFIG` moves only the
config file.

## As a library

Every stage is a provider behind a port, and a third-party provider is an
npm package whose default export is a `defineProvider({...})`:

```ts
import { defineProvider, type TextToSpeech } from "parlour";

export default defineProvider<TextToSpeech>({
  kind: "tts",
  name: "parlour-tts-example",
  description: "An example voice",
  create: (options, context) => ({ warm: async () => {}, render: async (text) => renderSomehow(text) }),
});
```

Named in config as `"tts": { "provider": "parlour-tts-example" }`, it is
loaded on first use with no change to Parlour. Fakes for every port are
exported from `parlour/testing`.

## Documentation

Everything else is in the repository:

- [Architecture](https://github.com/mrprkr/parlour/blob/main/docs/architecture.md)
- [Writing a provider](https://github.com/mrprkr/parlour/blob/main/docs/providers.md)
- [Clients: satellites, phones, hardware, automations](https://github.com/mrprkr/parlour/blob/main/docs/clients.md)
- [Home Assistant](https://github.com/mrprkr/parlour/blob/main/docs/home-assistant.md)
- [The menu bar app](https://github.com/mrprkr/parlour/blob/main/docs/desktop.md)
- [Tuning](https://github.com/mrprkr/parlour/blob/main/docs/tuning.md)

MIT. Copyright (c) 2026 Michael Parker.
