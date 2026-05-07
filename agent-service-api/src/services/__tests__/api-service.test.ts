import type { ConversationExecutionRequest, TestExecutionRequest } from '@ibm-vibe/types';
import axios from 'axios';
import { ApiService, serializeMetadata } from '../api-service';
import { extractTokenUsage } from '../token-extractor';

jest.mock('../token-extractor', () => ({
	extractTokenUsage: jest.fn().mockReturnValue({ tokens: {}, metadata: { extraction_method: 'none' } })
}));

jest.mock('axios');

const mockedAxios = axios as jest.Mocked<typeof axios>;
const mockedExtract = extractTokenUsage as jest.MockedFunction<typeof extractTokenUsage>;

describe('ApiService executeConversation metadata parsing', () => {
	it('parses metadata JSON strings to extract capabilities', async () => {
		const service = new ApiService() as any;
		service.makeApiRequest = jest.fn().mockResolvedValue({ data: { ok: true } });
		service.processResponse = jest.fn().mockReturnValue({
			output: 'ok',
			steps: [],
			success: true,
			extractedVariables: {}
		});

		const request: ConversationExecutionRequest = {
			conversation_id: 1,
			conversation_script: [
				{
					conversation_id: 1,
					sequence: 1,
					role: 'user',
					content: 'Hello',
					metadata: JSON.stringify({
						request_capabilities: { name: 'openai-chat' },
						response_capabilities: { name: 'openai-chat' }
					})
				}
			],
			api_endpoint: 'http://example.test',
			http_method: 'POST'
		};

		const result = await service.executeConversation(request);

		expect(result.transcript).toHaveLength(2);
		const userMeta = JSON.parse(result.transcript[0].metadata!);
		const assistantMeta = JSON.parse(result.transcript[1].metadata!);

		expect(userMeta.request_capabilities).toEqual({ name: 'openai-chat' });
		expect(assistantMeta.request_capabilities).toEqual({ name: 'openai-chat' });
		expect(assistantMeta.response_capabilities).toEqual({ name: 'openai-chat' });
	});
});

