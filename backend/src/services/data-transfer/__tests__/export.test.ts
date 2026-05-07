import { ExportableDataType } from '@ibm-vibe/types';
import { buildExportBundle } from '../export';
import * as agentRepo from '../../../db/repositories/agentRepo';
import * as conversationRepo from '../../../db/repositories/conversationRepo';
import * as conversationTurnTargetsRepo from '../../../db/repositories/conversationTurnTargetsRepo';
import * as suiteRepo from '../../../db/repositories/suiteRepo';
import * as configRepo from '../../../db/repositories/configRepo';
import * as templateRepo from '../../../db/repositories/templateRepo';
import { buildConversationReferenceKey, buildSuiteReferenceKey } from '../identity';

jest.mock('../../../db/database', () => ({
	__esModule: true,
	default: {
		transaction: jest.fn((callback: () => void) => callback)
	}
}));
jest.mock('../../../db/repositories/agentRepo');
jest.mock('../../../db/repositories/conversationRepo');
jest.mock('../../../db/repositories/conversationTurnTargetsRepo');
jest.mock('../../../db/repositories/suiteRepo');
jest.mock('../../../db/repositories/configRepo');
jest.mock('../../../db/repositories/templateRepo');

const mockedAgentRepo = agentRepo as jest.Mocked<typeof agentRepo>;
const mockedConversationRepo = conversationRepo as jest.Mocked<typeof conversationRepo>;
const mockedConversationTurnTargetsRepo = conversationTurnTargetsRepo as jest.Mocked<
	typeof conversationTurnTargetsRepo
>;
const mockedSuiteRepo = suiteRepo as jest.Mocked<typeof suiteRepo>;
const mockedConfigRepo = configRepo as jest.Mocked<typeof configRepo>;
const mockedTemplateRepo = templateRepo as jest.Mocked<typeof templateRepo>;

