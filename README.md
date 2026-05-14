# IBM VIBE

[![CI](https://github.com/IBM/VIBE/actions/workflows/ci.yml/badge.svg)](https://github.com/IBM/VIBE/actions/workflows/ci.yml)

IBM VIBE is a conversation-centric testing suite for evaluating AI agents through repeatable runs, inspectable transcripts, and clear execution history.

Use it to script realistic agent conversations, run them against agent configurations, and inspect the resulting sessions, jobs, token usage, similarity scores, and failures.

## Why VIBE?

- **Test conversations, not just prompts**: model the multi-turn exchanges your users actually have.
- **Make failures inspectable**: review sessions and transcripts instead of treating an agent run as a black box.
- **Compare agent versions**: iterate on prompts, tools, and LLM settings with consistent evaluation inputs.
- **Keep evaluation local and reproducible**: run the maintained TypeScript stack with SQLite-backed storage.

## Quickstart

### Prerequisites

- Node.js `18.17+` (`20` is recommended; see `.nvmrc`)
- npm

Optional:

- Python `3.10+` only if you are working on the legacy CrewAI service
- Ollama or another local LLM only if your selected agent path requires it

### Start the maintained TypeScript stack

```bash
npm install
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env.local
cp agent-service-api/.env.example agent-service-api/.env
npm run dev
```

This starts the three services used by the current conversation-first workflow:

| Service           | Default URL             | Role                                         |
| ----------------- | ----------------------- | -------------------------------------------- |
| Frontend          | `http://localhost:3000` | UI for conversations, sessions, and analysis |
| Backend           | `http://localhost:5000` | System API, storage, job orchestration       |
| Agent Service API | `http://localhost:5003` | External API executor and backend job poller |

Open [http://localhost:3000](http://localhost:3000), then follow the first-run path:

1. Add or confirm an LLM configuration.
2. Create or choose an agent.
3. Create a conversation script.
4. Use **Quick execute** to enqueue a run.
5. Inspect the job and resulting session transcript.

For more detail, see [`docs/quickstart.md`](docs/quickstart.md) and [`docs/product-tour.md`](docs/product-tour.md).

## Product workflow

VIBE's preferred workflow is conversation-first:

1. **Configure** the LLM/API and agent version you want to evaluate.
2. **Choose** or create the agent version that should handle the evaluation.
3. **Script** one or more conversations with realistic user and assistant messages.
4. **Execute** a conversation against an agent, which creates a queued job.
5. **Inspect** the session transcript, intermediate outputs, token usage, timing, and scoring signals.
6. **Iterate** on the agent configuration or conversation script and rerun.

Legacy test and suite flows still exist for compatibility, but new work should prefer conversations, sessions, and jobs.

## Architecture

The repository is an npm workspace monorepo:

| Workspace           | Technology                  | Purpose                                                |
| ------------------- | --------------------------- | ------------------------------------------------------ |
| `frontend`          | Next.js, TypeScript, Carbon | Web UI for evaluation workflows                        |
| `backend`           | Express, TypeScript, SQLite | API, persistence, job orchestration                    |
| `agent-service-api` | Express, TypeScript         | Polls backend jobs and executes external API agents    |
| `packages/*`        | TypeScript                  | Shared contracts, config, and utilities                |
| `agent-service`     | Python, FastAPI, CrewAI     | Legacy CrewAI path; currently not the maintained stack |

Key integration path:

```text
Frontend -> Backend -> Job queue -> Agent Service API -> Backend -> Sessions/transcripts
```

The Python `agent-service` is not started by `npm run dev`. Prefer `backend` + `agent-service-api` unless you are explicitly working on CrewAI integration.

## Development

Common commands from the repository root:

```bash
npm run dev
npm run format
npm run format:check
npm run lint
npm run typecheck
npm run test:ts
```

Each workspace also exposes its own `lint`, `typecheck`, and `test` scripts if you want to run a single service in isolation.

For multi-instance local setups, use `env.instance1.example` as a template and create your own `env.instance*` files locally. Instance env files are intentionally gitignored.

## Documentation

- [`docs/quickstart.md`](docs/quickstart.md) - first local run from a clean checkout
- [`docs/product-tour.md`](docs/product-tour.md) - how the main product concepts fit together
- [`docs/README.md`](docs/README.md) - full documentation index
- [`CONTRIBUTING.md`](CONTRIBUTING.md) - contributor workflow
- [`SECURITY.md`](SECURITY.md) - private vulnerability reporting

## Visuals to add before a public push

The repo will read much better on GitHub with a small visual set under `docs/assets/`:

- Dashboard screenshot with first-run guidance visible
- Conversation editor screenshot
- Quick execute screenshot
- Session transcript screenshot

Add those images to this README once captured from a representative local instance.

## License

Apache-2.0. See [`LICENSE`](LICENSE).
