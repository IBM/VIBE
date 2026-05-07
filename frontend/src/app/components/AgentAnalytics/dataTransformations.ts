import type { ExecutionSession, SessionMessage, Conversation } from '../../../lib/api';
import { calculateExecutionTime, getSimilarityScore } from './analyticsUtils';

export interface ChartDataPoint {
	group: string;
	key: Date | string | number;
	value: number;
	runs?: number;
}

interface MetricVisibility {
	showSuccessRate: boolean;
	showExecutionTime: boolean;
	showSimilarityScore: boolean;
}

/**
 * Prepare data for time-based performance chart
 */
export function prepareTimePerformanceData(
	sessions: ExecutionSession[],
	sessionMessages: Map<number, SessionMessage[]>,
	visibility: MetricVisibility
): ChartDataPoint[] {
	const dataByDate = new Map<
		string,
		{
			successRate: number;
			avgExecutionTime: number;
			avgSimilarity: number;
			similarityCount: number;
			count: number;
		}
	>();

	sessions.forEach((session) => {
		if (!session.started_at) {
			return;
		}
		const date = new Date(session.started_at).toISOString().split('T')[0];
		const existing = dataByDate.get(date) || {
			successRate: 0,
			avgExecutionTime: 0,
			avgSimilarity: 0,
			similarityCount: 0,
			count: 0
		};

		const executionTime = calculateExecutionTime(session);
		const { similarity, hasSimilarity } = getSimilarityScore(session.id, sessionMessages);

		dataByDate.set(date, {
			successRate: existing.successRate + (session.success ? 1 : 0),
			avgExecutionTime: existing.avgExecutionTime + executionTime,
			avgSimilarity: existing.avgSimilarity + similarity,
			similarityCount: existing.similarityCount + (hasSimilarity ? 1 : 0),
			count: existing.count + 1
		});
	});

	const result: ChartDataPoint[] = [];
	dataByDate.forEach((stats, dateStr) => {
		const date = new Date(dateStr);
		if (visibility.showSuccessRate) {
			result.push({ group: 'Success rate', key: date, value: (stats.successRate / stats.count) * 100 });
		}
		if (visibility.showExecutionTime && stats.count > 0) {
			result.push({ group: 'Execution time', key: date, value: stats.avgExecutionTime / stats.count });
		}
		if (visibility.showSimilarityScore && stats.similarityCount > 0) {
			result.push({ group: 'Similarity score', key: date, value: stats.avgSimilarity / stats.similarityCount });
		}
	});

	return result;
}

/**
 * Prepare data for experiments-based performance chart
 */
export function prepareExperimentsPerformanceData(
	sessions: ExecutionSession[],
	sessionMessages: Map<number, SessionMessage[]>,
	experimentCount: number,
	visibility: MetricVisibility
): ChartDataPoint[] {
	const actualCount = Math.min(experimentCount, sessions.length);
	const lastNSessions = sessions.slice(-actualCount);
	const result: ChartDataPoint[] = [];
	const startIndex = Math.max(0, sessions.length - actualCount);

	lastNSessions.forEach((session, index) => {
		const experimentNumber = `#${startIndex + index + 1}`;
		const executionTime = calculateExecutionTime(session);
		const { similarity, hasSimilarity } = getSimilarityScore(session.id, sessionMessages);

		if (visibility.showSuccessRate) {
			result.push({ group: 'Success rate', key: experimentNumber, value: session.success ? 100 : 0 });
		}
		if (visibility.showExecutionTime) {
			result.push({ group: 'Execution time', key: experimentNumber, value: executionTime });
		}
		if (visibility.showSimilarityScore && hasSimilarity) {
			result.push({ group: 'Similarity score', key: experimentNumber, value: similarity });
		}
	});

	return result;
}

/**
 * Prepare failure analysis data grouped by conversation
 */
export function prepareFailureAnalysisData(
	sessions: ExecutionSession[],
	conversations: Conversation[]
): ChartDataPoint[] {
	const failuresByConversation = new Map<number, { name: string; failures: number; total: number }>();

	sessions.forEach((session) => {
		const convId = session.conversation_id;
		if (!convId) {
			return;
		}

		const conv = conversations.find((c) => c.id === convId);
		const convName = conv?.name || `#${convId}`;

		const existing = failuresByConversation.get(convId) || { name: convName, failures: 0, total: 0 };
		failuresByConversation.set(convId, {
			name: convName,
			failures: existing.failures + (session.success ? 0 : 1),
			total: existing.total + 1
		});
	});

	return Array.from(failuresByConversation.values())
		.filter((item) => item.failures > 0)
		.sort((a, b) => b.failures - a.failures)
		.slice(0, 10)
		.map((item) => ({
			group: 'Failures',
			key: item.name,
			value: item.failures
		}));
}

/**
 * Prepare conversation difficulty ranking data
 */
export function prepareConversationDifficultyData(
	sessions: ExecutionSession[],
	conversations: Conversation[]
): ChartDataPoint[] {
	const statsByConversation = new Map<number, { name: string; successful: number; total: number }>();

	sessions.forEach((session) => {
		const convId = session.conversation_id;
		if (!convId) {
			return;
		}
		const conv = conversations.find((c) => c.id === convId);
		const convName = conv?.name || `#${convId}`;

		const existing = statsByConversation.get(convId) || { name: convName, successful: 0, total: 0 };
		statsByConversation.set(convId, {
			name: convName,
			successful: existing.successful + (session.success ? 1 : 0),
			total: existing.total + 1
		});
	});

	return Array.from(statsByConversation.values())
		.filter((item) => item.total >= 3)
		.map((item) => ({
			conversation: item.name,
			successRate: (item.successful / item.total) * 100,
			totalRuns: item.total
		}))
		.sort((a, b) => a.successRate - b.successRate)
		.slice(0, 10)
		.map((item) => ({
			group: 'Success rate',
			key: item.conversation,
			value: Math.round(item.successRate)
		}));
}

