"""MCP server exposing Laya MLX typed decisions (choice, score, yes/no) as local tools.

Registered in the repository's .mcp.json so Claude Code can make the same kind of on-device
decision Parlour does. The model loads on the first call and stays resident, so later calls
take milliseconds. LAYA_MODEL (default aac6fef/laya-mlx) and LAYA_DTYPE (default float16)
choose the checkpoint.
"""

import os
import threading
from typing import Any, Literal

from mcp.server.mcpserver import MCPServer
from pydantic import BaseModel, Field

import laya_mlx as laya

MODEL_ID = os.environ.get("LAYA_MODEL", "aac6fef/laya-mlx")
DTYPE = os.environ.get("LAYA_DTYPE", "float16")

mcp = MCPServer(
    "laya",
    instructions=(
        "Local, fast (~10ms) classifier for constrained decisions: pick one of N options, "
        "rate on an ordered rubric, or estimate P(true) for a proposition. It reads the "
        "state text and answers typed questions; it does not reason, generate text, or "
        "know facts beyond the state. Use it for routing, triage, tagging and quick "
        "judgements over text; treat low confidence as 'unsure'."
    ),
)

_agent = None
_lock = threading.Lock()


def agent():
    global _agent
    with _lock:
        if _agent is None:
            _agent = laya.load(MODEL_ID, dtype=DTYPE)
        return _agent


class Question(BaseModel):
    type: Literal["choice", "score", "noul"] = Field(
        description="choice: pick one option; score: ordered rubric level; noul: P(true)"
    )
    instructions: str = Field(description="The question to answer about the state")
    criteria: list[str] | dict[str, str] | None = Field(
        default=None,
        description=(
            "choice: option labels, or {label: description}. score: rubric levels ordered "
            "lowest to highest. Omit for noul."
        ),
    )


@mcp.tool()
def decide(state: str, questions: dict[str, Question]) -> dict[str, Any]:
    """Answer several typed questions about one state in a single batched pass.

    `state` is the text being judged (message, ticket, diff summary, conversation...).
    `questions` maps a name to a question. Returns per-question answers with
    probabilities and confidence.
    """
    qs = {name: q.model_dump(exclude_none=True) for name, q in questions.items()}
    return agent().predict(state, qs)["answers"]


@mcp.tool()
def choose(state: str, question: str, options: list[str] | dict[str, str]) -> dict[str, Any]:
    """Pick the best option for the state. `options` is a list of labels or
    {label: description}. Returns the chosen label with probabilities."""
    q = {"type": "choice", "instructions": question, "criteria": options}
    return agent().predict(state, {"answer": q})["answers"]["answer"]


@mcp.tool()
def rate(state: str, question: str, levels: list[str]) -> dict[str, Any]:
    """Rate the state on an ordered rubric. `levels` go from lowest to highest.
    Returns the expected zero-based level and per-level probabilities."""
    q = {"type": "score", "instructions": question, "criteria": levels}
    return agent().predict(state, {"answer": q})["answers"]["answer"]


@mcp.tool()
def check(state: str, proposition: str) -> dict[str, Any]:
    """Estimate the probability that a yes/no proposition about the state is true."""
    q = {"type": "noul", "instructions": proposition}
    return agent().predict(state, {"answer": q})["answers"]["answer"]


def main():
    mcp.run()


if __name__ == "__main__":
    main()
