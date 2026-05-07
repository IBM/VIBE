import type { Migration } from './types';

const migration: Migration = {
	version: 3,
	name: 'Add token usage to suite_runs',
	up: (db) => {
		const columns = db.prepare("PRAGMA table_info('suite_runs')").all() as Array<{ name: string }>;

		if (!columns.some((col) => col.name === 'total_input_tokens')) {
			db.exec('ALTER TABLE suite_runs ADD COLUMN total_input_tokens INTEGER DEFAULT 0');
		}
		if (!columns.some((col) => col.name === 'total_output_tokens')) {
			db.exec('ALTER TABLE suite_runs ADD COLUMN total_output_tokens INTEGER DEFAULT 0');
		}
	}
};

export default migration;
