import type { BobApiMeta, ChatMode } from '../types/bob.types';
import { createWorktree, readMeta, worktreeExists, writeMeta } from './worktree.service';

/**
 * Resolves a conversationId to its BobApiMeta.
 * If conversationId is absent, creates a new worktree.
 * Throws if the conversationId is provided but the worktree does not exist.
 */
export async function resolveConversation(
	conversationId: string | undefined,
	mode: ChatMode = 'ask'
): Promise<BobApiMeta> {
	if (!conversationId) {
		return createWorktree(mode);
	}

	const exists = await worktreeExists(conversationId);
	if (!exists) {
		throw Object.assign(new Error(`Conversation not found: ${conversationId}`), {
			statusCode: 404
		});
	}

	return readMeta(conversationId);
}

/**
 * Persists the BOB session_id back into the conversation's .bobapi.json.
 * Called once after the init event is received on turn 1.
 */
export async function persistSessionId(conversationId: string, sessionId: string): Promise<void> {
	const meta = await readMeta(conversationId);
	meta.sessionId = sessionId;
	await writeMeta(meta);
}
