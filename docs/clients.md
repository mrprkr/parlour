# Clients

One machine in the house runs the models, holds the tokens and answers.
Everything else with a microphone is a client: it sends what it hears, plays
back what it is sent, and runs no models at all. Nothing is told an address;
the server advertises itself with Bonjour and clients look for it.

```text
                        finds it with Bonjour
kitchen satellite  ->\    _parlour._tcp
study satellite    ->\
Voice PE, via HA   ->  the server  ->  tools, models, connectors, the house
phone, push to talk ->/
custom hardware    ->/
its own microphone ->/
```

The server's own microphone is one client among these and not a privileged
one. Every client keeps its own conversation, so a follow-up in the kitchen
cannot resolve against something asked in the study, and every client can say
which room it is in.

## The token

Every client needs `PARLOUR_TOKEN`. `parlour init` offers to generate one;
`parlour secrets set PARLOUR_TOKEN` sets it by hand, reading the value from
stdin so it never lands in a shell history:

```sh
openssl rand -hex 24 | parlour secrets set PARLOUR_TOKEN
parlour service restart
```

Without it the server binds to loopback, answers only the machine it runs
on, and does not advertise itself at all, because a voice agent on an open
port can turn the heating on and read the shopping list. `parlour doctor`
says which of the two states it is in.

Clients send the token as `Authorization: Bearer <token>`, or as `?token=`
on the URL for the socket and the phone page. `/health` needs no token and
reports `{ "ok": true, "tools": 14, "cloud": true }`.

## A satellite

Any Mac with a microphone. It needs Node, ffmpeg and the `parlour` package;
no models, no keys, no GPU, nothing to keep warm.

```sh
npm install -g parlour
parlour init          # answer "satellite", name the room, paste the token
```

That writes `role: "satellite"`, and installs the service, because a
satellite has no app to own it. From then on it finds the server by name,
reconnects for as long as it is switched on, and backs off (doubling up to
`satellite.retryMs`) when the server is down rather than hammering it.

```json
{
  "role": "satellite",
  "satellite": { "room": "kitchen", "serverUrl": "", "localWake": false, "retryMs": 15000 }
}
```

- **`serverUrl` empty** means Bonjour. Fill it in (`http://study-mac.local:8765`)
  only if the network drops multicast, which some mesh systems and most guest
  VLANs do. `parlour doctor` on the satellite says whether it can see a server.
- **`localWake`** runs the wake word on the satellite and streams only what
  follows it. It costs a copy of the models on that box (`parlour models
  fetch` puts them there) and saves a constant 32 KB/s on the network. Off by
  default: one less thing to keep in step.

The satellite plays the server's speech, so the voice is the same in every
room, and a change of voice is one setting on one machine.

## Home Assistant, and the satellites you already have

The cheapest client, because the hardware is already in the house and already
works. Home Assistant keeps doing the wake word, the speech to text and the
speech back; only the thinking moves. Set up in
[home-assistant.md](home-assistant.md); in short, the OpenAI Conversation
integration pointed at `http://<the server>:8765/v1` with model `parlour`
and the token as the API key.

## A phone

Open `http://<the server>:8765` and add it to the home screen. Hold the
button, say something, let go. Settings on the page take the token and,
optionally, a room. A link with `?token=...&room=kitchen` sets both without
typing them on a phone keyboard.

Safari only grants a microphone over HTTPS or on localhost, so on iOS this
wants a reverse proxy with a certificate, or Tailscale, in front of it.

The page posts one recording to `POST /voice?client=phone&room=kitchen` and
gets back `{ heard, reply, via, audio }`, the audio being a base64 WAV of the
reply. Anything that can record and post can use the same route.

## Custom hardware

```text
ws://<the server>:8765/listen?client=hallway&room=hallway&token=...
```

Send 16 kHz mono signed 16-bit PCM as binary frames, any size: the server
re-cuts them into the 80 ms frames the wake word wants. It replies with JSON
events and one binary WAV per answer.

| From the server | Meaning |
| --- | --- |
| `{"type":"ready","sampleRate":16000,"frameSamples":1280,"mode":"wake"}` | Connected. |
| `{"type":"state","value":"listening"}` | Also `thinking` (with `"text"`, what was heard), `speaking`, `idle`. |
| `{"type":"reply","text":"...","via":"local"}` | Followed by the WAV as a binary frame. |
| `{"type":"stop"}` | Stop playing: a new wake word arrived. |

- **Wake mode**, the default: the server runs the same openWakeWord and the
  same endpointing this machine's microphone gets, so the device can be a
  microphone, a speaker and a network stack.
- **Push mode** (`&mode=push`): the device says when the utterance starts and
  stops with `{"type":"start"}` and `{"type":"end"}`, and `{"type":"cancel"}`
  to throw it away. For a button, or for hardware that did its own wake
  word.

Send `{"type":"spoke"}` when playback finishes and the server starts
listening again immediately rather than waiting out its own guess.

## Automations and scripts

```sh
curl -s http://<the server>:8765/ask \
  -H "authorization: Bearer $PARLOUR_TOKEN" \
  -d '{"text": "is the washing machine finished", "room": "kitchen"}'
```

Replies `{"reply": "...", "via": "local"}`, where `via` says which model
answered. An optional `client` in the body keeps a conversation of its own;
without one every caller shares the `api` session.

## Bonjour

The server advertises `_parlour._tcp` with a TXT record saying
`role=server`, `token=required` or `token=none`, and `api=/v1`. The name is
`discovery.name`, or `"<config.name> on <hostname>"` when that is empty.
`discovery.enabled: false` turns it off, in which case every satellite needs
`serverUrl`.

```sh
dns-sd -B _parlour._tcp     # what is advertising, from any Mac on the network
```
