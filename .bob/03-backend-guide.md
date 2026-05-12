# Backend Guide

## Overview

The backend is an Express.js application written in TypeScript. It provides the REST API, owns SQLite persistence, manages the job queue, coordinates execution, and exposes compatibility adapters while the app moves from legacy tests to conversations.

**Location**: `backend/`  
**Entry Point**: [`backend/src/index.ts`](../backend/src/index.ts)  
**Port**: 5000 (configurable via `PORT` env var)

## Directory Structure

```
backend/src/
├── index.ts                 # Express app setup and route registration
├── config.ts                # Configuration loading from @ibm-vibe/config
├── types.ts                 # TypeScript type definitions
├── exports.ts               # Public API exports
│
├── routes/                  # API route handlers
│   ├── agents.ts           # Composes agent CRUD + template/map subroutes
│   ├── agents/             # Agent CRUD, templates, response map subroutes
│   ├── conversations.ts    # Conversation CRUD + messages
│   ├── data-transfer.ts    # Export/import endpoints
│   ├── execute.ts          # Test/conversation execution
│   ├── execute-suite.ts    # Suite execution
│   ├── jobs.ts             # Job management
│   ├── sessions.ts         # Execution session queries
│   ├── session-messages.ts # Session message CRUD + scoring
│   ├── results.ts          # Legacy results (with session fallback)
│   ├── test-suites.ts      # Suite CRUD + entries
│   ├── test-suites/        # Suite CRUD, entries, legacy test entry routes
│   ├── tests.ts            # Legacy test CRUD
│   ├── llm-configs.ts      # LLM configuration management
│   ├── templates.ts        # Global request templates
│   ├── response-maps.ts    # Global response maps
│   ├── conversation-turn-targets.ts  # Turn target management
│   ├── suite-runs.ts       # Suite run queries
│   └── stats.ts            # Dashboard statistics
│
├── services/               # Business logic layer
│   ├── job-queue.ts        # Job queue management
│   ├── agent-service.ts    # CrewAI agent communication
│   ├── agent-types.ts      # Agent type guards and interfaces
│   ├── scoring-service.ts  # Similarity scoring with LLMs
│   ├── llm-config-service.ts  # LLM provider abstraction
│   ├── legacy-execution.ts # Legacy test execution adapter
│   ├── suite-processing-service.ts  # Suite flattening logic
│   └── session-payload-normalizer.ts  # Session data normalization
│
├── db/                     # Database layer
│   ├── database.ts         # DB initialization and migrations
│   ├── queries.ts          # Raw SQL query functions
│   ├── normalizers.ts      # Data normalization utilities
│   ├── legacyTransitionMigrations.ts  # Legacy-to-conversation migration
│   ├── repositories/       # Repository pattern implementations
│   │   ├── agentRepo.ts
│   │   ├── configRepo.ts
│   │   ├── conversationRepo.ts
│   │   ├── conversationTurnTargetsRepo.ts
│   │   ├── executionRepo.ts
│   │   ├── legacyRepo.ts
│   │   ├── suiteRepo.ts
│   │   └── templateRepo.ts
│   └── migrations/         # Versioned schema migrations
│       ├── index.ts
│       ├── types.ts
│       └── 001_initial_schema.ts through 016_*.ts
│
├── lib/                    # Utilities and helpers
│   ├── asyncHandler.ts     # Express async error wrapper
│   ├── validateBody.ts     # Zod validation helper
│   ├── routeHelpers.ts     # Common route utilities
│   ├── logger.ts           # Logging utilities
│   ├── conversationPreflight.ts  # Pre-execution validation
│   ├── communicationCapabilities.ts  # Template/map capability matching
│   ├── sessionMetadata.ts  # Session metadata calculation
│   ├── tokenUsageExtractor.ts  # Token usage extraction
│   ├── parseScoringResponse.ts  # LLM scoring response parser
│   └── legacyIdResolver.ts # Legacy ID mapping
│
├── adapters/               # Compatibility adapters
│   └── legacy-adapter.ts   # Legacy test to conversation adapter
│
└── utils/                  # Shared utilities
    ├── agent-utils.ts      # Agent type detection
    └── pagination.ts       # Pagination helpers
```

## Key Modules

### Routes Layer

Routes handle HTTP requests, validate input, call services/repositories, and return responses. Most routes are mounted in [`backend/src/index.ts`](../backend/src/index.ts) under `/api/*`.

