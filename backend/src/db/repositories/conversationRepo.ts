import db from '../database';
import { Conversation, ConversationMessage, ConversationTurnTarget } from '@ibm-vibe/types';
import { normalizeConversationMessageInsert } from '../normalizers';

export const createConversation = (conversation: Conversation) => {
	const conversationWithDefaults = {
		...conversation,
		name: conversation.name || '',
		description: conversation.description || '',
		tags: conversation.tags || '[]',
		// Note: default_request_template_id and default_response_map_id are deprecated
		// Conversations now specify capability requirements instead of direct template IDs
		variables: conversation.variables ?? null,
		required_request_template_capabilities: conversation.required_request_template_capabilities ?? null,
		required_response_map_capabilities: conversation.required_response_map_capabilities ?? null,
		stop_on_failure:
			typeof conversation.stop_on_failure === 'boolean'
				? conversation.stop_on_failure
					? 1
					: 0
				: (conversation.stop_on_failure ?? 0)
	};

	const statement = db.prepare(`
		INSERT INTO conversations (
			name,
			description,
			tags,
			variables,
			required_request_template_capabilities,
			required_response_map_capabilities,
			stop_on_failure
		)
		VALUES (
			@name,
			@description,
			@tags,
			@variables,
			@required_request_template_capabilities,
			@required_response_map_capabilities,
			@stop_on_failure
		)
		RETURNING *
	`);
	return statement.get(conversationWithDefaults) as Conversation;
};

export const getConversations = () => {
	return db
		.prepare(
			`
		SELECT c.*, (
			SELECT COUNT(*) FROM conversation_messages m WHERE m.conversation_id = c.id
		) AS message_count
		FROM conversations c
		ORDER BY c.created_at DESC
	`
		)
		.all() as (Conversation & { message_count?: number })[];
};

export const getConversationById = (id: number) => {
	return db.prepare('SELECT * FROM conversations WHERE id = ?').get(id) as Conversation;
};

export const getConversationsWithCount = (
	params: { limit?: number; offset?: number } = {}
): { data: (Conversation & { message_count?: number })[]; total: number } => {
	const { limit, offset } = params;
	let query = `
		SELECT c.*, (
			SELECT COUNT(*) FROM conversation_messages m WHERE m.conversation_id = c.id
		) AS message_count
		FROM conversations c
		ORDER BY c.created_at DESC
	`;
	const queryParams: any[] = [];

	if (limit !== undefined) {
		query += ' LIMIT ?';
		queryParams.push(limit);
	}
	if (offset !== undefined) {
		query += ' OFFSET ?';
		queryParams.push(offset);
	}

	const data = db.prepare(query).all(...queryParams) as Conversation[];
	const totalResult = db.prepare('SELECT COUNT(*) as count FROM conversations').get() as { count: number };

	return { data, total: totalResult.count };
};

export const updateConversation = (id: number, conversation: Partial<Conversation>) => {
	const normalizedConversation: Record<string, unknown> = { ...conversation };

	if (Object.prototype.hasOwnProperty.call(normalizedConversation, 'stop_on_failure')) {
		const value = normalizedConversation.stop_on_failure as unknown;

		if (typeof value === 'boolean') {
			normalizedConversation.stop_on_failure = value ? 1 : 0;
		} else if (value === null || value === undefined) {
			normalizedConversation.stop_on_failure = 0;
		}
	}

	// Remove deprecated fields - conversations now use capability requirements instead
	delete normalizedConversation.default_request_template_id;
	delete normalizedConversation.default_response_map_id;

	const filteredConversation = Object.fromEntries(
		Object.entries(normalizedConversation).filter(([_, value]) => value !== undefined)
	);

	if (Object.keys(filteredConversation).length === 0) {
		return getConversationById(id);
	}

	const updates = Object.keys(filteredConversation)
		.filter((key) => key !== 'id' && key !== 'created_at')
		.map((key) => `${key} = @${key}`)
		.join(', ');

	const statement = db.prepare(`
		UPDATE conversations
		SET ${updates}, updated_at = CURRENT_TIMESTAMP
		WHERE id = @id
		RETURNING *
	`);

	return statement.get({ ...filteredConversation, id }) as Conversation;
};

