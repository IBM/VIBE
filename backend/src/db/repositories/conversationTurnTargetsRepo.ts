import db from '../database';
import type { ConversationTurnTarget } from '@ibm-vibe/types';

export function listByConversationId(conversationId: number): ConversationTurnTarget[] {
	return db
		.prepare(
			`
		SELECT * FROM conversation_turn_targets
		WHERE conversation_id = ?
		ORDER BY user_sequence
	`
		)
		.all(conversationId) as ConversationTurnTarget[];
}

export function findByConversationAndSequence(
	conversationId: number,
	userSequence: number
): ConversationTurnTarget | undefined {
	return db
		.prepare(
			`
		SELECT * FROM conversation_turn_targets
		WHERE conversation_id = ? AND user_sequence = ?
	`
		)
		.get(conversationId, userSequence) as ConversationTurnTarget | undefined;
}

export function updateByConversationAndSequence(
	targetReply: string,
	threshold: number | null | undefined,
	weight: number | null | undefined,
	conversationId: number,
	userSequence: number
): ConversationTurnTarget {
	return db
		.prepare(
			`
		UPDATE conversation_turn_targets
		SET target_reply = ?, threshold = ?, weight = ?, updated_at = CURRENT_TIMESTAMP
		WHERE conversation_id = ? AND user_sequence = ?
		RETURNING *
	`
		)
		.get(targetReply, threshold, weight, conversationId, userSequence) as ConversationTurnTarget;
}

export function create(
	conversationId: number,
	userSequence: number,
	targetReply: string,
	threshold: number | null | undefined,
	weight: number | null | undefined
): ConversationTurnTarget {
	return db
		.prepare(
			`
		INSERT INTO conversation_turn_targets (conversation_id, user_sequence, target_reply, threshold, weight)
		VALUES (?, ?, ?, ?, ?)
		RETURNING *
	`
		)
		.get(conversationId, userSequence, targetReply, threshold, weight) as ConversationTurnTarget;
}

export function deleteById(id: number): void {
	db.prepare('DELETE FROM conversation_turn_targets WHERE id = ?').run(id);
}
