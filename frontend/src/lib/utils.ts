import type { Job, TestResult, SessionMessage, Agent, ExecutionSession } from './api';
import { api } from './api';
export { tokenizePath, traverseByTokens, extractByPath } from '@ibm-vibe/utils';

/**
 * Get the primary ID for a job (session_id takes precedence over result_id)
 */
export const getJobId = (job: Job): number | null => {
	return job.session_id ?? job.result_id ?? null;
};

/**
 * Check if similarity scoring is currently active
 */
export const isScoringActive = (scoringStatus: string | null | undefined): boolean => {
	return scoringStatus === 'pending' || scoringStatus === 'running';
};

/**
 * Get Carbon Design System tag type based on status
 */
export const getStatusTagType = (status: string): 'green' | 'blue' | 'red' | 'purple' | 'gray' | 'cool-gray' => {
	switch (status.toLowerCase()) {
		case 'completed':
			return 'green';
		case 'running':
			return 'blue';
		case 'failed':
			return 'red';
		case 'pending':
			return 'purple';
		case 'queued':
			return 'purple';
		default:
			return 'gray';
	}
};

/**
 * Format token usage for display
 */
export const formatTokenUsage = (result: TestResult | null): string => {
	if (!result || (!result.input_tokens && !result.output_tokens)) {
		return '-';
	}

	const inputTokens = result.input_tokens || 0;
	const outputTokens = result.output_tokens || 0;
	const totalTokens = inputTokens + outputTokens;

	if (totalTokens === 0) {
		return '-';
	}

	if (inputTokens > 0 && outputTokens > 0) {
		return `${inputTokens} + ${outputTokens} = ${totalTokens}`;
	}

	return totalTokens.toString();
};

/**
 * Format token usage with detailed breakdown for modals
 */
export const formatTokenUsageDetailed = (result: TestResult | null): string => {
	if (!result || (!result.input_tokens && !result.output_tokens)) {
		return '';
	}

	const inputTokens = result.input_tokens || 0;
	const outputTokens = result.output_tokens || 0;
	const totalTokens = inputTokens + outputTokens;

	if (totalTokens === 0) {
		return '';
	}

	const parts: string[] = [];

	if (inputTokens > 0) {
		parts.push(`Input: ${inputTokens.toLocaleString()}`);
	}

	if (outputTokens > 0) {
		parts.push(`Output: ${outputTokens.toLocaleString()}`);
	}

	if (parts.length > 1) {
		parts.push(`Total: ${totalTokens.toLocaleString()}`);
	}

	return parts.join(' | ');
};

/**
 * Parse message metadata safely
 */
export const parseMessageMetadata = (message: SessionMessage): Record<string, unknown> => {
	try {
		return message.metadata ? JSON.parse(message.metadata) : {};
	} catch {
		return {};
	}
};

/**
 * Filter messages by role
 */
export const filterMessagesByRole = (messages: SessionMessage[], role: string): SessionMessage[] => {
	return messages.filter((m) => m.role === role);
};

/**
 * Helper to safely get a number from metadata
 */
const getNumberFromMetadata = (metadata: Record<string, unknown>, key: string): number => {
	const value = metadata[key];
	return typeof value === 'number' ? value : 0;
};

/**
 * Calculate total tokens from a message
 */
export const calculateMessageTokens = (message: SessionMessage): number => {
	const metadata = parseMessageMetadata(message);
	return getNumberFromMetadata(metadata, 'input_tokens') + getNumberFromMetadata(metadata, 'output_tokens');
};

/**
 * Calculate total tokens from multiple messages
 */
export const calculateTotalTokens = (messages: SessionMessage[]): { input: number; output: number; total: number } => {
	const totals = messages.reduce(
		(acc, message) => {
			const metadata = parseMessageMetadata(message);
			return {
				input: acc.input + getNumberFromMetadata(metadata, 'input_tokens'),
				output: acc.output + getNumberFromMetadata(metadata, 'output_tokens')
			};
		},
		{ input: 0, output: 0 }
	);

	return {
		input: totals.input,
		output: totals.output,
		total: totals.input + totals.output
	};
};

/**
 * Calculate response time from message metadata
 */
export const calculateResponseTime = (
	message: SessionMessage,
	fallbackDuration?: number,
	totalAssistantMessages?: number
): number => {
	const metadata = parseMessageMetadata(message);

	const executionTime = getNumberFromMetadata(metadata, 'execution_time_ms');
	if (executionTime > 0) {
		return executionTime;
	}

	// Fallback: estimate response time for assistant messages
	if (message.role === 'assistant' && fallbackDuration && totalAssistantMessages) {
		return fallbackDuration / totalAssistantMessages;
	}

	return 0;
};

/**
 * Find the first scored assistant message
 */
export const findScoredAssistantMessage = (messages: SessionMessage[]): SessionMessage | null => {
	const assistantMessages = filterMessagesByRole(messages, 'assistant');
	return (
		assistantMessages.find(
			(m) => m.similarity_scoring_status === 'completed' && typeof m.similarity_score === 'number'
		) || null
	);
};

