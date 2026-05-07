import type { Migration } from './types';

const migration: Migration = {
	version: 2,
	name: 'Add suite_run_id to jobs',
	up: (db) => {
		const columns = db.prepare("PRAGMA table_info('jobs')").all() as Array<{ name: string }>;
		if (!columns.some((col) => col.name === 'suite_run_id')) {
			db.exec('ALTER TABLE jobs ADD COLUMN suite_run_id INTEGER');
		}
	}
};

export default migration;
