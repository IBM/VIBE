import type { ExecutionSession, SessionMessage } from '../../../lib/api';

/**
 * Calculate execution time in seconds from session timestamps
 */
export function calculateExecutionTime(session: ExecutionSession): number {
	if (!session.started_at || !session.completed_at) return 0;
	return (new Date(session.completed_at).getTime() - new Date(session.started_at).getTime()) / 1000;
}

/**
 * Get the maximum similarity score from session messages
 * Returns { similarity: number, hasSimilarity: boolean }
 */
export function getSimilarityScore(
	sessionId: number | undefined,
	sessionMessages: Map<number, SessionMessage[]>
): { similarity: number; hasSimilarity: boolean } {
	if (!sessionId) {
		return { similarity: 0, hasSimilarity: false };
	}

	const messages = sessionMessages.get(sessionId);
	if (!messages) {
		return { similarity: 0, hasSimilarity: false };
	}

	const assistantMessages = messages.filter((m) => m.role === 'assistant');
	const scoredMessages = assistantMessages.filter(
		(m) => m.similarity_scoring_status === 'completed' && typeof m.similarity_score === 'number'
	);

	if (scoredMessages.length === 0) {
		return { similarity: 0, hasSimilarity: false };
	}

	const similarity = Math.max(...scoredMessages.map((m) => m.similarity_score!));
	return { similarity, hasSimilarity: true };
}

/**
 * Filter sessions by date range
 */
export function filterSessionsByDateRange(
	sessions: ExecutionSession[],
	dateRange: 'all' | '7d' | '30d' | '90d' | 'custom',
	startDate?: Date,
	endDate?: Date
): ExecutionSession[] {
	if (dateRange === 'all') return sessions;

	if (dateRange === 'custom') {
		if (!startDate || !endDate) return sessions;
		return sessions.filter((s) => {
			if (!s.started_at) return false;
			const sessionDate = new Date(s.started_at);
			return sessionDate >= startDate && sessionDate <= endDate;
		});
	}

	const now = new Date();
	let daysBack: number;
	switch (dateRange) {
		case '7d':
			daysBack = 7;
			break;
		case '30d':
			daysBack = 30;
			break;
		case '90d':
			daysBack = 90;
			break;
		default:
			return sessions;
	}

	const startDateThreshold = new Date(now.getTime() - daysBack * 24 * 60 * 60 * 1000);
	return sessions.filter((s) => {
		if (!s.started_at) return false;
		return new Date(s.started_at) >= startDateThreshold;
	});
}

/**
 * Sort sessions by start time (ascending)
 */
export function sortSessionsByTime(sessions: ExecutionSession[]): ExecutionSession[] {
	return [...sessions].sort((a, b) => {
		const aTime = a.started_at ? new Date(a.started_at).getTime() : 0;
		const bTime = b.started_at ? new Date(b.started_at).getTime() : 0;
		return aTime - bTime;
	});
}
