import {
	getConversationById,
	getExecutionSessionById,
	getSessionMessages,
	updateExecutionSession,
	countUserTurnsUpTo,
	getConversationTurnTarget
} from '../db/queries';
import type { ExecutionSession, SessionMessage } from '@ibm-vibe/types';

const shouldLog = process.env.NODE_ENV !== 'test';
const logWarn = (...args: unknown[]) => {
	/* istanbul ignore next */
	if (shouldLog) console.warn(...args);
};

export function parseSessionMetadata(metadata?: string | null): any {
	if (!metadata) {
		return {};
	}
	try {
		return JSON.parse(metadata);
	} catch {
		return {};
	}
}

export function serializeSessionMetadata(meta: any): string {
	try {
		return JSON.stringify(meta ?? {});
	} catch {
		return '{}';
	}
}

export function mergeMetadata(existing: string | null | undefined, patch: Record<string, unknown>): string {
	const base = parseSessionMetadata(existing);
	const merged = { ...base, ...patch };

	return serializeSessionMetadata(merged);
}

export async function updateSessionMetadata(sessionId: number, patch: Record<string, unknown>): Promise<void> {
	const session = await getExecutionSessionById(sessionId);
	if (!session) {
		logWarn(`updateSessionMetadata: session ${sessionId} not found; metadata patch ignored`);
		return;
	}
	const metadata = mergeMetadata(session.metadata, patch);
	await updateExecutionSession(sessionId, { metadata });
}

export function computeSessionDurationMs(session: ExecutionSession): number {
	if (!session.started_at) {
		return 0;
	}
	const start = new Date(session.started_at).getTime();
	const end = session.completed_at ? new Date(session.completed_at).getTime() : start;
	if (isNaN(start) || isNaN(end)) {
		return 0;
	}
	return Math.max(0, end - start);
}

export function extractTokenUsageFromSession(session: ExecutionSession): {
	input_tokens?: number;
	output_tokens?: number;
} {
	const meta = parseSessionMetadata(session.metadata);
	const tokens: { input_tokens?: number; output_tokens?: number } = {};
	if (typeof meta.input_tokens === 'number') {
		tokens.input_tokens = meta.input_tokens;
	}
	if (typeof meta.output_tokens === 'number') {
		tokens.output_tokens = meta.output_tokens;
	}
	return tokens;
}

export function getAssistantOutputFromMessages(messages: SessionMessage[]): string | undefined {
	const assistant = messages.find((m) => m.role === 'assistant');
	return assistant?.content;
}

export async function getSessionOutputAndExpected(
	sessionId: number
): Promise<{ output?: string; expected?: string } | undefined> {
	const session = await getExecutionSessionById(sessionId);
	if (!session) {
		return undefined;
	}
	const [conversation, messages] = await Promise.all([
		getConversationById(session.conversation_id),
		getSessionMessages(sessionId)
	]);
	const output = getAssistantOutputFromMessages(messages);
	// Determine the first assistant reply's matching user turn index (k)
	const assistant = messages.find((m) => m.role === 'assistant');
	if (!assistant || !conversation) {
		return { output, expected: undefined };
	}
	const k = countUserTurnsUpTo(sessionId, assistant.sequence);
	const target = getConversationTurnTarget(conversation.id!, k);
	const expected = target?.target_reply || undefined;
	return { output, expected };
}
