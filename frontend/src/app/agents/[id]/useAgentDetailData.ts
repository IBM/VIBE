import { useCallback, useEffect, useState } from 'react';
import { api, type Agent, type ExecutionSession, type SessionMessage } from '../../../lib/api';
import { loadConversationsByIds, loadSessionMessages, calculateSessionStats } from '../../../lib/utils';
import {
	calculateExecutionTime,
	getSimilarityScore,
	sortSessionsByTime
} from '../../components/AgentAnalytics/analyticsUtils';

export type AgentRequestTemplateConfig = {
	id: number;
	name: string;
	body: string;
	is_default?: number;
	capabilities?: string | Record<string, unknown> | null;
};

export type AgentResponseMapConfig = {
	id: number;
	name: string;
	spec: string;
	is_default?: number;
	capabilities?: string | Record<string, unknown> | null;
};

type AgentStats = {
	totalRuns: number;
	successRate: number;
	avgExecutionTime: number;
	avgSimilarity: number | null;
	lastRun: string | null;
	trends: {
		successRate: number;
		similarity: number | null;
		executionTime: number | null;
	};
};

const EMPTY_STATS: AgentStats = {
	totalRuns: 0,
	successRate: 0,
	avgExecutionTime: 0,
	avgSimilarity: null,
	lastRun: null,
	trends: {
		successRate: 0,
		similarity: null,
		executionTime: null
	}
};

export function useAgentDetailData(agentId: number | null) {
	const [agent, setAgent] = useState<Agent | null>(null);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);
	const [recentSessions, setRecentSessions] = useState<ExecutionSession[]>([]);
	const [allSessions, setAllSessions] = useState<ExecutionSession[]>([]);
	const [conversations, setConversations] = useState<Map<number, { name: string; id: number }>>(new Map());
	const [sessionMessages, setSessionMessages] = useState<Map<number, SessionMessage[]>>(new Map());
	const [stats, setStats] = useState<AgentStats>(EMPTY_STATS);
	const [requestTemplates, setRequestTemplates] = useState<AgentRequestTemplateConfig[]>([]);
	const [responseMaps, setResponseMaps] = useState<AgentResponseMapConfig[]>([]);

	const reload = useCallback(async () => {
		if (!agentId || Number.isNaN(agentId)) {
			setError('Invalid agent id');
			setLoading(false);
			return;
		}

		try {
			setLoading(true);
			setError(null);
			const agentData = await api.getAgentById(agentId);
			setAgent(agentData);

			// Load recent sessions for this agent (limited to 10 for display)
			const recentSessionsData = await api.getExecutionSessions({ agent_id: agentId, limit: 10, offset: 0 });
			setRecentSessions(recentSessionsData.data);

			// Load conversations for the sessions
			const conversationIds = Array.from(
				new Set(
					recentSessionsData.data.map((s) => s.conversation_id).filter((id) => id !== undefined) as number[]
				)
			);
			const conversationsMap = await loadConversationsByIds(conversationIds);
			setConversations(conversationsMap);

			// Load session messages for accurate status and similarity score calculation
			const messagesMap = await loadSessionMessages(recentSessionsData.data);
			setSessionMessages(messagesMap);

			// Load all sessions for stats calculation and analytics
			const allSessionsData = await api.getExecutionSessions({ agent_id: agentId, limit: 1000, offset: 0 });
			setAllSessions(allSessionsData.data);

			// Load messages for all sessions for similarity calculation
			const allMessagesMap = await loadSessionMessages(allSessionsData.data);
			setSessionMessages(allMessagesMap);

			// Calculate stats from all sessions
			const calculatedStats = calculateSessionStats(allSessionsData.data);

			// Calculate performance metrics and trends
			const sorted = sortSessionsByTime(allSessionsData.data);
			const midpoint = Math.floor(sorted.length / 2);
			const firstHalf = sorted.slice(0, midpoint);
			const secondHalf = sorted.slice(midpoint);

			const calculateMetrics = (sessions: typeof sorted) => {
				let successCount = 0;
				let totalSimilarity = 0;
				let similarityCount = 0;
				let totalExecutionTime = 0;
				let executionTimeCount = 0;

				sessions.forEach((session) => {
					if (session.success) {
						successCount++;
					}

					const execTime = calculateExecutionTime(session);
					if (execTime > 0) {
						totalExecutionTime += execTime;
						executionTimeCount++;
					}

					const { similarity, hasSimilarity } = getSimilarityScore(session.id, allMessagesMap);
					if (hasSimilarity) {
						totalSimilarity += similarity;
						similarityCount++;
					}
				});

				return {
					successRate: sessions.length > 0 ? (successCount / sessions.length) * 100 : 0,
					avgSimilarity: similarityCount > 0 ? totalSimilarity / similarityCount : null,
					avgExecutionTime: executionTimeCount > 0 ? totalExecutionTime / executionTimeCount : null
				};
			};

			const overall = calculateMetrics(sorted);
			const first = firstHalf.length > 0 ? calculateMetrics(firstHalf) : overall;
			const second = secondHalf.length > 0 ? calculateMetrics(secondHalf) : overall;

			setStats({
				totalRuns: allSessionsData.total,
				successRate: overall.successRate,
				avgExecutionTime: overall.avgExecutionTime ? overall.avgExecutionTime * 1000 : 0,
				avgSimilarity: overall.avgSimilarity,
				lastRun: calculatedStats.lastRun,
				trends: {
					successRate: second.successRate - first.successRate,
					similarity:
						overall.avgSimilarity && first.avgSimilarity && second.avgSimilarity
							? second.avgSimilarity - first.avgSimilarity
							: null,
					executionTime:
						overall.avgExecutionTime && first.avgExecutionTime && second.avgExecutionTime
							? second.avgExecutionTime - first.avgExecutionTime
							: null
				}
			});

			// Load communication configs
			try {
				const [tpls, maps] = await Promise.all([
					api.getAgentRequestTemplates(agentId),
					api.getAgentResponseMaps(agentId)
				]);
				setRequestTemplates(tpls || []);
				setResponseMaps(maps || []);
			} catch {
				// Ignore communication load errors.
			}
		} catch (err) {
			setError(err instanceof Error ? err.message : 'Failed to load agent');
		} finally {
			setLoading(false);
		}
	}, [agentId]);

	useEffect(() => {
		void reload();
	}, [reload]);

	return {
		agent,
		loading,
		error,
		recentSessions,
		allSessions,
		conversations,
		sessionMessages,
		stats,
		requestTemplates,
		responseMaps,
		setRequestTemplates,
		setResponseMaps,
		reload
	};
}
