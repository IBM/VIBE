/**
 * E2E tests for the vibe CLI.
 *
 * Each test suite spins up an isolated VIBE backend on a random free port
 * with a temporary SQLite database, runs CLI commands against it, and
 * tears everything down afterwards.
 *
 * Tests cover:
 *   - agents:        create / list / show / delete
 *   - conversations: create / list / show / add-message / set-target / delete
 *   - suites:        create / list / show / entries / add-conversation / remove-entry
 *   - results:       suite-run list, session transcript
 *   - transfer:      export / import dry-run
 *
 * Execution (run/poll) is NOT tested here because it requires a live agent
 * endpoint and would be environment-dependent and slow.
 */

import { startTestBackend, type TestBackend } from './server';
import { vibe, vibeOk } from './cli';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

// ── Test backend lifecycle ────────────────────────────────────────────────────

let backend: TestBackend;
let B: string; // backend URL shorthand

beforeAll(async () => {
	backend = await startTestBackend();
	B = backend.url;
}, 20000);

afterAll(async () => {
	await backend.stop();
}, 10000);

// ── Helpers ───────────────────────────────────────────────────────────────────

type JsonObj = Record<string, unknown>;

function asObj(v: unknown): JsonObj {
	if (typeof v !== 'object' || v === null || Array.isArray(v)) {
		throw new Error(`Expected object, got: ${JSON.stringify(v)}`);
	}
	return v as JsonObj;
}

function asArr(v: unknown): JsonObj[] {
	if (!Array.isArray(v)) {
		throw new Error(`Expected array, got: ${JSON.stringify(v)}`);
	}
	return v as JsonObj[];
}

function id(obj: unknown): number {
	return asObj(obj)['id'] as number;
}

// ── Agent tests ───────────────────────────────────────────────────────────────

describe('agent', () => {
	let agentId: number;

	test('create', () => {
		const result = vibeOk(
			['agent', 'create', '--name', 'E2E Test Agent', '--version', '1.0', '--prompt', 'test prompt'],
			{ backend: B }
		);
		const obj = asObj(result);
		expect(obj['name']).toBe('E2E Test Agent');
		expect(obj['version']).toBe('1.0');
		expect(typeof obj['id']).toBe('number');
		agentId = id(result);
	});

	test('list includes created agent', () => {
		const result = vibeOk(['agent', 'list'], { backend: B });
		const agents = asArr(result);
		expect(agents.some((a) => a['id'] === agentId)).toBe(true);
	});

	test('show by id', () => {
		const result = vibeOk(['agent', 'show', String(agentId)], { backend: B });
		const obj = asObj(result);
		expect(obj['id']).toBe(agentId);
		expect(obj['name']).toBe('E2E Test Agent');
	});

	test('delete', () => {
		const result = vibeOk(['agent', 'delete', String(agentId)], { backend: B });
		expect(asObj(result)['deleted']).toBe(true);
	});

	test('show after delete returns error exit code', () => {
		const r = vibe(['agent', 'show', String(agentId)], { backend: B });
		expect(r.exitCode).not.toBe(0);
	});
});

// ── Conversation tests ────────────────────────────────────────────────────────

