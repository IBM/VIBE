import db from '../database';
import { TestSuite, SuiteEntry, SuiteRun, SuiteRunFilters, JobStatus } from '@ibm-vibe/types';
import { normalizeSuiteEntryInsert } from '../normalizers';

export const createTestSuite = (testSuite: TestSuite) => {
	// Ensure fields have default values if not provided
	const testSuiteWithDefaults = {
		...testSuite,
		description: testSuite.description || '',
		tags: testSuite.tags || ''
	};

	const statement = db.prepare(`
		INSERT INTO test_suites (name, description, tags)
		VALUES (@name, @description, @tags)
		RETURNING *
	`);
	return statement.get(testSuiteWithDefaults) as TestSuite;
};

export const updateTestSuite = (id: number, testSuite: Partial<TestSuite>) => {
	// Filter out undefined values to avoid SQL errors
	const filteredTestSuite = Object.fromEntries(Object.entries(testSuite).filter(([_, value]) => value !== undefined));

	// If there are no fields to update, return the existing test suite
	if (Object.keys(filteredTestSuite).length === 0) {
		return getTestSuiteById(id);
	}

	const updates = Object.keys(filteredTestSuite)
		.filter((key) => key !== 'id' && key !== 'created_at')
		.map((key) => `${key} = @${key}`)
		.join(', ');

	const statement = db.prepare(`
		UPDATE test_suites
		SET ${updates}, updated_at = CURRENT_TIMESTAMP
		WHERE id = @id
		RETURNING *
	`);

	return statement.get({ ...filteredTestSuite, id }) as TestSuite;
};

export const deleteTestSuite = (id: number) => {
	// Start a transaction to ensure all operations succeed or fail together
	const transaction = db.transaction(() => {
		// Delete associated suite runs
		const deleteSuiteRunsStmt = db.prepare('DELETE FROM suite_runs WHERE suite_id = ?');
		deleteSuiteRunsStmt.run(id);

		// TestSuiteTests will be deleted automatically due to ON DELETE CASCADE

		// Finally delete the test suite
		const deleteTestSuiteStmt = db.prepare('DELETE FROM test_suites WHERE id = ?');
		return deleteTestSuiteStmt.run(id);
	});

	return transaction();
};

export const getTestSuites = () => {
	return db.prepare('SELECT * FROM test_suites ORDER BY created_at DESC').all() as TestSuite[];
};

export const getTestSuiteById = (id: number) => {
	return db.prepare('SELECT * FROM test_suites WHERE id = ?').get(id) as TestSuite;
};

export const getTestSuitesWithCount = (
	params: { limit?: number; offset?: number } = {}
): { data: TestSuite[]; total: number } => {
	const { limit, offset } = params;
	let query = 'SELECT * FROM test_suites ORDER BY created_at DESC';
	const queryParams: any[] = [];

	if (limit !== undefined) {
		query += ' LIMIT ?';
		queryParams.push(limit);
	}

	if (offset !== undefined) {
		query += ' OFFSET ?';
		queryParams.push(offset);
	}

	const data = db.prepare(query).all(...queryParams) as TestSuite[];
	const totalResult = db.prepare('SELECT COUNT(*) as count FROM test_suites').get() as { count: number };

	return { data, total: totalResult.count };
};

export const getEntriesInSuite = (parentSuiteId: number): SuiteEntry[] => {
	const stmt = db.prepare(`
        SELECT *
        FROM suite_entries
        WHERE parent_suite_id = ?
        ORDER BY sequence
    `);
	return stmt.all(parentSuiteId) as SuiteEntry[];
};

export const addSuiteEntry = (entry: {
	parent_suite_id: number;
	sequence?: number;
	test_id?: number;
	conversation_id?: number;
	child_suite_id?: number;
	agent_id_override?: number;
}): SuiteEntry => {
	const normalizedEntry = normalizeSuiteEntryInsert(entry);
	const statement = db.prepare(`
		INSERT INTO suite_entries (
			parent_suite_id, sequence, test_id, conversation_id, child_suite_id, agent_id_override
		) VALUES (
			@parent_suite_id, @sequence, @test_id, @conversation_id, @child_suite_id, @agent_id_override
		)
		RETURNING *
	`);
	return statement.get(normalizedEntry) as SuiteEntry;
};

export const updateSuiteEntryOrder = (entryId: number, sequence?: number, agent_id_override?: number): void => {
	const fields: string[] = [];
	const params: any = { id: entryId };

	if (sequence !== undefined) {
		fields.push('sequence = @sequence');
		params.sequence = sequence;
	}
	if (agent_id_override !== undefined) {
		fields.push('agent_id_override = @agent_id_override');
		params.agent_id_override = agent_id_override;
	}
	if (fields.length === 0) return;
	const stmt = db.prepare(`
		UPDATE suite_entries
		SET ${fields.join(', ')}
		WHERE id = @id
	`);
	stmt.run(params);
};

export const deleteSuiteEntry = (entryId: number): void => {
	const stmt = db.prepare('DELETE FROM suite_entries WHERE id = ?');
	stmt.run(entryId);
};

export const reorderSuiteEntries = (parentSuiteId: number, entryOrders: { entry_id: number; sequence: number }[]) => {
	const transaction = db.transaction(() => {
		const stmt = db.prepare('UPDATE suite_entries SET sequence = ? WHERE parent_suite_id = ? AND id = ?');
		for (const order of entryOrders) {
			stmt.run(order.sequence, parentSuiteId, order.entry_id);
		}
	});
	return transaction();
};

