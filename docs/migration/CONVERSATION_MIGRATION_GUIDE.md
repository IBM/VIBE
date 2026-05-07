## conversation-based testing migration (high level)

### where we are coming from (legacy)

- entities
    - `tests`: single-prompt inputs with expected output fields
    - `results`: final outputs and scoring (e.g., similarity)
    - `jobs`: queue entries referencing `test_id` (numeric), status, and result linkage
- flow
    - frontend starts execution → backend enqueues job → agent-service executes a single request → backend stores `results`
- limitations
    - single-turn only, no full transcript, limited intermediate visibility

### where we are going (new paradigm)

- entities
    - `conversations`: high-level test scenarios
    - `conversation_messages`: ordered script (user/assistant/system/tool) that defines a multi-turn flow
    - `execution_sessions`: one concrete run of a conversation by a given agent
    - `session_messages`: full transcript captured during execution with timestamps and metadata
    - `jobs`: uuid ids, reference either `conversation_id` (preferred) or `test_id` (legacy during transition)
    - `suite_entries`: may refer to either `test_id` or `conversation_id`
- flow
    - frontend creates/edits conversation → execute with chosen agent → backend creates job with `conversation_id` → agent-service-api fetches conversation, executes turn-by-turn, posts a session and transcript → frontend shows live status and final transcript, plus metrics
- benefits
    - multi-turn testing, transcript-level insight, consistent storage for both interim and final outputs, better debugging

### how old and new relate

- a legacy `test` roughly corresponds to a `conversation` with a single `conversation_message` (user) and one assistant reply expected
- a legacy `result` maps to the final assistant message plus derived metrics in an `execution_session`
- `jobs` now support both, with `test_id` nullable and `conversation_id` preferred

### migration approach (data)

- schema
    - add new tables: `conversations`, `conversation_messages`, `execution_sessions`, `session_messages`
    - make `jobs.test_id` nullable; add `jobs.conversation_id` and `jobs.session_id`
    - add indexes for pagination and lookups
- data moves
    - for each legacy `test`, create a `conversation` and one `conversation_message` representing the original input
    - for each legacy `result`, create an `execution_session` and terminal `session_message` tied to that conversation
    - update `suite_entries` to reference the derived `conversation_id` where appropriate
- compatibility
    - keep legacy tables and endpoints functional during transition; new features should use conversations
    - hide legacy affordances in UI progressively while ensuring no data loss

### migration approach (apis and services)

- backend
    - expose CRUD for conversations, conversation_messages, sessions, session_messages
    - keep legacy endpoints operational until frontend no longer calls them
    - execution endpoints support both: `/api/execute` (legacy), `/api/execute/conversation` (new)
- agent-service-api
    - poll jobs; dispatch by presence of `conversation_id` vs `test_id`
    - execute conversations turn-by-turn; post session and transcript
- agent-service (python)
    - add conversation execution parity after polish; keep legacy executor for now

### frontend transition

- new pages/components
    - conversations list and detail with script builder and execute (agent selector)
    - session list and transcript viewer
    - jobs manager updated for uuid ids and conversation reruns
- progressive removal
    - replace legacy test-suite operations with suite entries referencing conversations
    - retire legacy test creation UI after equivalence is confirmed

### ensuring no functionality loss

- maintain both execution paths until conversation UI and APIs cover all needed capabilities
- verify: creation, execution, viewing results, suite runs, reruns, cancel/delete jobs
- add e2e tests that cover single-turn (legacy) and multi-turn (new) ensuring identical behavior for one-turn scenarios

### exit criteria for full cutover

- all suite operations use `suite_entries` with `conversation_id`
- frontend no longer calls legacy test-suite routes
- agent-service-api handles only `conversation_id` jobs in normal operation
- data backfills completed; no dangling references to legacy-only entities in active flows

### operational notes

- ids
    - jobs use uuid strings; conversations/tests/sessions remain numeric in sqlite
- error handling
    - keep clear status and error messages on jobs and sessions; retry transient external calls
- performance
    - paginate list endpoints; add indexes on foreign keys and timestamps

### glossary

- conversation: reusable multi-turn test definition
- session: a concrete execution of a conversation
- job: queued unit of work that produces a session (new) or a result (legacy)
