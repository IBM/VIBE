import type { ConversationExecutionRequest, IntermediateStep } from '@ibm-vibe/types';
import {
	executeConversationWithApi,
	type ConversationExecutorDependencies
} from '../api-service-conversation-executor';
import { extractTokenUsage } from '../token-extractor';

jest.mock('../token-extractor', () => ({
	extractTokenUsage: jest.fn()
}));

const mockedExtractTokenUsage = extractTokenUsage as jest.MockedFunction<typeof extractTokenUsage>;

const serializeMetadata = (metadata?: Record<string, unknown>) => (metadata ? JSON.stringify(metadata) : undefined);

const parseScriptMetadata = (metadata: unknown): Record<string, any> => {
	if (!metadata) {
		return {};
	}
	if (typeof metadata === 'string') {
		try {
			const parsed = JSON.parse(metadata);
			return parsed && typeof parsed === 'object' ? (parsed as Record<string, any>) : {};
		} catch {
			return {};
		}
	}
	return typeof metadata === 'object' ? (metadata as Record<string, any>) : {};
};

const baseRequest = (): ConversationExecutionRequest => ({
	conversation_id: 101,
	api_endpoint: 'http://example.test',
	http_method: 'POST',
	conversation_script: [{ conversation_id: 101, sequence: 1, role: 'user', content: 'Hello there' }]
});

const buildDeps = (overrides: Partial<ConversationExecutorDependencies> = {}): ConversationExecutorDependencies => ({
	makeApiRequest: jest.fn().mockResolvedValue({ data: { output: 'ok' } }),
	processResponse: jest.fn().mockReturnValue({
		output: 'Assistant reply',
		steps: [
			{
				timestamp: new Date().toISOString(),
				action: 'Mapped output',
				output: 'done'
			}
		] as IntermediateStep[],
		success: true,
		extractedVariables: {}
	}),
	parseScriptMetadata,
	resolvePointer: jest.fn((pointer: string, context: Record<string, any>) => {
		if (pointer === '$.variables.first') {
			return context.variables?.first;
		}
		return undefined;
	}),
	formatConversationRequestWithVars: jest.fn(
		(currentInput: string, _history: string, _template: string, variables: Record<string, any>) => ({
			input: currentInput,
			variables
		})
	),
	serializeMetadata,
	...overrides
});

describe('executeConversationWithApi', () => {
	beforeEach(() => {
		jest.clearAllMocks();
		mockedExtractTokenUsage.mockReturnValue({
			tokens: { input_tokens: 3, output_tokens: 5 },
			metadata: { extraction_method: 'explicit' }
		});
	});

	it('builds transcript, variables, and token metrics for successful runs', async () => {
		const deps = buildDeps();
		const request: ConversationExecutionRequest = {
			...baseRequest(),
			request_template: '{"input":"{{input}}","vars":{{variables}}}',
			conversation_script: [
				{ conversation_id: 101, sequence: 1, role: 'system', content: 'Be concise' },
				{
					conversation_id: 101,
					sequence: 2,
					role: 'user',
					content: 'Hello there',
					metadata: JSON.stringify({ request_capabilities: { provider: 'test' } })
				}
			]
		};

		const result = await executeConversationWithApi(request, deps);

		expect(result.success).toBe(true);
		expect(result.transcript).toHaveLength(3);
		expect(result.metrics.input_tokens).toBe(3);
		expect(result.metrics.output_tokens).toBe(5);
		expect(deps.makeApiRequest as jest.Mock).toHaveBeenCalledTimes(1);
		expect(deps.processResponse as jest.Mock).toHaveBeenCalledTimes(1);
		expect(result.intermediate_steps.some((step) => step.action === 'Conversation completed')).toBe(true);
	});

	it('stops at the first failed scripted message when stop_on_failure is true', async () => {
		const deps = buildDeps({
			processResponse: jest
				.fn()
				.mockReturnValueOnce({ output: 'first failed', steps: [], success: false, extractedVariables: {} })
				.mockReturnValueOnce({ output: 'second', steps: [], success: true, extractedVariables: {} })
		});
		const request: ConversationExecutionRequest = {
			...baseRequest(),
			stop_on_failure: true,
			conversation_script: [
				{ conversation_id: 101, sequence: 1, role: 'user', content: 'first' },
				{ conversation_id: 101, sequence: 2, role: 'user', content: 'second' }
			]
		};

		const result = await executeConversationWithApi(request, deps);

		expect(result.success).toBe(false);
		expect(deps.makeApiRequest as jest.Mock).toHaveBeenCalledTimes(1);
		expect(result.intermediate_steps.some((step) => step.action === 'Conversation stopped')).toBe(true);
	});

	it('resolves pointer variables across turns and merges extracted values', async () => {
		const deps = buildDeps({
			processResponse: jest
				.fn()
				.mockReturnValueOnce({
					output: 'step one',
					steps: [],
					success: true,
					extractedVariables: { first: 'from-first-response' }
				})
				.mockReturnValueOnce({
					output: 'step two',
					steps: [],
					success: true,
					extractedVariables: {}
				})
		});
		const request: ConversationExecutionRequest = {
			...baseRequest(),
			request_template: '{"input":"{{input}}"}',
			conversation_script: [
				{ conversation_id: 101, sequence: 1, role: 'user', content: 'first' },
				{
					conversation_id: 101,
					sequence: 2,
					role: 'user',
					content: 'second',
					metadata: JSON.stringify({
						variables: {
							copied: '$.variables.first'
						}
					})
				}
			]
		};

		const result = await executeConversationWithApi(request, deps);
		const secondCallVariables = (deps.formatConversationRequestWithVars as jest.Mock).mock.calls[1]?.[3];

		expect(secondCallVariables).toMatchObject({
			first: 'from-first-response',
			copied: 'from-first-response'
		});
		expect(result.variables).toMatchObject({ first: 'from-first-response' });
	});

	it('records message errors and continues when stop_on_failure is not enabled', async () => {
		const deps = buildDeps({
			makeApiRequest: jest
				.fn()
				.mockRejectedValueOnce(new Error('network timeout'))
				.mockResolvedValueOnce({ data: { output: 'ok' } }),
			processResponse: jest
				.fn()
				.mockReturnValue({ output: 'recovered', steps: [], success: true, extractedVariables: {} })
		});
		const request: ConversationExecutionRequest = {
			...baseRequest(),
			conversation_script: [
				{ conversation_id: 101, sequence: 1, role: 'user', content: 'first' },
				{ conversation_id: 101, sequence: 2, role: 'user', content: 'second' }
			]
		};

		const result = await executeConversationWithApi(request, deps);

		expect(result.success).toBe(false);
		expect(deps.makeApiRequest as jest.Mock).toHaveBeenCalledTimes(2);
		expect(result.transcript.some((message) => message.content.includes('Error: network timeout'))).toBe(true);
		expect(result.transcript.some((message) => message.content === 'recovered')).toBe(true);
	});

	it('returns a failed execution payload when a fatal error escapes outer flow', async () => {
		const deps = buildDeps({
			parseScriptMetadata: () => {
				throw new Error('fatal parse error');
			}
		});

		const result = await executeConversationWithApi(baseRequest(), deps);

		expect(result.success).toBe(false);
		expect(result.intermediate_steps.some((step) => step.action === 'Conversation error')).toBe(true);
	});
});
