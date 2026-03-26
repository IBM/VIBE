import type { ImportRequest } from '@ibm-vibe/types';
import { executeImportBundle } from '../execute';
import db from '../../../db/database';
import * as agentRepo from '../../../db/repositories/agentRepo';
import * as conversationRepo from '../../../db/repositories/conversationRepo';
import * as conversationTurnTargetsRepo from '../../../db/repositories/conversationTurnTargetsRepo';
import * as suiteRepo from '../../../db/repositories/suiteRepo';
import * as configRepo from '../../../db/repositories/configRepo';
import * as templateRepo from '../../../db/repositories/templateRepo';
import {
	buildConversationItemKey,
	buildConversationReferenceKey,
	buildLLMConfigItemKey,
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
jest.mock('../../../db/repositories/conversationTurnTargetsRepo');
jest.mock('../../../db/repositories/suiteRepo');
jest.mock('../../../db/repositories/configRepo');
jest.mock('../../../db/repositories/templateRepo');

const mockedDb = db as jest.Mocked<typeof db>;
const mockedAgentRepo = agentRepo as jest.Mocked<typeof agentRepo>;
const mockedConversationRepo = conversationRepo as jest.Mocked<typeof conversationRepo>;
const mockedConversationTurnTargetsRepo = conversationTurnTargetsRepo as jest.Mocked<typeof conversationTurnTargetsRepo>;
const mockedSuiteRepo = suiteRepo as jest.Mocked<typeof suiteRepo>;
const mockedConfigRepo = configRepo as jest.Mocked<typeof configRepo>;
const mockedTemplateRepo = templateRepo as jest.Mocked<typeof templateRepo>;

const createImportRequest = (overrides: Partial<ImportRequest>): ImportRequest => ({
	bundle: {
		version: 1,
		exported_at: '2026-03-03T12:00:00.000Z',
		data: {}
	},
	resolutions: {},
	...overrides
});

const createTemplateResolution = (template: { name: string; body: string }, decision: 'skip' | 'overwrite' | 'create_new') => ({
	[buildRequestTemplateItemKey(template as any)]: {
		item_key: buildRequestTemplateItemKey(template as any),
		decision
	}
});

describe('executeImportBundle', () => {
	beforeEach(() => {
		jest.clearAllMocks();
		(mockedDb.transaction as jest.Mock).mockImplementation((callback: () => void) => callback);

		mockedAgentRepo.getAgents.mockReturnValue([]);
		mockedConversationRepo.getConversations.mockReturnValue([]);
		mockedSuiteRepo.getTestSuites.mockReturnValue([]);
		mockedConfigRepo.getLLMConfigs.mockReturnValue([]);
		mockedTemplateRepo.listRequestTemplates.mockReturnValue([]);
		mockedTemplateRepo.listResponseMaps.mockReturnValue([]);
		mockedTemplateRepo.getAgentTemplates.mockReturnValue([]);
		mockedTemplateRepo.getAgentResponseMaps.mockReturnValue([]);

		mockedTemplateRepo.createRequestTemplate.mockImplementation((payload: any) => ({ id: 1, ...payload }));
		mockedTemplateRepo.updateRequestTemplate.mockImplementation((id: number, payload: any) => ({ id, ...payload }));
		mockedTemplateRepo.createResponseMap.mockImplementation((payload: any) => ({ id: 2, ...payload }));
		mockedTemplateRepo.updateResponseMap.mockImplementation((id: number, payload: any) => ({ id, ...payload }));
		mockedConfigRepo.createLLMConfig.mockImplementation((payload: any) => ({ id: 3, ...payload }));
		mockedConfigRepo.updateLLMConfig.mockImplementation((id: number, payload: any) => ({ id, ...payload }));
		mockedAgentRepo.createAgent.mockImplementation((payload: any) => ({ id: 4, ...payload }));
		mockedAgentRepo.updateAgent.mockImplementation((id: number, payload: any) => ({ id, ...payload }));
		mockedConversationRepo.createConversation.mockImplementation((payload: any) => ({ id: 5, ...payload }));
		mockedConversationRepo.updateConversation.mockImplementation((id: number, payload: any) => ({ id, ...payload }));
		mockedSuiteRepo.createTestSuite.mockImplementation((payload: any) => ({ id: 6, ...payload }));
		mockedSuiteRepo.updateTestSuite.mockImplementation((id: number, payload: any) => ({ id, ...payload }));
		mockedConversationRepo.getConversationMessages.mockReturnValue([]);
		mockedConversationTurnTargetsRepo.listByConversationId.mockReturnValue([]);
		mockedSuiteRepo.getEntriesInSuite.mockReturnValue([]);
	});

	it('skips items when decision is skip', () => {
		const template = { name: 'template-a', body: '{}' };
		const request = createImportRequest({
			bundle: {
				version: 1,
				exported_at: '2026-03-03T12:00:00.000Z',
				data: {
					request_templates: [template]
				}
			},
			resolutions: createTemplateResolution(template, 'skip')
		});

		const result = executeImportBundle(request);

		expect(mockedTemplateRepo.createRequestTemplate).not.toHaveBeenCalled();
		expect(result.created).toBe(0);
		expect(result.updated).toBe(0);
		expect(result.skipped).toBe(1);
	});

	it('creates new resources when decision is create_new and no conflict exists', () => {
		const template = { name: 'template-a', body: '{"foo":"bar"}' };
		const request = createImportRequest({
			bundle: {
				version: 1,
				exported_at: '2026-03-03T12:00:00.000Z',
				data: {
					request_templates: [template]
				}
			},
			resolutions: createTemplateResolution(template, 'create_new')
		});

		const result = executeImportBundle(request);

		expect(mockedTemplateRepo.createRequestTemplate).toHaveBeenCalledWith({
			name: 'template-a',
			body: '{"foo":"bar"}'
		});
		expect(result.created).toBe(1);
		expect(result.updated).toBe(0);
		expect(result.skipped).toBe(0);
	});

	it('overwrites existing resource when decision is overwrite', () => {
		mockedTemplateRepo.listRequestTemplates.mockReturnValue([
			{ id: 12, name: 'template-a', body: '{"old":true}' }
		] as any);
		const template = { name: 'template-a', body: '{"new":true}' };

		const request = createImportRequest({
			bundle: {
				version: 1,
				exported_at: '2026-03-03T12:00:00.000Z',
				data: {
					request_templates: [template]
				}
			},
			resolutions: createTemplateResolution(template, 'overwrite')
		});

		const result = executeImportBundle(request);

		expect(mockedTemplateRepo.updateRequestTemplate).toHaveBeenCalledWith(12, {
			name: 'template-a',
			body: '{"new":true}'
		});
		expect(result.created).toBe(0);
		expect(result.updated).toBe(1);
		expect(result.skipped).toBe(0);
	});

	it('renames conflicting create_new items with imported suffix by default', () => {
		mockedTemplateRepo.listRequestTemplates.mockReturnValue([
			{ id: 12, name: 'template-a', body: '{"old":true}' }
		] as any);
		const template = { name: 'template-a', body: '{"new":true}' };

		const request = createImportRequest({
			bundle: {
				version: 1,
				exported_at: '2026-03-03T12:00:00.000Z',
				data: {
					request_templates: [template]
				}
			},
			resolutions: createTemplateResolution(template, 'create_new')
		});

		executeImportBundle(request);

		expect(mockedTemplateRepo.createRequestTemplate).toHaveBeenCalledWith({
			name: 'template-a (imported)',
			body: '{"new":true}'
		});
	});

	it('renames repeated create_new template copies with a numbered imported suffix', () => {
		mockedTemplateRepo.listRequestTemplates.mockReturnValue([
			{ id: 12, name: 'template-a', body: '{"old":true}' },
			{ id: 13, name: 'template-a (imported)', body: '{"older":true}' }
		] as any);
		const template = { name: 'template-a', body: '{"new":true}' };

		const request = createImportRequest({
			bundle: {
				version: 1,
				exported_at: '2026-03-03T12:00:00.000Z',
				data: {
					request_templates: [template]
				}
			},
			resolutions: createTemplateResolution(template, 'create_new')
		});

		executeImportBundle(request);

		expect(mockedTemplateRepo.createRequestTemplate).toHaveBeenCalledWith({
			name: 'template-a (imported 2)',
			body: '{"new":true}'
		});
	});

	it('renames repeated create_new agent copies with a numbered imported suffix', () => {
		mockedAgentRepo.getAgents.mockReturnValue([
			{ id: 20, name: 'Agent A', version: '1.0.0' },
			{ id: 21, name: 'Agent A (imported)', version: '1.0.0' }
		] as any);

		const request = createImportRequest({
			bundle: {
				version: 1,
				exported_at: '2026-03-03T12:00:00.000Z',
				data: {
					agents: [{
						name: 'Agent A',
						version: '1.0.0',
						prompt: 'Prompt',
						settings: '{}'
					}]
				}
			},
			resolutions: {
				'agents:Agent A@1.0.0': { item_key: 'agents:Agent A@1.0.0', decision: 'create_new' }
			}
		});

		executeImportBundle(request);

		expect(mockedAgentRepo.createAgent).toHaveBeenCalledWith({
			name: 'Agent A (imported 2)',
			version: '1.0.0',
			prompt: 'Prompt',
			settings: '{}'
		});
	});

	it('processes dependencies in correct order and links templates to created agents', () => {
		const callOrder: string[] = [];
		const template = { name: 'template-a', body: '{}' };
		mockedTemplateRepo.createRequestTemplate.mockImplementation((payload: any) => {
			callOrder.push('createTemplate');
			return { id: 100, ...payload };
		});
		mockedAgentRepo.createAgent.mockImplementation((payload: any) => {
			callOrder.push('createAgent');
			return { id: 200, ...payload };
		});
		mockedTemplateRepo.linkTemplateToAgent.mockImplementation(() => {
			callOrder.push('linkTemplate');
		});

		const request = createImportRequest({
			bundle: {
				version: 1,
				exported_at: '2026-03-03T12:00:00.000Z',
				data: {
					request_templates: [template],
					agents: [
						{
							name: 'Agent A',
							version: '1.0.0',
							prompt: 'Prompt',
							settings: '{}',
							linked_templates: [{ template_name: 'template-a', is_default: true }]
						}
					]
				}
			},
			resolutions: {
				...createTemplateResolution(template, 'create_new'),
				'agents:Agent A@1.0.0': { item_key: 'agents:Agent A@1.0.0', decision: 'create_new' }
			}
		});

		executeImportBundle(request);

		expect(callOrder).toEqual(['createTemplate', 'createAgent', 'linkTemplate']);
		expect(mockedTemplateRepo.linkTemplateToAgent).toHaveBeenCalledWith(200, 100, true);
	});

	it('overwrites agents by replacing stale template and response map links', () => {
		mockedAgentRepo.getAgents.mockReturnValue([
			{ id: 200, name: 'Agent A', version: '1.0.0' }
		] as any);
		mockedTemplateRepo.listRequestTemplates.mockReturnValue([
			{ id: 100, name: 'template-new', body: '{}' }
		] as any);
		mockedTemplateRepo.listResponseMaps.mockReturnValue([
			{ id: 110, name: 'map-new', spec: '{}' }
		] as any);
		mockedTemplateRepo.getAgentTemplates.mockReturnValue([
			{ id: 300, name: 'template-old', is_default: 1 }
		] as any);
		mockedTemplateRepo.getAgentResponseMaps.mockReturnValue([
			{ id: 400, name: 'map-old', is_default: 1 }
		] as any);

		const request = createImportRequest({
			bundle: {
				version: 1,
				exported_at: '2026-03-03T12:00:00.000Z',
				data: {
					agents: [{
						name: 'Agent A',
						version: '1.0.0',
						prompt: 'Updated prompt',
						settings: '{}',
						linked_templates: [{ template_name: 'template-new', is_default: true }],
						linked_response_maps: [{ response_map_name: 'map-new', is_default: true }]
					}]
				}
			},
			resolutions: {
				'agents:Agent A@1.0.0': { item_key: 'agents:Agent A@1.0.0', decision: 'overwrite' }
			}
		});

		executeImportBundle(request);

		expect(mockedTemplateRepo.unlinkTemplateFromAgent).toHaveBeenCalledWith(200, 300);
		expect(mockedTemplateRepo.unlinkResponseMapFromAgent).toHaveBeenCalledWith(200, 400);
		expect(mockedTemplateRepo.linkTemplateToAgent).toHaveBeenCalledWith(200, 100, true);
		expect(mockedTemplateRepo.linkResponseMapToAgent).toHaveBeenCalledWith(200, 110, true);
	});

	it('creates conversation messages and turn targets for imported conversations', () => {
		mockedConversationRepo.createConversation.mockReturnValue({
			id: 501,
			name: 'Conversation A'
		} as any);

		const request = createImportRequest({
			bundle: {
				version: 1,
				exported_at: '2026-03-03T12:00:00.000Z',
				data: {
					conversations: [
						{
							name: 'Conversation A',
							messages: [
								{ sequence: 1, role: 'system', content: 'setup' },
								{ sequence: 2, role: 'user', content: 'hello' }
							],
							turn_targets: [{ user_sequence: 2, target_reply: 'Hi there', threshold: 90, weight: 1 }]
						}
					]
				}
			},
			resolutions: {}
		});

		executeImportBundle(request);

		expect(mockedConversationRepo.addMessageToConversation).toHaveBeenCalledTimes(2);
		expect(mockedConversationRepo.addMessageToConversation).toHaveBeenCalledWith({
			conversation_id: 501,
			sequence: 1,
			role: 'system',
			content: 'setup',
			metadata: undefined,
			request_template_id: undefined,
			response_map_id: undefined,
			set_variables: undefined
		});
		expect(mockedConversationTurnTargetsRepo.create).toHaveBeenCalledWith(501, 2, 'Hi there', 90, 1);
	});

	it('overwrites a conversation by replacing existing messages and turn targets before adding imported children', () => {
		mockedConversationRepo.getConversations.mockReturnValue([
			{ id: 501, name: 'Conversation A' }
		] as any);
		mockedConversationRepo.getConversationMessages.mockReturnValue([
			{ id: 91, conversation_id: 501, sequence: 1 },
			{ id: 92, conversation_id: 501, sequence: 2 }
		] as any);
		mockedConversationTurnTargetsRepo.listByConversationId.mockReturnValue([
			{ id: 81, conversation_id: 501, user_sequence: 2, target_reply: 'old target' }
		] as any);

		const conversation = {
			name: 'Conversation A',
			messages: [{ sequence: 1, role: 'user', content: 'replacement' }],
			turn_targets: [{ user_sequence: 1, target_reply: 'new target' }]
		};
		const request = createImportRequest({
			bundle: {
				version: 1,
				exported_at: '2026-03-03T12:00:00.000Z',
				data: {
					conversations: [conversation as any]
				}
			},
			resolutions: {
				[buildConversationItemKey(conversation as any)]: {
					item_key: buildConversationItemKey(conversation as any),
					decision: 'overwrite'
				}
			}
		});

		executeImportBundle(request);

		expect(mockedConversationTurnTargetsRepo.deleteById).toHaveBeenCalledWith(81);
		expect(mockedConversationRepo.deleteConversationMessage).toHaveBeenCalledWith(91);
		expect(mockedConversationRepo.deleteConversationMessage).toHaveBeenCalledWith(92);
		expect(mockedConversationRepo.updateConversation).toHaveBeenCalledWith(501, expect.objectContaining({ name: 'Conversation A' }));
		expect(mockedConversationRepo.addMessageToConversation).toHaveBeenCalledWith(expect.objectContaining({
			conversation_id: 501,
			sequence: 1,
			content: 'replacement'
		}));
		expect(mockedConversationTurnTargetsRepo.create).toHaveBeenCalledWith(501, 1, 'new target', undefined, undefined);
	});

	it('resolves legacy name-only suite entries after overwriting a conversation', () => {
		mockedConversationRepo.getConversations.mockReturnValue([
			{ id: 501, name: 'Conversation A' }
		] as any);
		mockedSuiteRepo.createTestSuite.mockReturnValue({ id: 700, name: 'Suite A' } as any);

		const conversation = {
			name: 'Conversation A',
			messages: [{ sequence: 1, role: 'user', content: 'replacement' }],
			turn_targets: []
		};
		const suite = {
			name: 'Suite A',
			entries: [{ sequence: 1, conversation_name: 'Conversation A' }]
		};
		const request = createImportRequest({
			bundle: {
				version: 1,
				exported_at: '2026-03-03T12:00:00.000Z',
				data: {
					conversations: [conversation as any],
					test_suites: [suite as any]
				}
			},
			resolutions: {
				[buildConversationItemKey(conversation as any)]: {
					item_key: buildConversationItemKey(conversation as any),
					decision: 'overwrite'
				},
				[buildSuiteItemKey(suite as any)]: {
					item_key: buildSuiteItemKey(suite as any),
					decision: 'create_new'
				}
			}
		});

		expect(() => executeImportBundle(request)).not.toThrow();
		expect(mockedSuiteRepo.addSuiteEntry).toHaveBeenCalledWith({
			parent_suite_id: 700,
			sequence: 1,
			conversation_id: 501,
			child_suite_id: undefined,
			agent_id_override: undefined
		});
	});

	it('resolves suite entry conversation names to imported conversation IDs', () => {
		const conversation = { name: 'Conversation A', messages: [], turn_targets: [] };
		const suite = {
			name: 'Suite A',
			entries: [{
				sequence: 1,
				conversation_name: 'Conversation A',
				conversation_reference_key: buildConversationReferenceKey(conversation as any)
			}]
		};
		mockedConversationRepo.createConversation.mockReturnValue({ id: 600, name: 'Conversation A' } as any);
		mockedSuiteRepo.createTestSuite.mockReturnValue({ id: 700, name: 'Suite A' } as any);

		const request = createImportRequest({
			bundle: {
				version: 1,
				exported_at: '2026-03-03T12:00:00.000Z',
				data: {
					conversations: [conversation as any],
					test_suites: [suite as any]
				}
			},
			resolutions: {
				[buildConversationItemKey(conversation as any)]: {
					item_key: buildConversationItemKey(conversation as any),
					decision: 'create_new'
				},
				[buildSuiteItemKey(suite as any)]: { item_key: buildSuiteItemKey(suite as any), decision: 'create_new' }
			}
		});

		executeImportBundle(request);

		expect(mockedSuiteRepo.addSuiteEntry).toHaveBeenCalledWith({
			parent_suite_id: 700,
			sequence: 1,
			conversation_id: 600,
			child_suite_id: undefined,
			agent_id_override: undefined
		});
	});

	it('uses conversation reference keys to resolve duplicate-name conversations in suite entries', () => {
		const firstConversation = {
			name: 'Duplicate flow',
			description: 'First',
			messages: [{ sequence: 1, role: 'user', content: 'first' }],
			turn_targets: []
		};
		const secondConversation = {
			name: 'Duplicate flow',
			description: 'Second',
			messages: [{ sequence: 1, role: 'user', content: 'second' }],
			turn_targets: []
		};
		mockedConversationRepo.createConversation
			.mockReturnValueOnce({ id: 601, name: 'Duplicate flow' } as any)
			.mockReturnValueOnce({ id: 602, name: 'Duplicate flow' } as any);
		const suite = {
			name: 'Suite A',
			entries: [{
				sequence: 1,
				conversation_name: 'Duplicate flow',
				conversation_reference_key: buildConversationReferenceKey(secondConversation as any)
			}]
		};
		mockedSuiteRepo.createTestSuite.mockReturnValue({ id: 700, name: 'Suite A' } as any);

		const request = createImportRequest({
			bundle: {
				version: 1,
				exported_at: '2026-03-03T12:00:00.000Z',
				data: {
					conversations: [firstConversation as any, secondConversation as any],
					test_suites: [suite as any]
				}
			},
			resolutions: {
				[buildConversationItemKey(firstConversation as any)]: {
					item_key: buildConversationItemKey(firstConversation as any),
					decision: 'create_new'
				},
				[buildConversationItemKey(secondConversation as any)]: {
					item_key: buildConversationItemKey(secondConversation as any),
					decision: 'create_new'
				},
				[buildSuiteItemKey(suite as any)]: { item_key: buildSuiteItemKey(suite as any), decision: 'create_new' }
			}
		});

		executeImportBundle(request);

		expect(mockedSuiteRepo.addSuiteEntry).toHaveBeenCalledWith({
			parent_suite_id: 700,
			sequence: 1,
			conversation_id: 602,
			child_suite_id: undefined,
			agent_id_override: undefined
		});
	});

	it('overwrites a suite by replacing existing suite entries before inserting imported entries', () => {
		mockedSuiteRepo.getTestSuites.mockReturnValue([{ id: 700, name: 'Suite A' }] as any);
		mockedSuiteRepo.getEntriesInSuite.mockReturnValue([
			{ id: 801, parent_suite_id: 700, sequence: 1 },
			{ id: 802, parent_suite_id: 700, sequence: 2 }
		] as any);
		const suite = { name: 'Suite A', entries: [{ sequence: 1 }] };

		const request = createImportRequest({
			bundle: {
				version: 1,
				exported_at: '2026-03-03T12:00:00.000Z',
				data: {
					test_suites: [suite as any]
				}
			},
			resolutions: {
				[buildSuiteItemKey(suite as any)]: { item_key: buildSuiteItemKey(suite as any), decision: 'overwrite' }
			}
		});

		executeImportBundle(request);

		expect(mockedSuiteRepo.deleteSuiteEntry).toHaveBeenCalledWith(801);
		expect(mockedSuiteRepo.deleteSuiteEntry).toHaveBeenCalledWith(802);
		expect(mockedSuiteRepo.updateTestSuite).toHaveBeenCalledWith(700, expect.objectContaining({ name: 'Suite A' }));
		expect(mockedSuiteRepo.addSuiteEntry).toHaveBeenCalledWith(expect.objectContaining({
			parent_suite_id: 700,
			sequence: 1
		}));
	});

	it('throws and rolls back when a forced conversation import has unresolved dependencies', () => {
		const conversation = {
			name: 'Conversation A',
			messages: [{ sequence: 1, role: 'user', content: 'hello', request_template_name: 'missing-template' }],
			turn_targets: []
		};
		const request = createImportRequest({
			bundle: {
				version: 1,
				exported_at: '2026-03-03T12:00:00.000Z',
				data: {
					conversations: [conversation as any]
				}
			},
			resolutions: {
				[buildConversationItemKey(conversation as any)]: {
					item_key: buildConversationItemKey(conversation as any),
					decision: 'create_new'
				}
			}
		});

		expect(() => executeImportBundle(request)).toThrow(
			'Invalid decision "create_new" for conversations "Conversation A" with status dependency_missing'
		);
		expect(mockedConversationRepo.createConversation).not.toHaveBeenCalled();
	});

	it('rejects a selected import when its bundled dependency was skipped', () => {
		const template = { name: 'shared-template', body: '{}' };
		const request = createImportRequest({
			bundle: {
				version: 1,
				exported_at: '2026-03-03T12:00:00.000Z',
				data: {
					request_templates: [template],
					agents: [{
						name: 'Bot',
						version: '1.0.0',
						prompt: 'Prompt',
						settings: '{}',
						linked_templates: [{ template_name: 'shared-template' }]
					}]
				}
			},
			resolutions: {
				[buildRequestTemplateItemKey(template as any)]: {
					item_key: buildRequestTemplateItemKey(template as any),
					decision: 'skip'
				},
				'agents:Bot@1.0.0': {
					item_key: 'agents:Bot@1.0.0',
					decision: 'create_new'
				}
			}
		});

		expect(() => executeImportBundle(request)).toThrow(
			'Invalid decision "create_new" for agents "Bot@1.0.0" with status dependency_missing'
		);
		expect(mockedAgentRepo.createAgent).not.toHaveBeenCalled();
	});

	it('throws and rolls back when a forced suite import has unresolved dependencies', () => {
		const suite = {
			name: 'Suite A',
			entries: [{ sequence: 1, conversation_name: 'Missing conversation' }]
		};
		const request = createImportRequest({
			bundle: {
				version: 1,
				exported_at: '2026-03-03T12:00:00.000Z',
				data: {
					test_suites: [suite as any]
				}
			},
			resolutions: {
				[buildSuiteItemKey(suite as any)]: { item_key: buildSuiteItemKey(suite as any), decision: 'create_new' }
			}
		});

		expect(() => executeImportBundle(request)).toThrow(
			'Invalid decision "create_new" for test_suites "Suite A" with status dependency_missing'
		);
		expect(mockedSuiteRepo.createTestSuite).not.toHaveBeenCalled();
	});

	it('disallows overwrite for duplicate imported conversations when one existing same-name conversation exists', () => {
		mockedConversationRepo.getConversations.mockReturnValue([
			{ id: 501, name: 'Duplicate flow' }
		] as any);
		const firstConversation = {
			name: 'Duplicate flow',
			description: 'First',
			messages: [{ sequence: 1, role: 'user', content: 'first' }],
			turn_targets: []
		};
		const secondConversation = {
			name: 'Duplicate flow',
			description: 'Second',
			messages: [{ sequence: 1, role: 'user', content: 'second' }],
			turn_targets: []
		};

		const request = createImportRequest({
			bundle: {
				version: 1,
				exported_at: '2026-03-03T12:00:00.000Z',
				data: {
					conversations: [firstConversation as any, secondConversation as any]
				}
			},
			resolutions: {
				[buildConversationItemKey(firstConversation as any)]: {
					item_key: buildConversationItemKey(firstConversation as any),
					decision: 'overwrite'
				},
				[buildConversationItemKey(secondConversation as any)]: {
					item_key: buildConversationItemKey(secondConversation as any),
					decision: 'create_new'
				}
			}
		});

		expect(() => executeImportBundle(request)).toThrow(
			`Invalid decision "overwrite" for conversations "${firstConversation.name} [${buildConversationReferenceKey(firstConversation as any).slice(-6)}]" with status conflict`
		);
	});

	it('disallows overwrite for llm configs when multiple existing configs share the same name', () => {
		mockedConfigRepo.getLLMConfigs.mockReturnValue([
			{ id: 301, name: 'Primary', provider: 'openai', config: '{"model":"a"}', priority: 1 },
			{ id: 302, name: 'Primary', provider: 'anthropic', config: '{"model":"b"}', priority: 2 }
		] as any);
		const llmConfig = {
			name: 'Primary',
			provider: 'openai',
			config: '{"model":"c"}',
			priority: 3
		};

		const request = createImportRequest({
			bundle: {
				version: 1,
				exported_at: '2026-03-03T12:00:00.000Z',
				data: {
					llm_configs: [llmConfig as any]
				}
			},
			resolutions: {
				[buildLLMConfigItemKey(llmConfig as any)]: {
					item_key: buildLLMConfigItemKey(llmConfig as any),
					decision: 'overwrite'
				}
			}
		});

		expect(() => executeImportBundle(request)).toThrow(
			'Invalid decision "overwrite" for llm_configs "Primary" with status conflict'
		);
		expect(mockedConfigRepo.updateLLMConfig).not.toHaveBeenCalled();
	});

	it('uses child suite reference keys to resolve duplicate-name child suites', () => {
		const firstSuite = {
			name: 'Shared suite',
			description: 'First child',
			entries: []
		};
		const secondSuite = {
			name: 'Shared suite',
			description: 'Second child',
			entries: []
		};
		const parentSuite = {
			name: 'Parent suite',
			entries: [{
				sequence: 1,
				child_suite_name: 'Shared suite',
				child_suite_reference_key: buildSuiteReferenceKey(secondSuite as any)
			}]
		};

		mockedSuiteRepo.createTestSuite
			.mockReturnValueOnce({ id: 710, name: 'Shared suite' } as any)
			.mockReturnValueOnce({ id: 711, name: 'Shared suite' } as any)
			.mockReturnValueOnce({ id: 712, name: 'Parent suite' } as any);

		const request = createImportRequest({
			bundle: {
				version: 1,
				exported_at: '2026-03-03T12:00:00.000Z',
				data: {
					test_suites: [firstSuite as any, secondSuite as any, parentSuite as any]
				}
			},
			resolutions: {
				[buildSuiteItemKey(firstSuite as any)]: { item_key: buildSuiteItemKey(firstSuite as any), decision: 'create_new' },
				[buildSuiteItemKey(secondSuite as any)]: { item_key: buildSuiteItemKey(secondSuite as any), decision: 'create_new' },
				[buildSuiteItemKey(parentSuite as any)]: { item_key: buildSuiteItemKey(parentSuite as any), decision: 'create_new' }
			}
		});

		executeImportBundle(request);

		expect(mockedSuiteRepo.addSuiteEntry).toHaveBeenCalledWith({
			parent_suite_id: 712,
			sequence: 1,
			conversation_id: undefined,
			child_suite_id: 711,
			agent_id_override: undefined
		});
	});

	it('runs inside a transaction and surfaces failures', () => {
		mockedTemplateRepo.createRequestTemplate.mockImplementation(() => {
			throw new Error('create failure');
		});
		const template = { name: 'template-a', body: '{}' };

		const request = createImportRequest({
			bundle: {
				version: 1,
				exported_at: '2026-03-03T12:00:00.000Z',
				data: {
					request_templates: [template]
				}
			},
			resolutions: createTemplateResolution(template, 'create_new')
		});

		expect(() => executeImportBundle(request)).toThrow('create failure');
		expect(mockedDb.transaction).toHaveBeenCalledTimes(1);
	});
});