**Pattern**:
```typescript
import { Router } from 'express';
import { asyncHandler } from '../lib/asyncHandler';
import { validateBody } from '../lib/validateBody';
import * as repo from '../db/repositories/someRepo';

const router = Router();

router.get('/', asyncHandler(async (req, res) => {
  const data = await repo.getAll();
  res.json(data);
}));

router.post('/', asyncHandler(async (req, res) => {
  const validated = validateBody(req, res, schema);
  if (!validated) return;
  
  const created = await repo.create(validated);
  res.status(201).json(created);
}));

export default router;
```

**Key Routes**:
- [`routes/agents.ts`](../backend/src/routes/agents.ts) - Agent CRUD, templates, response maps
- [`routes/conversations.ts`](../backend/src/routes/conversations.ts) - Conversation CRUD, messages
- [`routes/execute.ts`](../backend/src/routes/execute.ts) - Execution endpoints
- [`routes/jobs.ts`](../backend/src/routes/jobs.ts) - Job management and claiming
- [`routes/sessions.ts`](../backend/src/routes/sessions.ts) - Session queries
- [`routes/data-transfer.ts`](../backend/src/routes/data-transfer.ts) - Export/import workflows

### Services Layer

Services contain business logic and orchestrate between repositories.

**Job Queue Service** ([`services/job-queue.ts`](../backend/src/services/job-queue.ts)):
- Manages asynchronous job execution
- In-memory job cache with database persistence
- Automatic stale job detection and reset
- Suite run progress tracking
- Job claiming for distributed execution

**Scoring Service** ([`services/scoring-service.ts`](../backend/src/services/scoring-service.ts)):
- Similarity scoring using LLM providers
- Prompt generation for scoring
- Score parsing and validation
- Metadata tracking

**LLM Config Service** ([`services/llm-config-service.ts`](../backend/src/services/llm-config-service.ts)):
- Abstraction over multiple LLM providers (OpenAI, Anthropic, Ollama, Watsonx)
- Fallback mechanism with priority ordering
- Provider-specific request formatting

**Suite Processing Service** ([`services/suite-processing-service.ts`](../backend/src/services/suite-processing-service.ts)):
- Flattens nested suite structures
- Counts leaf tests
- Handles agent overrides
- Circular reference detection

### Database Layer

**Database Initialization** ([`db/database.ts`](../backend/src/db/database.ts)):
- SQLite connection setup
- Foreign key enforcement
- Migration execution
- Legacy table cleanup

**Queries** ([`db/queries.ts`](../backend/src/db/queries.ts)):
- Raw SQL query functions
- Prepared statements for performance
- Type-safe query results

**Repositories**:
Repositories provide a clean interface for data access:

- **agentRepo** - Agent CRUD, template/map linking
- **conversationRepo** - Conversation and message management
- **executionRepo** - Session and session message operations
- **templateRepo** - Global templates and response maps
- **suiteRepo** - Suite and entry management
- **configRepo** - LLM configuration management

**Migrations** ([`db/migrations/`](../backend/src/db/migrations/)):
- Sequential, versioned migrations
- Each migration has `version`, `name`, and `up` function
- Automatically tracked in `migrations` table
- See [`06-database-schema.md`](./06-database-schema.md) for details

### Library Utilities

**Async Handler** ([`lib/asyncHandler.ts`](../backend/src/lib/asyncHandler.ts)):
```typescript
// Wraps async route handlers to catch errors
export const asyncHandler = (fn: Function) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};
```

**Validate Body** ([`lib/validateBody.ts`](../backend/src/lib/validateBody.ts)):
```typescript
// Validates request body with Zod schema
export const validateBody = (req, res, schema, options?) => {
  const result = schema.safeParse(req.body);
  if (!result.success) {
    res.status(400).json({ error: 'Validation failed' });
    return null;
  }
  return result.data;
};
```

**Conversation Preflight** ([`lib/conversationPreflight.ts`](../backend/src/lib/conversationPreflight.ts)):
- Validates conversation before execution
- Checks template/map capabilities
- Ensures all required configs are present

**Communication Capabilities** ([`lib/communicationCapabilities.ts`](../backend/src/lib/communicationCapabilities.ts)):
- Matches template/map capabilities with conversation requirements
- Validates capability compatibility

## Data Flow Patterns

### Creating and Executing a Conversation

