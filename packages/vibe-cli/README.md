# @ibm-vibe/cli

Command-line interface for IBM VIBE — an AI agent testing platform.

Use this CLI to manage conversations, agents, and test suites on a running VIBE
deployment, execute tests against agent endpoints, and inspect results. It is
designed to be used by both humans and AI agents.

---

## For AI agents reading this

This CLI is your primary way to interact with a VIBE deployment from a shell
tool. Everything you need to know to use it is in this file and the skill at
`.bob/skills/vibe/SKILL.md`.

**What you can do with this CLI:**

| Capability                                      | Commands                                                                                    |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------- |
| Discover existing agents, suites, conversations | `vibe agent list`, `vibe suite list`, `vibe conversation list`                              |
| Create test conversations with expected outputs | `vibe conversation create`, `vibe conversation add-message`, `vibe conversation set-target` |
| Organise conversations into suites              | `vibe suite create`, `vibe suite add-conversation`                                          |
| Execute tests and block until complete          | `vibe run conversation`, `vibe run suite`                                                   |
| Read results and transcripts                    | `vibe results session`, `vibe results conversation`, `vibe results suite-run`               |
| Export/import data between VIBE instances       | `vibe transfer export`, `vibe transfer import`                                              |

**Reliable patterns for scripting:**

- Add `--json` to any command to get clean JSON on stdout and suppress all human-readable output.
- Exit codes are stable: `0` = success / all tests passed, `1` = test failures, `2` = CLI or infrastructure error.
- `vibe run` commands block until the job or suite run completes — no polling loop required.

**Where to find more detail:**

- Full workflow steps: `.bob/skills/vibe/SKILL.md`
- Backend API surface: `backend/src/routes/` (one file per resource)
- Shared types: `packages/types/index.ts`
- E2E test examples (real CLI usage patterns): `packages/vibe-cli/src/__tests__/e2e/cli.e2e.test.ts`

---

## Installation

This package is not yet published to npm. Install from source by cloning the
monorepo and linking:

```bash
git clone <repo-url>
cd ai-agent-testing-suite
npm install
cd packages/vibe-cli && npm link
```

Verify:

```bash
vibe help
```

---

## Configuration

Run `vibe init` in your project directory to create `vibe.config.json`:

```json
{
	"profiles": {
		"local": {
			"backend": "http://localhost:5100",
			"defaultAgent": 1,
			"defaultSuite": 1
		}
	},
	"defaultProfile": "local"
}
```

Config is resolved by walking up from the current directory. Multiple named
profiles let you target different VIBE deployments with `--profile <name>`.

**Environment overrides** (highest priority, useful in CI):

| Variable         | Purpose                                  |
| ---------------- | ---------------------------------------- |
| `VIBE_BACKEND`   | Backend URL                              |
| `VIBE_PROFILE`   | Active profile name                      |
| `VIBE_AGENT_ID`  | Default agent ID                         |
| `VIBE_SUITE_ID`  | Default suite ID                         |
| `VIBE_AGENT_URL` | Agent chat URL for `conversation record` |

---

## Commands

### `vibe init`

Create `vibe.config.json` interactively in the current directory.

### `vibe agent <subcommand>`

```
vibe agent list
vibe agent show <id>
vibe agent create --name <name> --version <v> --prompt <text> [--settings <file.json>]
vibe agent delete <id>
```

### `vibe conversation <subcommand>`

```
vibe conversation list
vibe conversation show <id>
vibe conversation create --name <name> [--messages turns.json] [--description <text>]
vibe conversation delete <id>
vibe conversation add-message --conversation <id> --role <user|system> --content <text> [--sequence <n>]
vibe conversation set-target --conversation <id> --target <text> [--sequence <n>] [--threshold <0-100>]
vibe conversation record --agent-url <url> [--suite <id>] [--threshold <n>] [--no-save]
```

`--messages turns.json` format:

