import db from '../database';
import { Job, JobFilters, ExecutionSession, SessionMessage } from '@ibm-vibe/types';

// Job Queries

/**
 * Create a new job
 */
export async function createJob(job: Job): Promise<Job> {
	const statement = db.prepare(`
		INSERT INTO jobs (
			id, agent_id, test_id, conversation_id, status, progress, partial_result, result_id, session_id, error, suite_run_id, job_type, claimed_by, claimed_at
		) VALUES (
			@id, @agent_id, @test_id, @conversation_id, @status, @progress, @partial_result, @result_id, @session_id, @error, @suite_run_id, @job_type, @claimed_by, @claimed_at
		)
	`);

	statement.run({
		id: job.id,
		agent_id: job.agent_id,
		test_id: job.test_id || null,
		conversation_id: job.conversation_id || null,
		status: job.status,
		progress: job.progress || 0,
		partial_result: job.partial_result || null,
		result_id: job.result_id || null,
		session_id: job.session_id || null,
		error: job.error || null,
		suite_run_id: job.suite_run_id || null,
		job_type: job.job_type || 'crewai',
		claimed_by: job.claimed_by || null,
		claimed_at: job.claimed_at || null
	});

	const result = await getJobById(job.id);
	if (!result) {
		throw new Error(`Failed to create job ${job.id}`);
	}
	return result;
}

/**
 * Get a job by ID
 */
export async function getJobById(id: string): Promise<Job | undefined> {
	const statement = db.prepare('SELECT * FROM jobs WHERE id = ?');
	const row = statement.get(id);
	return row as Job | undefined;
}

/**
 * Update a job
 */
export async function updateJob(id: string, updates: Partial<Job>): Promise<void> {
	// Create SET clause
	const fields = Object.keys(updates)
		.filter((key) => key !== 'id' && key !== 'created_at')
		.map((key) => `${key} = @${key}`);

	if (fields.length === 0) {
		return;
	}

	// Add updated_at
	fields.push('updated_at = CURRENT_TIMESTAMP');

	const statement = db.prepare(`
		UPDATE jobs
		SET ${fields.join(', ')}
		WHERE id = @id
	`);

	statement.run({
		id,
		...updates
	});
}

/**
 * List jobs with optional filtering
 */
export async function listJobs(filters: JobFilters & { limit?: number; offset?: number } = {}): Promise<Job[]> {
	let sql = 'SELECT * FROM jobs';
	const params: any = {};
	const conditions: string[] = [];

	if (filters.status) {
		conditions.push('status = @status');
		params.status = filters.status;
	}

	if (filters.agent_id) {
		conditions.push('agent_id = @agent_id');
		params.agent_id = filters.agent_id;
	}

	if (filters.test_id) {
		conditions.push('test_id = @test_id');
		params.test_id = filters.test_id;
	}

	if (filters.after) {
		conditions.push('created_at >= @after');
		params.after = filters.after.toISOString();
	}

	if (filters.before) {
		conditions.push('created_at <= @before');
		params.before = filters.before.toISOString();
	}

	if (filters.suite_run_id) {
		conditions.push('suite_run_id = @suite_run_id');
		params.suite_run_id = filters.suite_run_id;
	}

	if (filters.job_type) {
		conditions.push('job_type = @job_type');
		params.job_type = filters.job_type;
	}

	if (conditions.length > 0) {
		sql += ' WHERE ' + conditions.join(' AND ');
	}

	sql += ' ORDER BY created_at DESC';

	if (filters.limit !== undefined) {
		sql += ' LIMIT @limit';
		params.limit = filters.limit;
	}
	if (filters.offset !== undefined) {
		sql += ' OFFSET @offset';
		params.offset = filters.offset;
	}

	const statement = db.prepare(sql);
	return statement.all(params) as Job[];
}

export async function listJobsWithCount(
	filters: JobFilters & { limit?: number; offset?: number } = {}
): Promise<{ data: Job[]; total: number }> {
	// First, get the total count without pagination
	let countSql = 'SELECT COUNT(*) as count FROM jobs';
	const countParams: any = {};
	const conditions: string[] = [];

	if (filters.status) {
		conditions.push('status = @status');
		countParams.status = filters.status;
	}

	if (filters.agent_id) {
		conditions.push('agent_id = @agent_id');
		countParams.agent_id = filters.agent_id;
	}

	if (filters.test_id) {
		conditions.push('test_id = @test_id');
		countParams.test_id = filters.test_id;
	}

	if (filters.after) {
		conditions.push('created_at >= @after');
		countParams.after = filters.after.toISOString();
	}

	if (filters.before) {
		conditions.push('created_at <= @before');
		countParams.before = filters.before.toISOString();
	}

	if (filters.suite_run_id) {
		conditions.push('suite_run_id = @suite_run_id');
		countParams.suite_run_id = filters.suite_run_id;
	}

	if (filters.job_type) {
		conditions.push('job_type = @job_type');
		countParams.job_type = filters.job_type;
	}

	if (conditions.length > 0) {
		countSql += ' WHERE ' + conditions.join(' AND ');
	}

	const countStatement = db.prepare(countSql);
	const countResult = countStatement.get(countParams) as { count: number };
	const total = countResult.count;

	// Then get the actual data
	const data = await listJobs(filters);

	return { data, total };
}

