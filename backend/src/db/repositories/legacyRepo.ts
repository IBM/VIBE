import db from '../database';
import { Test, TestResult } from '@ibm-vibe/types';

const shouldLog = process.env.NODE_ENV !== 'test';
const logWarn = (...args: unknown[]) => {
	/* istanbul ignore next */
	if (shouldLog) console.warn(...args);
};
const logError = (...args: unknown[]) => {
	/* istanbul ignore next */
	if (shouldLog) console.error(...args);
};

// Test queries
export const createTest = (test: Test) => {
	// Ensure description has a default value if not provided
	const testWithDefaults = {
		...test,
		description: test.description || '', // Default to empty string if not provided
		expected_output: test.expected_output || '' // Default to empty string if not provided
	};

	const statement = db.prepare(`
		INSERT INTO tests (name, description, input, expected_output)
		VALUES (@name, @description, @input, @expected_output)
		RETURNING *
	`);
	return statement.get(testWithDefaults) as Test;
};

export const updateTest = (id: number, test: Partial<Test>) => {
	// Filter out undefined values to avoid SQL errors
	const filteredTest = Object.fromEntries(Object.entries(test).filter(([_, value]) => value !== undefined));

	// If there are no fields to update, return the existing test
	if (Object.keys(filteredTest).length === 0) {
		return getTestById(id);
	}

	const updates = Object.keys(filteredTest)
		.filter((key) => key !== 'id')
		.map((key) => `${key} = @${key}`)
		.join(', ');

	const statement = db.prepare(`
		UPDATE tests
		SET ${updates}, updated_at = CURRENT_TIMESTAMP
		WHERE id = @id
		RETURNING *
	`);

	return statement.get({ ...filteredTest, id }) as Test;
};

export const deleteTest = (id: number) => {
	// Start a transaction to ensure all operations succeed or fail together
	const transaction = db.transaction(() => {
		// Delete associated jobs first (due to foreign key to results)
		const deleteJobsStmt = db.prepare('DELETE FROM jobs WHERE test_id = ?');
		deleteJobsStmt.run(id);

		// Delete associated results
		const deleteResultsStmt = db.prepare('DELETE FROM results WHERE test_id = ?');
		deleteResultsStmt.run(id);

		// Delete any suite entries that reference this legacy test
		const deleteSuiteEntriesStmt = db.prepare('DELETE FROM suite_entries WHERE test_id = ?');
		deleteSuiteEntriesStmt.run(id);

		// Finally delete the test
		const deleteTestStmt = db.prepare('DELETE FROM tests WHERE id = ?');
		return deleteTestStmt.run(id);
	});

	return transaction();
};

export const getTests = () => {
	return db.prepare('SELECT * FROM tests ORDER BY created_at DESC').all() as Test[];
};

export const getTestById = (id: number) => {
	return db.prepare('SELECT * FROM tests WHERE id = ?').get(id) as Test;
};

export const getTestsWithCount = (
	params: { limit?: number; offset?: number } = {}
): { data: Test[]; total: number } => {
	const { limit, offset } = params;
	let query = 'SELECT * FROM tests ORDER BY created_at DESC';
	const queryParams: any[] = [];

	if (limit !== undefined) {
		query += ' LIMIT ?';
		queryParams.push(limit);
	}
	if (offset !== undefined) {
		query += ' OFFSET ?';
		queryParams.push(offset);
	}

	const data = db.prepare(query).all(...queryParams) as Test[];
	const totalResult = db.prepare('SELECT COUNT(*) as count FROM tests').get() as { count: number };

	return { data, total: totalResult.count };
};

