import type { Migration } from './types';

const shouldLog = process.env.NODE_ENV !== 'test';
const logError = (...args: unknown[]) => {
	/* istanbul ignore next */
	if (shouldLog) console.error(...args);
};

const migration: Migration = {
	version: 10,
	name: 'Ensure jobs.test_id is nullable',
	up: (db) => {
		try {
			const jobsColsDetailedFinal = db.prepare("PRAGMA table_info('jobs')").all() as Array<{
				name: string;
				notnull: number;
			}>;
			const testIdColFinal = jobsColsDetailedFinal.find((c) => c.name === 'test_id');
			if (testIdColFinal && Number(testIdColFinal.notnull) === 1) {
				db.transaction(() => {
					db.exec(`
        CREATE TABLE jobs_new (
          id TEXT PRIMARY KEY,
          agent_id INTEGER NOT NULL,
          test_id INTEGER,
			  status TEXT NOT NULL CHECK (status IN ('pending', 'running', 'completed', 'failed', 'cancelled', 'timeout')),
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
      `);

					// Copy data using explicit column list while validating FK targets
					db.exec(`
			INSERT INTO jobs_new (
			  id, agent_id, test_id, status, progress, partial_result, result_id,
			  error, created_at, updated_at, suite_run_id, job_type, claimed_by, claimed_at,
			  conversation_id, session_id
			)
			SELECT
			  j.id, j.agent_id, j.test_id, j.status, j.progress, j.partial_result, j.result_id,
			  j.error, j.created_at, j.updated_at,
			  CASE WHEN j.suite_run_id IS NOT NULL AND EXISTS (SELECT 1 FROM suite_runs s WHERE s.id = j.suite_run_id) THEN j.suite_run_id ELSE NULL END AS suite_run_id,
			  j.job_type, j.claimed_by, j.claimed_at,
			  CASE WHEN j.conversation_id IS NOT NULL AND EXISTS (SELECT 1 FROM conversations c WHERE c.id = j.conversation_id) THEN j.conversation_id ELSE NULL END AS conversation_id,
			  CASE WHEN j.session_id IS NOT NULL AND EXISTS (SELECT 1 FROM execution_sessions es WHERE es.id = j.session_id) THEN j.session_id ELSE NULL END AS session_id
			FROM jobs j;
			`);

					// Swap tables
					db.exec('DROP TABLE jobs;');
					db.exec('ALTER TABLE jobs_new RENAME TO jobs;');
				})();
			}
		} catch (e) {
			logError('Jobs test_id nullable guard failed', e);
		}
	}
};

export default migration;