/**
 * Delete old jobs
 */
export async function deleteOldJobs(olderThan: Date): Promise<number> {
	const statement = db.prepare(`
		DELETE FROM jobs
		WHERE created_at < ?
		AND (status = 'completed' OR status = 'failed')
	`);

	const result = statement.run(olderThan.toISOString());
	return result.changes;
}

/**
 * Delete a job by ID
 */
export async function deleteJob(id: string): Promise<boolean> {
	const statement = db.prepare(`
		DELETE FROM jobs
		WHERE id = ?
	`);

	const result = statement.run(id);
	return result.changes > 0;
}

export const getJobsBySuiteRunId = (suiteRunId: number) => {
	return db.prepare('SELECT * FROM jobs WHERE suite_run_id = ?').all(suiteRunId) as Job[];
};

export const createExecutionSession = (session: ExecutionSession) => {
	// Normalize required fields so named parameters are always provided
	const nowIso = new Date().toISOString();
	const status = session.status || 'pending';
	let metadataString = '{}';
	let variablesString: string | null = null;

	if (typeof session.metadata === 'string') {
		metadataString = session.metadata;
	} else if (session.metadata) {
		try {
			metadataString = JSON.stringify(session.metadata as unknown as any);
		} catch {
			metadataString = '{}';
		}
	}
	if ((session as any).variables === null || (session as any).variables === undefined) {
		variablesString = null;
	} else if (typeof (session as any).variables === 'string') {
		variablesString = (session as any).variables as string;
	} else {
		try {
			variablesString = JSON.stringify((session as any).variables);
		} catch {
			variablesString = null;
		}
	}

	const normalizedSession = {
		conversation_id: session.conversation_id,
		agent_id: session.agent_id,
		status,
		started_at: session.started_at ?? nowIso,
		completed_at: session.completed_at ?? (status === 'completed' ? nowIso : null),
		success: typeof session.success === 'boolean' ? (session.success ? 1 : 0) : null,
		error_message: session.error_message ?? null,
		metadata: metadataString,
		variables: variablesString
	};

	const statement = db.prepare(`
		INSERT INTO execution_sessions (
			conversation_id, agent_id, status, started_at, completed_at,
			success, error_message, metadata, variables
		)
		VALUES (
			@conversation_id, @agent_id, @status, @started_at, @completed_at,
			@success, @error_message, @metadata, @variables
		)
		RETURNING *
	`);
	return statement.get(normalizedSession) as ExecutionSession;
};

export const getExecutionSessions = (filters?: {
	conversation_id?: number;
	agent_id?: number;
	limit?: number;
	offset?: number;
}) => {
	let query = 'SELECT * FROM execution_sessions';
	const params: any[] = [];

	if (filters) {
		const conditions: string[] = [];
		if (filters.conversation_id) {
			conditions.push('conversation_id = ?');
			params.push(filters.conversation_id);
		}
		if (filters.agent_id) {
			conditions.push('agent_id = ?');
			params.push(filters.agent_id);
		}
		if (conditions.length > 0) {
			query += ' WHERE ' + conditions.join(' AND ');
		}
	}

	query += ' ORDER BY started_at DESC';

	if (filters?.limit !== undefined) {
		query += ' LIMIT ?';
		params.push(filters.limit);
	}
	if (filters?.offset !== undefined) {
		query += ' OFFSET ?';
		params.push(filters.offset);
	}

	return db.prepare(query).all(...params) as ExecutionSession[];
};

export const getExecutionSessionsWithCount = (filters?: {
	conversation_id?: number;
	agent_id?: number;
	limit?: number;
	offset?: number;
}): { data: ExecutionSession[]; total: number } => {
	// Get total count
	let countQuery = 'SELECT COUNT(*) as count FROM execution_sessions';
	const countParams: any[] = [];

	if (filters) {
		const conditions: string[] = [];
		if (filters.conversation_id) {
			conditions.push('conversation_id = ?');
			countParams.push(filters.conversation_id);
		}
		if (filters.agent_id) {
			conditions.push('agent_id = ?');
			countParams.push(filters.agent_id);
		}
		if (conditions.length > 0) {
			countQuery += ' WHERE ' + conditions.join(' AND ');
		}
	}

	const countResult = db.prepare(countQuery).get(...countParams) as { count: number };
	const total = countResult.count;

	// Get actual data
	const data = getExecutionSessions(filters);

	return { data, total };
};