/**
 * Prepare similarity vs speed scatter plot data
 */
export function prepareSuccessSpeedScatterData(
	sessions: ExecutionSession[],
	sessionMessages: Map<number, SessionMessage[]>,
	conversations: Conversation[]
): ChartDataPoint[] {
	const conversationStats = new Map<
		number,
		{
			name: string;
			totalExecutionTime: number;
			totalSimilarity: number;
			similarityCount: number;
			executionTimeCount: number;
			runCount: number;
		}
	>();

	sessions.forEach((session) => {
		const convId = session.conversation_id;
		if (!convId) {
			return;
		}

		const conv = conversations.find((c) => c.id === convId);
		const convName = conv?.name || `#${convId}`;

		const stats = conversationStats.get(convId) || {
			name: convName,
			totalExecutionTime: 0,
			totalSimilarity: 0,
			similarityCount: 0,
			executionTimeCount: 0,
			runCount: 0
		};

		stats.runCount++;
		const executionTime = calculateExecutionTime(session);
		if (executionTime > 0) {
			stats.totalExecutionTime += executionTime;
			stats.executionTimeCount++;
		}

		const { similarity, hasSimilarity } = getSimilarityScore(session.id, sessionMessages);
		if (hasSimilarity) {
			stats.totalSimilarity += similarity;
			stats.similarityCount++;
		}

		conversationStats.set(convId, stats);
	});

	const result: ChartDataPoint[] = [];
	conversationStats.forEach((stats) => {
		if (stats.executionTimeCount > 0 && stats.similarityCount > 0) {
			const avgExecutionTime = stats.totalExecutionTime / stats.executionTimeCount;
			const avgSimilarity = stats.totalSimilarity / stats.similarityCount;

			result.push({
				group: 'Conversations',
				key: avgExecutionTime,
				value: Math.round(avgSimilarity),
				runs: stats.runCount
			});
		}
	});

	return result;
}

/**
 * Prepare execution time histogram data
 */
export function prepareExecutionTimeHistogramData(sessions: ExecutionSession[]): ChartDataPoint[] {
	const executionTimes: number[] = [];

	sessions.forEach((session) => {
		const executionTime = calculateExecutionTime(session);
		if (executionTime > 0) {
			executionTimes.push(executionTime);
		}
	});

	if (executionTimes.length === 0) {
		return [];
	}

	const min = Math.min(...executionTimes);
	const max = Math.max(...executionTimes);
	const binCount = Math.min(15, Math.ceil(Math.sqrt(executionTimes.length)));
	const binSize = (max - min) / binCount;

	const bins: { range: string; count: number }[] = [];
	for (let i = 0; i < binCount; i++) {
		const binStart = min + i * binSize;
		const binEnd = min + (i + 1) * binSize;
		const count = executionTimes.filter((time) => time >= binStart && time < binEnd).length;
		bins.push({
			range: `${binStart.toFixed(0)}-${binEnd.toFixed(0)}`,
			count
		});
	}

	return bins.map((bin) => ({
		group: 'Frequency',
		key: bin.range,
		value: bin.count
	}));
}

/**
 * Prepare recent performance trends data
 */
export function prepareRecentTrendsData(
	sessions: ExecutionSession[],
	sessionMessages: Map<number, SessionMessage[]>,
	conversations: Conversation[]
): ChartDataPoint[] {
	if (sessions.length === 0) {
		return [];
	}

	const conversationCounts = new Map<number, { name: string; count: number }>();
	sessions.forEach((session) => {
		if (!session.conversation_id) {
			return;
		}
		const conv = conversations.find((c) => c.id === session.conversation_id);
		const convName = conv?.name || `#${session.conversation_id}`;
		const existing = conversationCounts.get(session.conversation_id);
		conversationCounts.set(session.conversation_id, {
			name: convName,
			count: (existing?.count || 0) + 1
		});
	});

	const topConversationIds = Array.from(conversationCounts.entries())
		.sort((a, b) => b[1].count - a[1].count)
		.slice(0, 5)
		.map(([id]) => id);

	if (topConversationIds.length === 0) {
		return [];
	}

	const sortedSessions = [...sessions].sort((a, b) => {
		const aTime = a.started_at ? new Date(a.started_at).getTime() : 0;
		const bTime = b.started_at ? new Date(b.started_at).getTime() : 0;
		return aTime - bTime;
	});

	const result: ChartDataPoint[] = [];

	topConversationIds.forEach((convId) => {
		const convSessions = sortedSessions.filter((s) => s.conversation_id === convId);
		const last15 = convSessions.slice(-15);

		const conv = conversations.find((c) => c.id === convId);
		const convName = conv?.name || `#${convId}`;

		last15.forEach((session, index) => {
			const { similarity } = getSimilarityScore(session.id, sessionMessages);

			// Use relative run position (01 to 15) so x-axis ordering is consistent across conversations
			const runPosition = index + 1;
			result.push({
				group: convName,
				key: `Run ${String(runPosition).padStart(2, '0')}`,
				value: Math.round(similarity)
			});
		});
	});

	return result;
}
