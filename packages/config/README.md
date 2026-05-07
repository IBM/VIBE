# @ibm-vibe/config

Shared configuration helpers for IBM VIBE services.
Each helper parses `process.env` with `zod`, applies sensible defaults, and exposes a typed object.

## Backend (`loadBackendConfig`)

| Variable                | Default                   | Description                    |
| ----------------------- | ------------------------- | ------------------------------ |
| `PORT`                  | `5000`                    | Express port                   |
| `HOST`                  | `localhost`               | Bind address                   |
| `AGENT_SERVICE_URL`     | `http://localhost:5002`   | CrewAI agent-service endpoint  |
| `AGENT_SERVICE_TIMEOUT` | `0`                       | Axios timeout (0 = no timeout) |
| `DB_PATH`               | `./data/agent-testing.db` | SQLite file path               |

## Agent Service API (`loadAgentServiceApiConfig`)

| Variable                     | Default                 | Description                                    |
| ---------------------------- | ----------------------- | ---------------------------------------------- |
| `PORT`                       | `5003`                  | API server port                                |
| `HOST`                       | `localhost`             | Bind address                                   |
| `BACKEND_URL`                | `http://localhost:5000` | Backend base URL                               |
| `BACKEND_TIMEOUT`            | `30000`                 | Timeout (ms) when calling backend              |
| `DEFAULT_TIMEOUT`            | `60000`                 | Timeout (ms) for external API requests         |
| `HEALTH_CHECK_INTERVAL`      | `60000`                 | Interval (ms) for polling health checks        |
| `POLLER_BASE_INTERVAL_MS`    | `5000`                  | Base interval (ms) between job polls           |
| `POLLER_MAX_INTERVAL_MS`     | `60000`                 | Max backoff interval (ms) between job polls    |
| `POLLER_BACKOFF_MULTIPLIER`  | `1.5`                   | Exponential backoff multiplier for empty polls |
| `POLLER_MAX_CONCURRENT_JOBS` | `3`                     | Max concurrent jobs to execute                 |

## Frontend (`loadFrontendConfig`)

| Variable                    | Default                 | Description                              |
| --------------------------- | ----------------------- | ---------------------------------------- |
| `NEXT_PUBLIC_API_URL`       | `http://localhost:5000` | Backend REST base URL                    |
| `NEXT_PUBLIC_INSTANCE_NAME` | _empty_                 | Optional label appended to the UI header |
