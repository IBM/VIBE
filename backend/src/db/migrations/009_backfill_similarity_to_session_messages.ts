import type { Migration } from './types';

const shouldLog = process.env.NODE_ENV !== 'test';
const logError = (...args: unknown[]) => {
	/* istanbul ignore next */
	if (shouldLog) console.error(...args);
};

const migration: Migration = {
	version: 9,
	name: 'Backfill similarity metadata onto assistant session messages',
	up: (db) => {
		try {
			const sessionsWithMeta = db
				.prepare(
					`
		SELECT id, metadata
		FROM execution_sessions
		WHERE metadata IS NOT NULL AND metadata != ''
	`
				)
				.all() as Array<{ id: number; metadata: string | null }>;

			const selectAssistantMsg = db.prepare(`
        SELECT id FROM session_messages
        WHERE session_id = ? AND role = 'assistant'
        ORDER BY sequence ASC
        LIMIT 1
    `);

			const updateAssistantMsg = db.prepare(`
		UPDATE session_messages
		SET
			similarity_score = COALESCE(?, similarity_score),
			similarity_scoring_status = COALESCE(?, similarity_scoring_status),
			similarity_scoring_error = COALESCE(?, similarity_scoring_error),
			similarity_scoring_metadata = COALESCE(?, similarity_scoring_metadata)
		WHERE id = ?
			AND (similarity_score IS NULL
				AND similarity_scoring_status IS NULL
				AND similarity_scoring_error IS NULL
				AND similarity_scoring_metadata IS NULL)
	`);

			const backfillTx = db.transaction(() => {
				for (const row of sessionsWithMeta) {
					if (!row.metadata) continue;
					let meta: any = {};
					try {
						meta = JSON.parse(row.metadata);
					} catch {}
					const score = typeof meta?.similarity_score === 'number' ? meta.similarity_score : null;
					const status =
						typeof meta?.similarity_scoring_status === 'string' ? meta.similarity_scoring_status : null;
					const error =
						typeof meta?.similarity_scoring_error === 'string' ? meta.similarity_scoring_error : null;
					let metaStr: string | null = null;
					if (meta && meta.similarity_scoring_metadata !== undefined) {
						if (typeof meta.similarity_scoring_metadata === 'string') {
							metaStr = meta.similarity_scoring_metadata;
						} else {
							try {
								metaStr = JSON.stringify(meta.similarity_scoring_metadata);
							} catch {
								metaStr = null;
							}
						}
					}

					if (score !== null || status !== null || error !== null || metaStr !== null) {
						const assistant = selectAssistantMsg.get(row.id) as { id?: number } | undefined;
						if (assistant?.id) {
							updateAssistantMsg.run(score, status, error, metaStr, assistant.id);
						}
					}
				}
			});
			backfillTx();
		} catch (e) {
			logError('Backfill similarity from session metadata to session_messages failed', e);
		}
	}
};

export default migration;
