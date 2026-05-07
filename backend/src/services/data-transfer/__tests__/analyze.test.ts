import type { ExportBundle } from '@ibm-vibe/types';
import { ExportableDataType } from '@ibm-vibe/types';
import { analyzeImportBundle } from '../analyze';
import * as agentRepo from '../../../db/repositories/agentRepo';
import * as conversationRepo from '../../../db/repositories/conversationRepo';
import * as suiteRepo from '../../../db/repositories/suiteRepo';
import * as configRepo from '../../../db/repositories/configRepo';
import * as templateRepo from '../../../db/repositories/templateRepo';
import {
	buildConversationReferenceKey,
	buildRequestTemplateItemKey,
	buildSuiteItemKey,
	buildSuiteReferenceKey
} from '../identity';

jest.mock('../../../db/database', () => ({
	__esModule: true,
	default: {
		transaction: jest.fn((callback: () => void) => callback)
	}
}));
jest.mock('../../../db/repositories/agentRepo');
jest.mock('../../../db/repositories/conversationRepo');
jest.mock('../../../db/repositories/suiteRepo');
jest.mock('../../../db/repositories/configRepo');
jest.mock('../../../db/repositories/templateRepo');

const mockedAgentRepo = agentRepo as jest.Mocked<typeof agentRepo>;
const mockedConversationRepo = conversationRepo as jest.Mocked<typeof conversationRepo>;
const mockedSuiteRepo = suiteRepo as jest.Mocked<typeof suiteRepo>;
const mockedConfigRepo = configRepo as jest.Mocked<typeof configRepo>;
const mockedTemplateRepo = templateRepo as jest.Mocked<typeof templateRepo>;

const createBundle = (overrides: Partial<ExportBundle>): ExportBundle => ({
	version: 1,
	exported_at: '2026-03-03T12:00:00.000Z',
	data: {},
	...overrides
});