// SuiteRun queries
export const createSuiteRun = (suiteRun: SuiteRun) => {
	const statement = db.prepare(`
		INSERT INTO suite_runs (
			suite_id, agent_id, status, progress,
			total_tests, completed_tests, successful_tests, failed_tests
		)
		VALUES (
			@suite_id, @agent_id, @status, @progress,
			@total_tests, @completed_tests, @successful_tests, @failed_tests
		)
		RETURNING *
	`);

	return statement.get(suiteRun) as SuiteRun;
};

export const updateSuiteRun = (id: number, updates: Partial<SuiteRun>) => {
	// Filter out undefined values
	const filteredUpdates = Object.fromEntries(Object.entries(updates).filter(([_, value]) => value !== undefined));

	// If there are no fields to update, return the existing suite run
	if (Object.keys(filteredUpdates).length === 0) {
		return getSuiteRunById(id);
	}

	const updateFields = Object.keys(filteredUpdates)
		.filter((key) => key !== 'id' && key !== 'started_at')
		.map((key) => `${key} = @${key}`)
		.join(', ');

	let completedField = '';
	if (updates.status === JobStatus.COMPLETED || updates.status === JobStatus.FAILED) {
		completedField = ', completed_at = CURRENT_TIMESTAMP';
	}

	const statement = db.prepare(`
		UPDATE suite_runs
		SET ${updateFields}${completedField}
		WHERE id = @id
		RETURNING *
	`);

	return statement.get({ ...filteredUpdates, id }) as SuiteRun;
};

export const getSuiteRunById = (id: number): SuiteRun | undefined => {
	return db.prepare('SELECT * FROM suite_runs WHERE id = ?').get(id) as SuiteRun;
};

export const listSuiteRuns = (filters: SuiteRunFilters & { limit?: number; offset?: number } = {}) => {
	let query = `
		SELECT
			sr.*,
			a.name as agent_name
		FROM suite_runs sr
		LEFT JOIN agents a ON sr.agent_id = a.id
		WHERE 1=1
	`;
	const params: any[] = [];

	if (filters.status) {
		query += ' AND sr.status = ?';
		params.push(filters.status);
	}

	if (filters.suite_id) {
		query += ' AND sr.suite_id = ?';
		params.push(filters.suite_id);
	}

	if (filters.agent_id) {
		query += ' AND sr.agent_id = ?';
		params.push(filters.agent_id);
	}

	if (filters.after) {
		query += ' AND sr.started_at >= ?';
		params.push(filters.after.toISOString());
	}

	if (filters.before) {
		query += ' AND sr.started_at <= ?';
		params.push(filters.before.toISOString());
	}

	query += ' ORDER BY sr.started_at DESC';

	if (filters.limit !== undefined) {
		query += ' LIMIT ?';
		params.push(filters.limit);
	}
	if (filters.offset !== undefined) {
		query += ' OFFSET ?';
		params.push(filters.offset);
	}

	return db.prepare(query).all(...params) as SuiteRun[];
};

export const listSuiteRunsWithCount = (
	filters: SuiteRunFilters & { limit?: number; offset?: number } = {}
): { data: SuiteRun[]; total: number } => {
	// First, get the total count without pagination
	let countQuery = 'SELECT COUNT(*) as count FROM suite_runs WHERE 1=1';
	const countParams: any[] = [];

	if (filters.status) {
		countQuery += ' AND status = ?';
		countParams.push(filters.status);
	}

	if (filters.suite_id) {
		countQuery += ' AND suite_id = ?';
		countParams.push(filters.suite_id);
	}

	if (filters.agent_id) {
		countQuery += ' AND agent_id = ?';
		countParams.push(filters.agent_id);
	}

	if (filters.after) {
		countQuery += ' AND started_at >= ?';
		countParams.push(filters.after.toISOString());
	}

	if (filters.before) {
		countQuery += ' AND started_at <= ?';
		countParams.push(filters.before.toISOString());
	}

	const countResult = db.prepare(countQuery).get(...countParams) as { count: number };
	const total = countResult.count;

	// Then get the actual data
	const data = listSuiteRuns(filters);

	return { data, total };
};

/**
 * Get aggregated token usage for a suite run
 */
export const getSuiteRunTokenUsage = (
	suiteRunId: number
): { total_input_tokens: number; total_output_tokens: number } => {
	// Sum tokens from execution session metadata for completed jobs in the suite run
	const sessions = db
		.prepare(
			`
		SELECT es.metadata
		FROM execution_sessions es
		WHERE es.id IN (
			SELECT j.session_id FROM jobs j
			WHERE j.suite_run_id = ? AND j.status = 'completed' AND j.session_id IS NOT NULL
		)
	`
		)
		.all(suiteRunId) as { metadata: string | null }[];

	let total_input_tokens = 0;
	let total_output_tokens = 0;

	for (const row of sessions) {
		if (!row.metadata) continue;
		try {
			const meta = JSON.parse(row.metadata);
			if (typeof meta?.input_tokens === 'number') total_input_tokens += meta.input_tokens;
			if (typeof meta?.output_tokens === 'number') total_output_tokens += meta.output_tokens;
		} catch {}
	}

	return { total_input_tokens, total_output_tokens };
};

export const deleteSuiteRun = (id: number) => {
	// Start a transaction to ensure all operations succeed or fail together
	const transaction = db.transaction(() => {
		// Delete associated jobs
		const deleteJobsStmt = db.prepare('DELETE FROM jobs WHERE suite_run_id = ?');
		deleteJobsStmt.run(id);

		// Delete the suite run
		const deleteSuiteRunStmt = db.prepare('DELETE FROM suite_runs WHERE id = ?');
		return deleteSuiteRunStmt.run(id);
	});

	return transaction();
};
