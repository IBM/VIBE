/* eslint-disable @typescript-eslint/no-explicit-any */
import type { ExecutionSession } from '../api';
import { api } from '../api';
import {
	agentToFormData,
	extractByPath,
	formatTokenUsage,
	formatTokenUsageDetailed,
	loadSessionMessages,
	traverseByTokens
} from '../utils';

jest.mock('../api', () => ({
	api: {
		getSessionTranscript: jest.fn()
	}
}));

const mockedApi = api as jest.Mocked<typeof api>;

describe('utils edge cases', () => {
	beforeEach(() => {
		jest.clearAllMocks();
	});

	it('formats token usage as "-" when totals cancel to zero', () => {
		expect(formatTokenUsage({ input_tokens: -5, output_tokens: 5 } as any)).toBe('-');
		expect(formatTokenUsageDetailed({ input_tokens: -5, output_tokens: 5 } as any)).toBe('');
	});

	it('agentToFormData supports string headers and token_mapping for external_api', () => {
		const agent = {
			name: 'A',
			version: '1',
			prompt: 'p',
			settings: JSON.stringify({
				type: 'external_api',
				http_method: 'POST',
				headers: '{"x":"y"}',
				token_mapping: '{"in":"out"}'
			})
		};

		const data = agentToFormData(agent as any);
		expect(data['agent-type']).toBe('external_api');
		expect(data['agent-headers']).toBe('{"x":"y"}');
		expect(data['agent-token-mapping']).toBe('{"in":"out"}');
	});

	it('loadSessionMessages skips sessions without id', async () => {
		mockedApi.getSessionTranscript.mockResolvedValueOnce([{ id: 1, role: 'user', content: 'hi' }] as any);

		const sessions: ExecutionSession[] = [{ id: undefined } as any, { id: 123 } as any];

		const map = await loadSessionMessages(sessions);
		expect(map.has(123)).toBe(true);
		expect(map.has(undefined as any)).toBe(false);
	});

	it('traverseByTokens handles numeric tokens against objects and primitives', () => {
		expect(traverseByTokens({ 0: 'zero' }, [0])).toBe('zero');
		expect(traverseByTokens('abc', [0])).toBeUndefined();
		expect(traverseByTokens(123, ['a'])).toBeUndefined();
	});

	it('extractByPath catches getter errors and returns undefined', () => {
		const obj = Object.defineProperty({}, 'a', {
			get() {
				throw new Error('boom');
			}
		});

		expect(extractByPath(obj, 'a')).toBeUndefined();
	});
});
