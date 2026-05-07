import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import os from 'os';

describe('database.ts branch coverage', () => {
	let tempDir: string;
	let originalDbPath: string | undefined;
	let originalCwd: string;

	beforeEach(() => {
		tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'db-test-'));
		originalDbPath = process.env.DB_PATH;
		originalCwd = process.cwd();
	});

	afterEach(() => {
		// Restore working directory first
		try {
			process.chdir(originalCwd);
		} catch {}
		if (originalDbPath !== undefined) {
			process.env.DB_PATH = originalDbPath;
		} else {
			delete process.env.DB_PATH;
		}
		if (fs.existsSync(tempDir)) {
			fs.rmSync(tempDir, { recursive: true, force: true });
		}
		// Clear module cache
		const modulePaths = Object.keys(require.cache).filter(
			(key) => key.includes('database') || key.includes('config') || key.includes('@ibm-vibe/config')
		);
		modulePaths.forEach((key) => delete require.cache[key]);
	});

	async function importDatabase() {
		// Clear all related module caches
		const modulePaths = Object.keys(require.cache).filter(
			(key) => key.includes('database') || key.includes('config') || key.includes('@ibm-vibe/config')
		);
		modulePaths.forEach((key) => delete require.cache[key]);
		try {
			delete require.cache[require.resolve('../config')];
		} catch {}
		try {
			delete require.cache[require.resolve('@ibm-vibe/config')];
		} catch {}
		return await import('../database');
	}

	describe('closeDatabase error handling', () => {
		it('should handle error when closing already-closed database', async () => {
			const dbPath = path.join(tempDir, `close-error-${Date.now()}.db`);
			process.env.DB_PATH = dbPath;
			const dbModule = await importDatabase();
			const db = dbModule.default;
			// Close it directly first
			db.close();
			// Try to close again via closeDatabase - should handle error gracefully
			expect(() => dbModule.closeDatabase()).not.toThrow();
		});
	});

	describe('path resolution branches', () => {
		it('should handle :memory: database path', async () => {
			process.env.DB_PATH = ':memory:';
			const dbModule = await importDatabase();
			expect(dbModule.default).toBeDefined();
		});

		it('should handle absolute database path', async () => {
			const absPath = path.join(tempDir, `absolute-${Date.now()}.db`);
			process.env.DB_PATH = absPath;
			const dbModule = await importDatabase();
			expect(dbModule.default).toBeDefined();
		});

		it('should resolve relative database path', async () => {
			const relativePath = `relative-${Date.now()}.db`;
			process.env.DB_PATH = relativePath;
			process.chdir(tempDir);
			const dbModule = await importDatabase();
			expect(dbModule.default).toBeDefined();
		});
	});

	describe('migration error handling branches', () => {
		it('should handle migration errors gracefully when table operations fail', async () => {
			// Create a database that will trigger migration code paths
			const dbPath = path.join(tempDir, `migration-error-${Date.now()}.db`);
			const setupDb = new Database(dbPath);
			// Create a minimal schema that will trigger migrations
			setupDb.exec(`
				CREATE TABLE IF NOT EXISTS agents (
					id INTEGER PRIMARY KEY AUTOINCREMENT,
					name TEXT NOT NULL,
					version TEXT NOT NULL,
					prompt TEXT NOT NULL,
					settings TEXT NOT NULL
				);
			`);
			setupDb.close();

			process.env.DB_PATH = dbPath;
			const dbModule = await importDatabase();
			// Migrations should run and handle any errors gracefully
			expect(dbModule.default).toBeDefined();
		});
	});
});
