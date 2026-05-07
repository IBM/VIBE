import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import { dbConfig } from '../config';
import { runMigrations } from './migrations';
import { runLegacyTransitionMigrations } from './legacyTransitionMigrations';

const shouldLog = process.env.NODE_ENV !== 'test';
const logError = (...args: unknown[]) => {
	/* istanbul ignore next */
	if (shouldLog) console.error(...args);
};

// Database setup
// Read database path from configuration (env: DB_PATH). If the configured path
// is relative, resolve it against the process working directory so that
// development (ts-node-dev) and production (node dist) behave consistently.
// Special case: :memory: is a SQLite in-memory database identifier and should not be resolved as a file path.
const configuredDbPath = dbConfig.path;
const resolvedDbPath = configuredDbPath.startsWith(':memory:')
	? configuredDbPath
	: path.isAbsolute(configuredDbPath)
		? configuredDbPath
		: path.resolve(process.cwd(), configuredDbPath);

if (!resolvedDbPath.startsWith(':memory:')) {
	const dbDirectory = path.dirname(resolvedDbPath);
	if (dbDirectory && dbDirectory !== '.') {
		fs.mkdirSync(dbDirectory, { recursive: true });
	}
}

const db: Database.Database = new Database(resolvedDbPath);

// Enable foreign keys
db.pragma('foreign_keys = ON');

// Run versioned migrations (schema + incremental changes)
runMigrations(db);

runLegacyTransitionMigrations(db, logError);

function dropLegacyTablesIfSafe() {
	try {
		// Check if legacy tables still exist
		const legacyTables = db
			.prepare(
				`
      SELECT name FROM sqlite_master
      WHERE type='table' AND name IN ('tests', 'results')
    `
			)
			.all() as { name: string }[];

		if (legacyTables.length === 0) {
			return;
		}

		// Check that no jobs depend exclusively on legacy fields
		const legacyJobsResult = db
			.prepare(
				`
      SELECT COUNT(*) as count
      FROM jobs
      WHERE test_id IS NOT NULL AND conversation_id IS NULL
    `
			)
			.get() as { count: number };

		if (legacyJobsResult.count > 0) {
			return;
		}

		// Check and fix suite entries that depend exclusively on legacy fields
		const legacySuiteEntriesResult = db
			.prepare(
				`
      SELECT COUNT(*) as count
      FROM suite_entries
      WHERE test_id IS NOT NULL AND conversation_id IS NULL
    `
			)
			.get() as { count: number };

		if (legacySuiteEntriesResult.count > 0) {
			// Since the original tests table is gone, we need to map test_id to conversation_id
			// The safest approach is to assume test_id == conversation_id for the migration
			// and remove entries where no corresponding conversation exists

			// First, update suite entries where a conversation with matching ID exists
			db.exec(`
        UPDATE suite_entries
        SET conversation_id = test_id, test_id = NULL
        WHERE test_id IS NOT NULL
        AND conversation_id IS NULL
        AND EXISTS (SELECT 1 FROM conversations WHERE id = suite_entries.test_id)
      `);

			db.exec(`
        DELETE FROM suite_entries
        WHERE test_id IS NOT NULL
        AND conversation_id IS NULL
      `);

			// Double-check that all suite entries are now migrated
			const remainingLegacyEntries = db
				.prepare(
					`
        SELECT COUNT(*) as count
        FROM suite_entries
        WHERE test_id IS NOT NULL AND conversation_id IS NULL
      `
				)
				.get() as { count: number };

			if (remainingLegacyEntries.count > 0) {
				return;
			}
		}

		// Create backup first
		db.exec(`
      ATTACH DATABASE 'data/agent-testing.db.before-drop-legacy' AS backup;
      CREATE TABLE IF NOT EXISTS backup.tests AS SELECT * FROM tests;
      CREATE TABLE IF NOT EXISTS backup.results AS SELECT * FROM results;
      DETACH DATABASE backup;
    `);

		// Recreate affected tables without legacy foreign key constraints
		// Get current record counts for validation
		const preCounts = {
			jobs: (db.prepare('SELECT COUNT(*) as count FROM jobs').get() as { count: number }).count,
			suite_entries: (db.prepare('SELECT COUNT(*) as count FROM suite_entries').get() as { count: number }).count
		};

		db.transaction(() => {
			// Recreate jobs table without FK constraints to legacy tables
			db.exec(`
        CREATE TABLE jobs_new (
          id TEXT PRIMARY KEY,
          agent_id INTEGER NOT NULL,
          test_id INTEGER,
          status TEXT NOT NULL CHECK (status IN ('pending', 'running', 'completed', 'failed', 'cancelled')),
          progress INTEGER DEFAULT 0,
          partial_result TEXT,
          result_id INTEGER,
          error TEXT,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          suite_run_id INTEGER,
          job_type TEXT DEFAULT 'crewai',
          claimed_by TEXT,
          claimed_at DATETIME,
          conversation_id INTEGER,
          session_id INTEGER,
          FOREIGN KEY (agent_id) REFERENCES agents(id),
          FOREIGN KEY (conversation_id) REFERENCES conversations(id),
          FOREIGN KEY (session_id) REFERENCES execution_sessions(id),
          FOREIGN KEY (suite_run_id) REFERENCES suite_runs(id)
        );

        INSERT INTO jobs_new SELECT * FROM jobs;
        DROP TABLE jobs;
        ALTER TABLE jobs_new RENAME TO jobs;
      `);

			// Recreate suite_entries table without FK constraint to tests
			db.exec(`
        CREATE TABLE suite_entries_new (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          parent_suite_id INTEGER NOT NULL,
          sequence INTEGER,
          test_id INTEGER,
          conversation_id INTEGER,
          child_suite_id INTEGER,
          agent_id_override INTEGER,
          FOREIGN KEY (parent_suite_id) REFERENCES test_suites(id) ON DELETE CASCADE,
          FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE,
          FOREIGN KEY (child_suite_id) REFERENCES test_suites(id) ON DELETE CASCADE
        );

        INSERT INTO suite_entries_new SELECT * FROM suite_entries;
        DROP TABLE suite_entries;
        ALTER TABLE suite_entries_new RENAME TO suite_entries;
      `);

			// Now drop the legacy tables
			db.exec(`
        DROP TABLE results;
        DROP TABLE tests;
      `);
		})();

		// Validate the migration
		const postCounts = {
			jobs: (db.prepare('SELECT COUNT(*) as count FROM jobs').get() as { count: number }).count,
			suite_entries: (db.prepare('SELECT COUNT(*) as count FROM suite_entries').get() as { count: number }).count
		};

		if (postCounts.jobs !== preCounts.jobs || postCounts.suite_entries !== preCounts.suite_entries) {
			throw new Error('Record counts changed during migration');
		}
	} catch (error) {
		logError('Drop legacy tables migration failed', error);
	}
}

