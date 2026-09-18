# Home Assistant

Home Assistant is Parlour's first integration: a source of tools, a line in
the system prompt, and a mute switch. It is on by default and lives under
`integrations["home-assistant"]` in your config:

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

The token is `HA_TOKEN` in `secrets.env`. It is a long-lived access token
from your profile page in Home Assistant, on the Security tab, right at the
bottom. `parlour init` asks for it and checks it against your instance, or
`parlour secrets set HA_TOKEN` takes it on stdin. That token is the whole
house, so it stays in `secrets.env` with mode 600 and never goes anywhere
near git.

## What Parlour can do with it

Tools come from two places, and the model sees them as one list:

- **Over MCP** (`mcp: true`). Home Assistant's **Model Context Protocol
  Server** integration publishes whatever is exposed under **Settings >
  Voice assistants > Expose** as tools, so Parlour inherits it all. Expose
  more and it can do more, with nothing to change on the Parlour side. Add
  the integration under **Settings > Devices & services**; it has no
  options. If Parlour cannot see a light, expose the light.
- **Over REST** (`rest: true`). Two escape hatches for what intents cannot
  express: `ha_get_state` reads any entity, and `ha_call_service` calls any
  service. The prompt tells the model to prefer a more specific tool when one
  fits.

Parlour connects to the MCP endpoint at `<url>/mcp_server/sse` with the
token. If that connection fails, you do not lose the REST tools: the failure
is logged and the house is still reachable the slower way.

## Home Assistant as a client

It works the other way round too. Home Assistant, and every Voice PE
satellite through it, can use Parlour as its conversation agent. Home
Assistant keeps doing the wake word, the speech to text and the speech back;
only the thinking moves.

1. **Settings > Devices & services > Add integration > OpenAI Conversation**.
2. Base URL `http://<the server>:8765/v1`, and your `PARLOUR_TOKEN` as the
   API key.
3. Model `parlour`. The prompt and the temperature on that page are ignored,
   because Parlour brings its own persona and its own tools, which is rather
   the point.
4. **Settings > Voice assistants**, and set the pipeline's conversation agent
   to it.

Your satellites then answer with the local model for house control and hand
harder questions to the cloud, exactly as the server's own microphone does.
Each Home Assistant user gets a conversation of their own.

For an automation that wants an answer as text, `POST /ask` through a
`rest_command`, with the token kept in `secrets.yaml`:

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

`muteEntity` names an entity that, when it is `on`, makes Parlour ignore its
wake word. Parlour asks over REST after the wake word fires and before it
acts on anything, so the mute is enforced by the house rather than by the
machine running Parlour, and it covers every client: satellites, phones and
the server's own microphone alike. Empty, the default, means no mute.

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

You can then override it by hand for one night from the dashboard. If the
house cannot be reached, the gate reads as off: a house that cannot be asked
should still be able to hear you, and the model will tell you about the
outage soon enough. A muted wake emits a `muted` event on the `--events`
stream, which is how the desktop app can tell you why nothing happened.

## What the doctor checks

```text
ok    Home Assistant token  HA_TOKEN is set
ok    Home Assistant        http://homeassistant.local:8123
FAIL  Home Assistant MCP    http://homeassistant.local:8123/mcp_server/sse did not answer. Add the Model Context Protocol Server integration in Home Assistant.
```

A failure on the second line is usually the token. A failure on the third,
with the second fine, means the integration is not installed yet.

## Moving over from the old configuration

Parlour began life as `agent/` inside a Home Assistant configuration
repository, with an `agent.config.json` and a `.env` beside it. If you were
running that, `parlour init` looks for `agent.config.json` in the working
directory and, when there is nothing at the new path yet, offers to convert
it for you:

| Then | Now |
| --- | --- |
| `homeAssistant.baseUrl`, `homeAssistant.useMcp` | `integrations["home-assistant"].url`, `.mcp` |
| `muteEntity` at the top level | `integrations["home-assistant"].muteEntity`; if the old file never set it, the old default `input_boolean.home_agent_muted` is written out so your mute keeps working |
| `mcpServers` | `integrations.mcp.servers` |
| `search.searxngUrl` | `search.url` |
| `tts.engine: "say"` | `tts.provider: "macos-say"` |
| `connectorsFile` | dropped; `connectors.json` is copied to `~/.config/parlour/` |
| `.env` | `~/.config/parlour/secrets.env`, with `AGENT_TOKEN` renamed to `PARLOUR_TOKEN` |

`AGENT_TOKEN` is still read as a fallback for `PARLOUR_TOKEN` for one
release, so upgrading does not lock every phone and satellite out of the
house. The model id reported to Home Assistant's OpenAI Conversation
integration changed to `parlour`, so that one field wants editing by hand.
