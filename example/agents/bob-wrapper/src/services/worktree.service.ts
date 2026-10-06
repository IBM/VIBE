import { execFile } from 'child_process';
import { promises as fs } from 'fs';
import path from 'path';
import { promisify } from 'util';
import { v4 as uuidv4 } from 'uuid';
import type { BobApiMeta, ChatMode, ConversationInfo } from '../types/bob.types';

const execFileAsync = promisify(execFile);

// ─── Paths ──────────────────────────────────────────────────────────────────

/** Root of the target git repo, set via WORKSPACE_REPO env var */
export function repoRoot(): string {
	const r = process.env.WORKSPACE_REPO;
	if (!r) throw new Error('WORKSPACE_REPO environment variable is not set');
	return r;
}

export function worktreesDir(): string {
	return path.join(repoRoot(), '.worktrees');
}

export function worktreePath(conversationId: string): string {
	return path.join(worktreesDir(), conversationId);
}

export function metaFilePath(conversationId: string): string {
	return path.join(worktreePath(conversationId), '.bobapi.json');
}

// ─── Meta file R/W ──────────────────────────────────────────────────────────

export async function readMeta(conversationId: string): Promise<BobApiMeta> {
	const raw = await fs.readFile(metaFilePath(conversationId), 'utf8');
	return JSON.parse(raw) as BobApiMeta;
}

export async function writeMeta(meta: BobApiMeta): Promise<void> {
	await fs.writeFile(metaFilePath(meta.conversationId), JSON.stringify(meta, null, 2), 'utf8');
}

// ─── Worktree lifecycle ──────────────────────────────────────────────────────

export async function createWorktree(mode: ChatMode = 'ask'): Promise<BobApiMeta> {
	const conversationId = uuidv4();
	const branch = `conv/${conversationId}`;
	const wdir = worktreePath(conversationId);

	// Ensure .worktrees/ exists
	await fs.mkdir(worktreesDir(), { recursive: true });

	await execFileAsync('git', ['worktree', 'add', wdir, '-b', branch], { cwd: repoRoot() });

	const meta: BobApiMeta = {
		conversationId,
		sessionId: null,
		branch,
		createdAt: new Date().toISOString(),
		mode
	};

	await writeMeta(meta);
	return meta;
}

export async function removeWorktree(conversationId: string): Promise<void> {
	const wdir = worktreePath(conversationId);
	let meta: BobApiMeta | null = null;

	try {
		meta = await readMeta(conversationId);
	} catch {
		// best-effort: proceed even if meta is unreadable
	}

	await execFileAsync('git', ['worktree', 'remove', wdir, '--force'], {
		cwd: repoRoot()
	});

	if (meta) {
		try {
			await execFileAsync('git', ['branch', '-D', meta.branch], {
				cwd: repoRoot()
			});
		} catch {
			// branch may already be gone
		}
	}
}

export async function listWorktrees(): Promise<ConversationInfo[]> {
	const dir = worktreesDir();

	try {
		await fs.access(dir);
	} catch {
		return [];
	}

	const entries = await fs.readdir(dir, { withFileTypes: true });
	const results: ConversationInfo[] = [];

	for (const entry of entries) {
		if (!entry.isDirectory()) continue;
		try {
			const meta = await readMeta(entry.name);
			results.push({
				conversationId: meta.conversationId,
				sessionId: meta.sessionId,
				branch: meta.branch,
				createdAt: meta.createdAt,
				mode: meta.mode
			});
		} catch {
			// skip corrupted / incomplete worktrees
		}
	}

	return results;
}

export async function worktreeExists(conversationId: string): Promise<boolean> {
	try {
		await fs.access(worktreePath(conversationId));
		return true;
	} catch {
		return false;
	}
}
