# Execution Flow

## Overview

This document describes how execution jobs are created, queued, claimed, executed, and completed in the IBM VIBE system. The primary maintained flow is conversation execution through the TypeScript `agent-service-api`; legacy tests are adapted into that model where possible.

## Key Components

### Backend (`backend/`)

- **Routes**: [`routes/execute.ts`](../backend/src/routes/execute.ts) - Handles execution requests
- **Job Queue**: [`services/job-queue.ts`](../backend/src/services/job-queue.ts) - Manages job lifecycle
- **Database**: Persists jobs, sessions, and results

### Agent Service API (`agent-service-api/`)

- **Job Poller**: [`services/job-poller.ts`](../agent-service-api/src/services/job-poller.ts) - Polls for available jobs
- **Executor**: [`services/job-poller-conversation-executor.ts`](../agent-service-api/src/services/job-poller-conversation-executor.ts) - Executes conversations
- **Entry Point**: [`index.ts`](../agent-service-api/src/index.ts) - Starts poller on service startup

## Execution Flow Diagram

```
┌─────────────┐
│   Frontend  │
└──────┬──────┘
       │ 1. POST /api/execute/conversation
       │    { agent_id, conversation_id }
       ▼
┌─────────────────────────────────────────────────────────┐
│                        Backend                          │
│                                                         │
│  ┌──────────────────────────────────────────────────┐  │
│  │ routes/execute.ts                                │  │
│  │ • Validates request                              │  │
│  │ • Performs preflight checks                      │  │
│  │ • Calls jobQueue.createConversationJob()         │  │
│  └────────────────┬─────────────────────────────────┘  │
│                   │                                     │
│  ┌────────────────▼─────────────────────────────────┐  │
│  │ services/job-queue.ts                            │  │
│  │ • Generates UUID for job                         │  │
│  │ • Determines job_type (crewai/external_api)      │  │
│  │ • Creates Job record in database                 │  │
│  │ • Adds to in-memory queue                        │  │
│  │ • Returns job_id                                 │  │
│  └──────────────────────────────────────────────────┘  │
│                                                         │
└─────────────────────────────────────────────────────────┘
       │
       │ 2. Returns 202 Accepted
       │    { job_id, message }
       ▼
┌─────────────┐
│   Frontend  │ 3. Polls GET /api/jobs/:id
└─────────────┘    for status updates

       ┌─────────────────────────────────────────────────┐
       │         Meanwhile (async execution)             │
       └─────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────┐
│              Agent Service API                          │
│                                                         │
│  ┌──────────────────────────────────────────────────┐  │
│  │ services/job-poller.ts                           │  │
│  │ • Polls GET /api/jobs/available/:job_type        │  │
│  │ • Adaptive polling (5-60s intervals)             │  │
│  │ • Exponential backoff when no jobs               │  │
│  └────────────────┬─────────────────────────────────┘  │
│                   │ 4. Finds pending job                │
│                   ▼                                     │
│  ┌──────────────────────────────────────────────────┐  │
│  │ Claims job via POST /api/jobs/:id/claim          │  │
│  │ • Backend marks job as 'running'                 │  │
│  │ • Sets claimed_by and claimed_at                 │  │
│  └────────────────┬─────────────────────────────────┘  │
│                   │                                     │
│                   │ 5. Fetches conversation details    │
│                   ▼                                     │
│  ┌──────────────────────────────────────────────────┐  │
│  │ services/job-poller-conversation-executor.ts     │  │
│  │ • GET /api/conversations/:id (with messages)     │  │
│  │ • Resolves conversation script                   │  │
│  │ • Applies templates and response maps            │  │
│  │ • Resolves variables                             │  │
│  └────────────────┬─────────────────────────────────┘  │
│                   │                                     │
│                   │ 6. Updates job progress (30%)       │
│                   ▼                                     │
│  ┌──────────────────────────────────────────────────┐  │
│  │ Executes conversation turn-by-turn               │  │
│  │ • Calls external AI API for each turn            │  │
│  │ • Applies request templates (Handlebars)         │  │
│  │ • Extracts responses (JSONPath)                  │  │
│  │ • Extracts token usage                           │  │
│  │ • Stops on failure if configured                 │  │
│  └────────────────┬─────────────────────────────────┘  │
│                   │                                     │
│                   │ 7. Updates job progress (80%)       │
│                   ▼                                     │
│  ┌──────────────────────────────────────────────────┐  │
│  │ Saves results to backend                         │  │
│  │ • POST /api/sessions                             │  │
│  │ • Creates execution_session record               │  │
│  │ • Creates session_messages records               │  │
│  │ • Stores metadata (tokens, timing, etc.)         │  │
│  └────────────────┬─────────────────────────────────┘  │
│                   │                                     │
│                   │ 8. Updates job status                │
│                   ▼                                     │
│  ┌──────────────────────────────────────────────────┐  │
│  │ PUT /api/jobs/:id                                │  │
│  │ • status: 'completed' (or 'failed')              │  │
│  │ • progress: 100                                  │  │
│  │ • session_id: <created_session_id>               │  │
│  └──────────────────────────────────────────────────┘  │
│                                                         │
└─────────────────────────────────────────────────────────┘
       │
       │ 9. Frontend receives completed status
       ▼
┌─────────────┐
│   Frontend  │ 10. GET /api/sessions/:id
│             │     Displays results
└─────────────┘
```

