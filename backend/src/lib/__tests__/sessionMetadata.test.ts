import {
	parseSessionMetadata,
	serializeSessionMetadata,
	mergeMetadata,
	updateSessionMetadata,
	computeSessionDurationMs,
	extractTokenUsageFromSession,
	getAssistantOutputFromMessages,
	getSessionOutputAndExpected
} from '../sessionMetadata';
import * as queries from '../../db/queries';
import type { ExecutionSession, SessionMessage } from '@ibm-vibe/types';

jest.mock('../../db/queries');

const mockedQueries = queries as jest.Mocked<typeof queries>;

describe('sessionMetadata', () => {
	describe('parseSessionMetadata', () => {
		it('parses valid JSON metadata', () => {
			const metadata = JSON.stringify({ key: 'value', count: 42 });
			const result = parseSessionMetadata(metadata);

			expect(result).toEqual({ key: 'value', count: 42 });
		});

		it('returns empty object for null', () => {
			expect(parseSessionMetadata(null)).toEqual({});
		});

		it('returns empty object for undefined', () => {
			expect(parseSessionMetadata(undefined)).toEqual({});
		});

		it('returns empty object for empty string', () => {
			expect(parseSessionMetadata('')).toEqual({});
		});

		it('returns empty object for invalid JSON', () => {
			expect(parseSessionMetadata('{invalid')).toEqual({});
		});

		it('handles nested objects', () => {
			const metadata = JSON.stringify({ nested: { deep: { value: 123 } } });
			const result = parseSessionMetadata(metadata);

			expect(result).toEqual({ nested: { deep: { value: 123 } } });
		});

		it('handles arrays', () => {
			const metadata = JSON.stringify({ items: [1, 2, 3] });
			const result = parseSessionMetadata(metadata);

			expect(result).toEqual({ items: [1, 2, 3] });
		});
	});

	describe('serializeSessionMetadata', () => {
		it('serializes object to JSON string', () => {
			const meta = { key: 'value', count: 42 };
			const result = serializeSessionMetadata(meta);

			expect(result).toBe('{"key":"value","count":42}');
		});

		it('handles null input', () => {
			expect(serializeSessionMetadata(null)).toBe('{}');
		});

		it('handles undefined input', () => {
			expect(serializeSessionMetadata(undefined)).toBe('{}');
		});

		it('handles empty object', () => {
			expect(serializeSessionMetadata({})).toBe('{}');
		});

		it('handles nested objects', () => {
			const meta = { nested: { value: 123 } };
			const result = serializeSessionMetadata(meta);

			expect(result).toBe('{"nested":{"value":123}}');
		});

		it('handles arrays', () => {
			const meta = { items: [1, 2, 3] };
			const result = serializeSessionMetadata(meta);

			expect(result).toBe('{"items":[1,2,3]}');
		});

		it('returns empty object JSON for circular references', () => {
			const circular: any = { a: 1 };
			circular.self = circular;

			const result = serializeSessionMetadata(circular);
			expect(result).toBe('{}');
		});
	});

	describe('mergeMetadata', () => {
		it('merges patch into existing metadata', () => {
			const existing = JSON.stringify({ a: 1, b: 2 });
			const patch = { b: 3, c: 4 };

			const result = mergeMetadata(existing, patch);
			const parsed = JSON.parse(result);

			expect(parsed).toEqual({ a: 1, b: 3, c: 4 });
		});

		it('handles null existing metadata', () => {
			const patch = { key: 'value' };
			const result = mergeMetadata(null, patch);
			const parsed = JSON.parse(result);

			expect(parsed).toEqual({ key: 'value' });
		});

		it('handles undefined existing metadata', () => {
			const patch = { key: 'value' };
			const result = mergeMetadata(undefined, patch);
			const parsed = JSON.parse(result);

			expect(parsed).toEqual({ key: 'value' });
		});

		it('handles empty patch', () => {
			const existing = JSON.stringify({ a: 1 });
			const result = mergeMetadata(existing, {});
			const parsed = JSON.parse(result);

			expect(parsed).toEqual({ a: 1 });
		});

		it('overwrites existing values with patch', () => {
			const existing = JSON.stringify({ key: 'old' });
			const patch = { key: 'new' };

			const result = mergeMetadata(existing, patch);
			const parsed = JSON.parse(result);

			expect(parsed).toEqual({ key: 'new' });
		});

		it('handles invalid existing JSON', () => {
			const patch = { key: 'value' };
			const result = mergeMetadata('{invalid', patch);
			const parsed = JSON.parse(result);

			expect(parsed).toEqual({ key: 'value' });
		});

		it('preserves nested objects from existing', () => {
			const existing = JSON.stringify({ nested: { a: 1, b: 2 } });
			const patch = { other: 'value' };

			const result = mergeMetadata(existing, patch);
			const parsed = JSON.parse(result);

			expect(parsed).toEqual({ nested: { a: 1, b: 2 }, other: 'value' });
		});
	});

	describe('computeSessionDurationMs', () => {
		it('computes duration between start and completion', () => {
			const session: ExecutionSession = {
				id: 1,
				conversation_id: 1,
				agent_id: 1,
				status: 'completed',
				started_at: '2024-01-01T10:00:00.000Z',
				completed_at: '2024-01-01T10:00:05.500Z',
				success: true
			};

			expect(computeSessionDurationMs(session)).toBe(5500);
		});

		it('returns 0 when started_at is undefined', () => {
			const session: ExecutionSession = {
				id: 1,
				conversation_id: 1,
				agent_id: 1,
				status: 'pending',
				started_at: undefined,
				completed_at: undefined,
				success: undefined
			};

			expect(computeSessionDurationMs(session)).toBe(0);
		});

		it('returns 0 when completed_at is undefined', () => {
			const session: ExecutionSession = {
				id: 1,
				conversation_id: 1,
				agent_id: 1,
				status: 'running',
				started_at: '2024-01-01T10:00:00.000Z',
				completed_at: undefined,
				success: undefined
			};

			expect(computeSessionDurationMs(session)).toBe(0);
		});

		it('handles same start and completion time', () => {
			const session: ExecutionSession = {
				id: 1,
				conversation_id: 1,
				agent_id: 1,
				status: 'completed',
				started_at: '2024-01-01T10:00:00.000Z',
				completed_at: '2024-01-01T10:00:00.000Z',
				success: true
			};

			expect(computeSessionDurationMs(session)).toBe(0);
		});

		it('returns 0 for invalid date strings', () => {
			const session: ExecutionSession = {
				id: 1,
				conversation_id: 1,
				agent_id: 1,
				status: 'completed',
				started_at: 'invalid',
				completed_at: 'invalid',
				success: true
			};

			expect(computeSessionDurationMs(session)).toBe(0);
		});

		it('handles millisecond precision', () => {
			const session: ExecutionSession = {
				id: 1,
				conversation_id: 1,
				agent_id: 1,
				status: 'completed',
				started_at: '2024-01-01T10:00:00.123Z',
				completed_at: '2024-01-01T10:00:00.456Z',
				success: true
			};

			expect(computeSessionDurationMs(session)).toBe(333);
		});

		it('returns 0 for negative duration', () => {
			const session: ExecutionSession = {
				id: 1,
				conversation_id: 1,
				agent_id: 1,
				status: 'completed',
				started_at: '2024-01-01T10:00:05.000Z',
				completed_at: '2024-01-01T10:00:00.000Z',
				success: true
			};

			expect(computeSessionDurationMs(session)).toBe(0);
		});
	});

	describe('updateSessionMetadata', () => {
		it('returns early when session is missing', async () => {
			mockedQueries.getExecutionSessionById.mockReturnValue(null as any);

			await updateSessionMetadata(99, { key: 'value' });

			expect(mockedQueries.updateExecutionSession).not.toHaveBeenCalled();
		});

		it('merges and updates metadata for existing session', async () => {
			mockedQueries.getExecutionSessionById.mockReturnValue({
				id: 1,
				metadata: JSON.stringify({ a: 1 })
			} as any);
			mockedQueries.updateExecutionSession.mockReturnValue({} as any);

			await updateSessionMetadata(1, { b: 2 });

			const updateCall = mockedQueries.updateExecutionSession.mock.calls[0];
			expect(updateCall[0]).toBe(1);
			expect(JSON.parse((updateCall[1] as { metadata: string }).metadata)).toEqual({ a: 1, b: 2 });
		});
	});

	describe('extractTokenUsageFromSession', () => {
		it('extracts input and output tokens from metadata', () => {
			const session: ExecutionSession = {
				id: 1,
				conversation_id: 1,
				agent_id: 1,
				status: 'completed',
				started_at: '2024-01-01T10:00:00.000Z',
				completed_at: '2024-01-01T10:00:01.000Z',
				success: true,
				metadata: JSON.stringify({ input_tokens: 100, output_tokens: 50 })
			};

			const result = extractTokenUsageFromSession(session);

			expect(result).toEqual({ input_tokens: 100, output_tokens: 50 });
		});

		it('returns empty object when metadata is undefined', () => {
			const session: ExecutionSession = {
				id: 1,
				conversation_id: 1,
				agent_id: 1,
				status: 'completed',
				started_at: '2024-01-01T10:00:00.000Z',
				completed_at: '2024-01-01T10:00:01.000Z',
				success: true,
				metadata: undefined
			};

			expect(extractTokenUsageFromSession(session)).toEqual({});
		});

		it('returns empty object when tokens are not present', () => {
			const session: ExecutionSession = {
				id: 1,
				conversation_id: 1,
				agent_id: 1,
				status: 'completed',
				started_at: '2024-01-01T10:00:00.000Z',
				completed_at: '2024-01-01T10:00:01.000Z',
				success: true,
				metadata: JSON.stringify({ other: 'data' })
			};

			expect(extractTokenUsageFromSession(session)).toEqual({});
		});

		it('extracts only input_tokens when output_tokens is missing', () => {
			const session: ExecutionSession = {
				id: 1,
				conversation_id: 1,
				agent_id: 1,
				status: 'completed',
				started_at: '2024-01-01T10:00:00.000Z',
				completed_at: '2024-01-01T10:00:01.000Z',
				success: true,
				metadata: JSON.stringify({ input_tokens: 100 })
			};

			expect(extractTokenUsageFromSession(session)).toEqual({ input_tokens: 100 });
		});

		it('extracts only output_tokens when input_tokens is missing', () => {
			const session: ExecutionSession = {
				id: 1,
				conversation_id: 1,
				agent_id: 1,
				status: 'completed',
				started_at: '2024-01-01T10:00:00.000Z',
				completed_at: '2024-01-01T10:00:01.000Z',
				success: true,
				metadata: JSON.stringify({ output_tokens: 50 })
			};

			expect(extractTokenUsageFromSession(session)).toEqual({ output_tokens: 50 });
		});

		it('ignores non-numeric token values', () => {
			const session: ExecutionSession = {
				id: 1,
				conversation_id: 1,
				agent_id: 1,
				status: 'completed',
				started_at: '2024-01-01T10:00:00.000Z',
				completed_at: '2024-01-01T10:00:01.000Z',
				success: true,
				metadata: JSON.stringify({ input_tokens: 'invalid', output_tokens: null })
			};

			expect(extractTokenUsageFromSession(session)).toEqual({});
		});

		it('handles zero token values', () => {
			const session: ExecutionSession = {
				id: 1,
				conversation_id: 1,
				agent_id: 1,
				status: 'completed',
				started_at: '2024-01-01T10:00:00.000Z',
				completed_at: '2024-01-01T10:00:01.000Z',
				success: true,
				metadata: JSON.stringify({ input_tokens: 0, output_tokens: 0 })
			};

			expect(extractTokenUsageFromSession(session)).toEqual({ input_tokens: 0, output_tokens: 0 });
		});
	});

	describe('getAssistantOutputFromMessages', () => {
		it('returns content from first assistant message', () => {
			const messages: SessionMessage[] = [
				{ id: 1, session_id: 1, sequence: 1, role: 'user', content: 'Hello' },
				{ id: 2, session_id: 1, sequence: 2, role: 'assistant', content: 'Hi there!' }
			];

			expect(getAssistantOutputFromMessages(messages)).toBe('Hi there!');
		});

		it('returns undefined when no assistant messages exist', () => {
			const messages: SessionMessage[] = [{ id: 1, session_id: 1, sequence: 1, role: 'user', content: 'Hello' }];

			expect(getAssistantOutputFromMessages(messages)).toBeUndefined();
		});

		it('returns undefined for empty messages array', () => {
			expect(getAssistantOutputFromMessages([])).toBeUndefined();
		});

		it('returns first assistant message when multiple exist', () => {
			const messages: SessionMessage[] = [
				{ id: 1, session_id: 1, sequence: 1, role: 'user', content: 'Hello' },
				{ id: 2, session_id: 1, sequence: 2, role: 'assistant', content: 'First response' },
				{ id: 3, session_id: 1, sequence: 3, role: 'user', content: 'Follow up' },
				{ id: 4, session_id: 1, sequence: 4, role: 'assistant', content: 'Second response' }
			];

			expect(getAssistantOutputFromMessages(messages)).toBe('First response');
		});

		it('handles empty assistant content', () => {
			const messages: SessionMessage[] = [
				{ id: 1, session_id: 1, sequence: 1, role: 'user', content: 'Hello' },
				{ id: 2, session_id: 1, sequence: 2, role: 'assistant', content: '' }
			];

			expect(getAssistantOutputFromMessages(messages)).toBe('');
		});

		it('handles system messages', () => {
			const messages: SessionMessage[] = [
				{ id: 1, session_id: 1, sequence: 1, role: 'system', content: 'System prompt' },
				{ id: 2, session_id: 1, sequence: 2, role: 'user', content: 'Hello' },
				{ id: 3, session_id: 1, sequence: 3, role: 'assistant', content: 'Response' }
			];

			expect(getAssistantOutputFromMessages(messages)).toBe('Response');
		});
	});

	describe('getSessionOutputAndExpected', () => {
		it('returns undefined when session is missing', async () => {
			mockedQueries.getExecutionSessionById.mockReturnValue(null as any);

			const result = await getSessionOutputAndExpected(10);

			expect(result).toBeUndefined();
		});

		it('returns output without expected when conversation missing', async () => {
			mockedQueries.getExecutionSessionById.mockReturnValue({ id: 1, conversation_id: 2 } as any);
			mockedQueries.getConversationById.mockReturnValue(null as any);
			mockedQueries.getSessionMessages.mockReturnValue([
				{ role: 'assistant', content: 'hello', sequence: 2 }
			] as any);

			const result = await getSessionOutputAndExpected(1);

			expect(result).toEqual({ output: 'hello', expected: undefined });
		});

		it('returns output and expected for assistant turn', async () => {
			mockedQueries.getExecutionSessionById.mockReturnValue({ id: 1, conversation_id: 2 } as any);
			mockedQueries.getConversationById.mockReturnValue({ id: 2 } as any);
			mockedQueries.getSessionMessages.mockReturnValue([
				{ role: 'user', content: 'hi', sequence: 1 },
				{ role: 'assistant', content: 'hello', sequence: 2 }
			] as any);
			mockedQueries.countUserTurnsUpTo.mockReturnValue(1);
			mockedQueries.getConversationTurnTarget.mockReturnValue({ target_reply: 'expected' } as any);

			const result = await getSessionOutputAndExpected(1);

			expect(result).toEqual({ output: 'hello', expected: 'expected' });
		});
	});
});

// Made with Bob
