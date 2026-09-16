# Changelog

All notable changes to Parlour. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the versions
follow [Semantic Versioning](https://semver.org/).

## 0.1.0

First public release, extracted from a private Home Assistant configuration.

- The `parlour` package: a core of ports, a provider registry that loads
  third-party providers from npm, the built-in providers (ffmpeg, afplay,
  openWakeWord, whisper.cpp, Kokoro, macOS `say`, any OpenAI-compatible
  model, Anthropic, SearXNG, Brave), and the Home Assistant, MCP and
  connectors integrations.
- The CLI: `init`, `start`, `text`, `doctor`, `service`, `connectors`,
  `models`, `config` and `secrets`, with `--json` and `--porcelain` for the
  app.
- The network server: `/ask`, `/voice`, `/listen`, the OpenAI-compatible
  `/v1` for Home Assistant, the phone page, Bonjour, and the satellite role.
- The menu bar app, which now drives the CLI and knows nothing else.
- Config moved to `~/.config/parlour/config.json` with a provider name in
  every slot; `parlour init` converts an old `agent.config.json`. The
  network token is `PARLOUR_TOKEN`; `AGENT_TOKEN` is still read for this
  release. The model id reported at `/v1/models` is `parlour`.
