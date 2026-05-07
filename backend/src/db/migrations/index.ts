import type Database from 'better-sqlite3';
import type { Migration } from './types';

import migration001 from './001_initial_schema';
import migration002 from './002_add_suite_run_id_to_jobs';
import migration003 from './003_add_token_usage_to_suite_runs';
import migration004 from './004_add_job_polling_columns';
import migration005 from './005_add_similarity_columns_to_results';
import migration006 from './006_create_conversation_tables_and_migrate';
import migration007 from './007_post_migration_guards';
import migration008 from './008_add_scoring_columns_to_session_messages';
import migration009 from './009_backfill_similarity_to_session_messages';
import migration010 from './010_make_jobs_test_id_nullable';
import migration011 from './011_ensure_suite_entries_cascade';
import migration012 from './012_drop_conversations_expected_outcome';
import migration013 from './013_agent_templates_and_response_maps';
import migration014 from './014_global_template_library';
import migration015 from './015_migrate_legacy_templates_to_global';
import migration016 from './016_backfill_conversation_template_ids';

const MIGRATIONS: Migration[] = [
	migration001,
	migration002,
	migration003,
	migration004,
	migration005,
	migration006,
	migration007,
	migration008,
	migration009,
	migration010,
	migration011,
	migration012,
	migration013,
	migration014,
	migration015,
	migration016
];

export function getUserVersion(db: Database.Database): number {
	const raw = db.pragma('user_version', { simple: true }) as unknown;
	const value =
		typeof raw === 'number' ? raw : Number((raw as { user_version?: unknown } | null)?.user_version ?? raw);

	return Number.isFinite(value) ? value : 0;
}

export function setUserVersion(db: Database.Database, version: number): void {
	db.pragma(`user_version = ${version}`);
}

export function runMigrations(db: Database.Database): void {
	const currentVersion = getUserVersion(db);
	const pending = MIGRATIONS.filter((m) => m.version > currentVersion).sort((a, b) => a.version - b.version);

	for (const migration of pending) {
		try {
			const run = db.transaction(() => {
				migration.up(db);
				setUserVersion(db, migration.version);
			});
			run();
		} catch (error) {
			throw new Error(
				`Migration ${migration.version} (${migration.name}) failed: ${error instanceof Error ? error.message : String(error)}`
			);
		}
	}
}
