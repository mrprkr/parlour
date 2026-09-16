#!/bin/sh
# Keeps whisper.cpp loaded and listening on 127.0.0.1:8910. Loading the model
# per utterance costs more than transcribing it, so this stays up.
#
#   brew install whisper-cpp
set -eu

cd "$(dirname "$0")/.."
MODEL=${WHISPER_MODEL:-models/whisper/ggml-small.en.bin}

exec whisper-server \
  --host 127.0.0.1 \
  --port 8910 \
  --model "$MODEL" \
  --language en \
  --threads "${WHISPER_THREADS:-6}" \
  --no-timestamps \
  --convert
