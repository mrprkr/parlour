# Security

Parlour runs with a token that can control a house, holds API keys, and
listens on the network. Please report anything that weakens that privately.

## Reporting

Use GitHub's private vulnerability reporting: **Security > Report a
vulnerability** on the repository. Do not open a public issue for something
that could be used against a house before it is fixed. You will get a reply
within a week, and a fix or a plan within a month for anything confirmed.

## What counts

- **Token handling.** `PARLOUR_TOKEN`, `HA_TOKEN` and the API keys must never
  appear in config, in the logs, in `--json` output, in the event stream, in
  a process listing or in the desktop app's window. Connector tokens belong
  in the Keychain (or the mode-600 file store) and nowhere else.
- **The network server.** Anything reachable without the token beyond
  `/health`; any way to bind beyond loopback without a token; anything that
  reads a file outside `src/server/web` through the page routes; a way to
  make one client's conversation leak into another's.
- **Connectors.** The OAuth flow (the loopback redirect, PKCE, token
  refresh), and a connector's tools being reachable by something that is
  not the household.
- **Installation.** `parlour init`, `parlour models fetch` and the app's
  `npm install -g` fetching from anywhere other than where they say.
- **The prompt.** A tool result or a transcription that can make the model
  call a tool it was not asked to. This one is hard to fix in general;
  reports with a concrete reproduction are still wanted.

Out of scope: the security of Home Assistant, LM Studio, whisper.cpp or any
other service Parlour talks to, and anything that needs the attacker to
already have the token or a shell on the machine.

## Supported versions

The latest release. Parlour is pre-1.0 and fixes go into the next release
rather than being backported.