## Detailed Step-by-Step Flow

### 1. Job Creation (Frontend → Backend)

**Endpoint**: `POST /api/execute/conversation`

**Request**:

```json
{
	"agent_id": 1,
	"conversation_id": 5
}
```

**Backend Processing** ([`routes/execute.ts`](../backend/src/routes/execute.ts)):

1. Validates request body with Zod schema
2. Fetches agent and conversation from database
3. Determines agent job type (`crewai` or `external_api`)
4. For `external_api` agents:
    - Fetches conversation messages
    - Fetches agent templates and response maps
    - Runs preflight validation ([`lib/conversationPreflight.ts`](../backend/src/lib/conversationPreflight.ts))
    - Checks capability matching
    - Validates required templates/maps exist
5. Calls `jobQueue.createConversationJob(agent_id, conversation_id)`

**Job Queue Service** ([`services/job-queue.ts`](../backend/src/services/job-queue.ts)):

1. Generates UUID for job ID
2. Fetches agent to determine job type
3. Creates Job object:
    ```typescript
    {
      id: "uuid",
      agent_id: 1,
      conversation_id: 5,
      status: "pending",
      progress: 0,
      job_type: "external_api"
    }
    ```
4. Saves to database (`jobs` table)
5. Adds to in-memory queue
6. Returns job ID

**Response**: `202 Accepted`

```json
{
	"job_id": "550e8400-e29b-41d4-a716-446655440000",
	"message": "Conversation execution job created and queued for execution"
}
```

### 2. Job Polling (Agent Service API → Backend)

**Service**: [`agent-service-api/src/services/job-poller.ts`](../agent-service-api/src/services/job-poller.ts)

**Polling Strategy**:

- Starts on service startup ([`index.ts`](../agent-service-api/src/index.ts))
- Polls `GET /api/jobs/available/external_api?limit=5` in the current service implementation
- Adaptive intervals:
    - 5 seconds when jobs are available
    - Exponential backoff up to 60 seconds when idle
- Concurrent execution (configurable limit)

**Backend Response** ([`routes/jobs.ts`](../backend/src/routes/jobs.ts)):

```json
[
	{
		"id": "550e8400-e29b-41d4-a716-446655440000",
		"agent_id": 1,
		"conversation_id": 5,
		"status": "pending",
		"progress": 0,
		"job_type": "external_api"
	}
]
```

### 3. Job Claiming

**Endpoint**: `POST /api/jobs/:id/claim`

**Request Body**:

```json
{
	"service_id": "agent-service-api-instance-1"
}
```

**Backend Processing**:

1. Checks job exists and is pending
2. Updates job:
    - `status`: `"running"`
    - `claimed_by`: value from `service_id`
    - `claimed_at`: current timestamp
3. Returns `{ message, job_id }`

**Purpose**: Prevents multiple services from executing the same job

### 4. Conversation Execution

**Service**: [`agent-service-api/src/services/job-poller-conversation-executor.ts`](../agent-service-api/src/services/job-poller-conversation-executor.ts)

**Steps**:

1. **Fetch Conversation**:
    - `GET /api/conversations/:id`
    - Includes messages, variables, templates, response maps

2. **Resolve Configuration**:
    - Get agent templates and response maps
    - Resolve conversation script with variables
    - Apply default templates/maps if not specified per-message

3. **Update Progress**: `PUT /api/jobs/:id` → `progress: 30`

4. **Execute Turn-by-Turn**:
    - For each message in conversation:
        - Apply request template (Handlebars)
        - Call external AI API
        - Extract response using response map (JSONPath)
        - Extract token usage
        - Store message in transcript
        - Check stop_on_failure condition

