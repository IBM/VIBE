import type { TestExecutionRequest } from '@ibm-vibe/types';
import { ApiServiceResponseProcessor } from '../api-service-response-processor';

describe('ApiServiceResponseProcessor', () => {
	let processor: ApiServiceResponseProcessor;

	beforeEach(() => {
		processor = new ApiServiceResponseProcessor();
	});

	it('parses script metadata from JSON, objects, and invalid payloads', () => {
		expect(processor.parseScriptMetadata('{"request_template":"{}"}')).toEqual({ request_template: '{}' });
		expect(processor.parseScriptMetadata({ response_mapping: '{}' })).toEqual({ response_mapping: '{}' });
		expect(processor.parseScriptMetadata('{invalid')).toEqual({});
		expect(processor.parseScriptMetadata(42)).toEqual({});
	});

	it('processes mapped output, intermediate steps, and extracted variables', () => {
		const responseData = {
			payload: {
				answer: 'done',
				steps: [{ action: 'Step 1', output: 'ok' }],
				vars: { requestId: 'req-1' }
			}
		};
		const request = {
			test_id: 1,
			response_mapping: JSON.stringify({
				output: 'payload.answer',
				intermediate_steps: 'payload.steps',
				variables: { requestId: 'payload.vars.requestId' },
				success_criteria: { type: 'contains', value: 'do' }
			})
		} as TestExecutionRequest;

		const result = processor.processResponse(responseData, request, []);

		expect(result.output).toBe('done');
		expect(result.success).toBe(true);
		expect(result.extractedVariables).toEqual({ requestId: 'req-1' });
		expect(result.steps.some((step) => step.action === 'Step 1')).toBe(true);
		expect(result.steps.some((step) => step.action === 'Processing Complete')).toBe(true);
	});

	it('evaluates json_match success criteria with operators', () => {
		const request = {
			test_id: 2,
			response_mapping: JSON.stringify({
				output: 'metrics.label',
				success_criteria: {
					type: 'json_match',
					path: 'metrics.score',
					operator: '>=',
					value: 90
				}
			})
		} as TestExecutionRequest;

		const result = processor.processResponse({ metrics: { score: 95, label: 'great' } }, request, []);

		expect(result.output).toBe('great');
		expect(result.success).toBe(true);
	});

	it('handles invalid mapping payloads as processing errors', () => {
		const result = processor.processResponse(
			{ value: 1 },
			{ test_id: 3, response_mapping: '{invalid' } as TestExecutionRequest,
			[]
		);

		expect(result.success).toBe(false);
		expect(result.output).toContain('Error processing response');
		expect(result.steps.some((step) => step.action === 'Processing Error')).toBe(true);
	});

	it('resolves pointers and path extraction safely', () => {
		const context = {
			lastResponse: {
				data: {
					items: [{ id: 7 }]
				}
			},
			variables: {
				token: 'abc'
			}
		};

		expect(processor.resolvePointer('$.lastResponse.data.items[0].id', context)).toBe(7);
		expect(processor.resolvePointer('$.variables.token', context)).toBe('abc');
		expect(processor.resolvePointer('not-a-pointer', context)).toBe('not-a-pointer');
		expect(processor.extractByPath(context, 'lastResponse.data.items[0].id')).toBe(7);
		expect(processor.extractByPath(context, null as any)).toBeUndefined();
	});
});
