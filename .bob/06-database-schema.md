# Database Schema

## Overview

The system uses SQLite for data persistence with the better-sqlite3 driver. The schema supports both legacy single-turn tests and modern multi-turn conversations.

This document is an orientation guide, not a generated schema dump. For exact DDL, read [`backend/src/db/migrations/`](../backend/src/db/migrations/), [`backend/src/db/legacyTransitionMigrations.ts`](../backend/src/db/legacyTransitionMigrations.ts), and startup guards in [`backend/src/db/database.ts`](../backend/src/db/database.ts).

**Database File**: Configured via `DB_PATH` environment variable (default: `./data/agent-testing.db`)

## Migration System

Migrations are versioned and sequential, tracked in the `migrations` table.

**Location**: [`backend/src/db/migrations/`](../backend/src/db/migrations/)

Additional legacy transition guards run during database initialization. They create/repair bridge tables such as `suite_entries` and `conversation_turn_targets`, backfill legacy expected outputs into turn targets, and may drop old legacy tables when startup checks decide it is safe.

**Migration Structure**:
```typescript
interface Migration {
  version: number;
  name: string;
  up: (db: Database) => void;
}
```

**Current Migrations**:
1. `001_initial_schema.ts` - Base tables (agents, tests, results, jobs, suites)
2. `002_add_suite_run_id_to_jobs.ts` - Suite run tracking
3. `003_add_token_usage_to_suite_runs.ts` - Token metrics
4. `004_add_job_polling_columns.ts` - Job claiming support
5. `005_add_similarity_columns_to_results.ts` - Similarity scoring
6. `006_create_conversation_tables_and_migrate.ts` - Conversation system
7. `007_post_migration_guards.ts` - Data integrity checks
8. `008_add_scoring_columns_to_session_messages.ts` - Per-turn scoring
9. `009_backfill_similarity_to_session_messages.ts` - Score migration
10. `010_make_jobs_test_id_nullable.ts` - Support conversation-only jobs
11. `011_ensure_suite_entries_cascade.ts` - Cascade deletes
12. `012_drop_conversations_expected_outcome.ts` - Remove unused column
13. `013_agent_templates_and_response_maps.ts` - Communication configs
14. `014_global_template_library.ts` - Global templates/maps
15. `015_migrate_legacy_templates_to_global.ts` - Template migration
16. `016_backfill_conversation_template_ids.ts` - Link conversations to templates

## Core Tables

### agents
Stores agent configurations and versions.

```sql
CREATE TABLE agents (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  version TEXT NOT NULL,
  prompt TEXT NOT NULL,
  settings TEXT NOT NULL,  -- JSON: agent configuration
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(name, version)
);
```

**Settings JSON Structure**:
```typescript
{
  type: 'crewai' | 'external_api',
  // For CrewAI:
  role?: string,
  goal?: string,
  backstory?: string,
  llm_config?: object,
  // For External API:
  api_endpoint?: string,
  http_method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE',
  headers?: object,
  token_mapping?: object,
  success_criteria?: object
}
```

### conversations
Multi-turn test definitions.