```json
[
	{ "role": "user", "content": "First user turn" },
	{ "role": "user", "content": "Second user turn" }
]
```

`conversation record` opens an interactive REPL. Chat with a live agent endpoint,
then `/done` to save the transcript as a VIBE conversation with per-turn targets.

### `vibe suite <subcommand>`

```
vibe suite list
vibe suite show <id>
vibe suite create --name <name> [--description <text>] [--tags <text>]
vibe suite delete <id>
vibe suite entries <id>
vibe suite add-conversation --suite <id> --conversation <id> [--agent <id>]
vibe suite remove-entry --suite <id> --entry <id>
```

### `vibe run <subcommand>`

```
vibe run conversation --conversation <id> [--agent <id>]
vibe run suite         --suite <id>        [--agent <id>]
```

Both commands enqueue execution, poll until complete, print a summary, and exit
with code `0` (all passed) or `1` (failures). The `--agent` flag defaults to
`defaultAgent` from config if set.

### `vibe results <subcommand>`

```
vibe results session      <id>
vibe results conversation <id>
vibe results suite-run    <id>
vibe results runs         [--suite <id>] [--limit <n>]
```

### `vibe transfer <subcommand>`

```
vibe transfer export --types <types,...> [--out bundle.json]
vibe transfer import --file bundle.json  [--dry-run]
```

Valid export types: `conversations`, `test_suites`, `agents`, `templates`,
`response_maps`, `llm_configs`. Multiple types are comma-separated.

`--dry-run` analyses the bundle and prints a conflict report without writing anything.

---

## Global flags

| Flag               | Effect                                                      |
| ------------------ | ----------------------------------------------------------- |
| `--json`           | Emit raw JSON to stdout; suppress all human-readable output |
| `--profile <name>` | Use a named profile from `vibe.config.json`                 |

---

## JSON output contract

When `--json` is passed, stdout is always a single valid JSON value. Stderr
may still receive error messages. The schema per command:

| Command                    | JSON shape                                                                 |
| -------------------------- | -------------------------------------------------------------------------- |
| `agent list`               | `Agent[]`                                                                  |
| `agent show`               | `Agent`                                                                    |
| `agent create`             | `Agent`                                                                    |
| `conversation list`        | `Conversation[]`                                                           |
| `conversation show`        | `{ conversation: Conversation, targets: ConversationTurnTarget[] }`        |
| `conversation create`      | `Conversation`                                                             |
| `conversation add-message` | `ConversationMessage`                                                      |
| `conversation set-target`  | `ConversationTurnTarget`                                                   |
| `suite list`               | `(TestSuite & { test_count: number })[]`                                   |
| `suite show`               | `{ suite: TestSuite, entries: SuiteEntry[] }`                              |
| `suite entries`            | `SuiteEntry[]`                                                             |
| `suite add-conversation`   | `SuiteEntry`                                                               |
| `run conversation`         | `{ status, job_id, session_id, similarity_score, agent_reply }`            |
| `run suite`                | `{ status, suite_run_id, total, passed, failed, avg_score, total_tokens }` |
| `results session`          | `{ session: ExecutionSession, messages: SessionMessage[] }`                |
| `results runs`             | `SuiteRun[]`                                                               |
| `transfer export --out`    | `{ exported_to, version }`                                                 |
| `transfer import`          | `ImportResultSummary`                                                      |
| Any error                  | `{ error: string }`                                                        |

All types are defined in `packages/types/index.ts`.

---

## Development

```bash
# Build
cd packages/vibe-cli && npm run build

# Type-check without building
npm run typecheck

# Run E2E tests (starts an isolated backend automatically)
npm run test:e2e

# Or from the repo root
npm run test:cli-e2e
```

E2E tests live in `src/__tests__/e2e/`. They spawn a real backend on a random
free port with a temporary SQLite database and invoke the compiled CLI binary
via `child_process.spawnSync`. No mocking.
