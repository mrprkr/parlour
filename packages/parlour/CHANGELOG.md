# parlour

## 0.4.0

### Minor Changes

- 5e917f0: Add an optional `ha_assist` tool (`assist: true`, off by default) that hands a command to Home Assistant's Assist, so custom sentences and sentence-triggered automations fire when Parlour is the one listening.

## 0.3.1

### Patch Changes

- The iPhone app only talks to a server it has been explicitly paired with, and release builds lock their Cargo dependencies.

## 0.3.0

### Minor Changes

- `init` suggests current tool-calling models (Qwen3.5, Gemma 4, Qwen3.6), lets you go back a question and review every answer before anything is set up, and `parlour pair` shows a QR code for the iPhone app to scan.
