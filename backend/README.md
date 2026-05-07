# Backend Service

The central API server for IBM VIBE. It handles REST endpoints, execution orchestration,
and SQLite-backed persistence for tests, conversations, sessions, jobs, and suite runs.

## Architecture

- **Database**: SQLite (via `better-sqlite3`)
- **API**: Express REST API
- **Types**: Shared interfaces from `@ibm-vibe/types`

## Setup

1. **Install Dependencies**:
   Run `npm install` in the project root to link the workspace packages.

    ```bash
    # In project root
    npm install
    ```

2. **Configure Environment**:
   Copy `.env.example` to `.env` and adjust settings.

    ```bash
    cp .env.example .env
    ```

3. **Run Service**:

    ```bash
    npm run dev
    ```

## Environment loading behavior

The backend uses `@ibm-vibe/config`, which always reads from `process.env`.

- `npm run dev` auto-loads `.env` from the backend directory using `dotenv/config`.
- `npm run start` does **not** auto-load `.env`; provide environment variables via your shell, process manager, or scripts such as `start-instance.sh`.

### Examples

Use default `.env` in development:

```bash
cd backend
npm run dev
```

Use a custom env file in development:

```bash
cd backend
DOTENV_CONFIG_PATH=.env.instance1 npm run dev
```

Override a value from `.env` explicitly in shell (shell value wins):

```bash
cd backend
PORT=5100 npm run dev
```

Run production start with exported env only:

```bash
cd backend
export PORT=5000 DB_PATH=./data/agent-testing.db AGENT_SERVICE_URL=http://localhost:5002
npm run start
```

## Development

The backend relies on the shared types package. If you modify `packages/types`, you may need to restart the backend dev server to pick up changes.
