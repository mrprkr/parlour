# agent

The voice agent that runs on the Mac mini. Wake word, speech to text, a local
model with tools, speech back, and a cloud model behind it for the questions
the local one should not attempt.

Full setup and the reasoning behind each choice:
[`docs/home-agent.md`](../docs/home-agent.md).

```sh
pnpm install
pnpm models          # openWakeWord and whisper weights
cp .env.example .env # HA_TOKEN, ANTHROPIC_API_KEY
cp agent.config.example.json agent.config.json

pnpm text            # everything but the microphone
pnpm start           # the real thing
```

## Layout

| Path | What it is |
| --- | --- |
| `src/index.ts` | Wiring, and the idle/listening/thinking state machine. |
| `src/config.ts` | The schema for `agent.config.json`. Secrets come from the environment instead. |
| `src/audio/` | ffmpeg capture, openWakeWord in ONNX, energy endpointing. |
| `src/stt/` | whisper.cpp server client. |
| `src/tts/` | Kokoro, with macOS `say` as the fallback. |
| `src/llm/` | The two back ends, the tool loop, and the local-first router. |
| `src/tools/` | MCP clients, Home Assistant REST, search, timers. |
| `src/prompt.ts` | The persona, and the rule for when to hand over. |

Nothing here is written to at runtime, and none of it is read by Home
Assistant. It sits in this repository because it is part of how the house
works, not because the house runs it.
