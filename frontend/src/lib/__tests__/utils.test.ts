/* eslint-disable @typescript-eslint/no-explicit-any */
import {
	getJobId,
	isScoringActive,
	getStatusTagType,
	formatTokenUsage,
	formatTokenUsageDetailed,
	parseMessageMetadata,
	filterMessagesByRole,
	calculateMessageTokens,
	calculateTotalTokens,
	calculateResponseTime,
	findScoredAssistantMessage,
	agentToFormData,
	loadConversationsByIds,
	loadSessionMessages,
	calculateSessionStats,
	tokenizePath,
	traverseByTokens,
	extractByPath
} from '../utils';
import { api } from '../api';
import type { Job, TestResult, SessionMessage, Agent, ExecutionSession } from '../api';

// Mock the api module
jest.mock('../api', () => ({
	api: {
		getConversationById: jest.fn(),
		getSessionTranscript: jest.fn()
	}
}));

describe('utils', () => {
	describe('getJobId', () => {
		it('returns session_id when present', () => {
			const job: Job = { session_id: 123, result_id: 456 } as any;
			expect(getJobId(job)).toBe(123);
		});

		it('returns result_id when session_id is not present', () => {
			const job: Job = { result_id: 456 } as any;
			expect(getJobId(job)).toBe(456);
		});

		it('returns null when neither is present', () => {
			const job: Job = {} as any;
			expect(getJobId(job)).toBeNull();
		});

		it('prefers session_id over result_id', () => {
			const job: Job = { session_id: 123, result_id: 456 } as any;
			expect(getJobId(job)).toBe(123);
		});
	});

	describe('isScoringActive', () => {
		it('returns true for pending status', () => {
			expect(isScoringActive('pending')).toBe(true);
		});

		it('returns true for running status', () => {
			expect(isScoringActive('running')).toBe(true);
		});

		it('returns false for completed status', () => {
			expect(isScoringActive('completed')).toBe(false);
		});

		it('returns false for failed status', () => {
			expect(isScoringActive('failed')).toBe(false);
		});

		it('returns false for null', () => {
			expect(isScoringActive(null)).toBe(false);
		});

		it('returns false for undefined', () => {
			expect(isScoringActive(undefined)).toBe(false);
		});
	});

	describe('getStatusTagType', () => {
		it('returns green for completed', () => {
			expect(getStatusTagType('completed')).toBe('green');
		});

		it('returns blue for running', () => {
			expect(getStatusTagType('running')).toBe('blue');
		});

		it('returns red for failed', () => {
			expect(getStatusTagType('failed')).toBe('red');
		});

		it('returns purple for pending', () => {
			expect(getStatusTagType('pending')).toBe('purple');
		});

		it('returns purple for queued', () => {
			expect(getStatusTagType('queued')).toBe('purple');
		});

		it('returns gray for unknown status', () => {
			expect(getStatusTagType('unknown')).toBe('gray');
		});

		it('is case insensitive', () => {
			expect(getStatusTagType('COMPLETED')).toBe('green');
			expect(getStatusTagType('Running')).toBe('blue');
		});
	});

	describe('formatTokenUsage', () => {
		it('formats with both input and output tokens', () => {
			const result: TestResult = { input_tokens: 100, output_tokens: 50 } as any;
			expect(formatTokenUsage(result)).toBe('100 + 50 = 150');
		});

		it('returns dash for null result', () => {
			expect(formatTokenUsage(null)).toBe('-');
		});

		it('returns dash when no tokens', () => {
			const result: TestResult = {} as any;
			expect(formatTokenUsage(result)).toBe('-');
		});

		it('returns total when only input tokens', () => {
			const result: TestResult = { input_tokens: 100 } as any;
			expect(formatTokenUsage(result)).toBe('100');
		});

		it('returns total when only output tokens', () => {
			const result: TestResult = { output_tokens: 50 } as any;
			expect(formatTokenUsage(result)).toBe('50');
		});

		it('returns dash when tokens are zero', () => {
			const result: TestResult = { input_tokens: 0, output_tokens: 0 } as any;
			expect(formatTokenUsage(result)).toBe('-');
		});
	});

	describe('formatTokenUsageDetailed', () => {
		it('formats with both input and output tokens', () => {
			const result: TestResult = { input_tokens: 1000, output_tokens: 500 } as any;
			expect(formatTokenUsageDetailed(result)).toBe('Input: 1,000 | Output: 500 | Total: 1,500');
		});

		it('returns empty string for null result', () => {
			expect(formatTokenUsageDetailed(null)).toBe('');
		});

		it('formats with only input tokens', () => {
			const result: TestResult = { input_tokens: 1000 } as any;
			expect(formatTokenUsageDetailed(result)).toBe('Input: 1,000');
		});

		it('formats with only output tokens', () => {
			const result: TestResult = { output_tokens: 500 } as any;
			expect(formatTokenUsageDetailed(result)).toBe('Output: 500');
		});

		it('returns empty string when tokens are zero', () => {
			const result: TestResult = { input_tokens: 0, output_tokens: 0 } as any;
			expect(formatTokenUsageDetailed(result)).toBe('');
		});
	});

	describe('parseMessageMetadata', () => {
		it('parses valid JSON metadata', () => {
			const message: SessionMessage = { metadata: '{"key": "value"}' } as any;
			expect(parseMessageMetadata(message)).toEqual({ key: 'value' });
		});

		it('returns empty object for null metadata', () => {
			const message: SessionMessage = { metadata: null } as any;
			expect(parseMessageMetadata(message)).toEqual({});
		});

		it('returns empty object for undefined metadata', () => {
			const message: SessionMessage = {} as any;
			expect(parseMessageMetadata(message)).toEqual({});
		});

		it('returns empty object for invalid JSON', () => {
			const message: SessionMessage = { metadata: 'invalid json' } as any;
			expect(parseMessageMetadata(message)).toEqual({});
		});
	});

	describe('filterMessagesByRole', () => {
		const messages: SessionMessage[] = [
			{ id: 1, role: 'user' } as any,
			{ id: 2, role: 'assistant' } as any,
			{ id: 3, role: 'user' } as any,
			{ id: 4, role: 'system' } as any
		];

		it('filters messages by role', () => {
			const userMessages = filterMessagesByRole(messages, 'user');
			expect(userMessages).toHaveLength(2);
			expect(userMessages[0].id).toBe(1);
			expect(userMessages[1].id).toBe(3);
		});

		it('returns empty array when no matches', () => {
			const adminMessages = filterMessagesByRole(messages, 'admin');
			expect(adminMessages).toEqual([]);
		});
	});

	describe('calculateMessageTokens', () => {
		it('calculates total tokens from metadata', () => {
			const message: SessionMessage = {
				metadata: JSON.stringify({ input_tokens: 100, output_tokens: 50 })
			} as any;
			expect(calculateMessageTokens(message)).toBe(150);
		});

		it('returns 0 when no token data', () => {
			const message: SessionMessage = { metadata: '{}' } as any;
			expect(calculateMessageTokens(message)).toBe(0);
		});

		it('handles non-number values', () => {
			const message: SessionMessage = {
				metadata: JSON.stringify({ input_tokens: 'invalid', output_tokens: 50 })
			} as any;
			expect(calculateMessageTokens(message)).toBe(50);
		});
	});

	describe('calculateTotalTokens', () => {
		it('calculates totals from multiple messages', () => {
			const messages: SessionMessage[] = [
				{ metadata: JSON.stringify({ input_tokens: 100, output_tokens: 50 }) } as any,
				{ metadata: JSON.stringify({ input_tokens: 200, output_tokens: 100 }) } as any
			];
			const totals = calculateTotalTokens(messages);
			expect(totals).toEqual({ input: 300, output: 150, total: 450 });
		});

		it('returns zeros for empty array', () => {
			const totals = calculateTotalTokens([]);
			expect(totals).toEqual({ input: 0, output: 0, total: 0 });
		});
	});

	describe('calculateResponseTime', () => {
		it('returns execution_time_ms from metadata', () => {
			const message: SessionMessage = {
				metadata: JSON.stringify({ execution_time_ms: 1500 })
			} as any;
			expect(calculateResponseTime(message)).toBe(1500);
		});

		it('estimates time for assistant messages with fallback', () => {
			const message: SessionMessage = { role: 'assistant', metadata: '{}' } as any;
			expect(calculateResponseTime(message, 3000, 3)).toBe(1000);
		});

		it('returns 0 when no data available', () => {
			const message: SessionMessage = { metadata: '{}' } as any;
			expect(calculateResponseTime(message)).toBe(0);
		});
	});

	describe('findScoredAssistantMessage', () => {
		const messages: SessionMessage[] = [
			{ id: 1, role: 'user' } as any,
			{ id: 2, role: 'assistant', similarity_scoring_status: 'pending' } as any,
			{ id: 3, role: 'assistant', similarity_scoring_status: 'completed', similarity_score: 0.9 } as any,
			{ id: 4, role: 'assistant', similarity_scoring_status: 'completed', similarity_score: 0.8 } as any
		];

		it('finds first scored assistant message', () => {
			const scored = findScoredAssistantMessage(messages);
			expect(scored?.id).toBe(3);
		});

		it('returns null when no scored messages', () => {
			const unscored: SessionMessage[] = [
				{ id: 1, role: 'assistant', similarity_scoring_status: 'pending' } as any
			];
			expect(findScoredAssistantMessage(unscored)).toBeNull();
		});

		it('returns null for empty array', () => {
			expect(findScoredAssistantMessage([])).toBeNull();
		});
	});

	describe('agentToFormData', () => {
		it('converts agent to form data', () => {
			const agent: Agent = {
				name: 'Test Agent',
				version: '1.0',
				prompt: 'Test prompt',
				settings: '{}'
			} as any;
			const formData = agentToFormData(agent);
			expect(formData['agent-name']).toBe('Test Agent');
			expect(formData['agent-version']).toBe('1.0');
			expect(formData['agent-prompt']).toBe('Test prompt');
		});

		it('returns empty object for null agent', () => {
			expect(agentToFormData(null)).toEqual({});
		});

		it('parses CrewAI settings', () => {
			const agent: Agent = {
				name: 'Test',
				version: '1.0',
				prompt: '',
				settings: JSON.stringify({
					type: 'crew_ai',
					model: 'gpt-4',
					temperature: 0.7,
					role: 'assistant'
				})
			} as any;
			const formData = agentToFormData(agent);
			expect(formData['agent-type']).toBe('crew_ai');
			expect(formData['agent-model']).toBe('gpt-4');
			expect(formData['agent-temperature']).toBe('0.7');
			expect(formData['agent-role']).toBe('assistant');
		});

		it('parses external API settings', () => {
			const agent: Agent = {
				name: 'Test',
				version: '1.0',
				prompt: '',
				settings: JSON.stringify({
					type: 'external_api',
					api_endpoint: 'https://api.example.com',
					http_method: 'POST'
				})
			} as any;
			const formData = agentToFormData(agent);
			expect(formData['agent-type']).toBe('external_api');
			expect(formData['agent-api-endpoint']).toBe('https://api.example.com');
			expect(formData['agent-http-method']).toBe('POST');
		});

		it('handles invalid settings JSON gracefully', () => {
			const agent: Agent = {
				name: 'Test',
				version: '1.0',
				prompt: '',
				settings: 'invalid json'
			} as any;
			const formData = agentToFormData(agent);
			expect(formData['agent-name']).toBe('Test');
		});
	});

	describe('loadConversationsByIds', () => {
		beforeEach(() => {
			jest.clearAllMocks();
		});

		it('loads conversations by IDs', async () => {
			(api.getConversationById as jest.Mock)
				.mockResolvedValueOnce({ id: 1, name: 'Conv 1' })
				.mockResolvedValueOnce({ id: 2, name: 'Conv 2' });

			const result = await loadConversationsByIds([1, 2]);
			expect(result.size).toBe(2);
			expect(result.get(1)).toEqual({ name: 'Conv 1', id: 1 });
			expect(result.get(2)).toEqual({ name: 'Conv 2', id: 2 });
		});

		it('returns empty map for empty array', async () => {
			const result = await loadConversationsByIds([]);
			expect(result.size).toBe(0);
		});

		it('handles errors gracefully', async () => {
			(api.getConversationById as jest.Mock)
				.mockResolvedValueOnce({ id: 1, name: 'Conv 1' })
				.mockRejectedValueOnce(new Error('Failed'));

			const result = await loadConversationsByIds([1, 2]);
			expect(result.size).toBe(1);
			expect(result.get(1)).toEqual({ name: 'Conv 1', id: 1 });
		});
	});

	describe('loadSessionMessages', () => {
		beforeEach(() => {
			jest.clearAllMocks();
		});

		it('loads messages for sessions', async () => {
			const sessions: ExecutionSession[] = [{ id: 1 } as any, { id: 2 } as any];
			(api.getSessionTranscript as jest.Mock)
				.mockResolvedValueOnce([{ id: 1, content: 'msg1' }])
				.mockResolvedValueOnce([{ id: 2, content: 'msg2' }]);

			const result = await loadSessionMessages(sessions);
			expect(result.size).toBe(2);
			expect(result.get(1)).toHaveLength(1);
			expect(result.get(2)).toHaveLength(1);
		});

		it('returns empty map for empty array', async () => {
			const result = await loadSessionMessages([]);
			expect(result.size).toBe(0);
		});

		it('handles errors gracefully', async () => {
			const sessions: ExecutionSession[] = [{ id: 1 } as any];
			(api.getSessionTranscript as jest.Mock).mockRejectedValueOnce(new Error('Failed'));

			const result = await loadSessionMessages(sessions);
			expect(result.size).toBe(1);
			expect(result.get(1)).toEqual([]);
		});
	});

	describe('calculateSessionStats', () => {
		it('calculates stats for sessions', () => {
			const sessions: ExecutionSession[] = [
				{ success: true, started_at: '2024-01-01T10:00:00Z', completed_at: '2024-01-01T10:01:00Z' } as any,
				{ success: false, started_at: '2024-01-01T11:00:00Z', completed_at: '2024-01-01T11:02:00Z' } as any,
				{ success: true, started_at: '2024-01-01T12:00:00Z', completed_at: '2024-01-01T12:01:30Z' } as any
			];

			const stats = calculateSessionStats(sessions);
			expect(stats.totalRuns).toBe(3);
			expect(stats.successRate).toBeCloseTo(66.67, 1);
			expect(stats.avgDuration).toBeGreaterThan(0);
			expect(stats.lastRun).toBe('2024-01-01T10:00:00Z');
		});

		it('returns zeros for empty array', () => {
			const stats = calculateSessionStats([]);
			expect(stats).toEqual({
				totalRuns: 0,
				successRate: 0,
				avgDuration: 0,
				lastRun: null
			});
		});
	});

	describe('tokenizePath', () => {
		it('tokenizes dot notation', () => {
			expect(tokenizePath('a.b.c')).toEqual(['a', 'b', 'c']);
		});

		it('tokenizes bracket notation with numbers', () => {
			expect(tokenizePath('a[0][1]')).toEqual(['a', 0, 1]);
		});

		it('tokenizes bracket notation with strings', () => {
			expect(tokenizePath('a["key"]["other"]')).toEqual(['a', 'key', 'other']);
		});

		it('tokenizes mixed notation', () => {
			expect(tokenizePath('a.b[0].c["key"]')).toEqual(['a', 'b', 0, 'c', 'key']);
		});
	});

	describe('traverseByTokens', () => {
		const obj = {
			a: {
				b: {
					c: 'value'
				}
			},
			arr: [1, 2, { nested: 'item' }]
		};

		it('traverses nested object', () => {
			expect(traverseByTokens(obj, ['a', 'b', 'c'])).toBe('value');
		});

		it('traverses array by index', () => {
			expect(traverseByTokens(obj, ['arr', 1])).toBe(2);
		});

		it('traverses nested array object', () => {
			expect(traverseByTokens(obj, ['arr', 2, 'nested'])).toBe('item');
		});

		it('returns undefined for invalid path', () => {
			expect(traverseByTokens(obj, ['a', 'x', 'y'])).toBeUndefined();
		});

		it('returns undefined for null object', () => {
			expect(traverseByTokens(null, ['a'])).toBeUndefined();
		});
	});

	describe('extractByPath', () => {
		const obj = {
			user: {
				name: 'John',
				address: {
					city: 'NYC'
				}
			},
			items: [{ id: 1 }, { id: 2 }]
		};

		it('extracts value by dot notation', () => {
			expect(extractByPath(obj, 'user.name')).toBe('John');
		});

		it('extracts nested value', () => {
			expect(extractByPath(obj, 'user.address.city')).toBe('NYC');
		});

		it('extracts array item', () => {
			expect(extractByPath(obj, 'items[0].id')).toBe(1);
		});

		it('returns undefined for invalid path', () => {
			expect(extractByPath(obj, 'user.invalid')).toBeUndefined();
		});

		it('returns undefined for empty path', () => {
			expect(extractByPath(obj, '')).toBeUndefined();
		});

		it('handles errors gracefully', () => {
			expect(extractByPath(obj, null as any)).toBeUndefined();
		});
	});
});

// Made with Bob
