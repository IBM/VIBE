---
slug: testing-agents-with-conversations
title: Why test AI agents with conversations, not prompts
authors: [vibe-team]
tags: [learning]
---

A single prompt and a single answer rarely reflect how people use an AI agent. Real usage is a conversation: context builds up, users change their mind, and mistakes compound over turns.

<!-- truncate -->

## The problem with prompt-only testing

Prompt-level checks tell you whether one reply looks right. They miss failures that only show up across turns, such as forgotten context, contradictory answers, or a tool call that goes wrong on the third message.

## The VIBE model

VIBE organizes evaluation around a few concepts:

- **Conversation**: an ordered script of user messages.
- **Turn target**: the reply you expect for a user turn, scored for similarity against the agent's actual answer.
- **Session**: the transcript produced by a run, with timing, token usage and scores per turn.
- **Suite**: a named collection of conversations that you run together.

## A minimal loop

```bash
vibe conversation create --name "Refund flow" --json
vibe conversation add-message --conversation <id> --role user --content "I want a refund"
vibe conversation set-target --conversation <id> --target "I can help with that" --threshold 65
vibe run conversation --conversation <id> --agent <agent_id> --json
```

The command exits with `0` when the conversation passes and `1` when a turn falls below its threshold, so it drops straight into CI.

## Next steps

Try the [quickstart](/docs/quickstart), then read the [product tour](/docs/product-tour) to see how sessions and suites fit together.
