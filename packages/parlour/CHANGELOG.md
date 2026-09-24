# parlour

## 0.6.0

### Minor Changes

- 412e8d8: Manage a server from its clients: `/admin` routes and `parlour remote` change the pipeline settings, start, stop and restart the local model and whisper, and run the doctor, logs and restarts. `parlour service` takes one service by name and gains `start`. The model servers are kept from freezing the Mac: a model too big for its memory is not started, they leave cores free and run at a lower priority, and a crash loop backs off and then stops.

## 0.5.0

### Minor Changes

- f36e835: Run inside the Mac App Store app's sandbox: secrets stay in the container, Homebrew and launchd are left alone, and `parlour start` keeps whisper and the local model warm itself.
- c6f171a: Add a `parakeet-mlx` speech to text provider that runs NVIDIA's Parakeet on Apple silicon, kept warm in a local Python worker.
- 4a8e077: Add `parlour try` to test one stage of the pipeline on its own (microphone, wake word, transcription, local and cloud models, voice, and the whole answer), and `parlour skills write` and `remove` so the desktop app can edit house rules.

### Patch Changes

- b453a42: The server keeps running when the microphone stops and opens it again with a backoff, `parlour doctor` says when `audio.inputDevice` is not a device the Mac has, and `parlour service install` and `restart` wait for launchd to let go of a running job before loading it again, so the local model is no longer left unloaded.

## 0.4.0

### Minor Changes

- 5e917f0: Add an optional `ha_assist` tool (`assist: true`, off by default) that hands a command to Home Assistant's Assist, so custom sentences and sentence-triggered automations fire when Parlour is the one listening.

## 0.3.1

### Patch Changes

- The iPhone app only talks to a server it has been explicitly paired with, and release builds lock their Cargo dependencies.

## 0.3.0

### Minor Changes

- `init` suggests current tool-calling models (Qwen3.5, Gemma 4, Qwen3.6), lets you go back a question and review every answer before anything is set up, and `parlour pair` shows a QR code for the iPhone app to scan.