```sql
CREATE TABLE conversations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  description TEXT,
  tags TEXT,  -- JSON array
  default_request_template_id INTEGER,
  default_response_map_id INTEGER,
  variables TEXT,  -- JSON object
  required_request_template_capabilities TEXT,
  required_response_map_capabilities TEXT,
  stop_on_failure BOOLEAN DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

The template, capability, variables, and `stop_on_failure` columns are added after the initial conversation migration.

### conversation_messages
Ordered messages within a conversation.

```sql
CREATE TABLE conversation_messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  conversation_id INTEGER NOT NULL,
  sequence INTEGER NOT NULL,
  role TEXT NOT NULL CHECK(role IN ('user', 'system')),
  content TEXT NOT NULL,
  metadata TEXT,  -- JSON
  request_template_id INTEGER,
  response_map_id INTEGER,
  set_variables TEXT,  -- JSON: variable assignments
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE,
  -- request_template_id, response_map_id, and set_variables are added by later migrations
  UNIQUE(conversation_id, sequence)
);
```

### conversation_turn_targets
Expected outcomes for specific conversation turns.

```sql
CREATE TABLE conversation_turn_targets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  conversation_id INTEGER NOT NULL,
  user_sequence INTEGER NOT NULL,  -- matches conversation_messages.sequence
  target_reply TEXT NOT NULL,
  threshold INTEGER,  -- 0-100; app code defaults to 70 when missing
  weight REAL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (conversation_id, user_sequence)
    REFERENCES conversation_messages(conversation_id, sequence)
    ON DELETE CASCADE,
  UNIQUE(conversation_id, user_sequence)
);
```

### execution_sessions
Concrete runs of conversations by agents.

```sql
CREATE TABLE execution_sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  conversation_id INTEGER NOT NULL,
  agent_id INTEGER NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('pending', 'running', 'completed', 'failed')),
  started_at DATETIME,
  completed_at DATETIME,
  success BOOLEAN,
  error_message TEXT,
  metadata TEXT,  -- JSON: metrics, similarity scores, token usage
  variables TEXT,  -- JSON: resolved variables snapshot, added by later migration
  FOREIGN KEY (conversation_id) REFERENCES conversations(id),
  FOREIGN KEY (agent_id) REFERENCES agents(id)
);
```

### session_messages
Full execution transcript with per-turn scoring.

```sql
CREATE TABLE session_messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id INTEGER NOT NULL,
  sequence INTEGER NOT NULL,
  role TEXT NOT NULL CHECK(role IN ('user', 'assistant', 'system', 'tool')),
  content TEXT NOT NULL,
  timestamp DATETIME,
  metadata TEXT,  -- JSON: timing, tokens, confidence
  -- Per-turn similarity scoring:
  similarity_score REAL,  -- 0-100
  similarity_scoring_status TEXT CHECK(similarity_scoring_status IN ('pending', 'running', 'completed', 'failed')),
  similarity_scoring_error TEXT,
  similarity_scoring_metadata TEXT,  -- JSON
  FOREIGN KEY (session_id) REFERENCES execution_sessions(id) ON DELETE CASCADE
);
```

### jobs
Work queue for asynchronous execution.

```sql
CREATE TABLE jobs (
  id TEXT PRIMARY KEY,  -- UUID
  agent_id INTEGER NOT NULL,
  test_id INTEGER,  -- Legacy, nullable
  conversation_id INTEGER,  -- Preferred
  status TEXT NOT NULL,  -- JobStatus: pending/running/completed/failed/timeout
  progress INTEGER DEFAULT 0,  -- 0-100
  partial_result TEXT,
  result_id INTEGER,  -- Legacy result reference
  session_id INTEGER,  -- Session reference
  error TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  suite_run_id INTEGER,
  job_type TEXT,  -- 'crewai' or 'external_api'
  claimed_by TEXT,  -- Service identifier
  claimed_at DATETIME,
  FOREIGN KEY (agent_id) REFERENCES agents(id),
  -- legacy test/result FKs can be removed by startup transition guards
  FOREIGN KEY (conversation_id) REFERENCES conversations(id),
  FOREIGN KEY (result_id) REFERENCES results(id),
  FOREIGN KEY (session_id) REFERENCES execution_sessions(id),
  FOREIGN KEY (suite_run_id) REFERENCES suite_runs(id)
);
```

### test_suites
Collections of tests/conversations for batch execution.

```sql
CREATE TABLE test_suites (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  description TEXT,
  tags TEXT,  -- Comma-separated
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

### suite_entries
Entries in a suite (tests, conversations, or nested suites).

```sql
CREATE TABLE suite_entries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  parent_suite_id INTEGER NOT NULL,
  sequence INTEGER,
  test_id INTEGER,  -- Legacy
  conversation_id INTEGER,  -- Preferred
  child_suite_id INTEGER,  -- For nested suites
  agent_id_override INTEGER,  -- Override agent for this entry
  FOREIGN KEY (parent_suite_id) REFERENCES test_suites(id) ON DELETE CASCADE,
  FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE,
  FOREIGN KEY (child_suite_id) REFERENCES test_suites(id) ON DELETE CASCADE
);
```

`test_id` and `agent_id_override` are still used by application code, but the final transition table intentionally avoids legacy test and agent foreign-key constraints.

### suite_runs
Execution tracking for suite runs.

```sql
CREATE TABLE suite_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  suite_id INTEGER NOT NULL,
  agent_id INTEGER NOT NULL,
  -- agent_name is returned by repository joins, not stored in the table
  status TEXT NOT NULL CHECK(status IN ('pending', 'running', 'completed', 'failed', 'timeout')),
  progress INTEGER DEFAULT 0,
  total_tests INTEGER NOT NULL,
  completed_tests INTEGER DEFAULT 0,
  successful_tests INTEGER DEFAULT 0,
  failed_tests INTEGER DEFAULT 0,
  average_execution_time REAL,
  total_execution_time REAL,
  -- avg_similarity_score is computed for API responses
  total_input_tokens INTEGER,
  total_output_tokens INTEGER,
  started_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  completed_at DATETIME,
  FOREIGN KEY (suite_id) REFERENCES test_suites(id),
  FOREIGN KEY (agent_id) REFERENCES agents(id)
);
```

## Communication Configuration Tables

### request_templates
Global request templates for external API agents.

```sql
CREATE TABLE request_templates (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  description TEXT,
  capability TEXT,  -- JSON: {"name": "openai-chat"}
  body TEXT NOT NULL,  -- Handlebars template
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

### response_maps
Global response mapping configurations.

```sql
CREATE TABLE response_maps (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  description TEXT,
  capability TEXT,  -- JSON: {"name": "openai-chat"}
  spec TEXT NOT NULL,  -- JSON: response parsing spec
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

### agent_template_links
Links agents to request templates.

```sql
CREATE TABLE agent_template_links (
  agent_id INTEGER NOT NULL,
  template_id INTEGER NOT NULL,
  is_default BOOLEAN DEFAULT 0,
  linked_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (agent_id, template_id),
  FOREIGN KEY (agent_id) REFERENCES agents(id) ON DELETE CASCADE,
  FOREIGN KEY (template_id) REFERENCES request_templates(id) ON DELETE CASCADE
);
```

### agent_response_map_links
Links agents to response maps.

```sql
CREATE TABLE agent_response_map_links (
  agent_id INTEGER NOT NULL,
  response_map_id INTEGER NOT NULL,
  is_default BOOLEAN DEFAULT 0,
  linked_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (agent_id, response_map_id),
  FOREIGN KEY (agent_id) REFERENCES agents(id) ON DELETE CASCADE,
  FOREIGN KEY (response_map_id) REFERENCES response_maps(id) ON DELETE CASCADE
);
```

Default template/map links are guarded by partial unique indexes on `agent_id WHERE is_default = 1`.

## Legacy Tables (Migration Phase)

### tests
Legacy single-turn tests.

```sql
CREATE TABLE tests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  description TEXT,
  input TEXT NOT NULL,
  expected_output TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

**Migration Status**: Being phased out in favor of single-message conversations.

### results
Legacy test results.

```sql
CREATE TABLE results (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  agent_id INTEGER NOT NULL,
  test_id INTEGER NOT NULL,
  output TEXT NOT NULL,
  intermediate_steps TEXT,  -- JSON
  success BOOLEAN NOT NULL,
  execution_time INTEGER,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  similarity_score REAL,
  similarity_scoring_status TEXT,
  similarity_scoring_error TEXT,
  similarity_scoring_metadata TEXT,
  input_tokens INTEGER,
  output_tokens INTEGER,
  token_mapping_metadata TEXT,
  FOREIGN KEY (agent_id) REFERENCES agents(id),
  FOREIGN KEY (test_id) REFERENCES tests(id)
);
```

**Migration Status**: Supported for backward compatibility where legacy tables still exist. New executions create sessions, and startup guards may remove legacy table constraints/tables after migration checks pass.

### Legacy Agent-Scoped Templates (Deprecated)

```sql
CREATE TABLE agent_request_templates (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  agent_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  engine TEXT,
  content_type TEXT,
  body TEXT NOT NULL,
  tags TEXT,
  is_default BOOLEAN DEFAULT 0,
  capabilities TEXT,  -- JSON
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (agent_id) REFERENCES agents(id) ON DELETE CASCADE
);

CREATE TABLE agent_response_maps (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  agent_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  spec TEXT NOT NULL,
  tags TEXT,
  is_default BOOLEAN DEFAULT 0,
  capabilities TEXT,  -- JSON
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (agent_id) REFERENCES agents(id) ON DELETE CASCADE
);
```

**Migration Status**: Migrated to global templates with agent links.

## LLM Configuration

### llm_configs
LLM provider configurations for scoring.

```sql
CREATE TABLE llm_configs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  provider TEXT NOT NULL,  -- 'openai', 'anthropic', 'ollama', 'watsonx'
  config TEXT NOT NULL,  -- JSON: provider-specific config
  priority INTEGER NOT NULL DEFAULT 100,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

## Indexes

Key indexes for performance:

```sql
CREATE INDEX idx_jobs_status ON jobs(status);
CREATE INDEX idx_jobs_status_type ON jobs(status, job_type);
CREATE INDEX idx_jobs_conversation ON jobs(conversation_id);
CREATE INDEX idx_jobs_session ON jobs(session_id);
CREATE INDEX idx_jobs_suite_run ON jobs(suite_run_id);
CREATE INDEX idx_session_messages_session ON session_messages(session_id);
CREATE INDEX idx_execution_sessions_conversation ON execution_sessions(conversation_id);
CREATE INDEX idx_execution_sessions_agent ON execution_sessions(agent_id);
CREATE INDEX idx_suite_entries_conversation ON suite_entries(conversation_id);
```

## Data Relationships

```
agents ──┬─→ execution_sessions ──→ session_messages
         ├─→ jobs
         ├─→ suite_runs
         ├─→ agent_template_links ──→ request_templates
         └─→ agent_response_map_links ──→ response_maps

conversations ──┬─→ conversation_messages
                ├─→ conversation_turn_targets
                ├─→ execution_sessions
                └─→ jobs

test_suites ──┬─→ suite_entries ──┬─→ conversations
              └─→ suite_runs       ├─→ tests (legacy)
                                   └─→ test_suites (nested)

jobs ──┬─→ execution_sessions (via session_id)
       ├─→ results (via result_id, legacy)
       └─→ suite_runs (via suite_run_id)
```

## Migration Path

**Current State**: Dual system support
- Legacy: `tests` → `results`
- Modern: `conversations` → `execution_sessions` → `session_messages`

**Transition Strategy**:
1. New features use conversation system
2. Legacy endpoints map to conversations internally
3. Both result types accessible via unified API
4. Legacy tables will be dropped when migration complete

**Checking Migration Status**:
```sql
-- Check for remaining legacy-only jobs
SELECT COUNT(*) FROM jobs 
WHERE test_id IS NOT NULL AND conversation_id IS NULL;

-- Check for remaining legacy-only suite entries
SELECT COUNT(*) FROM suite_entries 
WHERE test_id IS NOT NULL AND conversation_id IS NULL;
