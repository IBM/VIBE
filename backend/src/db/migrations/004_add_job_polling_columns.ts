import type { Migration } from './types';

const migration: Migration = {
	version: 4,
	name: 'Add job polling columns to jobs',
	up: (db) => {
		const columns = db.prepare("PRAGMA table_info('jobs')").all() as Array<{ name: string }>;

		if (!columns.some((col) => col.name === 'job_type')) {
			db.exec("ALTER TABLE jobs ADD COLUMN job_type TEXT DEFAULT 'crewai'");
		}
		if (!columns.some((col) => col.name === 'claimed_by')) {
			db.exec('ALTER TABLE jobs ADD COLUMN claimed_by TEXT');
		}
		if (!columns.some((col) => col.name === 'claimed_at')) {
			db.exec('ALTER TABLE jobs ADD COLUMN claimed_at DATETIME');
		}
	}
};

export default migration;
