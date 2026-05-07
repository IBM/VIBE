import type { Migration } from './types';

const migration: Migration = {
	version: 6,
	name: 'Create conversation tables and migrate legacy data',
	up: (db) => {
		const conversationTablesInfo = db.prepare("PRAGMA table_info('conversations')").all() as Array<{
			name: string;
		}>;
		if (conversationTablesInfo.some((col) => col.name === 'id')) {
			return;
		}

		db.exec(`
    CREATE TABLE conversations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      description TEXT,
      tags TEXT, -- JSON array for flexible categorization
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE conversation_messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      conversation_id INTEGER NOT NULL,
      sequence INTEGER NOT NULL,
      role TEXT NOT NULL CHECK (role IN ('user', 'system')),
      content TEXT NOT NULL,
      metadata TEXT, -- JSON for message-specific config
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE,
      UNIQUE(conversation_id, sequence)
    );

    CREATE TABLE execution_sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      conversation_id INTEGER NOT NULL,
      agent_id INTEGER NOT NULL,
      status TEXT NOT NULL CHECK (status IN ('pending', 'running', 'completed', 'failed')),
      started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      completed_at TIMESTAMP,
      success BOOLEAN,
      error_message TEXT,
      metadata TEXT, -- JSON for session-level metrics (similarity scores, token usage, etc)
      FOREIGN KEY (conversation_id) REFERENCES conversations(id),
      FOREIGN KEY (agent_id) REFERENCES agents(id)
    );

    CREATE TABLE session_messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id INTEGER NOT NULL,
      sequence INTEGER NOT NULL,
      role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system', 'tool')),
      content TEXT NOT NULL,
      timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      metadata TEXT, -- JSON for timing, tokens, confidence, etc.
      FOREIGN KEY (session_id) REFERENCES execution_sessions(id) ON DELETE CASCADE
    );
  `);

		// 1. Migrate tests -> conversations (without test_suite_id)
		db.exec(`
    INSERT INTO conversations (name, description, tags, created_at, updated_at)
    SELECT name, description, '[]', created_at, updated_at FROM tests;
  `);

		// 1b. For each migrated test, insert a single user message so conversations are single-turn
		// Only insert when the conversation has no messages yet
		db.exec(`
    INSERT INTO conversation_messages (conversation_id, sequence, role, content, created_at)
    SELECT c.id, 1, 'user', t.input, COALESCE(t.created_at, CURRENT_TIMESTAMP)
    FROM tests t
    JOIN conversations c
      ON c.name = t.name AND c.created_at = t.created_at
    WHERE NOT EXISTS (
      SELECT 1 FROM conversation_messages m WHERE m.conversation_id = c.id
    );
  `);

		// 2. Migrate test inputs -> conversation_messages
		db.exec(`
		INSERT INTO conversation_messages (conversation_id, sequence, role, content, created_at)
		SELECT c.id, 1, 'user', t.input, t.created_at
		FROM conversations c
		JOIN tests t ON c.name = t.name AND c.created_at = t.created_at
		WHERE NOT EXISTS (
			SELECT 1 FROM conversation_messages m WHERE m.conversation_id = c.id AND m.sequence = 1
		);
	`);

		// 3. Migrate results -> execution_sessions
		db.exec(`
    INSERT INTO execution_sessions (
      conversation_id, agent_id, status, started_at, completed_at,
      success, metadata
    )
    SELECT
      c.id,
      r.agent_id,
      'completed',
      r.created_at,
      CASE
        WHEN r.execution_time IS NOT NULL AND r.execution_time > 0 THEN
          datetime(r.created_at, '+' ||
            CASE
              WHEN r.execution_time > 1000 THEN r.execution_time / 1000.0
              ELSE r.execution_time
            END || ' seconds')
        ELSE r.created_at
      END,
      r.success,
      JSON_OBJECT(
        'similarity_score', r.similarity_score,
        'similarity_scoring_status', r.similarity_scoring_status,
        'similarity_scoring_error', r.similarity_scoring_error,
        'similarity_scoring_metadata', r.similarity_scoring_metadata,
        'input_tokens', r.input_tokens,
        'output_tokens', r.output_tokens,
        'token_mapping_metadata', r.token_mapping_metadata,
        'intermediate_steps', r.intermediate_steps
      )
    FROM results r
    JOIN tests t ON r.test_id = t.id
    JOIN conversations c ON c.name = t.name AND c.created_at = t.created_at;
  `);

		// 4. Migrate result outputs -> session_messages (user input + agent output)
		db.exec(`
    INSERT INTO session_messages (session_id, sequence, role, content, timestamp, metadata)
    SELECT
      es.id,
      1,
      'user',
      cm.content,
      es.started_at,
      '{}'
    FROM execution_sessions es
    JOIN conversations c ON es.conversation_id = c.id
    JOIN conversation_messages cm ON cm.conversation_id = c.id AND cm.sequence = 1

    UNION ALL

    SELECT
      es.id,
      2,
      'assistant',
      r.output,
      es.completed_at,
      JSON_OBJECT(
        'execution_time_ms', r.execution_time,
        'input_tokens', r.input_tokens,
        'output_tokens', r.output_tokens
      )
    FROM execution_sessions es
    JOIN conversations c ON es.conversation_id = c.id
    JOIN tests t ON c.name = t.name AND c.created_at = t.created_at
    JOIN results r ON r.test_id = t.id AND r.agent_id = es.agent_id AND r.created_at = es.started_at;
  `);

		// 5. Add conversation_id and session_id columns to jobs table
		db.exec(`
    ALTER TABLE jobs ADD COLUMN conversation_id INTEGER REFERENCES conversations(id);
    ALTER TABLE jobs ADD COLUMN session_id INTEGER REFERENCES execution_sessions(id);
  `);

		// 6. Update jobs to reference conversations and sessions instead of tests and results
		db.exec(`
    UPDATE jobs SET conversation_id = (
      SELECT c.id FROM conversations c
      JOIN tests t ON c.name = t.name AND c.created_at = t.created_at
      WHERE jobs.test_id = t.id
    );

    UPDATE jobs SET session_id = (
      SELECT es.id FROM execution_sessions es
      WHERE es.conversation_id = jobs.conversation_id
      AND es.agent_id = jobs.agent_id
      AND jobs.result_id IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM results r
        WHERE r.id = jobs.result_id
        AND r.agent_id = es.agent_id
      )
    );
  `);

		// 7. Add conversation_id column to suite_entries if the table exists
		const suiteEntriesTable = db
			.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='suite_entries'")
			.get() as { name?: string } | undefined;
		if (suiteEntriesTable) {
			const suiteEntriesColumns = db.prepare("PRAGMA table_info('suite_entries')").all() as Array<{
				name: string;
			}>;
			if (!suiteEntriesColumns.some((col) => col.name === 'conversation_id')) {
				db.exec('ALTER TABLE suite_entries ADD COLUMN conversation_id INTEGER REFERENCES conversations(id);');
			}
		}

		// 8. Update suite structure (only for existing suite tables)
		const testSuitesTable = db
			.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='test_suites'")
			.get() as { name?: string } | undefined;
		if (testSuitesTable) {
			db.exec(
				"UPDATE test_suites SET description = COALESCE(description, '') || ' [Migrated to conversation testing]';"
			);
		}

		if (suiteEntriesTable) {
			db.exec(`
      UPDATE suite_entries SET conversation_id = (
        SELECT c.id FROM conversations c
        JOIN tests t ON c.name = t.name AND c.created_at = t.created_at
        WHERE suite_entries.test_id = t.id
      ) WHERE test_id IS NOT NULL;
    `);
		}
	}
};

export default migration;
