/**
 * Starts an isolated VIBE backend on a free port with a temporary SQLite DB.
 * Returns a helper with the backend URL and a shutdown function.
 *
 * The backend is the compiled dist from backend/dist/index.js, started as a
 * child process with PORT and DB_PATH overridden via environment variables.
 */
import { spawn, type ChildProcess } from 'child_process';
import * as net from 'net';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';

export interface TestBackend {
	url: string;
	port: number;
	dbPath: string;
	stop: () => Promise<void>;
}

/** Find a free TCP port on localhost */
export function getFreePort(): Promise<number> {
	return new Promise((resolve, reject) => {
		const server = net.createServer();
		server.listen(0, '127.0.0.1', () => {
			const addr = server.address() as net.AddressInfo;
			server.close(() => resolve(addr.port));
		});
		server.on('error', reject);
	});
}

/** Poll until the health endpoint responds or timeout expires */
async function waitForBackend(url: string, timeoutMs = 15000): Promise<void> {
	const deadline = Date.now() + timeoutMs;
	while (Date.now() < deadline) {
		try {
			const res = await fetch(`${url}/api/health`);
			if (res.ok) return;
		} catch {
			// not ready yet
		}
		await new Promise((r) => setTimeout(r, 200));
	}
	throw new Error(`Backend at ${url} did not become healthy within ${timeoutMs}ms`);
}

/**
 * Start an isolated backend.
 * Requires the backend to have been built: backend/dist/index.js must exist.
 */
export async function startTestBackend(): Promise<TestBackend> {
	const port = await getFreePort();
	const dbDir = os.tmpdir();
	const dbName = `vibe-e2e-${port}-${Date.now()}.db`;
	const dbPath = path.join(dbDir, dbName);

	// __dirname is packages/vibe-cli/src/__tests__/e2e at runtime
	const backendDist = path.resolve(__dirname, '../../../../../backend/dist/index.js');
	if (!fs.existsSync(backendDist)) {
		throw new Error(`Backend dist not found at ${backendDist}. Run: cd backend && npm run build`);
	}

	const proc: ChildProcess = spawn('node', [backendDist], {
		env: {
			...process.env,
			PORT: String(port),
			DB_PATH: dbPath,
			NODE_ENV: 'test',
			// Suppress migration logs
			LOG_LEVEL: 'error'
		},
		stdio: 'pipe'
	});

	proc.stderr?.on('data', () => {
		/* suppress */
	});
	proc.stdout?.on('data', () => {
		/* suppress */
	});

	const url = `http://127.0.0.1:${port}`;
	await waitForBackend(url);

	const stop = (): Promise<void> =>
		new Promise((resolve) => {
			proc.once('close', () => {
				// Delete temp DB files
				for (const suffix of ['', '-shm', '-wal', '.before-drop-legacy']) {
					const f = dbPath + suffix;
					if (fs.existsSync(f)) {
						try {
							fs.unlinkSync(f);
						} catch {
							/* best effort */
						}
					}
				}
				resolve();
			});
			proc.kill('SIGTERM');
			// Force kill after 3s if it hasn't exited
			setTimeout(() => {
				try {
					proc.kill('SIGKILL');
				} catch {
					/* ignore */
				}
			}, 3000);
		});

	return { url, port, dbPath, stop };
}
