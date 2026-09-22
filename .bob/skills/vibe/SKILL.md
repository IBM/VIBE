---
name: vibe
description: >
    Use when working with IBM VIBE to create conversations, run tests, inspect
    results, or manage agents and suites via the VIBE CLI. Trigger phrases:
    "run vibe tests", "create a vibe conversation", "add to vibe suite",
    "check vibe results", "vibe test", "vibe suite", "vibe agent", "test my agent
    with vibe", "set up vibe", "vibe init", "export vibe data", "import vibe data".
---

# VIBE CLI skill

IBM VIBE is an AI agent testing platform. This skill lets you manage conversations,
agents, and suites, execute tests, and inspect results — all through the
`@ibm-vibe/cli` package (`vibe` command).

## Prerequisites

The CLI must be installed and configured before any other steps.

**Check it's available:**

```
vibe help
```

If not found, install from the cloned monorepo:

```
cd /path/to/ai-agent-testing-suite
npm run build:packages
cd packages/vibe-cli && npm link
```

**Check / create config:**

```
vibe init
```

This creates `vibe.config.json` with a named profile pointing at the backend URL.
Skip if the file already exists. Config is found by walking up from the current directory.

**Verify connectivity:**

```
vibe agent list --json
```

If this returns agents, the CLI is connected. If it errors, check that the backend
is running and the `backend` URL in `vibe.config.json` is correct.

---

## Workflow: create a conversation and run it

### 1. Create the conversation

Single-turn (one user message + one expected reply):

```
vibe conversation create --name "My test" --json
```

Note the `id` from the output.

Multi-turn from a JSON file:

```
# turns.json: [{ "role": "user", "content": "..." }, ...]
vibe conversation create --name "My test" --messages turns.json --json
```

### 2. Add a turn target (expected reply for scoring)

```
vibe conversation set-target \
  --conversation <id> \
  --target "expected agent reply text" \
  --sequence 1 \
  --threshold 65 \
  --json
```

### 3. Add the conversation to a suite

```
vibe suite add-conversation --suite <suite_id> --conversation <conv_id> --json
```

If no suite exists yet:

```
vibe suite create --name "My suite" --json
# use the returned id
```

### 4. Run it

Single conversation:

```
vibe run conversation --conversation <id> --agent <agent_id> --json
```

Full suite:

```
vibe run suite --suite <id> --agent <agent_id> --json
```

Both commands block until complete. Exit code 0 = all passed, 1 = failures.

### 5. Read results

```
vibe results conversation <id> --json
vibe results suite-run <run_id> --json
vibe results session <session_id> --json
```

---

## Workflow: discover what exists

```
vibe agent list --json
vibe suite list --json
vibe conversation list --json
vibe results runs --suite <id> --json
```

---

## Workflow: record a live conversation as a test

```
vibe conversation record \
  --agent-url http://localhost:3000/agents/my-agent/chat \
  --suite <suite_id> \
  --threshold 65
```

This opens an interactive REPL. Chat with the agent, then `/done` to save.
The recorded turns become a conversation with per-turn targets in VIBE.

Use `--no-save` for a dry run that only shows the agent's replies.

---

## Workflow: export and import data

Export conversations and suites to a bundle file:

```
vibe transfer export --types conversations,test_suites --out bundle.json
```

Import into another instance:

```
vibe transfer import --file bundle.json
# add --dry-run to preview without writing
```

---

## Using --json for AI agent scripting

Every command accepts `--json` to emit clean, stable JSON to stdout.
Use this when parsing output programmatically:

```
vibe run suite --suite 1 --agent 2 --json
# → { "status": "completed", "passed": 8, "failed": 0, ... }
```

Exit codes: `0` = success / all tests passed, `1` = test failures, `2` = CLI/infrastructure error.

---

## Configuration reference

`vibe.config.json` supports named profiles:

```json
{
	"profiles": {
		"local": { "backend": "http://localhost:5100", "defaultAgent": 1, "defaultSuite": 1 },
		"staging": { "backend": "https://vibe-staging.example.com", "defaultAgent": 3 }
	},
	"defaultProfile": "local"
}
```

Switch profiles: `--profile staging`

Environment overrides (highest priority):

- `VIBE_BACKEND` — backend URL
- `VIBE_PROFILE` — active profile name
- `VIBE_AGENT_ID` — default agent ID
- `VIBE_SUITE_ID` — default suite ID
- `VIBE_AGENT_URL` — agent chat URL for `conversation record`

---

## Quick reference

| Goal                            | Command                                                                    |
| ------------------------------- | -------------------------------------------------------------------------- |
| List agents                     | `vibe agent list`                                                          |
| List suites                     | `vibe suite list`                                                          |
| List conversations              | `vibe conversation list`                                                   |
| Show conversation               | `vibe conversation show <id>`                                              |
| Run single conversation         | `vibe run conversation --conversation <id> --agent <id>`                   |
| Run full suite                  | `vibe run suite --suite <id> --agent <id>`                                 |
| Latest results for conversation | `vibe results conversation <id>`                                           |
| Recent suite runs               | `vibe results runs --suite <id>`                                           |
| Export data                     | `vibe transfer export --types conversations,test_suites --out bundle.json` |
| Import data                     | `vibe transfer import --file bundle.json`                                  |