```
1. POST /api/conversations
   → conversationRepo.createConversation()
   → Returns conversation with id

2. POST /api/conversations/:id/messages (multiple times)
   → conversationRepo.createConversationMessage()
   → Builds conversation script

3. POST /api/execute/conversation
   → Validates agent and conversation exist
   → Runs preflight checks (for external_api agents)
   → jobQueue.createConversationJob()
   → Returns job_id

4. Agent-service-api polls and claims job
   → GET /api/jobs/available/external_api?limit=5
   → POST /api/jobs/:id/claim { service_id }

5. Agent-service-api executes and posts results
   → POST /api/sessions
   → executionRepo.createExecutionSession()
   → executionRepo.createSessionMessage() (for each turn)
   → PUT /api/jobs/:id (mark completed)

6. Frontend fetches results
   → GET /api/sessions/:id
   → executionRepo.getExecutionSessionById()
   → executionRepo.getSessionMessages()
```

### Suite Execution

```
1. POST /api/execute-suite
   → suiteProcessingService.getFlattenedLeaves()
   → jobQueue.createSuiteRun()
   → Creates job for each leaf test/conversation
   → Returns suite_run_id

2. Jobs execute independently
   → Each job follows normal execution flow
   → jobQueue.updateSuiteRunProgress() after each job

3. Frontend monitors progress
   → GET /api/suite-runs/:id
   → Shows aggregate metrics and status
```

## Configuration

Configuration is loaded from environment variables via [`@ibm-vibe/config`](../packages/config/src/index.ts):

```typescript
// backend/src/config.ts
import { loadBackendConfig } from '@ibm-vibe/config';

const backendConfig = loadBackendConfig();

export const agentServiceConfig = backendConfig.agentService;
export const serverConfig = backendConfig.server;
export const dbConfig = backendConfig.database;
```

**Environment Variables**:
- `PORT` - Server port (default: 5000)
- `HOST` - Server host (default: localhost)
- `DB_PATH` - SQLite database path (default: ./data/agent-testing.db)
- `AGENT_SERVICE_URL` - CrewAI service URL (default: http://localhost:5002)
- `AGENT_SERVICE_TIMEOUT` - Request timeout in ms (default: 0 = no timeout)

## Error Handling

**Pattern**:
1. Use `asyncHandler` wrapper for all async routes
2. Validate input with Zod schemas via `validateBody`
3. Return appropriate HTTP status codes
4. Include error details in response

```typescript
router.post('/', asyncHandler(async (req, res) => {
  const validated = validateBody(req, res, schema);
  if (!validated) return; // 400 already sent
  
  try {
    const result = await service.doSomething(validated);
    res.status(201).json(result);
  } catch (error) {
    if (error instanceof NotFoundError) {
      return res.status(404).json({ error: error.message });
    }
    throw error; // Let asyncHandler catch it
  }
}));
```

## Testing

Tests are located in `__tests__` directories alongside source files.

**Test Structure**:
- Unit tests for services, utilities, and repositories
- Integration tests for routes
- Mock database and external dependencies
- Jest config sets a 90% global coverage threshold for backend, frontend, and agent-service-api coverage runs

## Common Patterns

### Repository Pattern
```typescript
// db/repositories/exampleRepo.ts
export function getAll(): Entity[] {
  return db.prepare('SELECT * FROM entities').all() as Entity[];
}

export function getById(id: number): Entity | null {
  return db.prepare('SELECT * FROM entities WHERE id = ?')
    .get(id) as Entity | null;
}

export function create(data: Omit<Entity, 'id'>): Entity {
  const stmt = db.prepare('INSERT INTO entities (...) VALUES (...)');
  const info = stmt.run(...);
  return getById(info.lastInsertRowid as number)!;
}
```

### Service Pattern
```typescript
// services/exampleService.ts
export class ExampleService {
  async processData(input: Input): Promise<Output> {
    // 1. Validate
    // 2. Transform
    // 3. Call repositories
    // 4. Return result
  }
}

export const exampleService = new ExampleService();
```

### Route Pattern
```typescript
// routes/example.ts
const router = Router();

router.get('/', asyncHandler(async (req, res) => {
  const data = await repo.getAll();
  res.json(data);
}));

router.post('/', asyncHandler(async (req, res) => {
  const validated = validateBody(req, res, schema);
  if (!validated) return;
  
  const created = await repo.create(validated);
  res.status(201).json(created);
}));

export default router;