// Result queries
export const createResult = (result: TestResult) => {
	// Validate required fields
	if (typeof result.agent_id !== 'number' || result.agent_id <= 0) {
		throw new Error('Invalid agent_id: must be a positive number');
	}
	if (typeof result.test_id !== 'number' || result.test_id <= 0) {
		throw new Error('Invalid test_id: must be a positive number');
	}
	if (typeof result.output !== 'string') {
		// Try to serialize output if it's not a string
		try {
			result.output = JSON.stringify(result.output);
		} catch {
			throw new Error('Invalid output: must be a string or JSON-serializable');
		}
	}
	if (typeof result.success !== 'boolean') {
		throw new Error('Invalid success: must be a boolean');
	}

	// Validate and ensure proper types for optional fields
	let serializedIntermediateSteps = '';
	if (result.intermediate_steps !== undefined) {
		if (typeof result.intermediate_steps === 'string') {
			serializedIntermediateSteps = result.intermediate_steps;
		} else {
			// If it's an array or object, try to serialize it
			try {
				serializedIntermediateSteps = JSON.stringify(result.intermediate_steps);
			} catch {
				throw new Error('Invalid intermediate_steps: must be a string or JSON-serializable');
			}
		}
	}

	let executionTime = 0;
	if (result.execution_time !== undefined) {
		if (typeof result.execution_time !== 'number' || result.execution_time < 0) {
			throw new Error('Invalid execution_time: must be a non-negative number');
		}
		executionTime = result.execution_time;
	}

	// Handle token usage fields
	let inputTokens = null;
	let outputTokens = null;
	let tokenMappingMetadata = '';

	if (result.input_tokens !== undefined && typeof result.input_tokens === 'number' && result.input_tokens >= 0) {
		inputTokens = Math.floor(result.input_tokens);
	}

	if (result.output_tokens !== undefined && typeof result.output_tokens === 'number' && result.output_tokens >= 0) {
		outputTokens = Math.floor(result.output_tokens);
	}

	if (result.token_mapping_metadata !== undefined) {
		if (typeof result.token_mapping_metadata === 'string') {
			tokenMappingMetadata = result.token_mapping_metadata;
		} else {
			try {
				tokenMappingMetadata = JSON.stringify(result.token_mapping_metadata);
			} catch {
				logWarn('Invalid token_mapping_metadata: must be a string or JSON-serializable');
			}
		}
	}

	// Create a clean object with only the fields we want to insert
	const cleanResult = {
		agent_id: result.agent_id,
		test_id: result.test_id,
		output: result.output,
		intermediate_steps: serializedIntermediateSteps,
		success: result.success ? 1 : 0, // SQLite expects 1/0 for booleans
		execution_time: executionTime,
		input_tokens: inputTokens,
		output_tokens: outputTokens,
		token_mapping_metadata: tokenMappingMetadata
	};

	const statement = db.prepare(`
		INSERT INTO results (
			agent_id, test_id, output, intermediate_steps,
			success, execution_time, input_tokens, output_tokens, token_mapping_metadata
		)
		VALUES (
			@agent_id, @test_id, @output, @intermediate_steps,
			@success, @execution_time, @input_tokens, @output_tokens, @token_mapping_metadata
		)
		RETURNING *
	`);

	try {
		const dbResult = statement.get(cleanResult) as {
			id: number;
			agent_id: number;
			test_id: number;
			output: string;
			intermediate_steps: string;
			success: number;
			execution_time: number;
			input_tokens: number | null;
			output_tokens: number | null;
			token_mapping_metadata: string;
			created_at: string;
		};
		// Convert the boolean back from SQLite's number representation
		return {
			id: dbResult.id,
			agent_id: dbResult.agent_id,
			test_id: dbResult.test_id,
			output: dbResult.output,
			intermediate_steps: dbResult.intermediate_steps,
			success: Boolean(dbResult.success),
			execution_time: dbResult.execution_time,
			input_tokens: dbResult.input_tokens,
			output_tokens: dbResult.output_tokens,
			token_mapping_metadata: dbResult.token_mapping_metadata,
			created_at: dbResult.created_at
		};
	} catch (error) {
		logError('Failed to insert result:', error);
		logError('Attempted to insert:', cleanResult);
		throw new Error(`Failed to insert result: ${error instanceof Error ? error.message : 'Unknown error'}`);
	}
};

export const getResults = (filters?: { agent_id?: number; test_id?: number; limit?: number; offset?: number }) => {
	let query = 'SELECT * FROM results';
	const params: any[] = [];

	if (filters) {
		const conditions: string[] = [];
		if (filters.agent_id) {
			conditions.push('agent_id = ?');
			params.push(filters.agent_id);
		}
		if (filters.test_id) {
			conditions.push('test_id = ?');
			params.push(filters.test_id);
		}
		if (conditions.length > 0) {
			query += ' WHERE ' + conditions.join(' AND ');
		}
	}

	query += ' ORDER BY created_at DESC';

	if (filters?.limit !== undefined) {
		query += ' LIMIT ?';
		params.push(filters.limit);
	}
	if (filters?.offset !== undefined) {
		query += ' OFFSET ?';
		params.push(filters.offset);
	}

	return db.prepare(query).all(...params) as TestResult[];
};

export const getResultsWithCount = (filters?: {
	agent_id?: number;
	test_id?: number;
	limit?: number;
	offset?: number;
}): { data: TestResult[]; total: number } => {
	// First, get the total count without pagination
	let countQuery = 'SELECT COUNT(*) as count FROM results';
	const countParams: any[] = [];

	if (filters) {
		const conditions: string[] = [];
		if (filters.agent_id) {
			conditions.push('agent_id = ?');
			countParams.push(filters.agent_id);
		}
		if (filters.test_id) {
			conditions.push('test_id = ?');
			countParams.push(filters.test_id);
		}
		if (conditions.length > 0) {
			countQuery += ' WHERE ' + conditions.join(' AND ');
		}
	}

	const countResult = db.prepare(countQuery).get(...countParams) as { count: number };
	const total = countResult.count;

	// Then get the actual data
	const data = getResults(filters);

	return { data, total };
};

export const getResultById = (id: number) => {
	return db.prepare('SELECT * FROM results WHERE id = ?').get(id) as TestResult;
};

export const updateResult = (id: number, updates: Partial<TestResult>) => {
	const filteredUpdates = Object.fromEntries(
		Object.entries(updates).filter(([key, value]) => value !== undefined && key !== 'id' && key !== 'created_at')
	);

	// If there are no fields to update, return
	if (Object.keys(filteredUpdates).length === 0) {
		return;
	}

	const fields = Object.keys(filteredUpdates).map((key) => `${key} = @${key}`);

	const statement = db.prepare(`
		UPDATE results
		SET ${fields.join(', ')}
		WHERE id = @id
	`);

	statement.run({
		id,
		...filteredUpdates
	});
};