// Create indexes for better performance (only for tables that will remain)
db.exec(`
  CREATE INDEX IF NOT EXISTS idx_agents_name_version ON agents(name, version);
  CREATE INDEX IF NOT EXISTS idx_jobs_status ON jobs(status);
  CREATE INDEX IF NOT EXISTS idx_jobs_suite_run ON jobs(suite_run_id);
  CREATE INDEX IF NOT EXISTS idx_jobs_job_type ON jobs(job_type);
  CREATE INDEX IF NOT EXISTS idx_jobs_status_type ON jobs(status, job_type);
  CREATE INDEX IF NOT EXISTS idx_suite_runs_suite ON suite_runs(suite_id);
  CREATE INDEX IF NOT EXISTS idx_suite_runs_agent ON suite_runs(agent_id);
  CREATE INDEX IF NOT EXISTS idx_suite_runs_status ON suite_runs(status);
  CREATE INDEX IF NOT EXISTS idx_llm_configs_priority ON llm_configs(priority);
  CREATE INDEX IF NOT EXISTS idx_llm_configs_provider ON llm_configs(provider);
  CREATE INDEX IF NOT EXISTS idx_jobs_created_at ON jobs(created_at);
  CREATE INDEX IF NOT EXISTS idx_suite_runs_status_suite ON suite_runs(status, suite_id);

  -- New conversation indexes
  CREATE INDEX IF NOT EXISTS idx_conversations_name ON conversations(name);
  CREATE INDEX IF NOT EXISTS idx_conversations_created_at ON conversations(created_at);
  CREATE INDEX IF NOT EXISTS idx_conversation_messages_conversation ON conversation_messages(conversation_id);
  CREATE INDEX IF NOT EXISTS idx_conversation_messages_sequence ON conversation_messages(conversation_id, sequence);
  CREATE INDEX IF NOT EXISTS idx_execution_sessions_conversation ON execution_sessions(conversation_id);
  CREATE INDEX IF NOT EXISTS idx_execution_sessions_agent ON execution_sessions(agent_id);
  CREATE INDEX IF NOT EXISTS idx_execution_sessions_status ON execution_sessions(status);
  CREATE INDEX IF NOT EXISTS idx_session_messages_session ON session_messages(session_id);
  CREATE INDEX IF NOT EXISTS idx_session_messages_sequence ON session_messages(session_id, sequence);
  CREATE INDEX IF NOT EXISTS idx_jobs_conversation ON jobs(conversation_id);
  CREATE INDEX IF NOT EXISTS idx_jobs_session ON jobs(session_id);
`);

// Minimal guard: ensure suite_entries.conversation_id exists, then create its index
try {
	const suiteEntriesColsForIndex = db.prepare("PRAGMA table_info('suite_entries')").all() as Array<{ name: string }>;
	if (
		suiteEntriesColsForIndex.length > 0 &&
		!suiteEntriesColsForIndex.some((col) => col.name === 'conversation_id')
	) {
		// Try to add the column if it's missing (idempotent)
		db.exec('ALTER TABLE suite_entries ADD COLUMN conversation_id INTEGER REFERENCES conversations(id)');
	}
	const suiteEntriesColsAfter = db.prepare("PRAGMA table_info('suite_entries')").all() as Array<{ name: string }>;
	if (suiteEntriesColsAfter.some((col) => col.name === 'conversation_id')) {
		db.exec('CREATE INDEX IF NOT EXISTS idx_suite_entries_conversation ON suite_entries(conversation_id)');
	}
} catch (e) {
	logError('Minimal guard for suite_entries index failed', e);
}

// Check if we can safely drop legacy tables on every startup
dropLegacyTablesIfSafe();

// Export cleanup function for tests
export function closeDatabase(): void {
	try {
		db.close();
	} catch (error) {
		logError('Error closing database:', error);
	}
}

export default db;
