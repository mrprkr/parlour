---
name: deciding-with-laya
description: Use when the laya MCP tools (mcp__laya__choose, check, rate, decide) are available and a task needs fast, cheap, local classification of text - routing or triaging messages/tickets/emails, tagging items, picking one of N labels, rating on a rubric, or bulk-labelling many items - or when the user asks to use laya for a decision.
---

# Deciding with Laya

## Overview
Laya is a small local classifier (~10 ms per call, runs on-device with MLX). It reads the text you give it (the `state`) and answers questions whose possible answers you define up front. It **matches the text against your labels**. It does not reason, calculate, know facts, or judge safety. Use it to label text in bulk and triage it on a first pass. You remain the decision-maker.

## Setup
The `laya` server comes from this repository's `.mcp.json` and runs from `packages/laya`. If the tools are missing, run `pnpm exec nx run laya:setup` (needs `uv` and Apple silicon) and restart Claude Code.

## Use it for / not for

| Good fit | Bad fit (use your own judgement) |
|---|---|
| Routing a message to a team or queue | Is this command/code safe or destructive? |
| Intent: cancel / upgrade / refund / question | Facts, arithmetic, anything needing knowledge |
| Tagging many items with fixed labels | Irreversible or security-relevant gates |
| Rough sentiment or urgency, as a **rating** | Long documents where the key sentence is buried |
| Pre-sorting before you look at items closely | One-off judgements you can make yourself |

## Recipe
1. **Choose the tool.** One text with several questions → `decide` (one batched call). One question → `choose` / `rate` / `check`.
2. **Write the options.**
   - Always include an escape option such as `"other / none of these"`. Without one, off-topic text gets forced into a label (with confidence close to 0).
   - Give descriptions: `{"billing": "invoices, payments, refunds, tax"}` works better than bare labels.
   - Keep the list short, about 20 or fewer.
3. **Keep the state short.** Pass only the relevant passage (a few sentences). If the key sentence is surrounded by long filler, the answer turns to noise even within the 512-token limit.
4. **Prefer `choose` or `rate` over `check`.** `check` (yes/no) leans towards "false", missing positive sentiment and questions, and flips when the wording changes. For polarity, use `rate` with ordered levels, or `choose` with explicit opposite options.
5. **Read `confidence`, not just the top answer.**
   - `choice` / `score`: confidence is the margin. Below ~0.1 means unsure; about 0.3 or above can be used.
   - For `check`, the confidence is only distance from 0.5. It looks high even when the answer is wrong.
6. **Act on the result:**
   - Confident, and the label agrees with your own reading → use it.
   - Unsure, or it contradicts what the text plainly says → treat it as unrouted and decide yourself.
   - Never rephrase and retry until you get the answer you wanted. That's you deciding, not Laya.
7. **Report the evidence.** State the label, its probability and confidence, and flag every item you overrode or found uncertain.

## Example
```json
decide(state="Can I get a quote for 50 seats? Also my last invoice was wrong.",
  questions={
    "team":   {"type":"choice","instructions":"Which team should handle this?",
               "criteria":{"billing":"invoices, payments, refunds","technical":"bugs, outages",
                           "sales":"quotes, new purchases, seats","other":"none of these"}},
    "urgency":{"type":"score","instructions":"How urgent is this?",
               "criteria":["not urgent","soon","critical"]}})
```

## Common mistakes
- Using `check` as a gate for "is this safe to run/delete/deploy". It's unreliable and the answer depends on the wording.
- Leaving out an "other" option, then trusting a label picked with 0.00 confidence.
- Making many separate calls about the same text instead of one `decide` call.
- Passing a whole file or long thread as the state.
- Presenting Laya's output as fact without its confidence.