/**
 * Convert an Agent object to form data format for AgentFormModal
 */
export const agentToFormData = (agent: Agent | null | undefined): Record<string, string> => {
	if (!agent) {
		return {};
	}

	// Start with top-level fields
	const data: Record<string, string> = {
		'agent-name': agent.name || '',
		'agent-version': agent.version || '',
		'agent-prompt': agent.prompt || '',
		'agent-settings': agent.settings || ''
	};

	// Parse settings JSON and map to form fields
	try {
		const settings = agent.settings ? JSON.parse(agent.settings) : {};
		if (settings.type) data['agent-type'] = settings.type;

		// CrewAI fields
		if (settings.type === 'crew_ai' || settings.type === 'crewai') {
			data['agent-model'] = settings.model ?? '';
			data['agent-temperature'] = settings.temperature?.toString() ?? '';
			data['agent-max-tokens'] = settings.max_tokens?.toString() ?? '';
			data['agent-ollama-url'] = settings.base_url ?? '';
			data['agent-role'] = settings.role ?? '';
			data['agent-goal'] = settings.goal ?? '';
			data['agent-backstory'] = settings.backstory ?? '';
		}

		// External API fields
		if (settings.type === 'external_api') {
			data['agent-api-endpoint'] = settings.api_endpoint ?? '';
			data['agent-api-key'] = settings.api_key ?? '';
			data['agent-http-method'] = settings.http_method ?? 'POST';
			if (settings.headers !== undefined) {
				data['agent-headers'] =
					typeof settings.headers === 'string' ? settings.headers : JSON.stringify(settings.headers);
			}
			if (settings.token_mapping !== undefined) {
				data['agent-token-mapping'] =
					typeof settings.token_mapping === 'string'
						? settings.token_mapping
						: JSON.stringify(settings.token_mapping);
			}
		}
	} catch {
		// If settings are invalid, ignore and use defaults
	}

	return data;
};

/**
 * Load conversations by their IDs and return a map of id -> { name, id }
 * Uses Promise.all for parallel loading
 */
export const loadConversationsByIds = async (
	conversationIds: number[]
): Promise<Map<number, { name: string; id: number }>> => {
	const conversationsMap = new Map<number, { name: string; id: number }>();

	if (conversationIds.length === 0) {
		return conversationsMap;
	}

	const conversationPromises = conversationIds.map(async (convId) => {
		try {
			const conv = await api.getConversationById(convId);
			return [convId, { name: conv.name, id: convId }] as [number, { name: string; id: number }];
		} catch {
			return null;
		}
	});

	const results = await Promise.all(conversationPromises);
	results.forEach((result) => {
		if (result) {
			conversationsMap.set(result[0], result[1]);
		}
	});

	return conversationsMap;
};

/**
 * Load session messages for multiple sessions and return a map of session_id -> messages[]
 * Uses Promise.all for parallel loading
 */
export const loadSessionMessages = async (sessions: ExecutionSession[]): Promise<Map<number, SessionMessage[]>> => {
	const messagesMap = new Map<number, SessionMessage[]>();

	if (sessions.length === 0) {
		return messagesMap;
	}

	const messagePromises = sessions.map(async (session) => {
		if (session.id) {
			try {
				const messages = await api.getSessionTranscript(session.id);
				return [session.id, messages] as [number, SessionMessage[]];
			} catch {
				return [session.id, []] as [number, SessionMessage[]];
			}
		}
		return null;
	});

	const results = await Promise.all(messagePromises);
	results.forEach((result) => {
		if (result) {
			messagesMap.set(result[0], result[1]);
		}
	});

	return messagesMap;
};

/**
 * Calculate session statistics from a list of execution sessions
 */
export const calculateSessionStats = (
	sessions: ExecutionSession[]
): {
	totalRuns: number;
	successRate: number;
	avgDuration: number;
	lastRun: string | null;
} => {
	if (sessions.length === 0) {
		return {
			totalRuns: 0,
			successRate: 0,
			avgDuration: 0,
			lastRun: null
		};
	}

	const totalRuns = sessions.length;
	const successfulRuns = sessions.filter((s) => s.success).length;
	const successRate = totalRuns > 0 ? (successfulRuns / totalRuns) * 100 : 0;

	// Calculate average duration
	const sessionsWithTime = sessions.filter((s) => s.started_at && s.completed_at);
	const avgDuration =
		sessionsWithTime.length > 0
			? sessionsWithTime.reduce((sum, s) => {
					const duration = new Date(s.completed_at!).getTime() - new Date(s.started_at!).getTime();
					return sum + duration;
				}, 0) / sessionsWithTime.length
			: 0;

	// Get last run timestamp
	const lastRun = sessions.length > 0 && sessions[0].started_at ? sessions[0].started_at : null;

	return {
		totalRuns,
		successRate,
		avgDuration: avgDuration / 1000, // Convert to seconds
		lastRun
	};
};