describe('conversation', () => {
	let convId: number;

	test('create minimal', () => {
		const result = vibeOk(['conversation', 'create', '--name', 'E2E conversation'], { backend: B });
		const obj = asObj(result);
		expect(obj['name']).toBe('E2E conversation');
		expect(typeof obj['id']).toBe('number');
		convId = id(result);
	});

	test('list includes created conversation', () => {
		const result = vibeOk(['conversation', 'list'], { backend: B });
		const convs = asArr(result);
		expect(convs.some((c) => c['id'] === convId)).toBe(true);
	});

	test('add-message', () => {
		const result = vibeOk(
			[
				'conversation',
				'add-message',
				'--conversation',
				String(convId),
				'--role',
				'user',
				'--content',
				'Hello VIBE'
			],
			{ backend: B }
		);
		const msg = asObj(result);
		expect(msg['role']).toBe('user');
		expect(msg['content']).toBe('Hello VIBE');
		expect(msg['conversation_id']).toBe(convId);
		expect(msg['sequence']).toBe(1);
	});

	test('set-target', () => {
		const result = vibeOk(
			[
				'conversation',
				'set-target',
				'--conversation',
				String(convId),
				'--target',
				'Hello back',
				'--sequence',
				'1',
				'--threshold',
				'75'
			],
			{ backend: B }
		);
		const target = asObj(result);
		expect(target['conversation_id']).toBe(convId);
		expect(target['user_sequence']).toBe(1);
		expect(target['target_reply']).toBe('Hello back');
		expect(target['threshold']).toBe(75);
	});

	test('show includes messages and targets', () => {
		const result = vibeOk(['conversation', 'show', String(convId)], { backend: B });
		const obj = asObj(result);
		const conv = asObj(obj['conversation']);
		const targets = asArr(obj['targets']);
		expect(conv['id']).toBe(convId);
		expect(targets.length).toBe(1);
		expect(asObj(targets[0])['target_reply']).toBe('Hello back');
	});

	test('create with messages file', () => {
		const tmpFile = path.join(os.tmpdir(), `vibe-e2e-turns-${Date.now()}.json`);
		fs.writeFileSync(
			tmpFile,
			JSON.stringify([
				{ role: 'user', content: 'Turn 1' },
				{ role: 'user', content: 'Turn 2' }
			])
		);
		try {
			const result = vibeOk(['conversation', 'create', '--name', 'E2E multi-turn', '--messages', tmpFile], {
				backend: B
			});
			const obj = asObj(result);
			// messages are added inline — conversation is created; messages embedded
			expect(obj['name']).toBe('E2E multi-turn');
			// clean up
			vibeOk(['conversation', 'delete', String(id(result))], { backend: B });
		} finally {
			fs.unlinkSync(tmpFile);
		}
	});

	test('delete', () => {
		const result = vibeOk(['conversation', 'delete', String(convId)], { backend: B });
		expect(asObj(result)['deleted']).toBe(true);
	});

	test('list after delete does not include deleted conversation', () => {
		const result = vibeOk(['conversation', 'list'], { backend: B });
		const convs = asArr(result);
		expect(convs.every((c) => c['id'] !== convId)).toBe(true);
	});
});

// ── Suite tests ───────────────────────────────────────────────────────────────

describe('suite', () => {
	let suiteId: number;
	let convId: number;
	let entryId: number | undefined;

	beforeAll(() => {
		// Create a conversation to add to the suite
		const r = vibeOk(['conversation', 'create', '--name', 'Suite member conversation'], { backend: B });
		convId = id(r);
		// Add a message so it's a valid conversation
		vibeOk(
			['conversation', 'add-message', '--conversation', String(convId), '--role', 'user', '--content', 'test'],
			{ backend: B }
		);
	});

	afterAll(() => {
		// Best-effort cleanup
		try {
			vibeOk(['conversation', 'delete', String(convId)], { backend: B });
		} catch {
			/* ignore */
		}
	});

	test('create', () => {
		const result = vibeOk(['suite', 'create', '--name', 'E2E suite', '--description', 'E2E test suite'], {
			backend: B
		});
		const obj = asObj(result);
		expect(obj['name']).toBe('E2E suite');
		suiteId = id(result);
	});

	test('list includes created suite', () => {
		const result = vibeOk(['suite', 'list'], { backend: B });
		const suites = asArr(result);
		expect(suites.some((s) => s['id'] === suiteId)).toBe(true);
	});

	test('show', () => {
		const result = vibeOk(['suite', 'show', String(suiteId)], { backend: B });
		const obj = asObj(result);
		expect(asObj(obj['suite'])['id']).toBe(suiteId);
		expect(Array.isArray(obj['entries'])).toBe(true);
	});

	test('add-conversation', () => {
		const result = vibeOk(
			['suite', 'add-conversation', '--suite', String(suiteId), '--conversation', String(convId)],
			{ backend: B }
		);
		const entry = asObj(result);
		expect(entry['parent_suite_id']).toBe(suiteId);
		expect(entry['conversation_id']).toBe(convId);
		entryId = id(result) as number;
	});

	test('entries shows added conversation', () => {
		const result = vibeOk(['suite', 'entries', String(suiteId)], { backend: B });
		const entries = asArr(result);
		expect(entries.some((e) => e['conversation_id'] === convId)).toBe(true);
	});

	test('remove-entry', () => {
		if (entryId === undefined) {
			throw new Error('entryId not set — add-conversation test must pass first');
		}
		const result = vibeOk(['suite', 'remove-entry', '--suite', String(suiteId), '--entry', String(entryId)], {
			backend: B
		});
		expect(asObj(result)['deleted']).toBe(true);
	});

	test('entries is empty after remove', () => {
		const result = vibeOk(['suite', 'entries', String(suiteId)], { backend: B });
		expect(asArr(result).length).toBe(0);
	});
});