describe('ApiService helpers and executeTest', () => {
	it('falls back to simple input when request template is invalid JSON', () => {
		const service = new ApiService() as any;
		const result = service.formatRequest('hello', '{"input": "{{input}}"');
		expect(result).toEqual({ input: 'hello' });
	});

	it('extracts output, steps, variables, and success criteria', () => {
		const service = new ApiService() as any;
		const responseData = {
			data: { message: 'ok done' },
			meta: {
				request_id: 'req-123',
				steps: [{ action: 'step-1', output: 'ok' }]
			}
		};
		const request: TestExecutionRequest = {
			test_id: 1,
			api_endpoint: 'http://example.test',
			http_method: 'POST',
			test_input: 'hi',
			response_mapping: JSON.stringify({
				output: 'data.message',
				intermediate_steps: 'meta.steps',
				variables: { requestId: 'meta.request_id' },
				success_criteria: { type: 'contains', value: 'ok' }
			})
		};

		const { output, steps, success, extractedVariables } = service.processResponse(responseData, request, []);

		expect(output).toBe('ok done');
		expect(success).toBe(true);
		expect(extractedVariables).toEqual({ requestId: 'req-123' });
		expect(steps.some((step: any) => step.action === 'step-1')).toBe(true);
		expect(steps.some((step: any) => step.action === 'Processing Complete')).toBe(true);
	});

	it('uses default labels for intermediate steps', () => {
		const service = new ApiService() as any;
		const responseData = {
			data: { message: 'ok' },
			meta: {
				steps: [{ output: 'only output' }, { action: 'custom' }]
			}
		};
		const request: TestExecutionRequest = {
			test_id: 1,
			api_endpoint: 'http://example.test',
			http_method: 'POST',
			test_input: 'hi',
			response_mapping: JSON.stringify({
				output: 'data.message',
				intermediate_steps: 'meta.steps'
			})
		};

		const { steps } = service.processResponse(responseData, request, []);

		expect(steps.some((step: any) => step.action === 'Intermediate Step')).toBe(true);
	});

	it('extracts values with bracket notation paths', () => {
		const service = new ApiService() as any;
		const obj = { choices: [{ message: { content: 'Hello' } }] };
		expect(service.extractByPath(obj, 'choices[0].message.content')).toBe('Hello');
	});

	it('returns error response when API call fails', async () => {
		const service = new ApiService() as any;
		service.makeApiRequest = jest.fn().mockRejectedValue(new Error('boom'));

		const request: TestExecutionRequest = {
			test_id: 2,
			api_endpoint: 'http://example.test',
			http_method: 'POST',
			test_input: 'hi'
		};

		const result = await service.executeTest(request);

		expect(result.success).toBe(false);
		expect(result.output).toContain('Error: boom');
	});

	it('processes non-array intermediate steps and json_match success', () => {
		const service = new ApiService() as any;
		const responseData = { details: { status: 5, note: 'ok' } };
		const request: TestExecutionRequest = {
			test_id: 1,
			test_input: 'hi',
			api_endpoint: 'http://example.test',
			response_mapping: JSON.stringify({
				output: 'details.note',
				intermediate_steps: 'details',
				success_criteria: {
					type: 'json_match',
					path: 'details.status',
					operator: '>=',
					value: 5
				}
			})
		};

		const { steps, success } = service.processResponse(responseData, request, []);

		expect(steps.some((step: any) => step.action === 'Intermediate Data')).toBe(true);
		expect(success).toBe(true);
	});

	it('defaults output when response mapping is missing', () => {
		const service = new ApiService() as any;
		const { output } = service.processResponse({ output: 'plain' }, { test_id: 1 } as any, []);

		expect(output).toBe('plain');
	});

	it('defaults output when mapping output is missing', () => {
		const service = new ApiService() as any;
		const { output } = service.processResponse(
			{ value: 1 },
			{
				test_id: 2,
				response_mapping: JSON.stringify({ success_criteria: { type: 'contains', value: '1' } })
			} as any,
			[]
		);

		expect(output).toContain('"value":1');
	});

	it('handles unknown success criteria types', () => {
		const service = new ApiService() as any;
		const responseData = { status: 'ok' };
		const request: TestExecutionRequest = {
			test_id: 2,
			test_input: 'hi',
			api_endpoint: 'http://example.test',
			response_mapping: JSON.stringify({
				output: 'status',
				success_criteria: { type: 'unknown', value: 'ok' }
			})
		};

		const { success } = service.processResponse(responseData, request, []);

		expect(success).toBe(false);
	});

	it('handles json_match without a path', () => {
		const service = new ApiService() as any;
		const responseData = { value: 1 };
		const request: TestExecutionRequest = {
			test_id: 3,
			test_input: 'hi',
			api_endpoint: 'http://example.test',
			response_mapping: JSON.stringify({
				output: 'value',
				success_criteria: { type: 'json_match', value: 1 }
			})
		};

		const { success } = service.processResponse(responseData, request, []);

		expect(success).toBe(false);
	});

	it('extracts values with quoted path tokens and null traversal', () => {
		const service = new ApiService() as any;
		expect(service.extractByPath({ data: { key: 'value' } }, 'data["key"]')).toBe('value');
		expect(service.extractByPath({ a: null }, 'a.b')).toBeUndefined();
		expect(service.extractByPath({ a: 1 }, null as any)).toBeUndefined();
	});

	it('handles invalid response mapping JSON', () => {
		const service = new ApiService() as any;
		const { output, steps, success } = service.processResponse({}, { response_mapping: '{invalid' } as any, []);

		expect(output).toContain('Error processing response');
		expect(success).toBe(false);
		expect(steps.some((step: any) => step.action === 'Processing Error')).toBe(true);
	});

	it('handles extractByPath errors gracefully', () => {
		const service = new ApiService() as any;
		service.tokenizePath = jest.fn(() => {
			throw new Error('boom');
		});

		expect(service.extractByPath({ a: 1 }, 'a')).toBeUndefined();
	});

	it('serializes metadata with filtering', () => {
		expect(serializeMetadata(undefined)).toBeUndefined();
		expect(serializeMetadata({ value: undefined })).toBeUndefined();
		expect(serializeMetadata({ value: 1, missing: undefined })).toBe(JSON.stringify({ value: 1 }));
	});

	it('parses script metadata from strings and objects', () => {
		const service = new ApiService() as any;
		expect(service.parseScriptMetadata('{"a":1}')).toEqual({ a: 1 });
		expect(service.parseScriptMetadata('"value"')).toEqual({});
		expect(service.parseScriptMetadata('{invalid')).toEqual({});
		expect(service.parseScriptMetadata({ b: 2 })).toEqual({ b: 2 });
		expect(service.parseScriptMetadata(123)).toEqual({});
	});

	it('compares values with multiple operators', () => {
		const service = new ApiService() as any;
		expect(service.compareValues(2, '>', 1)).toBe(true);
		expect(service.compareValues(2, '<', 1)).toBe(false);
		expect(service.compareValues(2, '>=', 2)).toBe(true);
		expect(service.compareValues(2, '<=', 1)).toBe(false);
		expect(service.compareValues(2, '==', '2')).toBe(true);
		expect(service.compareValues(2, '!=', 1)).toBe(true);
		expect(service.compareValues(2, '!==', '2')).toBe(true);
		expect(service.compareValues(2, '===', 2)).toBe(true);
		expect(service.compareValues(2, 'unknown', 2)).toBe(false);
	});

	it('resolves pointers and returns raw values', () => {
		const service = new ApiService() as any;
		expect(service.resolvePointer('plain', { value: 1 })).toBe('plain');
		service.tokenizePath = jest.fn(() => {
			throw new Error('boom');
		});
		expect(service.resolvePointer('$.value', { value: 1 })).toBeUndefined();
	});

	it('makes GET and POST requests with correct payloads', async () => {
		const service = new ApiService() as any;
		mockedAxios.get.mockResolvedValue({ data: { ok: true } } as any);
		(mockedAxios as any).mockResolvedValue({ data: { ok: true } });

		await service.makeApiRequest('http://example.test', 'GET', { q: 'test' });
		await service.makeApiRequest('http://example.test', 'POST', { input: 'hi' }, { 'X-Test': 'yes' }, 'token');
		await service.makeApiRequest('http://example.test', undefined, { input: 'hi' });

		expect(mockedAxios.get).toHaveBeenCalledWith(expect.stringContaining('q=test'), expect.any(Object));
		expect(mockedAxios as any).toHaveBeenCalled();
	});

	it('executes a test successfully and records token usage', async () => {
		const service = new ApiService() as any;
		service.makeApiRequest = jest.fn().mockResolvedValue({
			data: { result: { text: 'Hello' }, usage: { prompt_tokens: 1, completion_tokens: 2 } }
		});
		mockedExtract.mockReturnValueOnce({
			tokens: { input_tokens: 1, output_tokens: 2 },
			metadata: { extraction_method: 'explicit' }
		});

		const request: TestExecutionRequest = {
			test_id: 10,
			api_endpoint: 'http://example.test',
			http_method: 'POST',
			test_input: 'hi',
			request_template: '{"input":"{{input}}"}',
			response_mapping: JSON.stringify({
				output: 'result.text',
				success_criteria: { type: 'contains', value: 'Hello' }
			})
		};

		const result = await service.executeTest(request);

		expect(result.success).toBe(true);
		expect(result.metrics.input_tokens).toBe(1);
		expect(result.metrics.output_tokens).toBe(2);
	});

	it('executes a test without token usage data', async () => {
		const service = new ApiService() as any;
		service.makeApiRequest = jest.fn().mockResolvedValue({
			data: { result: { text: 'Hello' } }
		});
		mockedExtract.mockReturnValueOnce({
			tokens: {},
			metadata: { extraction_method: 'none' }
		});

		const request: TestExecutionRequest = {
			test_id: 11,
			api_endpoint: 'http://example.test',
			test_input: 'hi'
		};

		const result = await service.executeTest(request);

		expect(result.metrics.input_tokens).toBeUndefined();
	});

	it('executes a conversation and accumulates variables', async () => {
		const service = new ApiService() as any;
		service.makeApiRequest = jest.fn().mockResolvedValue({
			data: { output: { message: 'OK' } }
		});
		mockedExtract.mockReturnValueOnce({
			tokens: { input_tokens: 2, output_tokens: 3 },
			metadata: { extraction_method: 'explicit' }
		});

		const request: ConversationExecutionRequest = {
			conversation_id: 55,
			api_endpoint: 'http://example.test',
			http_method: 'POST',
			request_template: '{"input":"{{input}}","history":"{{conversation_history}}"}',
			response_mapping: JSON.stringify({
				output: 'output.message',
				variables: { lastStatus: 'output.message' },
				success_criteria: { type: 'exact_match', value: 'OK' }
			}),
			conversation_script: [
				{
					conversation_id: 55,
					sequence: 1,
					role: 'system',
					content: 'You are helpful'
				},
				{
					conversation_id: 55,
					sequence: 2,
					role: 'user',
					content: 'Hi',
					metadata: JSON.stringify({
						variables: { greeting: 'hello' }
					})
				}
			]
		};

		const result = await service.executeConversation(request);

		expect(result.success).toBe(true);
		expect(result.transcript.length).toBeGreaterThan(1);
		expect(result.variables).toMatchObject({ lastStatus: 'OK' });
	});

	it('executes a conversation with long output', async () => {
		const service = new ApiService() as any;
		const longOutput = 'x'.repeat(120);
		service.makeApiRequest = jest.fn().mockResolvedValue({
			data: { output: { message: longOutput } }
		});

		const request: ConversationExecutionRequest = {
			conversation_id: 77,
			api_endpoint: 'http://example.test',
			http_method: 'POST',
			request_template: '{"input":"{{input}}","history":"{{conversation_history}}"}',
			response_mapping: JSON.stringify({
				output: 'output.message',
				success_criteria: { type: 'contains', value: 'x' }
			}),
			conversation_script: [{ conversation_id: 77, sequence: 1, role: 'user', content: 'Short' }]
		};

		const result = await service.executeConversation(request);

		expect(result.success).toBe(true);
	});

	it('stops conversation on failure when configured', async () => {
		const service = new ApiService() as any;
		service.makeApiRequest = jest.fn().mockRejectedValue(new Error('boom'));

		const request: ConversationExecutionRequest = {
			conversation_id: 9,
			api_endpoint: 'http://example.test',
			http_method: 'POST',
			stop_on_failure: true,
			conversation_script: [{ conversation_id: 9, sequence: 1, role: 'user', content: 'Hi' }]
		};

		const result = await service.executeConversation(request);

		expect(result.success).toBe(false);
		expect(result.transcript.some((message: { content: string }) => message.content.includes('Error:'))).toBe(true);
	});

	it('stops conversation when success criteria fails', async () => {
		const service = new ApiService() as any;
		service.makeApiRequest = jest.fn().mockResolvedValue({
			data: { output: { message: 'No' } }
		});

		const request: ConversationExecutionRequest = {
			conversation_id: 11,
			api_endpoint: 'http://example.test',
			http_method: 'POST',
			stop_on_failure: true,
			response_mapping: JSON.stringify({
				output: 'output.message',
				success_criteria: { type: 'exact_match', value: 'Yes' }
			}),
			conversation_script: [{ conversation_id: 11, sequence: 1, role: 'user', content: 'Hi' }]
		};

		const result = await service.executeConversation(request);

		expect(result.success).toBe(false);
		expect(
			result.intermediate_steps.some((step: { action: string }) => step.action === 'Conversation stopped')
		).toBe(true);
	});

	it('resolves pointer variables in conversation messages', async () => {
		const service = new ApiService() as any;
		service.makeApiRequest = jest
			.fn()
			.mockResolvedValueOnce({ data: { output: { message: 'First' } } })
			.mockResolvedValueOnce({ data: { output: { message: 'Second' } } });

		const request: ConversationExecutionRequest = {
			conversation_id: 12,
			api_endpoint: 'http://example.test',
			http_method: 'POST',
			request_template: '{"input":"{{input}}","prev":"{{prev}}"}',
			response_mapping: JSON.stringify({
				output: 'output.message'
			}),
			conversation_script: [
				{ conversation_id: 12, sequence: 1, role: 'user', content: 'First' },
				{
					conversation_id: 12,
					sequence: 2,
					role: 'user',
					content: 'Second',
					metadata: JSON.stringify({
						variables: { prev: '$.lastResponse.output.message' }
					})
				}
			]
		};

		await service.executeConversation(request);

		expect(service.makeApiRequest).toHaveBeenCalledTimes(2);
		expect(service.makeApiRequest.mock.calls[1][2]).toMatchObject({ prev: 'First' });
	});

	it('formats conversation requests with variables and handles errors', () => {
		const service = new ApiService() as any;
		const result = service.formatConversationRequestWithVars(
			'hello',
			'History',
			'{"input":"{{input}}","user":"{{user.name}}"}',
			{ user: { name: 'Sam' } }
		);
		expect(result).toEqual({ input: 'hello', user: 'Sam' });

		const withObject = service.formatConversationRequestWithVars(
			'hello',
			'History',
			'{"input":"{{input}}","payload":{{data}}}',
			{ data: { value: 1 } }
		);
		expect(withObject).toEqual({ input: 'hello', payload: { value: 1 } });

		const circular: any = {};
		circular.self = circular;
		const withCircular = service.formatConversationRequestWithVars(
			'hello',
			'History',
			'{"input":"{{input}}","payload":"{{data}}"}',
			{ data: circular }
		);
		expect(withCircular).toEqual({ input: 'hello', payload: '[object Object]' });

		const fallback = service.formatConversationRequestWithVars('hi', 'History', '{"input":"{{input}}"', {
			value: 1
		});
		expect(fallback).toEqual({ input: 'hi', variables: { value: 1 } });
	});

	it('returns conversation error response on unexpected failures', async () => {
		const service = new ApiService() as any;
		const result = await service.executeConversation({ conversation_id: 99 } as any);

		expect(result.success).toBe(false);
		expect(result.intermediate_steps.some((step: { action: string }) => step.action === 'Conversation error')).toBe(
			true
		);
	});

	it('returns true for health check', async () => {
		const service = new ApiService();
		await expect(service.healthCheck()).resolves.toBe(true);
	});
});
