# Quickstart

This guide gets the maintained TypeScript stack running locally and points you at the first useful evaluation flow.

## 1. Install prerequisites

Required:

- Node.js `18.17+` (`20` is recommended)
- npm

Optional:

- Python `3.10+` if you are working on the legacy CrewAI service
- A local LLM runtime if your chosen agent path depends on one

## 2. Install dependencies

Run from the repository root:

```bash
npm install
```

The root `postinstall` builds the shared packages used by the backend, frontend, and agent-service-api workspaces.

## 3. Create local environment files

```bash
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env.local
cp agent-service-api/.env.example agent-service-api/.env
```

The defaults connect the local services together:

- Frontend: `http://localhost:3000`
- Backend: `http://localhost:5100`
- Agent Service API: `http://localhost:5003`

The backend writes SQLite data to `backend/data/agent-testing.db` by default.

## 4. Start the app

```bash
npm run dev
```

This starts the backend, agent-service-api, and frontend together. The Python `agent-service` is not part of the default development path.

Open [http://localhost:3000](http://localhost:3000).

## 5. Run your first conversation

1. Open **LLM configs** and add or verify the model/API configuration your agent will use.
2. Open **Agents** and create or select the agent version you want to evaluate.
3. Open **Conversations** and create a conversation script with realistic messages.
4. Open **Quick execute**, select the agent and conversation, then execute.
5. Open **Jobs** to track queue progress.
6. Open **Sessions** to inspect the transcript, timing, token usage, and scoring signals.

## Troubleshooting

- If the frontend cannot reach the API, confirm `frontend/.env.local` has `NEXT_PUBLIC_API_URL=http://localhost:5100`.
- If you created local env files before the default backend port changed, update `backend/.env`, `frontend/.env.local`, and `agent-service-api/.env` together.
- If jobs stay pending, confirm `agent-service-api/.env` points `BACKEND_URL` at the backend and that `npm run dev` is still running.
- If shared package types look stale, run `npm run build:packages` or restart `npm run dev`.
- If you are working on CrewAI, start `agent-service` separately and verify `backend/.env` has the correct `AGENT_SERVICE_URL`.
