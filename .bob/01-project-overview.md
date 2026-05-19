# Project Overview

## What is IBM VIBE?

IBM VIBE (AI Agent Testing Suite) is a platform for testing, evaluating, and improving AI agents. It treats tests as inspectable conversations: users define agent configurations, conversations or legacy tests, run them through queued execution, and inspect transcripts, scores, and run metadata.

## Core Purpose

The platform serves several key purposes:

1. **Quality Assurance** - Verify agent outputs against expected responses
2. **Regression Testing** - Ensure new agent versions don't break existing functionality
3. **Performance Optimization** - Measure and improve agent execution metrics
4. **Configuration Testing** - Compare different agent settings and prompts
5. **Iterative Development** - Quickly identify and fix issues in agent behavior

## Key Concepts

### Agents

AI agents with specific configurations (role, goal, backstory, LLM settings). Each agent can have multiple versions for A/B testing and iteration.

**Agent Types:**

- **CrewAI Agents** - Configured with role, goal, backstory, tools, and delegation
- **External API Agents** - Connect to any external AI service with custom request/response mapping

### Conversations

Multi-turn test definitions that represent realistic interaction patterns. Conversations consist of:

- Ordered messages (user/system roles)
- Expected outcomes for each turn
- Variable support for dynamic content
- Stop-on-failure configuration

### Tests (Legacy)

Single-turn test cases with input and expected output. Legacy endpoints remain available, but new behavior should prefer conversations. Legacy tests are adapted into single-message conversations during execution where possible.

### Execution Sessions

Concrete runs of a conversation by a specific agent, capturing:

- Full transcript of all messages
- Timestamps and metadata
- Token usage and performance metrics
- Success/failure status

### Jobs

Work queue items that coordinate asynchronous test execution:

- Created when user requests execution
- Claimed by agent-service-api poller
- Track progress and status
- Link to results (sessions or legacy results)

### Test Suites

Collections of tests/conversations that can be executed together:

- Support nested suites
- Agent overrides per entry
- Batch execution with progress tracking
- Aggregate metrics and reporting

## Technology Stack

### Frontend

- **Framework**: Next.js 16 (React 18)
- **UI Library**: IBM Carbon Design System
- **Language**: TypeScript
- **Styling**: SCSS modules

### Backend

- **Framework**: Express.js
- **Language**: TypeScript
- **Database**: SQLite with better-sqlite3
- **Validation**: Zod schemas

### Agent Service API

- **Framework**: Express.js
- **Language**: TypeScript
- **Role**: Job poller and external API executor

### Agent Service (Python)

- **Framework**: FastAPI
- **Language**: Python
- **Role**: CrewAI execution (currently out of date)
- **Status**: Present in the repo but not the primary maintained execution path

### Shared Packages

- **@ibm-vibe/types** - Shared TypeScript types
- **@ibm-vibe/config** - Configuration management
- **@ibm-vibe/utils** - Shared utilities (token extraction, path traversal)

## Monorepo Structure

```
ai-agent-testing-suite/
├── frontend/              # Next.js UI
├── backend/               # Express API server
├── agent-service-api/     # Job poller & external API executor
├── agent-service/         # Python FastAPI (CrewAI)
├── packages/              # Shared packages
│   ├── types/            # Shared TypeScript types
│   ├── config/           # Configuration management
│   └── utils/            # Shared utilities
├── docs/                  # Documentation and diagrams
└── data/                  # SQLite database storage
```

## Development Workflow

1. **Frontend Development** - UI components and user interactions
2. **Backend Development** - API endpoints and business logic
3. **Agent Development** - CrewAI configurations and external API integrations
4. **Testing** - Automated testing across all components (TDD approach)
5. **Integration** - End-to-end testing of complete workflows

## Key Features

### Test Management

- Create, edit, and organize conversations and legacy tests
- Group conversations/tests into nested suites
- Track run history, transcripts, scores, and version performance

### Agent Configuration

- Configure agent roles, goals, and capabilities
- Create and manage multiple agent versions
- Compare performance across configurations
- Request templates and response maps for external APIs

### Execution Engine

- Run conversations/tests individually or in batches
- Execute with different agent versions
- Route `external_api` jobs through `agent-service-api`
- Keep legacy CrewAI compatibility through the older Python service path
- Use a backend job queue for asynchronous execution

### Results Analysis

- Detailed view of test results with pass/fail status
- Visualization of intermediate agent steps
- Performance metrics (token usage, execution time)
- Similarity scoring for output comparison
- Side-by-side comparison of agent versions

## Migration Status

The project is currently in a **legacy-to-conversation migration phase**:

- **Legacy System**: Single-turn tests with `tests` and `results` tables
- **New System**: Multi-turn conversations with `conversations`, `execution_sessions`, and `session_messages` tables
- **Current State**: Both systems are supported, with adapters and startup guards for backward compatibility
- **Future**: Legacy tables may be dropped once migration is complete

## Port Configuration

| Service                | Default Port | Role                                         |
| ---------------------- | -----------: | -------------------------------------------- |
| Frontend               |         3000 | UI for conversations, sessions, and analysis |
| Backend                |         5000 | System API, storage, job orchestration       |
| Agent Service API      |         5003 | External API executor and backend job poller |
| Agent Service (Python) |         5002 | CrewAI execution service                     |