// ── Results tests ─────────────────────────────────────────────────────────────

describe('results', () => {
	test('runs returns empty array on fresh DB', () => {
		const result = vibeOk(['results', 'runs'], { backend: B });
		// On a fresh DB there are no suite runs
		expect(Array.isArray(result)).toBe(true);
		expect((result as unknown[]).length).toBe(0);
	});

	test('results runs with --suite filter returns empty array', () => {
		const result = vibeOk(['results', 'runs', '--suite', '999'], { backend: B });
		expect(Array.isArray(result)).toBe(true);
	});

	test('session with unknown id returns non-zero exit', () => {
		const r = vibe(['results', 'session', '99999'], { backend: B });
		expect(r.exitCode).not.toBe(0);
	});

	test('suite-run with unknown id returns non-zero exit', () => {
		const r = vibe(['results', 'suite-run', '99999'], { backend: B });
		expect(r.exitCode).not.toBe(0);
	});
});

// ── Transfer tests ────────────────────────────────────────────────────────────

describe('transfer', () => {
	let exportedBundlePath: string;
	let exportConvId: number;

	beforeAll(() => {
		// Create a conversation to export
		const r = vibeOk(['conversation', 'create', '--name', 'Export target conversation'], { backend: B });
		exportConvId = id(r);
		vibeOk(
			[
				'conversation',
				'add-message',
				'--conversation',
				String(exportConvId),
				'--role',
				'user',
				'--content',
				'export me'
			],
			{ backend: B }
		);
		exportedBundlePath = path.join(os.tmpdir(), `vibe-e2e-bundle-${Date.now()}.json`);
	});

	afterAll(() => {
		try {
			vibeOk(['conversation', 'delete', String(exportConvId)], { backend: B });
		} catch {
			/* ignore */
		}
		if (fs.existsSync(exportedBundlePath)) {
			try {
				fs.unlinkSync(exportedBundlePath);
			} catch {
				/* ignore */
			}
		}
	});

	test('export conversations to file', () => {
		const result = vibeOk(['transfer', 'export', '--types', 'conversations', '--out', exportedBundlePath], {
			backend: B
		});
		const obj = asObj(result);
		expect(obj['exported_to']).toBe(exportedBundlePath);
		expect(obj['version']).toBe(1);
		expect(fs.existsSync(exportedBundlePath)).toBe(true);

		const bundle = JSON.parse(fs.readFileSync(exportedBundlePath, 'utf8'));
		expect(bundle.version).toBe(1);
		expect(bundle.data.conversations).toBeDefined();
		const names = (bundle.data.conversations as Array<{ name: string }>).map((c) => c.name);
		expect(names).toContain('Export target conversation');
	});

	test('import dry-run does not error', () => {
		const r = vibe(['transfer', 'import', '--file', exportedBundlePath, '--dry-run'], { backend: B });
		// dry-run: exits 0 and prints analysis
		expect(r.exitCode).toBe(0);
		// JSON output is the analysis report
		const obj = asObj(r.json);
		expect(typeof obj['totals']).toBe('object');
	});
});

// ── Error handling ────────────────────────────────────────────────────────────

describe('error handling', () => {
	test('unknown command exits 1', () => {
		const r = vibe(['notacommand'], { backend: B });
		expect(r.exitCode).toBe(1);
	});

	test('unknown subcommand exits 1', () => {
		const r = vibe(['agent', 'notasubcommand'], { backend: B });
		expect(r.exitCode).toBe(1);
	});

	test('agent create missing required args exits non-zero', () => {
		// missing --name
		const r = vibe(['agent', 'create', '--version', '1.0', '--prompt', 'p'], { backend: B });
		expect(r.exitCode).not.toBe(0);
	});

	test('conversation show with nonexistent id exits non-zero', () => {
		const r = vibe(['conversation', 'show', '99999'], { backend: B });
		expect(r.exitCode).not.toBe(0);
	});

	test('suite add-conversation with missing args exits non-zero', () => {
		const r = vibe(['suite', 'add-conversation', '--suite', '1'], { backend: B });
		expect(r.exitCode).not.toBe(0);
	});
});
