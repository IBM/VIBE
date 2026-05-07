import type { ImportRequest } from '@ibm-vibe/types';
import { buildImportPlan } from '../import-plan';
import * as agentRepo from '../../../db/repositories/agentRepo';
import * as conversationRepo from '../../../db/repositories/conversationRepo';
import * as suiteRepo from '../../../db/repositories/suiteRepo';
import * as configRepo from '../../../db/repositories/configRepo';
import * as templateRepo from '../../../db/repositories/templateRepo';
import { buildAgentItemKey, buildConversationItemKey, buildRequestTemplateItemKey } from '../identity';

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

const createImportRequest = (overrides: Partial<ImportRequest>): ImportRequest => ({
	bundle: {
		version: 1,
		exported_at: '2026-03-03T12:00:00.000Z',
		data: {}
	},
	resolutions: {},
	...overrides
});

describe('buildImportPlan', () => {
	beforeEach(() => {
		jest.clearAllMocks();
		mockedAgentRepo.getAgents.mockReturnValue([]);
		mockedConversationRepo.getConversations.mockReturnValue([]);
		mockedSuiteRepo.getTestSuites.mockReturnValue([]);
		mockedConfigRepo.getLLMConfigs.mockReturnValue([]);
		mockedTemplateRepo.listRequestTemplates.mockReturnValue([]);
		mockedTemplateRepo.listResponseMaps.mockReturnValue([]);
	});

	it('normalizes auto-renamed create_new items into executable resolutions', () => {
		mockedTemplateRepo.listRequestTemplates.mockReturnValue([
			{ id: 12, name: 'template-a', body: '{"old":true}' }
		] as any);
		const template = { name: 'template-a', body: '{"new":true}' };
		const itemKey = buildRequestTemplateItemKey(template as any);

		const plan = buildImportPlan(
			createImportRequest({
				bundle: {
					version: 1,
					exported_at: '2026-03-03T12:00:00.000Z',
					data: {
						request_templates: [template]
					}
				},
				resolutions: {
					[itemKey]: { item_key: itemKey, decision: 'create_new' }
				}
			})
		);

		expect(plan.executable).toBe(true);
		expect(plan.items[0]).toMatchObject({
			item_key: itemKey,
			selected_decision: 'create_new',
			final_name: 'template-a (imported)',
			executable: true
		});
		expect(plan.resolutions[itemKey]).toEqual({
			item_key: itemKey,
			decision: 'create_new',
			new_name: 'template-a (imported)'
		});
	});

	it('blocks explicit new_name collisions with existing items', () => {
		mockedTemplateRepo.listRequestTemplates.mockReturnValue([
			{ id: 12, name: 'template-a', body: '{"old":true}' },
			{ id: 13, name: 'template-b', body: '{"other":true}' }
		] as any);
		const template = { name: 'template-a', body: '{"new":true}' };
		const itemKey = buildRequestTemplateItemKey(template as any);

		const plan = buildImportPlan(
			createImportRequest({
				bundle: {
					version: 1,
					exported_at: '2026-03-03T12:00:00.000Z',
					data: {
						request_templates: [template]
					}
				},
				resolutions: {
					[itemKey]: { item_key: itemKey, decision: 'create_new', new_name: 'template-b' }
				}
			})
		);

		expect(plan.executable).toBe(false);
		expect(plan.items[0]).toMatchObject({
			item_key: itemKey,
			selected_decision: 'create_new',
			final_name: 'template-b',
			executable: false
		});
		expect(plan.issues).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					code: 'final-name-collision',
					message: 'Request template name is already taken: template-b'
				})
			])
		);
	});

	it('blocks explicit agent name and version collisions', () => {
		mockedAgentRepo.getAgents.mockReturnValue([
			{ id: 20, name: 'Bot', version: '1.0.0', prompt: 'old', settings: '{}' },
			{ id: 21, name: 'Bot', version: '2.0.0', prompt: 'newer', settings: '{}' }
		] as any);
		const agent = {
			name: 'Bot',
			version: '1.0.0',
			prompt: 'Prompt',
			settings: '{}'
		};
		const itemKey = buildAgentItemKey(agent);

		const plan = buildImportPlan(
			createImportRequest({
				bundle: {
					version: 1,
					exported_at: '2026-03-03T12:00:00.000Z',
					data: {
						agents: [agent]
					}
				},
				resolutions: {
					[itemKey]: {
						item_key: itemKey,
						decision: 'create_new',
						new_name: 'Bot',
						new_version: '2.0.0'
					}
				}
			})
		);

		expect(plan.executable).toBe(false);
		expect(plan.items[0]).toMatchObject({
			final_name: 'Bot',
			final_version: '2.0.0',
			final_entity_name: 'Bot@2.0.0',
			executable: false
		});
		expect(plan.issues).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					code: 'final-identity-collision',
					message: 'Agent identity is already taken: Bot@2.0.0'
				})
			])
		);
	});

	it('blocks create_new when a conflict item still has dependency issues', () => {
		mockedConversationRepo.getConversations.mockReturnValue([
			{ id: 41, name: 'Greeting flow' },
			{ id: 42, name: 'Greeting flow' }
		] as any);
		const conversation = {
			name: 'Greeting flow',
			messages: [
				{
					sequence: 1,
					role: 'user',
					content: 'hello',
					request_template_name: 'missing-template'
				}
			],
			turn_targets: []
		};
		const itemKey = buildConversationItemKey(conversation as any);

		const plan = buildImportPlan(
			createImportRequest({
				bundle: {
					version: 1,
					exported_at: '2026-03-03T12:00:00.000Z',
					data: {
						conversations: [conversation as any]
					}
				},
				resolutions: {
					[itemKey]: {
						item_key: itemKey,
						decision: 'create_new'
					}
				}
			})
		);

		expect(plan.executable).toBe(false);
		expect(plan.items[0]).toMatchObject({
			item_key: itemKey,
			status: 'conflict',
			selected_decision: 'create_new',
			executable: false
		});
		expect(plan.items[0].issues).toEqual(
			expect.arrayContaining([
				'Ambiguous existing conversation name: Greeting flow',
				'Missing request template dependency in message #1: missing-template'
			])
		);
	});

	it('allows create_new when existing conversation names are ambiguous but dependencies are valid', () => {
		mockedConversationRepo.getConversations.mockReturnValue([
			{ id: 41, name: 'Greeting flow' },
			{ id: 42, name: 'Greeting flow' }
		] as any);
		const conversation = {
			name: 'Greeting flow',
			messages: [{ sequence: 1, role: 'user', content: 'hello' }],
			turn_targets: []
		};
		const itemKey = buildConversationItemKey(conversation as any);

		const plan = buildImportPlan(
			createImportRequest({
				bundle: {
					version: 1,
					exported_at: '2026-03-03T12:00:00.000Z',
					data: {
						conversations: [conversation as any]
					}
				},
				resolutions: {
					[itemKey]: {
						item_key: itemKey,
						decision: 'create_new'
					}
				}
			})
		);

		expect(plan.executable).toBe(true);
		expect(plan.issues).toEqual([]);
		expect(plan.items[0]).toMatchObject({
			item_key: itemKey,
			status: 'conflict',
			selected_decision: 'create_new',
			final_name: 'Greeting flow (imported)',
			executable: true,
			issues: ['Ambiguous existing conversation name: Greeting flow']
		});
	});
});