5. **Update Progress**: `PUT /api/jobs/:id` → `progress: 80`

6. **Save Results**:
    - `POST /api/sessions`
    - Creates `execution_session` record
    - Creates `session_messages` records for full transcript
    - Stores metadata:
        - Token usage (prompt, completion, total)
        - Execution duration
        - Success/failure status
        - Error messages if any

7. **Complete Job**:
    - `PUT /api/jobs/:id`
    - `status`: `"completed"` or `"failed"`
    - `progress`: `100`
    - `session_id`: created session ID
    - `error`: error message if failed

### 5. Result Retrieval (Frontend)

**Polling**: Frontend polls `GET /api/jobs/:id` until status is `completed` or `failed`

**Session Retrieval**: `GET /api/sessions/:id`

**Response**:

```json
{
	"id": 123,
	"conversation_id": 5,
	"agent_id": 1,
	"status": "completed",
	"success": true,
	"started_at": "2026-05-12T14:00:00Z",
	"completed_at": "2026-05-12T14:00:45Z",
	"metadata": {
		"total_tokens": 1250,
		"prompt_tokens": 800,
		"completion_tokens": 450,
		"duration_ms": 45000,
		"similarity_scores": [95, 88, 92]
	},
	"messages": [
		{
			"sequence": 1,
			"role": "user",
			"content": "Hello, how are you?",
			"timestamp": "2026-05-12T14:00:00Z"
		},
		{
			"sequence": 2,
			"role": "assistant",
			"content": "I'm doing well, thank you!",
			"timestamp": "2026-05-12T14:00:15Z",
			"similarity_score": 95
		}
	]
}
```

## Legacy Test Execution

**Endpoint**: `POST /api/execute` (legacy)

**Flow**:

1. Maps `test_id` to `conversation_id` via legacy adapter
2. Creates conversation-based job
3. Follows same execution flow as above
4. Results stored in both:
    - `execution_sessions` / `session_messages` (new)
    - `results` table (legacy, for backward compatibility)

**Service**: [`services/legacy-execution.ts`](../backend/src/services/legacy-execution.ts)

## Suite Execution

**Endpoint**: `POST /api/execute-suite`

**Flow**:

1. Creates `suite_run` record
2. Flattens nested suite structure ([`services/suite-processing-service.ts`](../backend/src/services/suite-processing-service.ts))
3. Creates individual jobs for each test/conversation
4. Links all jobs to `suite_run_id`
5. Tracks aggregate progress and metrics
6. Jobs execute independently via normal flow

## Job States

```
pending → running → completed
                 ↘ failed
                 ↘ timeout (stale job detection)
```

**State Transitions**:

- `pending`: Job created, waiting for execution
- `running`: Job claimed by service, execution in progress
- `completed`: Execution finished successfully
- `failed`: Execution encountered an error
- `timeout`: Job stale according to backend job queue timeout handling

## Error Handling

### Preflight Failures

- Validation errors before job creation
- Return `400 Bad Request` immediately
- No job created

### Execution Failures

- Job created and claimed
- Error during execution
- Job marked as `failed` with error message
- Session may be partially created

### Service Crashes

- Stale job detection resets `running` jobs to `pending`
- Jobs can be re-claimed by another service instance
- Prevents jobs from being stuck indefinitely

## Performance Considerations

### Polling Optimization

- Adaptive polling intervals reduce unnecessary requests
- Exponential backoff when idle
- Batch job fetching (limit parameter)

### Concurrent Execution

- Agent Service API can execute multiple jobs concurrently
- Configurable concurrency limit
- Independent job execution (no blocking)

### Database Efficiency

- In-memory job cache in backend
- Prepared SQL statements
- Indexed queries on job status and timestamps

## Monitoring and Observability

### Job Metrics

- Creation time
- Claim time
- Execution duration
- Token usage
- Success/failure rates

### Endpoints for Monitoring

- `GET /api/jobs?status=running` - Active jobs
- `GET /api/jobs?status=failed` - Failed jobs
- `GET /api/stats` - Dashboard statistics

### Logging

- Job lifecycle events
- Execution errors
- API call timing
- Token usage tracking

## Related Documentation

- [Architecture](./02-architecture.md) - System architecture overview
- [Backend Guide](./03-backend-guide.md) - Backend implementation details
- [Database Schema](./06-database-schema.md) - Job and session tables