export const deleteConversation = (id: number) => {
	const transaction = db.transaction(() => {
		// Delete associated jobs first
		const deleteJobsStmt = db.prepare('DELETE FROM jobs WHERE conversation_id = ?');
		deleteJobsStmt.run(id);

		// Also delete entries where the conversation id was stored in legacy test_id
		const deleteLegacySuiteEntriesStmt = db.prepare('DELETE FROM suite_entries WHERE test_id = ?');
		deleteLegacySuiteEntriesStmt.run(id);

		// Delete associated execution sessions (will cascade to session messages)
		const deleteSessionsStmt = db.prepare('DELETE FROM execution_sessions WHERE conversation_id = ?');
		deleteSessionsStmt.run(id);

		// Delete conversation messages (should cascade but being explicit)
		const deleteMessagesStmt = db.prepare('DELETE FROM conversation_messages WHERE conversation_id = ?');
		deleteMessagesStmt.run(id);

		// Delete the conversation
		const deleteConversationStmt = db.prepare('DELETE FROM conversations WHERE id = ?');
		return deleteConversationStmt.run(id);
	});

	return transaction();
};

export const addMessageToConversation = (message: ConversationMessage) => {
	const normalizedMessage = normalizeConversationMessageInsert(message);
	const statement = db.prepare(`
		INSERT INTO conversation_messages (conversation_id, sequence, role, content, metadata, request_template_id, response_map_id, set_variables)
		VALUES (@conversation_id, @sequence, @role, @content, @metadata, @request_template_id, @response_map_id, @set_variables)
		RETURNING *
	`);
	return statement.get(normalizedMessage) as ConversationMessage;
};

export const getConversationMessages = (conversationId: number) => {
	return db
		.prepare('SELECT * FROM conversation_messages WHERE conversation_id = ? ORDER BY sequence')
		.all(conversationId) as ConversationMessage[];
};

export const updateConversationMessage = (id: number, message: Partial<ConversationMessage>) => {
	const filteredMessage = Object.fromEntries(Object.entries(message).filter(([_, value]) => value !== undefined));

	if (Object.keys(filteredMessage).length === 0) {
		return db.prepare('SELECT * FROM conversation_messages WHERE id = ?').get(id) as ConversationMessage;
	}

	const updates = Object.keys(filteredMessage)
		.filter((key) => key !== 'id' && key !== 'created_at')
		.map((key) => `${key} = @${key}`)
		.join(', ');

	const statement = db.prepare(`
		UPDATE conversation_messages
		SET ${updates}
		WHERE id = @id
		RETURNING *
	`);

	return statement.get({ ...filteredMessage, id }) as ConversationMessage;
};

export const deleteConversationMessage = (id: number) => {
	const statement = db.prepare('DELETE FROM conversation_messages WHERE id = ?');
	return statement.run(id);
};

export const reorderConversationMessages = (_conversationId: number, newOrder: { id: number; sequence: number }[]) => {
	const transaction = db.transaction(() => {
		const updateStmt = db.prepare('UPDATE conversation_messages SET sequence = ? WHERE id = ?');
		for (const { id, sequence } of newOrder) {
			updateStmt.run(sequence, id);
		}
	});

	return transaction();
};

/**
 * Fetch target reply config for a conversation + user_sequence.
 */
export function getConversationTurnTarget(
	conversationId: number,
	userSequence: number
): ConversationTurnTarget | undefined {
	const row = db
		.prepare(
			`
		SELECT * FROM conversation_turn_targets
		WHERE conversation_id = ? AND user_sequence = ?
	`
		)
		.get(conversationId, userSequence) as ConversationTurnTarget | undefined;
	return row;
}

/**
 * Count legacy "tests" which are represented as single-turn conversations
 * A single-turn conversation has exactly one user message.
 */
export const getSingleTurnTestsCount = (): number => {
	const row = db
		.prepare(
			`
		SELECT COUNT(*) AS count
		FROM (
			SELECT c.id
			FROM conversations c
			JOIN conversation_messages m ON m.conversation_id = c.id
			GROUP BY c.id
			HAVING SUM(CASE WHEN m.role = 'user' THEN 1 ELSE 0 END) = 1
		) t
	`
		)
		.get() as { count: number };
	return row.count;
};