export const getExecutionSessionById = (id: number) => {
	return db.prepare('SELECT * FROM execution_sessions WHERE id = ?').get(id) as ExecutionSession;
};

export const getExecutionSessionsByIds = (ids: number[]): ExecutionSession[] => {
	if (!ids || ids.length === 0) {
		return [];
	}
	const placeholders = ids.map(() => '?').join(',');
	const sql = `SELECT * FROM execution_sessions WHERE id IN (${placeholders})`;

	return db.prepare(sql).all(...ids) as ExecutionSession[];
};

export const updateExecutionSession = (id: number, session: Partial<ExecutionSession>) => {
	const filteredSession = Object.fromEntries(Object.entries(session).filter(([_, value]) => value !== undefined));

	if (Object.keys(filteredSession).length === 0) {
		return getExecutionSessionById(id);
	}

	const updates = Object.keys(filteredSession)
		.filter((key) => key !== 'id')
		.map((key) => `${key} = @${key}`)
		.join(', ');

	const statement = db.prepare(`
		UPDATE execution_sessions
		SET ${updates}
		WHERE id = @id
		RETURNING *
	`);

	return statement.get({ ...filteredSession, id }) as ExecutionSession;
};

export const addSessionMessage = (message: SessionMessage) => {
	// Ensure all named parameters are bound and of acceptable types
	let metadataString: string | null = null;
	if ((message as any).metadata === null || (message as any).metadata === undefined) {
		metadataString = null;
	} else if (typeof (message as any).metadata === 'string') {
		metadataString = (message as any).metadata as string;
	} else {
		try {
			metadataString = JSON.stringify((message as any).metadata);
		} catch {
			metadataString = null;
		}
	}

	const statement = db.prepare(`
		INSERT INTO session_messages (session_id, sequence, role, content, timestamp, metadata)
		VALUES (@session_id, @sequence, @role, @content, CURRENT_TIMESTAMP, @metadata)
		RETURNING *
	`);

	const payload = {
		session_id: message.session_id,
		sequence: message.sequence,
		role: message.role,
		content: message.content,
		metadata: metadataString
	} as const;

	return statement.get(payload) as SessionMessage;
};

export function updateSessionMessage(
	id: number,
	updates: Partial<
		Pick<
			SessionMessage,
			| 'content'
			| 'metadata'
			| 'similarity_score'
			| 'similarity_scoring_status'
			| 'similarity_scoring_error'
			| 'similarity_scoring_metadata'
		>
	>
): void {
	const filtered = Object.fromEntries(Object.entries(updates).filter(([, v]) => v !== undefined));

	if (Object.keys(filtered).length === 0) {
		return;
	}

	const fields = Object.keys(filtered).map((k) => `${k} = @${k}`);
	const stmt = db.prepare(`
		UPDATE session_messages
		SET ${fields.join(', ')}
		WHERE id = @id
	`);
	stmt.run({ id, ...filtered });
}

export const getSessionMessages = (sessionId: number) => {
	return db
		.prepare('SELECT * FROM session_messages WHERE session_id = ? ORDER BY sequence')
		.all(sessionId) as SessionMessage[];
};

export const getFullSessionTranscript = (sessionId: number) => {
	const session = getExecutionSessionById(sessionId);
	const messages = getSessionMessages(sessionId);

	return {
		session,
		messages
	};
};

/**
 * Count user messages up to and including a given sequence number.
 * Used to compute turn index k for the assistant reply (ignore system/tool).
 */
export function countUserTurnsUpTo(sessionId: number, sequenceInclusive: number): number {
	const row = db
		.prepare(
			`
    SELECT COUNT(*) as cnt
    FROM session_messages
    WHERE session_id = ?
		AND sequence <= ?
		AND role = 'user'
	`
		)
		.get(sessionId, sequenceInclusive) as { cnt: number };
	return row?.cnt ?? 0;
}

/**
 * Update per-turn scoring fields on a session_message row
 */
export function updateSessionMessageScoring(
	id: number,
	updates: Partial<
		Pick<
			SessionMessage,
			| 'similarity_score'
			| 'similarity_scoring_status'
			| 'similarity_scoring_error'
			| 'similarity_scoring_metadata'
		>
	>
): void {
	const filtered = Object.fromEntries(Object.entries(updates).filter(([, v]) => v !== undefined));
	if (Object.keys(filtered).length === 0) {
		return;
	}

	const fields = Object.keys(filtered).map((k) => `${k} = @${k}`);
	const stmt = db.prepare(`
		UPDATE session_messages
		SET ${fields.join(', ')}
		WHERE id = @id
	`);
	stmt.run({ id, ...filtered });
}

export function getSessionMessageById(id: number): SessionMessage | undefined {
	const stmt = db.prepare(`
		SELECT * FROM session_messages WHERE id = ?
	`);
	return stmt.get(id) as SessionMessage | undefined;
}
