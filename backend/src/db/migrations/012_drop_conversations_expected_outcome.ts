import type { Migration } from './types';

const shouldLog = process.env.NODE_ENV !== 'test';
const logError = (...args: unknown[]) => {
	/* istanbul ignore next */
	if (shouldLog) console.error(...args);
};

const migration: Migration = {
	version: 12,
	name: 'Drop conversations.expected_outcome via table rebuild',
	up: (db) => {
		try {
			const convInfo = db.prepare("PRAGMA table_info('conversations')").all() as Array<{ name: string }>;
			const hasExpectedOutcome = convInfo.some((col) => col.name === 'expected_outcome');
			if (!hasExpectedOutcome) {
				return;
			}

			// Temporarily disable FK enforcement to allow table rebuild while preserving ids
			const fkWasOn = db.pragma('foreign_keys', { simple: true }) as number;
			if (fkWasOn) {
				db.exec('PRAGMA foreign_keys = OFF');
			}
			try {
				db.transaction(() => {
					db.exec(`
					CREATE TABLE conversations_new (
						id INTEGER PRIMARY KEY AUTOINCREMENT,
						name TEXT NOT NULL,
						description TEXT,
						tags TEXT,
						created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
						updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
					);

					INSERT INTO conversations_new (id, name, description, tags, created_at, updated_at)
					SELECT id, name, description, COALESCE(tags, '[]'), created_at, updated_at FROM conversations;

					DROP TABLE conversations;
					ALTER TABLE conversations_new RENAME TO conversations;
				`);
				})();
			} finally {
				if (fkWasOn) {
					db.exec('PRAGMA foreign_keys = ON');
					// Validate referential integrity after rebuild
					try {
						db.exec('PRAGMA foreign_key_check');
					} catch (e) {
						logError('Foreign key check failed', e);
					}
				}
			}
		} catch (e) {
			logError('Conversations table rebuild failed', e);
		}
	}
};

export default migration;