describe('analyzeImportBundle', () => {
	beforeEach(() => {
		jest.clearAllMocks();
		mockedAgentRepo.getAgents.mockReturnValue([]);
		mockedConversationRepo.getConversations.mockReturnValue([]);
		mockedSuiteRepo.getTestSuites.mockReturnValue([]);
		mockedConfigRepo.getLLMConfigs.mockReturnValue([]);
		mockedTemplateRepo.listRequestTemplates.mockReturnValue([]);
		mockedTemplateRepo.listResponseMaps.mockReturnValue([]);
	});

	it('marks an unseen agent as new', () => {
		const bundle = createBundle({
			data: {
				agents: [
					{
						name: 'Bot',
						version: '1.0',
						prompt: 'Prompt',
						settings: '{}'
					}
				]
			}
		});

		const report = analyzeImportBundle(bundle);
		const item = report.items[0];

		expect(item.entity_type).toBe(ExportableDataType.AGENTS);
		expect(item.entity_name).toBe('Bot@1.0');
		expect(item.status).toBe('new');
		expect(report.totals).toEqual({ new: 1, conflict: 0, dependency_missing: 0 });
		expect(report.has_issues).toBe(false);
	});

	it('marks an existing agent with same name+version as conflict', () => {
		mockedAgentRepo.getAgents.mockReturnValue([
			{ id: 50, name: 'Bot', version: '1.0', prompt: '', settings: '{}' }
		] as any);

		const bundle = createBundle({
			data: {
				agents: [
					{
						name: 'Bot',
						version: '1.0',
						prompt: 'Prompt',
						settings: '{}'
					}
				]
			}
		});

		const report = analyzeImportBundle(bundle);
		const item = report.items[0];

		expect(item.status).toBe('conflict');
		expect(item.existing_id).toBe(50);
		expect(report.totals).toEqual({ new: 0, conflict: 1, dependency_missing: 0 });
		expect(report.has_issues).toBe(true);
	});

	it('marks existing conversation name as conflict', () => {
		mockedConversationRepo.getConversations.mockReturnValue([{ id: 3, name: 'Greeting flow' }] as any);

		const bundle = createBundle({
			data: {
				conversations: [
					{
						name: 'Greeting flow',
						messages: [{ sequence: 1, role: 'user', content: 'hello' }],
						turn_targets: []
					}
				]
			}
		});

		const report = analyzeImportBundle(bundle);
		const item = report.items[0];

		expect(item.entity_type).toBe(ExportableDataType.CONVERSATIONS);
		expect(item.status).toBe('conflict');
		expect(item.existing_id).toBe(3);
	});

	it('allows create_new when multiple existing conversations share the same name', () => {
		mockedConversationRepo.getConversations.mockReturnValue([
			{ id: 3, name: 'Greeting flow' },
			{ id: 4, name: 'Greeting flow' }
		] as any);

		const bundle = createBundle({
			data: {
				conversations: [
					{
						name: 'Greeting flow',
						messages: [{ sequence: 1, role: 'user', content: 'hello' }],
						turn_targets: []
					}
				]
			}
		});

		const report = analyzeImportBundle(bundle);
		expect(report.items[0]).toMatchObject({
			entity_type: ExportableDataType.CONVERSATIONS,
			status: 'conflict',
			issues: expect.arrayContaining(['Ambiguous existing conversation name: Greeting flow']),
			allowed_decisions: ['skip', 'create_new']
		});
	});

	it('creates unique analysis item keys for duplicate conversation names in the bundle', () => {
		const firstConversation = {
			name: 'Duplicate flow',
			description: 'First variant',
			messages: [{ sequence: 1, role: 'user', content: 'first' }],
			turn_targets: []
		};
		const secondConversation = {
			name: 'Duplicate flow',
			description: 'Second variant',
			messages: [{ sequence: 1, role: 'user', content: 'second' }],
			turn_targets: []
		};
		const bundle = createBundle({
			data: {
				conversations: [firstConversation as any, secondConversation as any]
			}
		});

		const report = analyzeImportBundle(bundle);
		const items = report.items.filter((item) => item.entity_type === ExportableDataType.CONVERSATIONS);

		expect(items).toHaveLength(2);
		expect(items[0].item_key).not.toEqual(items[1].item_key);
		expect(items.map((item) => item.entity_name)).toEqual(
			expect.arrayContaining([
				expect.stringContaining(buildConversationReferenceKey(firstConversation as any).slice(-6)),
				expect.stringContaining(buildConversationReferenceKey(secondConversation as any).slice(-6))
			])
		);
	});

	it('disallows overwrite when duplicate imported conversations share a name with an existing conversation', () => {
		mockedConversationRepo.getConversations.mockReturnValue([{ id: 3, name: 'Duplicate flow' }] as any);
		const firstConversation = {
			name: 'Duplicate flow',
			description: 'First variant',
			messages: [{ sequence: 1, role: 'user', content: 'first' }],
			turn_targets: []
		};
		const secondConversation = {
			name: 'Duplicate flow',
			description: 'Second variant',
			messages: [{ sequence: 1, role: 'user', content: 'second' }],
			turn_targets: []
		};

		const report = analyzeImportBundle(
			createBundle({
				data: {
					conversations: [firstConversation as any, secondConversation as any]
				}
			})
		);

		const items = report.items.filter((item) => item.entity_type === ExportableDataType.CONVERSATIONS);
		expect(items).toHaveLength(2);
		expect(items.every((item) => item.status === 'conflict')).toBe(true);
		expect(items.every((item) => item.allowed_decisions?.join(',') === 'skip,create_new')).toBe(true);
	});

	it('marks suite as dependency_missing when referenced conversation does not exist', () => {
		const bundle = createBundle({
			data: {
				test_suites: [
					{
						name: 'Suite A',
						entries: [{ sequence: 1, conversation_name: 'Missing convo' }]
					}
				]
			}
		});

		const report = analyzeImportBundle(bundle);
		const suiteItem = report.items[0];

		expect(suiteItem.status).toBe('dependency_missing');
		expect(suiteItem.issues).toEqual(expect.arrayContaining(['Missing conversation dependency: Missing convo']));
		expect(report.totals).toEqual({ new: 0, conflict: 0, dependency_missing: 1 });
		expect(report.has_issues).toBe(true);
	});

	it('does not mark missing dependency when dependency is present in bundle', () => {
		const conversation = {
			name: 'New convo',
			messages: [{ sequence: 1, role: 'user', content: 'hi' }],
			turn_targets: []
		};
		const bundle = createBundle({
			data: {
				conversations: [conversation as any],
				test_suites: [
					{
						name: 'Suite A',
						entries: [
							{
								sequence: 1,
								conversation_name: 'New convo',
								conversation_reference_key: buildConversationReferenceKey(conversation as any)
							}
						]
					}
				]
			}
		});

		const report = analyzeImportBundle(bundle);
		const suiteItem = report.items.find((item) => item.entity_type === ExportableDataType.TEST_SUITES);
		const conversationItem = report.items.find((item) => item.entity_type === ExportableDataType.CONVERSATIONS);

		expect(conversationItem?.status).toBe('new');
		expect(suiteItem?.status).toBe('new');
		expect(report.totals).toEqual({ new: 2, conflict: 0, dependency_missing: 0 });
	});

	it('marks legacy suite references to duplicate-name conversations as ambiguous', () => {
		const bundle = createBundle({
			data: {
				conversations: [
					{
						name: 'Duplicate flow',
						messages: [{ sequence: 1, role: 'user', content: 'first' }],
						turn_targets: []
					},
					{
						name: 'Duplicate flow',
						messages: [{ sequence: 1, role: 'user', content: 'second' }],
						turn_targets: []
					}
				],
				test_suites: [
					{
						name: 'Suite A',
						entries: [{ sequence: 1, conversation_name: 'Duplicate flow' }]
					}
				]
			}
		});

		const report = analyzeImportBundle(bundle);
		const suiteItem = report.items.find((item) => item.entity_type === ExportableDataType.TEST_SUITES);

		expect(suiteItem?.status).toBe('dependency_missing');
		expect(suiteItem?.issues).toEqual(
			expect.arrayContaining(['Ambiguous conversation dependency: Duplicate flow'])
		);
	});

	it('creates unique analysis item keys for duplicate suite names in the bundle', () => {
		const firstSuite = {
			name: 'Duplicate suite',
			description: 'First variant',
			entries: [{ sequence: 1 }]
		};
		const secondSuite = {
			name: 'Duplicate suite',
			description: 'Second variant',
			entries: [{ sequence: 1 }]
		};

		const report = analyzeImportBundle(
			createBundle({
				data: {
					test_suites: [firstSuite as any, secondSuite as any]
				}
			})
		);

		const items = report.items.filter((item) => item.entity_type === ExportableDataType.TEST_SUITES);
		expect(items).toHaveLength(2);
		expect(items[0].item_key).not.toEqual(items[1].item_key);
		expect(items.map((item) => item.entity_name)).toEqual(
			expect.arrayContaining([
				expect.stringContaining(buildSuiteReferenceKey(firstSuite as any).slice(-6)),
				expect.stringContaining(buildSuiteReferenceKey(secondSuite as any).slice(-6))
			])
		);
	});

	it('uses child suite reference keys to avoid ambiguity for duplicate suite names in the bundle', () => {
		const childOne = {
			name: 'Shared name',
			description: 'First child',
			entries: []
		};
		const childTwo = {
			name: 'Shared name',
			description: 'Second child',
			entries: []
		};
		const parentSuite = {
			name: 'Parent suite',
			entries: [
				{
					sequence: 1,
					child_suite_name: 'Shared name',
					child_suite_reference_key: buildSuiteReferenceKey(childTwo as any)
				}
			]
		};

		const report = analyzeImportBundle(
			createBundle({
				data: {
					test_suites: [childOne as any, childTwo as any, parentSuite as any]
				}
			})
		);

		const suiteItem = report.items.find((item) => item.entity_name === 'Parent suite');
		expect(suiteItem?.status).toBe('new');
	});

	it('allows create_new when multiple existing suites share the same name', () => {
		mockedSuiteRepo.getTestSuites.mockReturnValue([
			{ id: 10, name: 'Shared suite' },
			{ id: 11, name: 'Shared suite' }
		] as any);

		const report = analyzeImportBundle(
			createBundle({
				data: {
					test_suites: [{ name: 'Shared suite', entries: [] } as any]
				}
			})
		);

		expect(report.items[0]).toMatchObject({
			entity_type: ExportableDataType.TEST_SUITES,
			status: 'conflict',
			issues: expect.arrayContaining(['Ambiguous existing suite name: Shared suite']),
			allowed_decisions: ['skip', 'create_new']
		});
	});

	it('marks dependent items as missing when selected bundle dependencies are skipped', () => {
		const suite = {
			name: 'Suite A',
			entries: [
				{
					sequence: 1,
					agent_override_name: 'Bot',
					agent_override_version: '1.0.0'
				}
			]
		};
		const bundle = createBundle({
			data: {
				request_templates: [{ name: 'shared-template', body: '{}' }],
				agents: [
					{
						name: 'Bot',
						version: '1.0.0',
						prompt: 'Prompt',
						settings: '{}',
						linked_templates: [{ template_name: 'shared-template' }]
					}
				],
				test_suites: [suite as any]
			}
		});

		const report = analyzeImportBundle(bundle, {
			[buildRequestTemplateItemKey({ name: 'shared-template', body: '{}' } as any)]: {
				item_key: buildRequestTemplateItemKey({ name: 'shared-template', body: '{}' } as any),
				decision: 'skip'
			},
			'agents:Bot@1.0.0': {
				item_key: 'agents:Bot@1.0.0',
				decision: 'create_new'
			},
			[buildSuiteItemKey(suite as any)]: {
				item_key: buildSuiteItemKey(suite as any),
				decision: 'create_new'
			}
		});

		expect(report.items.find((item) => item.item_key === 'agents:Bot@1.0.0')).toMatchObject({
			status: 'dependency_missing',
			issues: expect.arrayContaining(['Missing request template dependency: shared-template'])
		});
		expect(report.items.find((item) => item.item_key === buildSuiteItemKey(suite as any))).toMatchObject({
			status: 'dependency_missing',
			issues: expect.arrayContaining(['Missing agent override dependency: Bot@1.0.0'])
		});
	});

	it('flags agent when linked template dependency is missing', () => {
		const bundle = createBundle({
			data: {
				agents: [
					{
						name: 'Bot',
						version: '1.0',
						prompt: 'Prompt',
						settings: '{}',
						linked_templates: [{ template_name: 'nonexistent-template' }]
					}
				]
			}
		});

		const report = analyzeImportBundle(bundle);
		const agentItem = report.items[0];

		expect(agentItem.status).toBe('dependency_missing');
		expect(agentItem.issues).toEqual(
			expect.arrayContaining(['Missing request template dependency: nonexistent-template'])
		);
	});

	it('creates unique analysis item keys for duplicate llm config names in the bundle', () => {
		mockedConfigRepo.getLLMConfigs.mockReturnValue([{ id: 91, name: 'Primary' }] as any);

		const report = analyzeImportBundle(
			createBundle({
				data: {
					llm_configs: [
						{ name: 'Primary', provider: 'openai', config: '{"model":"a"}', priority: 1 },
						{ name: 'Primary', provider: 'anthropic', config: '{"model":"b"}', priority: 2 }
					]
				}
			})
		);

		const items = report.items.filter((item) => item.entity_type === ExportableDataType.LLM_CONFIGS);
		expect(items).toHaveLength(2);
		expect(items[0].item_key).not.toEqual(items[1].item_key);
		expect(items.every((item) => item.allowed_decisions?.join(',') === 'skip,create_new')).toBe(true);
	});

	it('marks llm config imports as ambiguous when multiple existing configs share the same name', () => {
		mockedConfigRepo.getLLMConfigs.mockReturnValue([
			{ id: 91, name: 'Primary', provider: 'openai', config: '{"model":"a"}', priority: 1 },
			{ id: 92, name: 'Primary', provider: 'anthropic', config: '{"model":"b"}', priority: 2 }
		] as any);

		const report = analyzeImportBundle(
			createBundle({
				data: {
					llm_configs: [{ name: 'Primary', provider: 'openai', config: '{"model":"c"}', priority: 3 }]
				}
			})
		);

		expect(report.items[0]).toMatchObject({
			entity_type: ExportableDataType.LLM_CONFIGS,
			status: 'conflict',
			issues: expect.arrayContaining(['Ambiguous existing LLM config name: Primary']),
			allowed_decisions: ['skip', 'create_new']
		});
	});

	it('returns correct totals for mixed statuses', () => {
		mockedTemplateRepo.listRequestTemplates.mockReturnValue([
			{ id: 22, name: 'existing-template', body: '{}' }
		] as any);

		const bundle = createBundle({
			data: {
				llm_configs: [{ name: 'new-llm', provider: 'openai', config: '{}', priority: 1 }],
				request_templates: [{ name: 'existing-template', body: '{}' }],
				test_suites: [
					{
						name: 'Broken suite',
						entries: [{ sequence: 1, child_suite_name: 'missing-child' }]
					}
				]
			}
		});

		const report = analyzeImportBundle(bundle);

		expect(report.totals).toEqual({ new: 1, conflict: 1, dependency_missing: 1 });
		expect(report.has_issues).toBe(true);
	});

	it('returns an empty analysis for an empty bundle', () => {
		const bundle = createBundle({ data: {} });

		const report = analyzeImportBundle(bundle);

		expect(report.items).toEqual([]);
		expect(report.totals).toEqual({ new: 0, conflict: 0, dependency_missing: 0 });
		expect(report.has_issues).toBe(false);
	});

	it('creates unique analysis item keys for duplicate request template names in the bundle', () => {
		const firstTemplate = { name: 'Shared', body: '{"kind":"first"}' };
		const secondTemplate = { name: 'Shared', body: '{"kind":"second"}' };
		const bundle = createBundle({
			data: {
				request_templates: [firstTemplate as any, secondTemplate as any]
			}
		});

		const report = analyzeImportBundle(bundle);
		const items = report.items.filter((item) => item.entity_type === ExportableDataType.REQUEST_TEMPLATES);

		expect(items).toHaveLength(2);
		expect(items[0].item_key).not.toEqual(items[1].item_key);
		expect(items.map((item) => item.entity_name)).toEqual(
			expect.arrayContaining([
				expect.stringContaining(items[0].item_key.slice(-6)),
				expect.stringContaining(items[1].item_key.slice(-6))
			])
		);
	});
});
