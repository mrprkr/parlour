# agent

The voice agent that runs on the Mac mini. Wake word, speech to text, a local
model with tools, speech back, and a cloud model behind it for the questions
the local one should not attempt.

Full setup and the reasoning behind each choice:
[`docs/home-agent.md`](../docs/home-agent.md).

```sh
bash install.sh        # dependencies, models, config, services, the app
```

Then, day to day:

```sh
pnpm text            # everything but the microphone
pnpm start           # the real thing, in the foreground
pnpm doctor          # which of the six moving parts is down
```

## Layout

| Path | What it is |
| --- | --- |
| `install.sh` | The whole setup, idempotent. Run it again to change your mind. |
| `src/index.ts` | Wiring, and the idle/listening/thinking state machine. |
| `src/config.ts` | The schema for `agent.config.json`. Secrets come from the environment instead. |
| `src/doctor.ts` | Checks every dependency and names the broken one. |
| `src/events.ts` | The NDJSON status stream the desktop app reads. |
| `src/audio/` | ffmpeg capture, openWakeWord in ONNX, energy endpointing. |
| `src/stt/` | whisper.cpp server client. |
| `src/tts/` | Kokoro, with macOS `say` as the fallback. |
| `src/llm/` | The two back ends, the tool loop, and the local-first router. |
| `src/tools/` | MCP clients, Home Assistant REST, search, timers. |
| `src/prompt.ts` | The persona, and the rule for when to hand over. |
| `desktop/` | The menu bar app: Tauri and Rust around the same agent. |

Nothing here is written to at runtime, and none of it is read by Home
Assistant. It sits in this repository because it is part of how the house
works, not because the house runs it.
