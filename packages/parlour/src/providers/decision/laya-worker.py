#!/usr/bin/env python3
"""Warm Laya-MLX worker for Parlour.

Reads one JSON request per stdin line, writes one JSON response per stdout line.
Keeps the checkpoint loaded so each utterance avoids the multi-second cold start.

Protocol:
  ready → {"ready": true, "model": "<id>"}
  request → {"id": "...", "state": <any>, "questions": {...}}
  response → {"id": "...", "ok": true, "model": "...", "answers": {...}}
           | {"id": "...", "ok": false, "error": "..."}
"""

from __future__ import annotations

import json
import os
import sys
import traceback


def normalize_answers(raw: dict) -> dict:
    """Map Laya's answer objects onto Parlour's DecisionAnswer shape."""
    out: dict = {}
    for key, answer in raw.items():
        if not isinstance(answer, dict):
            continue
        kind = answer.get("type")
        if kind == "noul" or "noul" in answer:
            out[key] = {"type": "noul", "noul": float(answer["noul"])}
        elif kind == "choice" or "choice" in answer:
            probs = answer.get("probabilities") or {}
            out[key] = {
                "type": "choice",
                "choice": str(answer["choice"]),
                "probabilities": {str(k): float(v) for k, v in probs.items()},
                "confidence": float(answer.get("confidence", 0.0)),
            }
        elif kind == "score" or "score" in answer:
            probs = answer.get("probabilities") or {}
            legend = answer.get("legend") or {}
            out[key] = {
                "type": "score",
                "score": float(answer["score"]),
                "legend": {str(k): str(v) for k, v in legend.items()},
                "probabilities": {str(k): float(v) for k, v in probs.items()},
                "confidence": float(answer.get("confidence", 0.0)),
            }
    return out


def main() -> int:
    model_id = os.environ.get("PARLOUR_LAYA_MODEL", "aac6fef/laya-mlx")
    dtype = os.environ.get("PARLOUR_LAYA_DTYPE", "float16")
    device = os.environ.get("PARLOUR_LAYA_DEVICE", "gpu")

    try:
        import laya_mlx as laya
    except ImportError:
        print(
            json.dumps(
                {
                    "ready": False,
                    "error": "laya_mlx is not installed. In a checkout run: pnpm exec nx run laya:setup; otherwise: pip install laya-mlx",
                }
            ),
            flush=True,
        )
        return 1

    try:
        agent = laya.load(model_id, dtype=dtype, device=device)
    except TypeError:
        # Older laya-mlx builds take device only on Agent(), not load().
        agent = laya.load(model_id, dtype=dtype)
    except Exception as error:  # noqa: BLE001 — surface to Node as a ready failure
        print(json.dumps({"ready": False, "error": str(error)}), flush=True)
        return 1

    print(json.dumps({"ready": True, "model": model_id}), flush=True)

    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue
        try:
            request = json.loads(line)
        except json.JSONDecodeError as error:
            print(json.dumps({"id": None, "ok": False, "error": f"bad json: {error}"}), flush=True)
            continue

        req_id = request.get("id")
        try:
            result = agent.predict(request["state"], request["questions"])
            answers = normalize_answers(result.get("answers") or {})
            print(
                json.dumps(
                    {"id": req_id, "ok": True, "model": model_id, "answers": answers},
                    ensure_ascii=False,
                ),
                flush=True,
            )
        except Exception as error:  # noqa: BLE001
            print(
                json.dumps(
                    {
                        "id": req_id,
                        "ok": False,
                        "error": str(error),
                        "trace": traceback.format_exc()[-500:],
                    },
                    ensure_ascii=False,
                ),
                flush=True,
            )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
