import type { ConversationExecutionRequest, TestExecutionRequest } from '@ibm-vibe/types';
import axios from 'axios';
import { ApiService } from '../api-service';
import { extractTokenUsage } from '../token-extractor';

jest.mock('../token-extractor', () => ({
	extractTokenUsage: jest.fn().mockReturnValue({ tokens: {}, metadata: { extraction_method: 'none' } })
}));

jest.mock('axios');

const mockedAxios = axios as jest.Mocked<typeof axios>;
const mockedExtract = extractTokenUsage as jest.MockedFunction<typeof extractTokenUsage>;

describe('ApiService additional coverage', () => {
	beforeEach(() => {
		jest.clearAllMocks();
	});

	it('adds token usage extracted step (including 0 token counts)', async () => {
		const service = new ApiService() as any;
		service.makeApiRequest = jest.fn().mockResolvedValue({
			data: { output: 'ok', usage: { prompt_tokens: 0, completion_tokens: 0 } }
		});

		mockedExtract.mockReturnValueOnce({
			tokens: { input_tokens: 0, output_tokens: 0 },
			metadata: { extraction_method: 'explicit' }
		});

		const result = await service.executeTest({
			test_id: 123,
			api_endpoint: 'http://example.test',
			test_input: 'hi'
		} as TestExecutionRequest);

		expect(result.intermediate_steps.some((s: any) => s.action === 'Token usage extracted')).toBe(true);
		expect(result.intermediate_steps.find((s: any) => s.action === 'Token usage extracted')?.output).toContain(
			'Input: 0, Output: 0'
		);
	});

	it('handles response_mapping without output for string responses', () => {
		const service = new ApiService() as any;

		const { output, success, steps } = service.processResponse(
			'plain response text',
			{
				test_id: 1,
				response_mapping: JSON.stringify({
					// no output path
					success_criteria: { type: 'contains', value: 'plain' }
				})
			} as any,
			[]
		);

		expect(output).toBe('plain response text');
		expect(success).toBe(true);
		expect(steps.some((s: any) => s.action === 'Processing Complete')).toBe(true);
	});

	it('defaults output extraction for string responses when response_mapping is missing', () => {
		const service = new ApiService() as any;

		const { output, steps } = service.processResponse('hello', { test_id: 1 } as any, []);

		expect(output).toBe('hello');
		expect(steps.some((s: any) => s.action === 'Processing Complete')).toBe(true);
	});

	it('defaults json_match operator to == when not specified', () => {
		const service = new ApiService() as any;

		const { success } = service.processResponse(
			{ details: { status: '5' } },
			{
				test_id: 1,
				response_mapping: JSON.stringify({
					output: 'details.status',
					success_criteria: { type: 'json_match', path: 'details.status', value: 5 }
				})
			} as any,
			[]
		);

		// loose equality allows "5" == 5
		expect(success).toBe(true);
	});

	it('builds Authorization/header config for non-GET requests', async () => {
		const service = new ApiService() as any;

		(mockedAxios as any).mockResolvedValue({ data: { ok: true } });

		await service.makeApiRequest(
			'http://example.test',
			'POST',
			{ input: 'hi' },
			{ 'X-Test': 'yes' },
			'secret-token'
		);

		expect((mockedAxios as any).mock.calls[0][0]).toMatchObject({
			method: 'post',
			url: 'http://example.test',
			data: { input: 'hi' }
		});
		expect((mockedAxios as any).mock.calls[0][0].headers).toMatchObject({
			'Content-Type': 'application/json',
			'X-Test': 'yes',
			Authorization: 'Bearer secret-token'
		});
		expect((mockedAxios as any).mock.calls[0][0].timeout).toEqual(expect.any(Number));
	});

	it('logs long user message with ellipsis and defaults http_method to POST', async () => {
		const service = new ApiService() as any;
		service.makeApiRequest = jest.fn().mockResolvedValue({ data: { output: 'ok' } });

		const longContent = 'a'.repeat(70);
		const request: ConversationExecutionRequest = {
			conversation_id: 300,
			api_endpoint: 'http://example.test',
			// no http_method provided -> default branch
			conversation_script: [{ conversation_id: 300, sequence: 1, role: 'user', content: longContent }]
		};

		const result = await service.executeConversation(request);

		expect(result.intermediate_steps.some((s: any) => s.output.includes('...'))).toBe(true);
		expect(service.makeApiRequest).toHaveBeenCalledWith(
			'http://example.test',
			'POST',
			expect.anything(),
			undefined,
			undefined
		);
	});

	it('does not include variables_before/after metadata when empty', async () => {
		const service = new ApiService() as any;
		service.makeApiRequest = jest.fn().mockResolvedValue({ data: { output: { message: 'OK' } } });
		mockedExtract.mockReturnValueOnce({ tokens: {}, metadata: { extraction_method: 'none' } });

		const request: ConversationExecutionRequest = {
			conversation_id: 301,
			api_endpoint: 'http://example.test',
			http_method: 'POST',
			response_mapping: JSON.stringify({ output: 'output.message' }),
			conversation_script: [{ conversation_id: 301, sequence: 1, role: 'user', content: 'Hi' }]
		};

		const result = await service.executeConversation(request);
		const assistant = result.transcript.find((m: any) => m.role === 'assistant');
		const meta = assistant?.metadata ? JSON.parse(assistant.metadata) : {};

		expect(meta.variables_before).toBeUndefined();
		expect(meta.variables_after).toBeUndefined();
	});

	it('does not re-treat literal {{input}} in user content as a variable placeholder', () => {
		const service = new ApiService() as any;

		const payload = service.formatConversationRequestWithVars(
			'Literal {{input}} should stay',
			'History',
			'{"input":"{{input}}"}',
			{}
		);

		expect(payload).toEqual({ input: 'Literal {{input}} should stay' });
	});

	it('surfaces non-2xx errors from HTTP client in executeTest output', async () => {
		const service = new ApiService() as any;
		service.makeApiRequest = jest.fn().mockRejectedValue(new Error('Request failed with status code 429'));

		const result = await service.executeTest({
			test_id: 999,
			api_endpoint: 'http://example.test',
			test_input: 'hi'
		} as TestExecutionRequest);

		expect(result.success).toBe(false);
		expect(result.output).toContain('status code 429');
	});
});
