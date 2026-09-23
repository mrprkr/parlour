#!/usr/bin/env python3
"""Warm Parakeet MLX worker for Parlour.

Reads one JSON request per stdin line, writes one JSON response per stdout line.
Keeps the model loaded so each utterance avoids the multi-second cold start.

Protocol:
  ready -> {"ready": true, "model": "<id>"}
  request -> {"id": "...", "path": "/tmp/.../speech.wav"}
  response -> {"id": "...", "ok": true, "text": "..."}
            | {"id": "...", "ok": false, "error": "..."}
"""

from __future__ import annotations

import json
import os
import sys


def emit(message: dict) -> None:
    print(json.dumps(message, ensure_ascii=False), flush=True)


def main() -> int:
    model_id = os.environ.get("PARLOUR_PARAKEET_MODEL", "mlx-community/parakeet-tdt-0.6b-v2")

    try:
        from parakeet_mlx import from_pretrained
    except ImportError:
        emit({"ready": False, "error": "parakeet_mlx is not installed. Run: pip install parakeet-mlx"})
        return 1

    try:
        model = from_pretrained(model_id)
    except Exception as error:  # noqa: BLE001 - surface to Node as a ready failure
        emit({"ready": False, "error": str(error)})
        return 1

    emit({"ready": True, "model": model_id})

    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue
        try:
            request = json.loads(line)
        except json.JSONDecodeError as error:
            emit({"id": None, "ok": False, "error": f"bad json: {error}"})
            continue

        req_id = request.get("id")
        try:
            result = model.transcribe(request["path"])
            emit({"id": req_id, "ok": True, "text": result.text.strip()})
        except Exception as error:  # noqa: BLE001
            emit({"id": req_id, "ok": False, "error": str(error)})
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
