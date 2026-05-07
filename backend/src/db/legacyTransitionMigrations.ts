import type Database from 'better-sqlite3';

type LogError = (...args: unknown[]) => void;

export const runLegacyTransitionMigrations = (db: Database.Database, logError: LogError): void => {
	// Migration: create suite_entries table if missing and migrate existing entries
	const suiteEntriesInfo = db.prepare("PRAGMA table_info('suite_entries')").all() as Array<{ name: string }>;
	if (!suiteEntriesInfo.some((col) => col.name === 'id')) {
		db.exec(`
			CREATE TABLE IF NOT EXISTS suite_entries (
				id INTEGER PRIMARY KEY AUTOINCREMENT,
				parent_suite_id INTEGER NOT NULL,
				sequence INTEGER,
				test_id INTEGER,
				child_suite_id INTEGER,
				agent_id_override INTEGER,
				FOREIGN KEY (parent_suite_id) REFERENCES test_suites(id) ON DELETE CASCADE,
				FOREIGN KEY (test_id) REFERENCES tests(id) ON DELETE CASCADE,
				FOREIGN KEY (child_suite_id) REFERENCES test_suites(id) ON DELETE CASCADE
			);
		`);
		db.exec(`
			INSERT INTO suite_entries (parent_suite_id, sequence, test_id)
			SELECT suite_id, sequence, test_id FROM test_suite_tests;
		`);

		db.exec(`DROP TABLE IF EXISTS test_suite_tests;`);
		db.exec(`
			CREATE INDEX IF NOT EXISTS idx_suite_entries_parent ON suite_entries(parent_suite_id);
			CREATE INDEX IF NOT EXISTS idx_suite_entries_sequence ON suite_entries(sequence);
			CREATE INDEX IF NOT EXISTS idx_suite_entries_test ON suite_entries(test_id);
			CREATE INDEX IF NOT EXISTS idx_suite_entries_child ON suite_entries(child_suite_id);
		`);
	}

	// Migration: conversation turn targets (finalized schema pre-deploy)
	try {
		const hasTurnTargetsTable = db
			.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='conversation_turn_targets'")
			.get() as { name?: string } | undefined;
		if (!hasTurnTargetsTable) {
			db.exec(`
				CREATE TABLE IF NOT EXISTS conversation_turn_targets (
					id INTEGER PRIMARY KEY AUTOINCREMENT,
					conversation_id INTEGER NOT NULL,
					user_sequence INTEGER NOT NULL,
					target_reply TEXT NOT NULL,
					threshold INTEGER,
					weight REAL,
					created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
					updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
					UNIQUE (conversation_id, user_sequence),
					FOREIGN KEY (conversation_id, user_sequence)
						REFERENCES conversation_messages(conversation_id, sequence)
						ON DELETE CASCADE
				);
			`);
		}
	} catch (error) {
		logError('Ensure conversation_turn_targets table failed', error);
	}

	// Backfill: move generic expected outcomes into first-turn targets
	try {
		const hasConversations = db
			.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='conversations'")
			.get() as { name?: string } | undefined;
		const hasTurnTargets = db
			.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='conversation_turn_targets'")
			.get() as { name?: string } | undefined;
		const convCols = hasConversations
			? (db.prepare("PRAGMA table_info('conversations')").all() as Array<{ name: string }>)
			: [];
		const hasExpectedOutcomeCol = convCols.some((col) => col.name === 'expected_outcome');
		if (hasConversations && hasTurnTargets && hasExpectedOutcomeCol) {
			db.exec(`
				INSERT INTO conversation_turn_targets (conversation_id, user_sequence, target_reply)
				SELECT c.id, 1, c.expected_outcome
				FROM conversations c
				LEFT JOIN conversation_turn_targets t
					ON t.conversation_id = c.id AND t.user_sequence = 1
				WHERE c.expected_outcome IS NOT NULL
					AND TRIM(c.expected_outcome) <> ''
					AND t.id IS NULL;
			`);
		}
	} catch (error) {
		logError('Backfill from conversations.expected_outcome failed', error);
	}

	try {
		const hasTests = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='tests'").get() as
			| { name?: string }
			| undefined;
		const hasConversations = db
			.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='conversations'")
			.get() as { name?: string } | undefined;
		const hasTurnTargets = db
			.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='conversation_turn_targets'")
			.get() as { name?: string } | undefined;
		if (hasTests && hasConversations && hasTurnTargets) {
			db.exec(`
				INSERT INTO conversation_turn_targets (conversation_id, user_sequence, target_reply)
				SELECT c.id, 1, t.expected_output
				FROM tests t
				JOIN conversations c
					ON c.name = t.name AND c.created_at = t.created_at
				LEFT JOIN conversation_turn_targets tt
					ON tt.conversation_id = c.id AND tt.user_sequence = 1
				WHERE t.expected_output IS NOT NULL
					AND TRIM(t.expected_output) <> ''
					AND tt.id IS NULL;
			`);
		}
	} catch (error) {
		logError('Backfill from tests.expected_output failed', error);
	}
};
