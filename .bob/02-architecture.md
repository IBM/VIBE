# System Architecture

## High-Level Architecture

The IBM VIBE system consists of four main components that work together to provide comprehensive AI agent testing capabilities.

```
┌─────────────────────────────────────────────────────────────┐
│                    AI Agent Testing Suite                    │
│                                                              │
│  ┌──────────┐      ┌──────────┐      ┌──────────────────┐  │
│  │ Frontend │─────▶│ Backend  │─────▶│ Agent Service    │  │
│  │ Next.js  │ HTTP │ Express  │ HTTP │ API (TypeScript) │  │
│  └──────────┘      └────┬─────┘      └──────────────────┘  │
│                         │                                    │
│                         │ CRUD                               │
│                         ▼                                    │
│                    ┌─────────┐                               │
│                    │ SQLite  │                               │
│                    │Database │                               │
│                    └─────────┘                               │
│                                                              │
│  Optional: ┌──────────────────┐                             │
│            │ Agent Service    │                             │
│            │ (Python/CrewAI)  │                             │
│            └──────────────────┘                             │
└─────────────────────────────────────────────────────────────┘
```

## Component Details

### 1. Frontend (`frontend/`)

**Technology**: Next.js 14, TypeScript, SCSS, Carbon React

**Responsibilities**:
- User interface for test and agent management
- Results visualization with intermediate steps
- Comparison views for different agent versions
- Real-time job status monitoring
- Session transcript viewer

**Key Features**:
- Server-side rendering with Next.js App Router
- Carbon Design System components
- Responsive dashboard with metrics
- Agent analytics and performance tracking

**Structure**:
```
frontend/src/
├── app/                    # Next.js app router pages
│   ├── page.tsx           # Dashboard
│   ├── agents/            # Agent management
│   ├── conversations/     # Conversation management
│   ├── sessions/          # Session viewer
│   ├── test-suites/       # Suite management
│   └── components/        # Shared UI components
└── lib/                   # Utilities and API client
    └── api/               # Backend API client
```

### 2. Backend (`backend/`)

**Technology**: Express.js, TypeScript, SQLite (better-sqlite3)

**Responsibilities**:
- REST API for all CRUD operations
- Job queue management
- Test execution coordination
- Data persistence and migrations
- Similarity scoring orchestration

**Key Features**:
- Versioned database migrations
- Repository pattern for data access
- Service layer for business logic
- Async job queue with status tracking
- Support for both legacy and conversation-based testing

**Structure**:
```
backend/src/
├── index.ts               # Express app setup
├── config.ts              # Configuration management
├── types.ts               # TypeScript type definitions
├── routes/                # API route handlers
│   ├── agents.ts
│   ├── conversations.ts
│   ├── execute.ts
│   ├── jobs.ts
│   ├── sessions.ts
│   └── ...
├── services/              # Business logic layer
│   ├── job-queue.ts       # Job management
│   ├── agent-service.ts   # Agent communication
│   ├── scoring-service.ts # Similarity scoring
│   └── ...
├── db/                    # Database layer
│   ├── database.ts        # DB initialization
│   ├── queries.ts         # SQL queries
│   ├── repositories/      # Data access layer
│   └── migrations/        # Schema migrations
├── lib/                   # Utilities and helpers
└── utils/                 # Shared utilities
```

### 3. Agent Service API (`agent-service-api/`)

**Technology**: Express.js, TypeScript

**Responsibilities**:
- Poll backend for pending jobs
- Execute external API conversations
- Post session results back to backend
- Handle request templating and response mapping
- Token usage extraction

**Key Features**:
- Adaptive polling with exponential backoff
- Concurrent job execution (configurable limit)
- Handlebars template engine for requests
- JSONPath for response extraction
- Automatic token usage detection

**Structure**:
```
agent-service-api/src/
├── index.ts               # Express app + poller startup
├── config/                # Configuration
├── services/              # Core services
│   ├── job-poller.ts      # Job polling logic
│   ├── api-service.ts     # External API execution
│   └── conversation-script-resolver.ts
└── routes/                # Health check endpoints
```

