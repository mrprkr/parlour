#!/bin/sh
# Downloads the models the agent needs. Everything lands in models/, which is
# gitignored: they are large, and they are not ours to redistribute.
set -eu

cd "$(dirname "$0")/.."
WAKE_DIR=models/openwakeword
WHISPER_DIR=models/whisper
WHISPER_MODEL=${WHISPER_MODEL:-ggml-small.en.bin}
OWW=https://github.com/dscripka/openWakeWord/releases/download/v0.5.1

mkdir -p "$WAKE_DIR" "$WHISPER_DIR"

fetch() {
  if [ -f "$2" ]; then
    echo "have $2"
  else
    echo "fetching $2"
    curl -fsSL --retry 3 -o "$2" "$1"
  fi
}

# The shared front end: audio to mel spectrogram, mel to speech embedding.
fetch "$OWW/melspectrogram.onnx" "$WAKE_DIR/melspectrogram.onnx"
fetch "$OWW/embedding_model.onnx" "$WAKE_DIR/embedding_model.onnx"

# One classifier per wake word. The version suffix is dropped so that
# agent.config.json can name them as plain words.
for word in ${WAKE_WORDS:-hey_jarvis alexa hey_mycroft}; do
  fetch "$OWW/${word}_v0.1.onnx" "$WAKE_DIR/${word}.onnx"
done

# small.en is the sweet spot on Apple silicon: near enough to medium on short
# commands, and fast enough that nobody notices it running.
fetch "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/$WHISPER_MODEL" \
  "$WHISPER_DIR/$WHISPER_MODEL"

echo
echo "Kokoro downloads itself on first use, into the transformers.js cache."