describe('buildExportBundle', () => {
	beforeEach(() => {
		jest.useFakeTimers().setSystemTime(new Date('2026-03-03T12:00:00.000Z'));
		jest.clearAllMocks();

		mockedAgentRepo.getAgents.mockReturnValue([]);
		mockedConversationRepo.getConversations.mockReturnValue([]);
		mockedSuiteRepo.getTestSuites.mockReturnValue([]);
		mockedConfigRepo.getLLMConfigs.mockReturnValue([]);
		mockedTemplateRepo.listRequestTemplates.mockReturnValue([]);
		mockedTemplateRepo.listResponseMaps.mockReturnValue([]);
	});

	afterEach(() => {
		jest.useRealTimers();
	});

	it('returns export metadata and includes only selected types', () => {
		mockedAgentRepo.getAgents.mockReturnValue([
			{
				id: 10,
				name: 'Support agent',
				version: '1.0.0',
				prompt: 'You are helpful',
				settings: '{"foo":"bar"}',
				created_at: '2026-03-01T10:00:00.000Z'
			}
		] as any);
		mockedTemplateRepo.getAgentTemplates.mockReturnValue([
			{ id: 1, name: 'chat-template', is_default: 1, created_at: '2026-03-01T10:00:00.000Z', body: '{}' }
		] as any);
		mockedTemplateRepo.getAgentResponseMaps.mockReturnValue([
			{ id: 7, name: 'chat-map', is_default: 0, created_at: '2026-03-01T10:00:00.000Z', spec: '{}' }
		] as any);

		const bundle = buildExportBundle([ExportableDataType.AGENTS], 'test-instance');

		expect(bundle.version).toBe(1);
		expect(bundle.exported_at).toBe('2026-03-03T12:00:00.000Z');
		expect(bundle.instance_name).toBe('test-instance');
		expect(bundle.data.agents).toEqual([
			{
				name: 'Support agent',
				version: '1.0.0',
				prompt: 'You are helpful',
				settings: '{"foo":"bar"}',
				linked_templates: [{ template_name: 'chat-template', is_default: true }],
				linked_response_maps: [{ response_map_name: 'chat-map', is_default: false }]
			}
		]);
		expect(bundle.data.conversations).toBeUndefined();
		expect(bundle.data.test_suites).toBeUndefined();
		expect(bundle.data.llm_configs).toBeUndefined();
	});

	it('exports conversations with message references resolved by name and turn targets', () => {
		mockedConversationRepo.getConversations.mockReturnValue([
			{
				id: 3,
				name: 'Greeting flow',
				description: 'Basic greeting',
				tags: '["smoke"]',
				variables: '{"topic":"hello"}',
				required_request_template_capabilities: '{"name":"openai-chat"}',
				required_response_map_capabilities: '{"name":"openai-chat"}',
				stop_on_failure: 1,
				created_at: '2026-03-01T10:00:00.000Z',
				updated_at: '2026-03-01T10:00:00.000Z'
			}
		] as any);
		mockedConversationRepo.getConversationMessages.mockReturnValue([
			{
				id: 30,
				conversation_id: 3,
				sequence: 1,
				role: 'system',
				content: 'System setup',
				request_template_id: 12,
				response_map_id: 22,
				created_at: '2026-03-01T10:00:00.000Z'
			},
			{
				id: 31,
				conversation_id: 3,
				sequence: 2,
				role: 'user',
				content: 'Say hello',
				created_at: '2026-03-01T10:00:00.000Z'
			}
		] as any);
		mockedTemplateRepo.getRequestTemplateById.mockImplementation((id: number) =>
			id === 12 ? ({ id: 12, name: 'req-template', body: '{}' } as any) : undefined
		);
		mockedTemplateRepo.getResponseMapById.mockImplementation((id: number) =>
			id === 22 ? ({ id: 22, name: 'resp-map', spec: '{}' } as any) : undefined
		);
		mockedConversationTurnTargetsRepo.listByConversationId.mockReturnValue([
			{
				id: 1,
				conversation_id: 3,
				user_sequence: 2,
				target_reply: 'Hello!',
				threshold: 80,
				weight: 1,
				created_at: '2026-03-01T10:00:00.000Z',
				updated_at: '2026-03-01T10:00:00.000Z'
			}
		] as any);

		const bundle = buildExportBundle([ExportableDataType.CONVERSATIONS], 'test-instance');
		const expectedConversation = {
			name: 'Greeting flow',
			description: 'Basic greeting',
			tags: '["smoke"]',
			variables: '{"topic":"hello"}',
			required_request_template_capabilities: '{"name":"openai-chat"}',
			required_response_map_capabilities: '{"name":"openai-chat"}',
			stop_on_failure: true,
			messages: [
				{
					sequence: 1,
					role: 'system',
					content: 'System setup',
					request_template_name: 'req-template',
					response_map_name: 'resp-map'
				},
				{
					sequence: 2,
					role: 'user',
					content: 'Say hello'
				}
			],
			turn_targets: [
				{
					user_sequence: 2,
					target_reply: 'Hello!',
					threshold: 80,
					weight: 1
				}
			]
		};

		expect(bundle.data.conversations).toEqual([
			{
				...expectedConversation,
				reference_key: buildConversationReferenceKey(expectedConversation as any)
			}
		]);
	});

	it('exports test suites with entry references resolved by names', () => {
		mockedSuiteRepo.getTestSuites.mockReturnValue([
			{ id: 100, name: 'Top suite', description: 'top', tags: '' },
			{ id: 101, name: 'Child suite', description: 'child', tags: '' }
		] as any);
		mockedSuiteRepo.getEntriesInSuite.mockImplementation((suiteId: number) => {
			if (suiteId === 100) {
				return [
					{ id: 1, parent_suite_id: 100, sequence: 1, conversation_id: 200, agent_id_override: 300 },
					{ id: 2, parent_suite_id: 100, sequence: 2, child_suite_id: 101 }
				] as any;
			}
			return [];
		});
		mockedConversationRepo.getConversationById.mockReturnValue({
			id: 200,
			name: 'Checkout conversation'
		} as any);
		mockedConversationRepo.getConversationMessages.mockImplementation(
			(conversationId: number) => (conversationId === 200 ? [] : []) as any
		);
		mockedConversationTurnTargetsRepo.listByConversationId.mockImplementation(
			(conversationId: number) => (conversationId === 200 ? [] : []) as any
		);
		mockedSuiteRepo.getTestSuiteById.mockImplementation((id: number) =>
			id === 100
				? ({ id: 100, name: 'Top suite', description: 'top', tags: '' } as any)
				: id === 101
					? ({ id: 101, name: 'Child suite', description: 'child', tags: '' } as any)
					: undefined
		);
		mockedAgentRepo.getAgentById.mockReturnValue({
			id: 300,
			name: 'Routing agent',
			version: '2.1.0'
		} as any);

		const bundle = buildExportBundle([ExportableDataType.TEST_SUITES], 'test-instance');
		const childSuite = {
			name: 'Child suite',
			description: 'child',
			tags: '',
			entries: []
		};
		const topSuite = {
			name: 'Top suite',
			description: 'top',
			tags: '',
			entries: [
				{
					sequence: 1,
					conversation_name: 'Checkout conversation',
					agent_override_name: 'Routing agent',
					agent_override_version: '2.1.0'
				},
				{
					sequence: 2,
					child_suite_name: 'Child suite',
					child_suite_reference_key: buildSuiteReferenceKey(childSuite as any)
				}
			]
		};

		expect(bundle.data.test_suites).toEqual([
			{
				...topSuite,
				reference_key: buildSuiteReferenceKey(topSuite as any)
			},
			{
				...childSuite,
				reference_key: buildSuiteReferenceKey(childSuite as any)
			}
		]);
	});

	it('exports global resources without db metadata fields', () => {
		mockedTemplateRepo.listRequestTemplates.mockReturnValue([
			{
				id: 11,
				name: 'request-template',
				description: 'desc',
				capability: '{"name":"openai-chat"}',
				body: '{}',
				created_at: '2026-03-01T10:00:00.000Z'
			}
		] as any);
		mockedTemplateRepo.listResponseMaps.mockReturnValue([
			{
				id: 21,
				name: 'response-map',
				description: 'desc',
				capability: '{"name":"openai-chat"}',
				spec: '{}',
				created_at: '2026-03-01T10:00:00.000Z'
			}
		] as any);
		mockedConfigRepo.getLLMConfigs.mockReturnValue([
			{
				id: 31,
				name: 'Primary LLM',
				provider: 'openai',
				config: '{"model":"gpt-4.1"}',
				priority: 10,
				created_at: '2026-03-01T10:00:00.000Z',
				updated_at: '2026-03-01T10:00:00.000Z'
			}
		] as any);

		const bundle = buildExportBundle(
			[ExportableDataType.REQUEST_TEMPLATES, ExportableDataType.RESPONSE_MAPS, ExportableDataType.LLM_CONFIGS],
			'test-instance'
		);

		expect(bundle.data.request_templates).toEqual([
			{
				name: 'request-template',
				description: 'desc',
				capability: '{"name":"openai-chat"}',
				body: '{}'
			}
		]);
		expect(bundle.data.response_maps).toEqual([
			{
				name: 'response-map',
				description: 'desc',
				capability: '{"name":"openai-chat"}',
				spec: '{}'
			}
		]);
		expect(bundle.data.llm_configs).toEqual([
			{
				name: 'Primary LLM',
				provider: 'openai',
				config: '{"model":"gpt-4.1"}',
				priority: 10
			}
		]);
	});

	it('does not query unrelated repositories for unselected types', () => {
		mockedAgentRepo.getAgents.mockReturnValue([]);

		buildExportBundle([ExportableDataType.AGENTS], 'test-instance');

		expect(mockedAgentRepo.getAgents).toHaveBeenCalledTimes(1);
		expect(mockedConversationRepo.getConversations).not.toHaveBeenCalled();
		expect(mockedSuiteRepo.getTestSuites).not.toHaveBeenCalled();
		expect(mockedConfigRepo.getLLMConfigs).not.toHaveBeenCalled();
		expect(mockedTemplateRepo.listRequestTemplates).not.toHaveBeenCalled();
		expect(mockedTemplateRepo.listResponseMaps).not.toHaveBeenCalled();
	});

	it('exports duplicate conversations with distinct reference keys and uses the exact reference in suite entries', () => {
		mockedConversationRepo.getConversations.mockReturnValue([
			{ id: 10, name: 'Duplicate flow', description: 'First variant' },
			{ id: 11, name: 'Duplicate flow', description: 'Second variant' }
		] as any);
		mockedConversationRepo.getConversationMessages.mockImplementation(
			(conversationId: number) =>
				(conversationId === 10
					? [{ id: 100, conversation_id: 10, sequence: 1, role: 'user', content: 'first prompt' }]
					: [{ id: 101, conversation_id: 11, sequence: 1, role: 'user', content: 'second prompt' }]) as any
		);
		mockedConversationTurnTargetsRepo.listByConversationId.mockReturnValue([]);
		mockedSuiteRepo.getTestSuites.mockReturnValue([
			{ id: 200, name: 'Suite with duplicate conversation', description: '', tags: '' }
		] as any);
		mockedSuiteRepo.getEntriesInSuite.mockReturnValue([
			{ id: 300, parent_suite_id: 200, sequence: 1, conversation_id: 11 }
		] as any);
		mockedConversationRepo.getConversationById.mockImplementation(
			(conversationId: number) =>
				(conversationId === 10
					? { id: 10, name: 'Duplicate flow', description: 'First variant' }
					: { id: 11, name: 'Duplicate flow', description: 'Second variant' }) as any
		);
		mockedSuiteRepo.getTestSuiteById.mockImplementation((id: number) =>
			id === 200
				? ({ id: 200, name: 'Suite with duplicate conversation', description: '', tags: '' } as any)
				: undefined
		);

		const bundle = buildExportBundle(
			[ExportableDataType.CONVERSATIONS, ExportableDataType.TEST_SUITES],
			'test-instance'
		);

		expect(bundle.data.conversations).toHaveLength(2);
		expect(bundle.data.conversations?.[0].reference_key).not.toEqual(bundle.data.conversations?.[1].reference_key);
		expect(bundle.data.test_suites?.[0].entries?.[0]).toEqual({
			sequence: 1,
			conversation_name: 'Duplicate flow',
			conversation_reference_key: bundle.data.conversations?.[1].reference_key
		});
	});

	it('preserves child suite reference keys when exporting cyclic suite graphs', () => {
		mockedSuiteRepo.getTestSuites.mockReturnValue([
			{ id: 301, name: 'Suite A', description: 'first', tags: '' },
			{ id: 302, name: 'Suite B', description: 'second', tags: '' }
		] as any);
		mockedSuiteRepo.getTestSuiteById.mockImplementation((id: number) =>
			id === 301
				? ({ id: 301, name: 'Suite A', description: 'first', tags: '' } as any)
				: id === 302
					? ({ id: 302, name: 'Suite B', description: 'second', tags: '' } as any)
					: undefined
		);
		mockedSuiteRepo.getEntriesInSuite.mockImplementation((suiteId: number) => {
			if (suiteId === 301) {
				return [{ id: 1, parent_suite_id: 301, sequence: 1, child_suite_id: 302 }] as any;
			}
			if (suiteId === 302) {
				return [{ id: 2, parent_suite_id: 302, sequence: 1, child_suite_id: 301 }] as any;
			}
			return [];
		});

		const bundle = buildExportBundle([ExportableDataType.TEST_SUITES], 'test-instance');
		const suiteA = bundle.data.test_suites?.find((suite) => suite.name === 'Suite A');
		const suiteB = bundle.data.test_suites?.find((suite) => suite.name === 'Suite B');

		expect(suiteA?.reference_key).toBeDefined();
		expect(suiteB?.reference_key).toBeDefined();
		expect(suiteA?.entries?.[0]).toEqual({
			sequence: 1,
			child_suite_name: 'Suite B',
			child_suite_reference_key: suiteB?.reference_key
		});
		expect(suiteB?.entries?.[0]).toEqual({
			sequence: 1,
			child_suite_name: 'Suite A',
			child_suite_reference_key: suiteA?.reference_key
		});
	});
});
