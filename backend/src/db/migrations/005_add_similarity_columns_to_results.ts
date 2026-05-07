import type { Migration } from './types';

const migration: Migration = {
	version: 5,
	name: 'Add similarity and token usage columns to results',
	up: (db) => {
		const resultsInfo = db.prepare("PRAGMA table_info('results')").all() as Array<{ name: string }>;
		const hasResultsTable = resultsInfo.some((col) => col.name === 'id');
		if (!hasResultsTable) {
			return;
		}

		if (!resultsInfo.some((col) => col.name === 'similarity_score')) {
			db.exec('ALTER TABLE results ADD COLUMN similarity_score INTEGER');
		}
		if (!resultsInfo.some((col) => col.name === 'similarity_scoring_status')) {
			db.exec('ALTER TABLE results ADD COLUMN similarity_scoring_status TEXT');
		}
		if (!resultsInfo.some((col) => col.name === 'similarity_scoring_error')) {
			db.exec('ALTER TABLE results ADD COLUMN similarity_scoring_error TEXT');
		}
		if (!resultsInfo.some((col) => col.name === 'similarity_scoring_metadata')) {
			db.exec('ALTER TABLE results ADD COLUMN similarity_scoring_metadata TEXT');
		}

		if (!resultsInfo.some((col) => col.name === 'input_tokens')) {
			db.exec('ALTER TABLE results ADD COLUMN input_tokens INTEGER');
		}
		if (!resultsInfo.some((col) => col.name === 'output_tokens')) {
			db.exec('ALTER TABLE results ADD COLUMN output_tokens INTEGER');
		}
		if (!resultsInfo.some((col) => col.name === 'token_mapping_metadata')) {
			db.exec('ALTER TABLE results ADD COLUMN token_mapping_metadata TEXT');
		}
	}
};

export default migration;
