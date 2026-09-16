# Tuning

Everything here is a key in `~/.config/parlour/config.json`. `parlour config
edit` opens it; `parlour config show` prints what is in force with the
defaults filled in; `parlour service restart` (or a restart from the app)
picks up a change.

## When it misbehaves

| Symptom | Setting |
| --- | --- |
| Fires at the television | Raise `wake.threshold` towards 0.7. |
| Never fires | Lower it towards 0.4, and check `audio.inputDevice`. |
| Cuts you off mid-sentence | Raise `audio.silenceMs`, or lower `audio.silenceThreshold`. |
| Waits too long before answering | Lower `audio.silenceMs` to about 600. |
| Gives up before you start talking | You have 2.5 s after the wake word to begin. Say the wake word and the request in one breath. |
| Answers slowly | A smaller local model, or `parlour models fetch --whisper ggml-base.en.bin` then `parlour service install` to rewrite the whisper service: it loads the first model file in `~/Library/Caches/parlour/models/whisper/`, and `base` sorts before `small`. |
| Escalates too often, or not enough | It is a prompt, not a threshold. See `packages/parlour/src/core/prompt.ts`. |
| Says nothing at all | `parlour doctor`, or the Check button in the app. |
| Talks over itself | `audio.bargeIn` is off by default for a reason: with one box in one room, the microphone hears the speaker. |
| Fires twice on one wake word | Raise `wake.refractoryMs`. |
| The voice is wrong | `tts.voice`, `tts.speed`. Kokoro downloads itself the first time Parlour starts after an install, so that one start is slow and the fallback voice may speak until it is ready. |
| Can see the lights but not the blinds | Expose the blinds. Home Assistant only publishes what is exposed under Settings > Voice assistants > Expose. |

## Audio

```json
{
  "audio": {
    "inputDevice": ":0",
    "silenceMs": 800,
    "maxUtteranceMs": 15000,
    "silenceThreshold": 0.012,
    "bargeIn": false
  }
}
```

- **`inputDevice`** is an avfoundation index: `":0"` is the default
  microphone. `ffmpeg -f avfoundation -list_devices true -i ""` prints the
  list, and `parlour init` shows it when asking.
- **`silenceMs`** is how much silence ends an utterance once you have started
  talking. **`silenceThreshold`** is the RMS level, 0 to 1, below which a
  frame counts as silent; a noisy room wants it higher, a quiet speaker
  lower.
- **`maxUtteranceMs`** caps a single request. It is a safety net for a
  microphone that never goes quiet, not a way to make room for long
  questions.

## The wake word

```json
{ "wake": { "provider": "openwakeword", "words": ["hey_jarvis"], "threshold": 0.5, "refractoryMs": 1500 } }
```

The stock words are `hey_jarvis`, `alexa` and `hey_mycroft`; `parlour models
fetch --wake hey_jarvis,alexa` fetches the ones you name into
`~/Library/Caches/parlour/models/openwakeword/`. Any openWakeWord model works:
drop `<word>.onnx` in that directory and name `<word>` in `words`. More than
one word can be live at once, at a small cost in CPU.

## The voice

```json
{ "tts": { "provider": "kokoro", "voice": "bf_emma", "speed": 1.0, "fallback": "macos-say" } }
```

Kokoro's British voices are `bf_emma`, `bf_isabella`, `bm_george` and
`bm_lewis`; an unknown voice id fails the reply over to the fallback and the
log names every voice Kokoro has. `fallback`
names the voice used when the first throws (`null` to disable it); `macos-say`
ignores a Kokoro voice id and uses the system voice, or takes a macOS voice
name of its own (`"voice": "Daniel"` when `provider` is `macos-say`).

## The models

```json
{
  "llm": {
    "local": { "provider": "openai-compatible", "baseUrl": "http://127.0.0.1:1234/v1", "model": "qwen3-8b-mlx", "temperature": 0.3, "timeoutMs": 30000 },
    "cloud": { "provider": "anthropic", "enabled": true, "model": "claude-opus-5", "maxTokens": 1024, "onLocalFailure": true },
    "maxToolRounds": 6
  }
}
```

- **`local.model`** is the id as the server reports it. `parlour doctor`
  lists what is served against what is configured, which is the usual
  mismatch after loading a different model in LM Studio.
- **`local.timeoutMs`** is per completion. A model that regularly runs past
  it is too big for the machine; with `cloud.onLocalFailure` on, every
  timeout becomes a cloud answer, which is slow and not private.
- **`cloud.enabled: false`** runs local only. The escalation tool is not
  offered and the local model answers everything, including the questions it
  should not.
- **`maxToolRounds`** stops a model that keeps calling tools. Six is enough
  for "turn the kitchen and hall lights off and set a timer".
- A hosted OpenAI-compatible endpoint works as the local model with
  `"apiKeyEnv": "SOME_NAME"` naming a variable in `secrets.env`.

## Search

```json
{ "search": { "provider": "searxng", "url": "http://searxng.local:8080", "maxResults": 5 } }
```

Only the local model uses this; the cloud model searches for itself. SearXNG
needs `- json` under `search.formats` in its `settings.yml`. `"provider":
"brave"` with `BRAVE_API_KEY` in `secrets.env` is the hosted alternative, and
`"provider": "none"` leaves the local model without a search tool.

## Logging

`LOG_LEVEL` in `secrets.env` (or the environment): `debug`, `info`, `warn`
or `error`. `debug` prints every transcription time and every tool call with
its arguments, which is the level to use when working out why the model did
what it did. Logs from the service land in `~/Library/Logs/parlour/agent.log`
and `whisper.log`; `parlour service logs --lines 200` prints the tail of
both.
