# BOB Agent API

An Express + TypeScript HTTP API that wraps the [BOB CLI](https://github.com/ibm/bob) (`v1.0.6`) and exposes it as a stateless agent endpoint, compatible with IBM VIBE's External API agent contract.

Clients send a message and get back BOB's response. Multi-turn conversation context is maintained server-side — the client only needs to pass back the opaque `conversationId` it received on the previous turn.

---

## Prerequisites

- **Node.js** ≥ 18
- **BOB CLI** `v1.0.6` installed and available on `$PATH` (`bob --version`)
- A **git repository** for BOB to work against (pointed to via `WORKSPACE_REPO`)

---

## Setup

```bash
npm install
```

---

## Configuration

The server is configured entirely through environment variables.

| Variable         | Required | Default | Description                                                                            |
| ---------------- | -------- | ------- | -------------------------------------------------------------------------------------- |
| `WORKSPACE_REPO` | **Yes**  | —       | Absolute path to the git repository BOB will work in. Worktrees are created inside it. |
| `PORT`           | No       | `3001`  | Port the HTTP server listens on.                                                       |

---

## Running

### Development (ts-node, no build step)

```bash
WORKSPACE_REPO=/path/to/your/repo npm run dev
```

### Production

```bash
npm run build
WORKSPACE_REPO=/path/to/your/repo npm start
```

The server logs its port and workspace repo on startup:

```
BOB Agent API listening on port 3001
Workspace repo: /path/to/your/repo
```

---

## API Reference

### `POST /api/v1/chat`

Send a message to BOB. Omit `conversationId` on the first turn — the server will create a new conversation and return one. Pass it back on every subsequent turn.

**Request**

```http
POST /api/v1/chat
Content-Type: application/json
```

```json
{
	"message": "What does the orderSearch function do?",
	"conversationId": "optional-on-turn-1",
	"mode": "ask"
}
```

| Field            | Type                                            | Required | Description                                                                  |
| ---------------- | ----------------------------------------------- | -------- | ---------------------------------------------------------------------------- |
| `message`        | `string`                                        | **Yes**  | The user turn text.                                                          |
| `conversationId` | `string`                                        | No       | Omit on turn 1. Pass the value returned by the previous response on turn 2+. |
| `mode`           | `"ask"` \| `"code"` \| `"plan"` \| `"advanced"` | No       | BOB chat mode. Defaults to `ask`. Only applied on turn 1.                    |

**Response**

```json
{
	"conversationId": "3f2a1b4c-...",
	"content": "The orderSearch function queries the OMS API...",
	"usage": {
		"inputTokens": 1420,
		"outputTokens": 312,
		"totalTokens": 1732,
		"cost": 0.0021,
		"durationMs": 4381
	}
}
```

---

### `POST /api/v1/chat` — streaming (SSE)

Set `Accept: text/event-stream` to receive a Server-Sent Events stream instead of waiting for the full response.

**Request**

```http
POST /api/v1/chat
Content-Type: application/json
Accept: text/event-stream
```

**Stream events**

```
event: delta
data: {"content":"The orderSearch"}

event: delta
data: {"content":" function queries..."}

event: done
data: {"conversationId":"3f2a1b4c-...","content":"The orderSearch function queries the OMS API...","usage":{...}}

event: error
data: {"message":"BOB exited with code 1..."}
```

| Event   | Payload                                           | Description                                           |
| ------- | ------------------------------------------------- | ----------------------------------------------------- |
| `delta` | `{ content: string }`                             | Incremental text fragment from BOB.                   |
| `done`  | Full `ChatResponse` (same shape as JSON response) | Emitted once when BOB finishes.                       |
| `error` | `{ message: string }`                             | Emitted if BOB fails to start or exits with an error. |

---

### `GET /api/v1/conversations`

List all active conversations.

**Response**

```json
{
	"conversations": [
		{
			"conversationId": "3f2a1b4c-...",
			"sessionId": "bob-session-uuid",
			"branch": "conv/3f2a1b4c-...",
			"createdAt": "2024-01-15T10:30:00.000Z",
			"mode": "ask"
		}
	]
}
```

---

### `DELETE /api/v1/conversations/:id`

Remove a conversation. This deletes the git worktree and its branch.

```http
DELETE /api/v1/conversations/3f2a1b4c-...
```

Returns `204 No Content` on success.

---

### `GET /health`

Health check.

```json
{ "status": "ok" }
```

---

## Multi-turn example

```bash
# Turn 1 — no conversationId, server creates one
curl -s -X POST http://localhost:3001/api/v1/chat \
  -H "Content-Type: application/json" \
  -d '{"message": "What files are in the src directory?"}' \
  | tee turn1.json

# Extract conversationId from the response
CONV_ID=$(cat turn1.json | grep -o '"conversationId":"[^"]*"' | cut -d'"' -f4)

# Turn 2 — pass conversationId back
curl -s -X POST http://localhost:3001/api/v1/chat \
  -H "Content-Type: application/json" \
  -d "{\"message\": \"Which of those files handles routing?\", \"conversationId\": \"$CONV_ID\"}"
```

---

## IBM VIBE configuration

To use this API as an External Agent in IBM VIBE, configure the agent with:

```json
{
	"api_endpoint": "http://localhost:3001/api/v1/chat",
	"http_method": "POST",
	"request_template": "{\"message\":\"{{input}}\",\"conversationId\":\"{{conversationId}}\"}",
	"response_mapping": "{\"output\":\"content\",\"variables\":{\"conversationId\":\"conversationId\"}}",
	"token_mapping": "{\"input_tokens\":\"usage.inputTokens\",\"output_tokens\":\"usage.outputTokens\"}"
}
```

On turn 1, `{{conversationId}}` is empty — the API creates a new conversation and returns a `conversationId`. VIBE extracts it via `response_mapping.variables` and injects it into every subsequent request automatically.

---

## Project structure

```
├── src/
│   ├── app.ts                  # Express app, middleware, route mounting
│   ├── index.ts                # Server entry point, port + env config
│   ├── routes/
│   │   └── chat.ts             # POST /api/v1/chat, GET/DELETE /api/v1/conversations
│   ├── services/
│   │   ├── bob.service.ts      # Spawn BOB CLI, parse stream-json, SSE forwarding
│   │   ├── session.service.ts  # conversationId → sessionId resolution
│   │   └── worktree.service.ts # git worktree lifecycle, .bobapi.json R/W
│   ├── types/
│   │   └── bob.types.ts        # All shared TypeScript types
│   └── middleware/
│       └── error.ts            # Centralised error handler
├── package.json
├── tsconfig.json
└── PLAN.md                     # Design decisions and investigation log
```

---

## How it works

Each conversation gets an isolated **git worktree** inside `WORKSPACE_REPO/.worktrees/<conversationId>`. BOB is run with `cwd` set to that worktree, so its session list is scoped to exactly one session — no ambiguity.

A `.bobapi.json` sidecar file in each worktree holds the mapping between the API's `conversationId` and BOB's internal `session_id`:

```json
{
	"conversationId": "3f2a1b4c-...",
	"sessionId": "bob-internal-uuid",
	"branch": "conv/3f2a1b4c-...",
	"createdAt": "2024-01-15T10:30:00.000Z",
	"mode": "ask"
}
```

- **Turn 1:** message is piped via stdin; `session_id` from the `init` event is written back to `.bobapi.json`.
- **Turn 2+:** `bob --resume <session_id> -p "<message>"` is used (stdin is rejected by BOB in resume mode).

BOB's final answer is extracted from the `attempt_completion` tool call's `result` parameter, not assembled from streaming deltas (which include internal `<thinking>` blocks).
