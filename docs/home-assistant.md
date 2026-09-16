# Home Assistant

Home Assistant is an integration: a source of tools, a line in the system
prompt, and a mute gate. It is on by default, configured under
`integrations["home-assistant"]`:

```json
{
  "integrations": {
    "home-assistant": {
      "url": "http://homeassistant.local:8123",
      "mcp": true,
      "rest": true,
      "muteEntity": ""
    }
  }
}
```

The token is `HA_TOKEN` in `secrets.env`: a long-lived access token from your
profile page in Home Assistant, Security tab, right at the bottom. `parlour
init` asks for it and checks it against your instance; `parlour secrets set
HA_TOKEN` takes it on stdin. It is the whole house, so it goes in
`secrets.env` with mode 600 and never into git.

## What Parlour can do with it

Tools come from two places and the model sees them as one list:

- **Over MCP** (`mcp: true`). Home Assistant's **Model Context Protocol
  Server** integration publishes the entities exposed under **Settings >
  Voice assistants > Expose** as tools, so Parlour inherits whatever is
  exposed. Expose more and it can do more; there is nothing to change on the
  Parlour side. Add the integration under **Settings > Devices & services**.
  It has no options. If Parlour cannot see a light, expose the light.
- **Over REST** (`rest: true`). Two escape hatches for what intents cannot
  say: `ha_get_state` reads any entity, `ha_call_service` calls any service.
  The prompt tells the model to prefer a more specific tool when one fits.

Parlour connects to the MCP endpoint at `<url>/mcp_server/sse` with the
token. Losing it does not lose the REST tools: a failure there is logged and
the house is still reachable the slow way.

## Home Assistant as a client

The other direction: Home Assistant, and every Voice PE satellite through it,
using Parlour as its conversation agent. Home Assistant keeps doing the wake
word, the speech to text and the speech back; only the thinking moves.

1. **Settings > Devices & services > Add integration > OpenAI Conversation**.
2. Base URL `http://<the server>:8765/v1`, API key: the `PARLOUR_TOKEN`.
3. Model `parlour`. The prompt and the temperature on that page are ignored:
   Parlour brings its own persona and its own tools, which is the point.
4. **Settings > Voice assistants**, set the pipeline's conversation agent to
   it.

The satellites then answer with the local model for house control and
escalate to the cloud for anything harder, exactly as the server's own
microphone does. Each Home Assistant user gets a conversation of its own.

For an automation that wants an answer in text, `POST /ask` with a
`rest_command` and the token in `secrets.yaml`:

```yaml
rest_command:
  ask_parlour:
    url: http://<the server>:8765/ask
    method: POST
    headers:
      authorization: !secret parlour_token
    content_type: application/json
    payload: '{"text": "{{ text }}", "room": "{{ room }}"}'
```

where `parlour_token` in `secrets.yaml` is `Bearer <the token>`. The reply is
`{"reply": "...", "via": "local"}`.

## Muting

`muteEntity` names an entity that, when `on`, makes Parlour ignore its wake
word. It is asked over REST after the wake word fires and before anything is
acted on, so the mute is enforced by the house rather than by the machine
running Parlour, and it applies to every client: satellites, phones and the
server's own microphone alike. Empty, the default, means no mute.

```json
{ "integrations": { "home-assistant": { "muteEntity": "input_boolean.parlour_muted" } } }
```

A house that sleeps might define the boolean and an automation that follows
its sleeping state:

```yaml
input_boolean:
  parlour_muted:
    name: Parlour muted
    icon: mdi:microphone-off

automation:
  - id: parlour_mute_follows_sleeping
    alias: Parlour mute follows sleeping
    triggers:
      - trigger: state
        entity_id: input_boolean.sleeping
    actions:
      - action: "input_boolean.turn_{{ trigger.to_state.state }}"
        target:
          entity_id: input_boolean.parlour_muted
```

It can then be overridden by hand for one night from the dashboard. When the
house cannot be reached the gate reads as off: a house that cannot be asked
should still be able to hear, and the model will report the outage soon
enough. A muted wake emits a `muted` event on the `--events` stream, so the
desktop app can say why nothing happened.

## What the doctor checks

```text
ok    Home Assistant token  HA_TOKEN is set
ok    Home Assistant        http://homeassistant.local:8123
FAIL  Home Assistant MCP    http://homeassistant.local:8123/mcp_server/sse did not answer. Add the Model Context Protocol Server integration in Home Assistant.
```

A failure on the second line is usually the token. A failure on the third,
with the second fine, is the integration not being installed.

## Migrating from the old configuration

Parlour began as `agent/` inside a Home Assistant configuration repository,
with an `agent.config.json` and a `.env` beside it. `parlour init` looks for
`agent.config.json` in the working directory and, when there is nothing yet
at the new path, offers to convert it:

| Then | Now |
| --- | --- |
| `homeAssistant.baseUrl`, `homeAssistant.useMcp` | `integrations["home-assistant"].url`, `.mcp` |
| `muteEntity` at the top level | `integrations["home-assistant"].muteEntity`; when the old file never set it, the old default `input_boolean.home_agent_muted` is written out |
| `mcpServers` | `integrations.mcp.servers` |
| `search.searxngUrl` | `search.url` |
| `tts.engine: "say"` | `tts.provider: "macos-say"` |
| `connectorsFile` | dropped; `connectors.json` is copied to `~/.config/parlour/` |
| `.env` | `~/.config/parlour/secrets.env`, with `AGENT_TOKEN` renamed to `PARLOUR_TOKEN` |

`AGENT_TOKEN` is still read as a fallback for `PARLOUR_TOKEN` for one release,
so an upgrade does not lock every phone and satellite out of the house. The
model id reported to Home Assistant's OpenAI Conversation integration
changed to `parlour`, so that one field wants editing by hand.
