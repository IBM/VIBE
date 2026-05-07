import type { Agent } from '@ibm-vibe/types';

type AgentRepoModule = typeof import('../agentRepo');

const bootstrapRepo = (): AgentRepoModule => {
	process.env.DB_PATH = ':memory:';
	let repo: AgentRepoModule | undefined;
	jest.isolateModules(() => {
		// eslint-disable-next-line @typescript-eslint/no-var-requires
		repo = require('../agentRepo') as AgentRepoModule;
	});
	if (!repo) {
		throw new Error('Failed to load agentRepo module');
	}
	return repo;
};

const createTestAgent = (repo: typeof import('../agentRepo'), overrides: Partial<Agent> = {}) => {
	return repo.createAgent({
		name: 'capability-agent',
		version: '1.0.0',
		prompt: 'prompt',
		settings: JSON.stringify({ type: 'external_api', api_endpoint: 'http://example.com' }),
		...overrides
	});
};

describe('agentRepo capabilities storage', () => {
	it('persists request template capability name', () => {
		const repo = bootstrapRepo();
		const agent = createTestAgent(repo);

		repo.createAgentRequestTemplate(agent.id!, {
			name: 'tpl-cap',
			body: '{"input":"{{input}}"}',
			capabilities: { name: 'openai-chat' }
		});

		const templates = repo.listAgentRequestTemplates(agent.id!);
		expect(templates).toHaveLength(1);
		expect(templates[0].capabilities).toBeTruthy();
		const parsed = JSON.parse(String(templates[0].capabilities));
		expect(parsed.name).toBe('openai-chat');
	});

	it('returns null capabilities when omitted', () => {
		const repo = bootstrapRepo();
		const agent = createTestAgent(repo);

		repo.createAgentRequestTemplate(agent.id!, {
			name: 'tpl-default',
			body: '{"input":"{{input}}"}'
		});

		const [template] = repo.listAgentRequestTemplates(agent.id!);
		// Capabilities should be null when not provided
		expect(template.capabilities).toBeNull();
	});

	it('persists response map capability name', () => {
		const repo = bootstrapRepo();
		const agent = createTestAgent(repo);

		repo.createAgentResponseMap(agent.id!, {
			name: 'map-cap',
			spec: '{"output":"choices.0.message.content"}',
			capabilities: { name: 'openai-chat' }
		});

		const maps = repo.listAgentResponseMaps(agent.id!);
		expect(maps).toHaveLength(1);
		expect(maps[0].capabilities).toBeTruthy();
		const parsed = JSON.parse(String(maps[0].capabilities));
		expect(parsed.name).toBe('openai-chat');
	});
});
