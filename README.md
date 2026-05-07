# IBM VIBE

## Overview

IBM VIBE is a comprehensive platform designed to test, evaluate, and improve AI agents. It provides a structured approach to testing agent performance, behavior, and outputs across different configurations and inputs.

## Purpose

When building AI agents, it's essential to ensure they perform consistently and accurately. This testing suite serves several key purposes:

- **Quality Assurance**: Verify agent outputs against expected responses
- **Regression Testing**: Ensure new agent versions don't break existing functionality
- **Performance Optimization**: Measure and improve agent execution metrics
- **Configuration Testing**: Compare different agent settings and prompts
- **Iterative Development**: Quickly identify and fix issues in agent behavior

## Architecture

The application is separated into four main components:

1. **Frontend** - User interface for managing tests and viewing results
    - Built with Next.js and Carbon React
    - Provides test management UI, agent configuration, results visualization, and comparison views

2. **Backend** - API server for test management and data storage
    - Built with TypeScript, Express.js, and SQLite
    - Handles REST API for test management, coordination with agent service, and data persistence

3. **Agent Service** - Python service for executing CrewAI tests
    - Built with Python, FastAPI, and CrewAI
    - Handles agent execution, LLM provider integration, and result collection
    - Status: currently out of date and needs TLC before relying on it in production

4. **Agent Service API** - TypeScript service for external API style agents
    - Built with TypeScript and Express.js
    - Polls jobs from backend, executes conversations against external APIs, and posts sessions/transcripts back

## Key Features

### Test Management

- Create, edit, and organize test cases with expected outputs
- Group tests into test suites for comprehensive evaluation
- Track test history and version performance

### Agent Configuration

- Configure agent roles, goals, backstories, and capabilities
- Create and manage multiple agent versions
- Compare performance across different configurations

### Execution Engine

- Run tests individually or in batches
- Execute tests with different agent versions
- Support for various LLM providers (currently Ollama)

### Results Analysis

- Detailed view of test results with pass/fail status
- Visualization of intermediate agent steps
- Performance metrics collection (token usage, execution time, etc.)
- Side-by-side comparison of different agent versions

## Getting Started

### Prerequisites

- Node.js (v18.17+, v20 recommended)
- Python (v3.10+)
- Ollama or another LLM provider

### Installation

#### 1. Core Setup (Required)

```bash
# Install all dependencies (including workspaces)
npm install
```

#### 2. Run the app (recommended)

From the repository root:

```bash
npm run dev
```

This starts:

- **Backend**: `http://localhost:5000`
- **Agent Service API**: `http://localhost:5003`
- **Frontend**: `http://localhost:3000`

Note: the Python `agent-service` is not started by `npm run dev`. Start it separately if you want CrewAI executions.

For multi-instance local setups, use `env.instance1.example` as a template and create your own `env.instance*` files locally. Instance env files are intentionally gitignored.

## Service topology and ports

| Service                | Default port | Role                                         |
| ---------------------- | -----------: | -------------------------------------------- |
| Frontend               |         3000 | UI for conversations, sessions, and analysis |
| Backend                |         5000 | System API, storage, job orchestration       |
| Agent Service API      |         5003 | External API executor and backend job poller |
| Agent Service (Python) |         5002 | CrewAI execution service                     |

Key integration paths:

- Backend creates jobs and stores data.
- Agent Service API polls backend jobs, executes external API conversations, then posts sessions and messages.
- Backend can be configured to call the Python Agent Service directly for CrewAI execution paths via `AGENT_SERVICE_URL`.

#### 3. Services Setup (advanced)

##### Frontend

```bash
cd frontend
npm run dev
```

##### Backend

```bash
cd backend
# Copy the environment file and configure it
cp .env.example .env
# Note: Backend auto-loads .env when using `npm run dev` only.
# For production (`npm run start`), provide environment variables explicitly
# (or use runner scripts such as start-instance.sh).
# AGENT_SERVICE_URL should point to the Python agent-service (default http://localhost:5002)
# Or use start-instance.sh which handles this automatically
npm run dev
```

##### Agent Service (Python)

```bash
cd agent-service
# Create and activate virtual environment
python -m venv venv
source venv/bin/activate  # On Windows: .\venv\Scripts\activate
pip install -r requirements.txt
# Copy the environment file and configure it
cp .env.example .env
python run.py
```

Note: the Python `agent-service` implementation is currently out of date and needs TLC. Prefer the TypeScript path (`backend` + `agent-service-api`) unless you are explicitly working on CrewAI integration.

##### Agent Service API

```bash
cd agent-service-api
npm run dev
```

## Workflow

1. **Create Tests**: Define test inputs and expected outputs
2. **Configure Agents**: Create agent configurations with specific settings
3. **Run Tests**: Execute tests with your chosen agent configuration
4. **Analyze Results**: Review test results and agent performance
5. **Iterate**: Modify agent configurations based on results and retest

## Development tooling

To keep the monorepo healthy, run the shared quality gates before opening a PR:

- `npm run format` - format supported files with Prettier
- `npm run format:check` - verify formatting in CI style
- `npm run lint` - run eslint across backend, frontend, and agent-service-api
- `npm run typecheck` - ensure all TypeScript workspaces type-check cleanly
- `npm run test:ts` - execute Jest suites (backend, frontend, agent-service-api)

Each workspace also exposes its own `lint`, `typecheck`, and `test` scripts if you want to run a single service in isolation.

The Python agent service test suite is available via `npm run test:agent-service` (requires the `agent-service` Python environment).

## Why This Matters

AI agents are increasingly being deployed to handle complex, multi-step tasks. However, their performance can be unpredictable and dependent on specific prompts, configurations, and inputs. This testing suite provides:

- **Confidence**: Know your agents will perform as expected in production
- **Insights**: Understand which configurations yield the best results
- **Efficiency**: Save time through automated testing rather than manual verification
- **Consistency**: Ensure reliability across different inputs and edge cases
- **Documentation**: Create a record of expected behaviors and outputs

## Future Enhancements

- Support for additional agent frameworks beyond CrewAI
- Advanced analytics and reporting
- Integration with CI/CD pipelines
- Real-time monitoring via WebSockets
- Enhanced comparison tools

## Contributing

Contributions are welcome. Please read [`CONTRIBUTING.md`](CONTRIBUTING.md) before opening a pull request.

## Security

Please report security vulnerabilities privately. See [`SECURITY.md`](SECURITY.md).

## License

Apache-2.0. See [`LICENSE`](LICENSE).
