import Database from 'better-sqlite3';
import { getUserVersion, runMigrations, setUserVersion } from '../index';
import migration001 from '../001_initial_schema';

describe('db migrations', () => {
	let db: Database.Database;

	beforeEach(() => {
		db = new Database(':memory:');
		db.pragma('foreign_keys = ON');
	});

	afterEach(() => {
		db.close();
	});

	it('runs migrations and sets user_version', () => {
		runMigrations(db);

		expect(getUserVersion(db)).toBeGreaterThanOrEqual(4);

		const tables = db
			.prepare("SELECT name FROM sqlite_master WHERE type='table'")
			.all()
			.map((r: any) => r.name);
		expect(tables).toContain('agents');

		const jobColumns = db.prepare("PRAGMA table_info('jobs')").all() as Array<{ name: string }>;
		expect(jobColumns.some((c) => c.name === 'job_type')).toBe(true);
		expect(jobColumns.some((c) => c.name === 'claimed_by')).toBe(true);
		expect(jobColumns.some((c) => c.name === 'claimed_at')).toBe(true);
	});

	it('is idempotent', () => {
		runMigrations(db);
		const version1 = getUserVersion(db);

		runMigrations(db);
		const version2 = getUserVersion(db);

		expect(version1).toBeGreaterThanOrEqual(4);
		expect(version2).toBe(version1);
	});

	it('can continue from an initial schema-only database', () => {
		migration001.up(db);
		setUserVersion(db, 1);

		runMigrations(db);
		expect(getUserVersion(db)).toBeGreaterThanOrEqual(4);

		const suiteRunColumns = db.prepare("PRAGMA table_info('suite_runs')").all() as Array<{ name: string }>;
		expect(suiteRunColumns.some((c) => c.name === 'total_input_tokens')).toBe(true);
		expect(suiteRunColumns.some((c) => c.name === 'total_output_tokens')).toBe(true);
	});
});