### 4. Agent Service (Python) (`agent-service/`)

**Technology**: FastAPI, Python, CrewAI

**Status**: Currently out of date, maintained but not primary execution path

**Responsibilities**:
- Execute CrewAI agent workflows
- Support for various LLM providers
- Detailed logging of intermediate steps
- Metrics collection

**Note**: The TypeScript path (backend + agent-service-api) is the primary maintained execution path.

### 5. Shared Packages (`packages/`)

**@ibm-vibe/types**:
- Shared TypeScript type definitions
- Enums (JobStatus, etc.)
- Interfaces for all entities

**@ibm-vibe/config**:
- Environment configuration loading
- Zod schemas for validation
- Configuration for all services

**@ibm-vibe/utils**:
- Token extraction utilities
- Path traversal helpers
- Popular token format detection

## Data Flow

### Conversation Execution Flow

```
1. User creates conversation + agent configuration in Frontend
2. User clicks "Execute" → Frontend calls Backend API
3. Backend creates Job record (status: pending)
4. Backend returns job_id to Frontend
5. Frontend polls Backend for job status

Meanwhile:
6. Agent-service-api polls Backend for available jobs
7. Backend marks job as claimed/running
8. Agent-service-api fetches conversation script + agent config
9. Agent-service-api executes conversation turn-by-turn
10. Agent-service-api posts session + transcript to Backend
11. Backend persists execution_session + session_messages
12. Backend marks job as completed with session_id
13. Frontend fetches session transcript and displays results
```

### Legacy Test Execution Flow

```
1. User executes legacy test → Backend creates Job
2. Job references test_id (mapped to conversation_id)
3. Execution follows conversation flow
4. Results stored in both session and legacy result tables
```

## Integration Points

### Frontend ↔ Backend
- **Protocol**: HTTP REST API
- **Format**: JSON
- **Authentication**: Session-based (future enhancement)
- **Key Endpoints**: `/api/agents`, `/api/conversations`, `/api/execute`, `/api/sessions`

### Backend ↔ Agent Service API
- **Protocol**: HTTP API
- **Pattern**: Polling (agent-service-api pulls work)
- **Key Endpoints**: `/api/jobs/available`, `/api/jobs/:id/claim`, `/api/sessions`

### Agent Service API ↔ External AI APIs
- **Protocol**: HTTP (configurable method)
- **Format**: Template-based requests, mapped responses
- **Features**: Custom headers, authentication, retry logic

### Backend ↔ Database
- **Protocol**: SQLite (better-sqlite3)
- **Pattern**: Repository pattern with prepared statements
- **Migrations**: Versioned, sequential migrations

## Deployment Architecture

### Development
```
localhost:3000  → Frontend (Next.js dev server)
localhost:5000  → Backend (ts-node-dev)
localhost:5003  → Agent Service API (ts-node-dev)
localhost:5002  → Agent Service Python (optional)
```

### Production Considerations
- **Frontend**: Static site deployment (Vercel, Netlify) or Node.js server
- **Backend**: Node.js server with process manager (PM2)
- **Agent Service API**: Node.js server with process manager
- **Database**: SQLite file-based storage (consider backup strategy)
- **Monitoring**: Log aggregation and performance monitoring recommended

## Scalability Considerations

### Current Limitations
- SQLite is single-writer (suitable for moderate load)
- Job polling introduces latency (5-60 second intervals)
- No horizontal scaling of job execution

### Future Enhancements
- WebSocket support for real-time updates
- PostgreSQL migration for multi-writer support
- Distributed job queue (Redis, RabbitMQ)
- Kubernetes deployment for horizontal scaling

## Security Considerations

### Current State
- No authentication/authorization implemented
- API keys stored in agent settings (encrypted storage recommended)
- CORS enabled for development

### Recommended Enhancements
- User authentication and session management
- Role-based access control (RBAC)
- API key encryption at rest
- Rate limiting on API endpoints
- Input validation and sanitization (partially implemented with Zod)
