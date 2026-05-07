import db from '../db/database';

export function testIdToConversationId(testId: number): number | undefined {
	if (!Number.isFinite(testId)) {
		return undefined;
	}
	try {
		// First, try direct conversation id (common in our adapter flow)
		const conv = db.prepare('SELECT id FROM conversations WHERE id = ?').get(testId) as { id: number } | undefined;
		if (conv?.id) {
			return conv.id;
		}

		// Fallback: join through tests mapping if legacy table exists (name + created_at mapping is the migration basis)
		const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='tests'").all() as {
			name: string;
		}[];
		if (tables.length > 0) {
			const row = db
				.prepare(
					`
				SELECT c.id as conversation_id
				FROM tests t
				JOIN conversations c ON c.name = t.name AND c.created_at = t.created_at
				WHERE t.id = ?
			`
				)
				.get(testId) as { conversation_id: number } | undefined;
			if (row?.conversation_id) {
				return row.conversation_id;
			}
		}
	} catch {}

	return undefined;
}
