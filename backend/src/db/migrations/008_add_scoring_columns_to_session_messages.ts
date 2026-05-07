import type { Migration } from './types';

const shouldLog = process.env.NODE_ENV !== 'test';
const logError = (...args: unknown[]) => {
	/* istanbul ignore next */
	if (shouldLog) console.error(...args);
};

const migration: Migration = {
	version: 8,
	name: 'Add scoring columns to session_messages',
	up: (db) => {
		try {
			const sessMsgCols = db.prepare("PRAGMA table_info('session_messages')").all() as Array<{ name: string }>;
			if (!sessMsgCols.some((col) => col.name === 'similarity_score')) {
				db.exec('ALTER TABLE session_messages ADD COLUMN similarity_score REAL');
			}
			if (!sessMsgCols.some((col) => col.name === 'similarity_scoring_status')) {
				db.exec('ALTER TABLE session_messages ADD COLUMN similarity_scoring_status TEXT');
			}
			if (!sessMsgCols.some((col) => col.name === 'similarity_scoring_error')) {
				db.exec('ALTER TABLE session_messages ADD COLUMN similarity_scoring_error TEXT');
			}
			if (!sessMsgCols.some((col) => col.name === 'similarity_scoring_metadata')) {
				db.exec('ALTER TABLE session_messages ADD COLUMN similarity_scoring_metadata TEXT');
			}
		} catch (e) {
			logError('Add scoring columns to session_messages failed', e);
		}
	}
};

export default migration;
