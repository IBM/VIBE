import type { Migration } from './types';

const shouldLog = process.env.NODE_ENV !== 'test';
const logError = (...args: unknown[]) => {
	/* istanbul ignore next */
	if (shouldLog) console.error(...args);
};

const migration: Migration = {
	version: 7,
	name: 'Post-migration guards for partial conversation migration',
	up: (db) => {
		try {
			// 1) Ensure conversation_messages exists
			const convMsgInfo = db.prepare("PRAGMA table_info('conversation_messages')").all() as Array<{
				name: string;
			}>;
			if (!convMsgInfo.some((col) => col.name === 'id')) {
				db.exec(`
			CREATE TABLE IF NOT EXISTS conversation_messages (
				id INTEGER PRIMARY KEY AUTOINCREMENT,
				conversation_id INTEGER NOT NULL,
				sequence INTEGER NOT NULL,
				role TEXT NOT NULL CHECK (role IN ('user', 'system')),
				content TEXT NOT NULL,
				metadata TEXT,
				created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
				FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE,
				UNIQUE(conversation_id, sequence)
			);
		`);
			}

			// 2) Ensure execution_sessions exists
			const execSessInfo = db.prepare("PRAGMA table_info('execution_sessions')").all() as Array<{ name: string }>;
			if (!execSessInfo.some((col) => col.name === 'id')) {
				db.exec(`
			CREATE TABLE IF NOT EXISTS execution_sessions (
				id INTEGER PRIMARY KEY AUTOINCREMENT,
				conversation_id INTEGER NOT NULL,
				agent_id INTEGER NOT NULL,
				status TEXT NOT NULL CHECK (status IN ('pending', 'running', 'completed', 'failed')),
				started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
				completed_at TIMESTAMP,
				success BOOLEAN,
				error_message TEXT,
				metadata TEXT,
				FOREIGN KEY (conversation_id) REFERENCES conversations(id),
				FOREIGN KEY (agent_id) REFERENCES agents(id)
			);
		`);
			}

			// 3) Ensure session_messages exists
			const sessMsgInfo = db.prepare("PRAGMA table_info('session_messages')").all() as Array<{ name: string }>;
			if (!sessMsgInfo.some((col) => col.name === 'id')) {
				db.exec(`
			CREATE TABLE IF NOT EXISTS session_messages (
				id INTEGER PRIMARY KEY AUTOINCREMENT,
				session_id INTEGER NOT NULL,
				sequence INTEGER NOT NULL,
				role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system', 'tool')),
				content TEXT NOT NULL,
				timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
				metadata TEXT,
				FOREIGN KEY (session_id) REFERENCES execution_sessions(id) ON DELETE CASCADE
			);
		`);
			}

			// 4) Ensure jobs has conversation_id and session_id columns
			const jobsCols = db.prepare("PRAGMA table_info('jobs')").all() as Array<{ name: string }>;
			if (!jobsCols.some((col) => col.name === 'conversation_id')) {
				db.exec('ALTER TABLE jobs ADD COLUMN conversation_id INTEGER REFERENCES conversations(id)');
			}
			if (!jobsCols.some((col) => col.name === 'session_id')) {
				db.exec('ALTER TABLE jobs ADD COLUMN session_id INTEGER REFERENCES execution_sessions(id)');
			}

			// 5) Ensure suite_entries has conversation_id column
			const suiteEntryCols = db.prepare("PRAGMA table_info('suite_entries')").all() as Array<{ name: string }>;
			if (suiteEntryCols.length > 0 && !suiteEntryCols.some((col) => col.name === 'conversation_id')) {
				db.exec('ALTER TABLE suite_entries ADD COLUMN conversation_id INTEGER REFERENCES conversations(id)');
			}

			// 6) Idempotent backfills where legacy tables still exist
			const testsTable = db
				.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name = 'tests'")
				.get() as { name?: string } | undefined;
			const resultsTable = db
				.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name = 'results'")
				.get() as { name?: string } | undefined;

			if (suiteEntryCols.length > 0 && testsTable) {
				db.exec(`
      UPDATE suite_entries SET conversation_id = (
        SELECT c.id FROM conversations c
        JOIN tests t ON c.name = t.name AND c.created_at = t.created_at
        WHERE suite_entries.test_id = t.id
      )
      WHERE test_id IS NOT NULL AND conversation_id IS NULL;
    `);

				// After mapping, null out legacy pointer to avoid mixed references
				db.exec(`
      UPDATE suite_entries
      SET test_id = NULL
      WHERE conversation_id IS NOT NULL;
    `);
			}

			if (jobsCols.length > 0 && testsTable) {
				db.exec(`
      UPDATE jobs SET conversation_id = (
        SELECT c.id FROM conversations c
        JOIN tests t ON c.name = t.name AND c.created_at = t.created_at
        WHERE jobs.test_id = t.id
      )
      WHERE conversation_id IS NULL AND test_id IS NOT NULL;
    `);
			}

			if (jobsCols.length > 0 && resultsTable) {
				db.exec(`
			UPDATE jobs SET session_id = (
				SELECT es.id FROM execution_sessions es
				WHERE es.conversation_id = jobs.conversation_id
				AND es.agent_id = jobs.agent_id
				AND jobs.result_id IS NOT NULL
				AND EXISTS (
					SELECT 1 FROM results r
					WHERE r.id = jobs.result_id AND r.agent_id = es.agent_id
				)
			)
			WHERE session_id IS NULL;
		`);
			}
		} catch (e) {
			logError('Post-migration guard failed', e);
		}
	}
};

export default migration;
