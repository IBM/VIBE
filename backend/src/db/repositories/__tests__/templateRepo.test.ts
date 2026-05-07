/**
 * Tests for global template repository (TDD - write tests first)
 */

type TemplateRepoModule = typeof import('../templateRepo');
type AgentRepoModule = typeof import('../agentRepo');

const bootstrapRepos = (): { templateRepo: TemplateRepoModule; agentRepo: AgentRepoModule } => {
	process.env.DB_PATH = ':memory:';
	let templateRepo: TemplateRepoModule | undefined;
	let agentRepo: AgentRepoModule | undefined;
	jest.isolateModules(() => {
		// eslint-disable-next-line @typescript-eslint/no-var-requires
		templateRepo = require('../templateRepo') as TemplateRepoModule;
		// eslint-disable-next-line @typescript-eslint/no-var-requires
		agentRepo = require('../agentRepo') as AgentRepoModule;
	});
	if (!templateRepo || !agentRepo) {
		throw new Error('Failed to load repo modules');
	}
	return { templateRepo, agentRepo };
};

describe('templateRepo', () => {
	describe('request templates CRUD', () => {
		it('creates a request template', () => {
			const { templateRepo } = bootstrapRepos();

			const template = templateRepo.createRequestTemplate({
				name: 'OpenAI Chat',
				description: 'Standard OpenAI chat template',
				capability: JSON.stringify({ name: 'openai-chat' }),
				body: '{"model": "gpt-4", "messages": [{"role": "user", "content": "{{input}}"}]}'
			});

			expect(template.id).toBeDefined();
			expect(template.name).toBe('OpenAI Chat');
			expect(template.description).toBe('Standard OpenAI chat template');
			expect(template.capability).toBe(JSON.stringify({ name: 'openai-chat' }));
			expect(template.body).toContain('{{input}}');
			expect(template.created_at).toBeDefined();
		});

		it('enforces unique template names', () => {
			const { templateRepo } = bootstrapRepos();

			templateRepo.createRequestTemplate({
				name: 'Unique Name',
				body: '{"input": "{{input}}"}'
			});

			expect(() => {
				templateRepo.createRequestTemplate({
					name: 'Unique Name',
					body: '{"different": "body"}'
				});
			}).toThrow();
		});

		it('lists all request templates', () => {
			const { templateRepo } = bootstrapRepos();

			templateRepo.createRequestTemplate({ name: 'Template A', body: '{}' });
			templateRepo.createRequestTemplate({ name: 'Template B', body: '{}' });
			templateRepo.createRequestTemplate({ name: 'Template C', body: '{}' });

			const templates = templateRepo.listRequestTemplates();
			expect(templates).toHaveLength(3);
		});

		it('filters templates by capability', () => {
			const { templateRepo } = bootstrapRepos();

			templateRepo.createRequestTemplate({
				name: 'OpenAI Template',
				capability: JSON.stringify({ name: 'openai-chat' }),
				body: '{}'
			});
			templateRepo.createRequestTemplate({
				name: 'Ollama Template',
				capability: JSON.stringify({ name: 'ollama-generate' }),
				body: '{}'
			});
			templateRepo.createRequestTemplate({
				name: 'No Capability',
				body: '{}'
			});

			const openaiTemplates = templateRepo.listRequestTemplates({ capability: 'openai-chat' });
			expect(openaiTemplates).toHaveLength(1);
			expect(openaiTemplates[0].name).toBe('OpenAI Template');

			const ollamaTemplates = templateRepo.listRequestTemplates({ capability: 'ollama-generate' });
			expect(ollamaTemplates).toHaveLength(1);
			expect(ollamaTemplates[0].name).toBe('Ollama Template');
		});

		it('gets template by id', () => {
			const { templateRepo } = bootstrapRepos();

			const created = templateRepo.createRequestTemplate({
				name: 'Get By ID',
				body: '{"test": true}'
			});

			const retrieved = templateRepo.getRequestTemplateById(created.id!);
			expect(retrieved).toBeDefined();
			expect(retrieved?.name).toBe('Get By ID');
			expect(retrieved?.body).toBe('{"test": true}');
		});

		it('returns undefined for non-existent id', () => {
			const { templateRepo } = bootstrapRepos();

			const retrieved = templateRepo.getRequestTemplateById(99999);
			expect(retrieved).toBeUndefined();
		});

		it('updates a template', () => {
			const { templateRepo } = bootstrapRepos();

			const created = templateRepo.createRequestTemplate({
				name: 'Original Name',
				description: 'Original description',
				body: '{}'
			});

			const updated = templateRepo.updateRequestTemplate(created.id!, {
				name: 'Updated Name',
				description: 'Updated description',
				capability: JSON.stringify({ name: 'new-capability' })
			});

			expect(updated).toBeDefined();
			expect(updated?.name).toBe('Updated Name');
			expect(updated?.description).toBe('Updated description');
			expect(updated?.capability).toBe(JSON.stringify({ name: 'new-capability' }));
		});

		it('deletes a template', () => {
			const { templateRepo } = bootstrapRepos();

			const created = templateRepo.createRequestTemplate({
				name: 'To Delete',
				body: '{}'
			});

			templateRepo.deleteRequestTemplate(created.id!);

			const retrieved = templateRepo.getRequestTemplateById(created.id!);
			expect(retrieved).toBeUndefined();
		});
	});

	describe('response maps CRUD', () => {
		it('creates a response map', () => {
			const { templateRepo } = bootstrapRepos();

			const map = templateRepo.createResponseMap({
				name: 'OpenAI Response',
				description: 'Extract from OpenAI response',
				capability: JSON.stringify({ name: 'openai-chat' }),
				spec: '{"output": "choices.0.message.content"}'
			});

			expect(map.id).toBeDefined();
			expect(map.name).toBe('OpenAI Response');
			expect(map.spec).toContain('choices.0.message.content');
		});

		it('enforces unique response map names', () => {
			const { templateRepo } = bootstrapRepos();

			templateRepo.createResponseMap({
				name: 'Unique Map',
				spec: '{"output": "data"}'
			});

			expect(() => {
				templateRepo.createResponseMap({
					name: 'Unique Map',
					spec: '{"output": "different"}'
				});
			}).toThrow();
		});

		it('lists all response maps', () => {
			const { templateRepo } = bootstrapRepos();

			templateRepo.createResponseMap({ name: 'Map A', spec: '{}' });
			templateRepo.createResponseMap({ name: 'Map B', spec: '{}' });

			const maps = templateRepo.listResponseMaps();
			expect(maps).toHaveLength(2);
		});

		it('filters response maps by capability', () => {
			const { templateRepo } = bootstrapRepos();

			templateRepo.createResponseMap({
				name: 'OpenAI Map',
				capability: JSON.stringify({ name: 'openai-chat' }),
				spec: '{}'
			});
			templateRepo.createResponseMap({
				name: 'Ollama Map',
				capability: JSON.stringify({ name: 'ollama-generate' }),
				spec: '{}'
			});

			const openaiMaps = templateRepo.listResponseMaps({ capability: 'openai-chat' });
			expect(openaiMaps).toHaveLength(1);
			expect(openaiMaps[0].name).toBe('OpenAI Map');
		});

		it('gets response map by id', () => {
			const { templateRepo } = bootstrapRepos();

			const created = templateRepo.createResponseMap({
				name: 'Get By ID',
				spec: '{"output": "result"}'
			});

			const retrieved = templateRepo.getResponseMapById(created.id!);
			expect(retrieved).toBeDefined();
			expect(retrieved?.name).toBe('Get By ID');
		});

		it('updates a response map', () => {
			const { templateRepo } = bootstrapRepos();

			const created = templateRepo.createResponseMap({
				name: 'Original Map',
				spec: '{}'
			});

			const updated = templateRepo.updateResponseMap(created.id!, {
				name: 'Updated Map',
				capability: JSON.stringify({ name: 'updated-capability' })
			});

			expect(updated?.name).toBe('Updated Map');
			expect(updated?.capability).toBe(JSON.stringify({ name: 'updated-capability' }));
		});

		it('deletes a response map', () => {
			const { templateRepo } = bootstrapRepos();

			const created = templateRepo.createResponseMap({
				name: 'To Delete',
				spec: '{}'
			});

			templateRepo.deleteResponseMap(created.id!);

			expect(templateRepo.getResponseMapById(created.id!)).toBeUndefined();
		});
	});

	describe('agent-template linking', () => {
		it('sets first linked template as default when omitted', () => {
			const { templateRepo, agentRepo } = bootstrapRepos();

			const agent = agentRepo.createAgent({
				name: 'default-on-link-agent',
				version: '1.0',
				prompt: 'test',
				settings: '{}'
			});

			const template = templateRepo.createRequestTemplate({ name: 'Default Link', body: '{}' });

			templateRepo.linkTemplateToAgent(agent.id!, template.id!);

			const templates = templateRepo.getAgentTemplates(agent.id!);
			expect(templates).toHaveLength(1);
			expect(templates[0].is_default).toBe(1);
		});

		it('does not clear existing default when linking without is_default', () => {
			const { templateRepo, agentRepo } = bootstrapRepos();

			const agent = agentRepo.createAgent({
				name: 'preserve-default-agent',
				version: '1.0',
				prompt: 'test',
				settings: '{}'
			});

			const template = templateRepo.createRequestTemplate({ name: 'Preserve Default', body: '{}' });

			templateRepo.linkTemplateToAgent(agent.id!, template.id!, true);
			templateRepo.linkTemplateToAgent(agent.id!, template.id!);

			const templates = templateRepo.getAgentTemplates(agent.id!);
			const defaultTemplate = templates.find((t: { is_default?: number | boolean }) => t.is_default);
			expect(defaultTemplate?.id).toBe(template.id);
		});

		it('promotes newest linked template when default unlinked', () => {
			const { templateRepo, agentRepo } = bootstrapRepos();

			const agent = agentRepo.createAgent({
				name: 'promote-default-agent',
				version: '1.0',
				prompt: 'test',
				settings: '{}'
			});

			const template1 = templateRepo.createRequestTemplate({ name: 'Old Default', body: '{}' });
			const template2 = templateRepo.createRequestTemplate({ name: 'New Default', body: '{}' });

			templateRepo.linkTemplateToAgent(agent.id!, template1.id!, true);
			templateRepo.linkTemplateToAgent(agent.id!, template2.id!);

			templateRepo.unlinkTemplateFromAgent(agent.id!, template1.id!);

			const templates = templateRepo.getAgentTemplates(agent.id!);
			const defaultTemplate = templates.find((t: { is_default?: number | boolean }) => t.is_default);
			expect(defaultTemplate?.id).toBe(template2.id);
		});
		it('links a template to an agent', () => {
			const { templateRepo, agentRepo } = bootstrapRepos();

			const agent = agentRepo.createAgent({
				name: 'test-agent',
				version: '1.0',
				prompt: 'test',
				settings: JSON.stringify({ type: 'external_api' })
			});

			const template = templateRepo.createRequestTemplate({
				name: 'Linkable template',
				body: '{}'
			});

			templateRepo.linkTemplateToAgent(agent.id!, template.id!);

			const agentTemplates = templateRepo.getAgentTemplates(agent.id!);
			expect(agentTemplates).toHaveLength(1);
			expect(agentTemplates[0].id).toBe(template.id);
		});

		it('lists templates for an agent', () => {
			const { templateRepo, agentRepo } = bootstrapRepos();

			const agent = agentRepo.createAgent({
				name: 'multi-template-agent',
				version: '1.0',
				prompt: 'test',
				settings: '{}'
			});

			const template1 = templateRepo.createRequestTemplate({ name: 'T1', body: '{}' });
			const template2 = templateRepo.createRequestTemplate({ name: 'T2', body: '{}' });

			templateRepo.linkTemplateToAgent(agent.id!, template1.id!);
			templateRepo.linkTemplateToAgent(agent.id!, template2.id!);

			const templates = templateRepo.getAgentTemplates(agent.id!);
			expect(templates).toHaveLength(2);
		});

		it('sets default template for agent', () => {
			const { templateRepo, agentRepo } = bootstrapRepos();

			const agent = agentRepo.createAgent({
				name: 'default-test-agent',
				version: '1.0',
				prompt: 'test',
				settings: '{}'
			});

			const template1 = templateRepo.createRequestTemplate({ name: 'First', body: '{}' });
			const template2 = templateRepo.createRequestTemplate({ name: 'Second', body: '{}' });

			templateRepo.linkTemplateToAgent(agent.id!, template1.id!);
			templateRepo.linkTemplateToAgent(agent.id!, template2.id!);

			templateRepo.setAgentDefaultTemplate(agent.id!, template2.id!);

			const templates = templateRepo.getAgentTemplates(agent.id!);
			const defaultTemplate = templates.find((t: { is_default?: number | boolean }) => t.is_default);
			expect(defaultTemplate?.id).toBe(template2.id);
		});

		it('only allows one default template per agent', () => {
			const { templateRepo, agentRepo } = bootstrapRepos();

			const agent = agentRepo.createAgent({
				name: 'single-default-agent',
				version: '1.0',
				prompt: 'test',
				settings: '{}'
			});

			const template1 = templateRepo.createRequestTemplate({ name: 'T1', body: '{}' });
			const template2 = templateRepo.createRequestTemplate({ name: 'T2', body: '{}' });

			templateRepo.linkTemplateToAgent(agent.id!, template1.id!, true);
			templateRepo.linkTemplateToAgent(agent.id!, template2.id!, true);

			const templates = templateRepo.getAgentTemplates(agent.id!);
			const defaults = templates.filter((t: { is_default?: number | boolean }) => t.is_default);
			expect(defaults).toHaveLength(1);
			expect(defaults[0].id).toBe(template2.id);
		});

		it('unlinks template from agent', () => {
			const { templateRepo, agentRepo } = bootstrapRepos();

			const agent = agentRepo.createAgent({
				name: 'unlink-agent',
				version: '1.0',
				prompt: 'test',
				settings: '{}'
			});

			const template = templateRepo.createRequestTemplate({ name: 'Unlinkable', body: '{}' });

			templateRepo.linkTemplateToAgent(agent.id!, template.id!);
			expect(templateRepo.getAgentTemplates(agent.id!)).toHaveLength(1);

			templateRepo.unlinkTemplateFromAgent(agent.id!, template.id!);
			expect(templateRepo.getAgentTemplates(agent.id!)).toHaveLength(0);
		});

		it('deleting agent cascades to unlink', () => {
			const { templateRepo, agentRepo } = bootstrapRepos();

			const agent = agentRepo.createAgent({
				name: 'cascade-agent',
				version: '1.0',
				prompt: 'test',
				settings: '{}'
			});

			const template = templateRepo.createRequestTemplate({ name: 'Cascade Test', body: '{}' });

			templateRepo.linkTemplateToAgent(agent.id!, template.id!);

			// Delete agent
			agentRepo.deleteAgent(agent.id!);

			// Template should still exist but link should be gone
			expect(templateRepo.getRequestTemplateById(template.id!)).toBeDefined();
			// Agent templates should be empty since agent is gone
			expect(templateRepo.getAgentTemplates(agent.id!)).toHaveLength(0);
		});

		it('deleting template cascades to unlink', () => {
			const { templateRepo, agentRepo } = bootstrapRepos();

			const agent = agentRepo.createAgent({
				name: 'template-delete-agent',
				version: '1.0',
				prompt: 'test',
				settings: '{}'
			});

			const template = templateRepo.createRequestTemplate({ name: 'Delete Me', body: '{}' });

			templateRepo.linkTemplateToAgent(agent.id!, template.id!);
			expect(templateRepo.getAgentTemplates(agent.id!)).toHaveLength(1);

			templateRepo.deleteRequestTemplate(template.id!);
			expect(templateRepo.getAgentTemplates(agent.id!)).toHaveLength(0);
		});
	});

	describe('agent-response-map linking', () => {
		it('sets first linked response map as default when omitted', () => {
			const { templateRepo, agentRepo } = bootstrapRepos();

			const agent = agentRepo.createAgent({
				name: 'default-map-agent',
				version: '1.0',
				prompt: 'test',
				settings: '{}'
			});

			const map = templateRepo.createResponseMap({ name: 'Default Map', spec: '{}' });

			templateRepo.linkResponseMapToAgent(agent.id!, map.id!);

			const maps = templateRepo.getAgentResponseMaps(agent.id!);
			expect(maps).toHaveLength(1);
			expect(maps[0].is_default).toBe(1);
		});

		it('does not clear existing default when linking response map without is_default', () => {
			const { templateRepo, agentRepo } = bootstrapRepos();

			const agent = agentRepo.createAgent({
				name: 'preserve-map-default-agent',
				version: '1.0',
				prompt: 'test',
				settings: '{}'
			});

			const map = templateRepo.createResponseMap({ name: 'Preserve Map', spec: '{}' });

			templateRepo.linkResponseMapToAgent(agent.id!, map.id!, true);
			templateRepo.linkResponseMapToAgent(agent.id!, map.id!);

			const maps = templateRepo.getAgentResponseMaps(agent.id!);
			const defaultMap = maps.find((m: { is_default?: number | boolean }) => m.is_default);
			expect(defaultMap?.id).toBe(map.id);
		});

		it('promotes newest linked response map when default unlinked', () => {
			const { templateRepo, agentRepo } = bootstrapRepos();

			const agent = agentRepo.createAgent({
				name: 'promote-map-default-agent',
				version: '1.0',
				prompt: 'test',
				settings: '{}'
			});

			const map1 = templateRepo.createResponseMap({ name: 'Old Map', spec: '{}' });
			const map2 = templateRepo.createResponseMap({ name: 'New Map', spec: '{}' });

			templateRepo.linkResponseMapToAgent(agent.id!, map1.id!, true);
			templateRepo.linkResponseMapToAgent(agent.id!, map2.id!);

			templateRepo.unlinkResponseMapFromAgent(agent.id!, map1.id!);

			const maps = templateRepo.getAgentResponseMaps(agent.id!);
			const defaultMap = maps.find((m: { is_default?: number | boolean }) => m.is_default);
			expect(defaultMap?.id).toBe(map2.id);
		});
		it('links a response map to an agent', () => {
			const { templateRepo, agentRepo } = bootstrapRepos();

			const agent = agentRepo.createAgent({
				name: 'map-link-agent',
				version: '1.0',
				prompt: 'test',
				settings: '{}'
			});

			const map = templateRepo.createResponseMap({ name: 'Linkable Map', spec: '{}' });

			templateRepo.linkResponseMapToAgent(agent.id!, map.id!);

			const agentMaps = templateRepo.getAgentResponseMaps(agent.id!);
			expect(agentMaps).toHaveLength(1);
			expect(agentMaps[0].id).toBe(map.id);
		});

		it('sets default response map for agent', () => {
			const { templateRepo, agentRepo } = bootstrapRepos();

			const agent = agentRepo.createAgent({
				name: 'map-default-agent',
				version: '1.0',
				prompt: 'test',
				settings: '{}'
			});

			const map1 = templateRepo.createResponseMap({ name: 'Map1', spec: '{}' });
			const map2 = templateRepo.createResponseMap({ name: 'Map2', spec: '{}' });

			templateRepo.linkResponseMapToAgent(agent.id!, map1.id!);
			templateRepo.linkResponseMapToAgent(agent.id!, map2.id!);

			templateRepo.setAgentDefaultResponseMap(agent.id!, map2.id!);

			const maps = templateRepo.getAgentResponseMaps(agent.id!);
			const defaultMap = maps.find((m: { is_default?: number | boolean }) => m.is_default);
			expect(defaultMap?.id).toBe(map2.id);
		});

		it('unlinks response map from agent', () => {
			const { templateRepo, agentRepo } = bootstrapRepos();

			const agent = agentRepo.createAgent({
				name: 'map-unlink-agent',
				version: '1.0',
				prompt: 'test',
				settings: '{}'
			});

			const map = templateRepo.createResponseMap({ name: 'Unlinkable Map', spec: '{}' });

			templateRepo.linkResponseMapToAgent(agent.id!, map.id!);
			expect(templateRepo.getAgentResponseMaps(agent.id!)).toHaveLength(1);

			templateRepo.unlinkResponseMapFromAgent(agent.id!, map.id!);
			expect(templateRepo.getAgentResponseMaps(agent.id!)).toHaveLength(0);
		});
	});

	describe('capability name listing', () => {
		it('lists distinct capability names from templates', () => {
			const { templateRepo } = bootstrapRepos();

			templateRepo.createRequestTemplate({
				name: 'T1',
				capability: JSON.stringify({ name: 'openai-chat' }),
				body: '{}'
			});
			templateRepo.createRequestTemplate({
				name: 'T2',
				capability: JSON.stringify({ name: 'openai-chat' }),
				body: '{}'
			});
			templateRepo.createRequestTemplate({
				name: 'T3',
				capability: JSON.stringify({ name: 'ollama-generate' }),
				body: '{}'
			});
			templateRepo.createRequestTemplate({
				name: 'T4',
				body: '{}'
			});

			const names = templateRepo.listRequestTemplateCapabilityNames();
			expect(names).toHaveLength(2);
			expect(names).toContain('openai-chat');
			expect(names).toContain('ollama-generate');
		});

		it('lists distinct capability names from response maps', () => {
			const { templateRepo } = bootstrapRepos();

			templateRepo.createResponseMap({
				name: 'M1',
				capability: JSON.stringify({ name: 'openai-chat' }),
				spec: '{}'
			});
			templateRepo.createResponseMap({
				name: 'M2',
				capability: JSON.stringify({ name: 'watsonx-chat' }),
				spec: '{}'
			});

			const names = templateRepo.listResponseMapCapabilityNames();
			expect(names).toHaveLength(2);
			expect(names).toContain('openai-chat');
			expect(names).toContain('watsonx-chat');
		});
	});

	describe('unique name helpers', () => {
		it('returns base name when unused', () => {
			const { templateRepo } = bootstrapRepos();
			templateRepo.createRequestTemplate({ name: 'Taken', body: '{}' });

			const unique = templateRepo.getUniqueRequestTemplateName('Unique');
			expect(unique).toBe('Unique');
		});

		it('adds suffix when request template name exists', () => {
			const { templateRepo } = bootstrapRepos();
			templateRepo.createRequestTemplate({ name: 'Default', body: '{}' });

			const unique = templateRepo.getUniqueRequestTemplateName('Default', 'Agent A');
			expect(unique).toBe('Default (Agent A)');
		});

		it('adds suffix when response map name exists', () => {
			const { templateRepo } = bootstrapRepos();
			templateRepo.createResponseMap({ name: 'Default Map', spec: '{}' });

			const unique = templateRepo.getUniqueResponseMapName('Default Map', 'Agent A');
			expect(unique).toBe('Default Map (Agent A)');
		});

		describe('error and constraint handling', () => {
			it('handles update with no changes gracefully', () => {
				const { templateRepo } = bootstrapRepos();

				const created = templateRepo.createRequestTemplate({
					name: 'No Change',
					body: '{}'
				});

				const updated = templateRepo.updateRequestTemplate(created.id!, {});
				expect(updated).toEqual(created);
			});

			it('returns undefined when updating non-existent template', () => {
				const { templateRepo } = bootstrapRepos();

				const result = templateRepo.updateRequestTemplate(99999, { name: 'New Name' });
				expect(result).toBeUndefined();
			});

			it('returns undefined when updating non-existent response map', () => {
				const { templateRepo } = bootstrapRepos();

				const result = templateRepo.updateResponseMap(99999, { name: 'New Name' });
				expect(result).toBeUndefined();
			});

			it('handles deleting non-existent template gracefully', () => {
				const { templateRepo } = bootstrapRepos();

				expect(() => {
					templateRepo.deleteRequestTemplate(99999);
				}).not.toThrow();
			});

			it('handles deleting non-existent response map gracefully', () => {
				const { templateRepo } = bootstrapRepos();

				expect(() => {
					templateRepo.deleteResponseMap(99999);
				}).not.toThrow();
			});

			it('throws on linking template to non-existent agent', () => {
				const { templateRepo } = bootstrapRepos();

				const template = templateRepo.createRequestTemplate({ name: 'Test', body: '{}' });

				// Foreign key constraint should be enforced
				expect(() => {
					templateRepo.linkTemplateToAgent(99999, template.id!);
				}).toThrow('FOREIGN KEY constraint failed');
			});

			it('throws on linking non-existent template to agent', () => {
				const { templateRepo, agentRepo } = bootstrapRepos();

				const agent = agentRepo.createAgent({
					name: 'test',
					version: '1.0',
					prompt: 'test',
					settings: '{}'
				});

				// Foreign key constraint should be enforced
				expect(() => {
					templateRepo.linkTemplateToAgent(agent.id!, 99999);
				}).toThrow('FOREIGN KEY constraint failed');
			});

			it('handles unlinking non-existent template from agent', () => {
				const { templateRepo, agentRepo } = bootstrapRepos();

				const agent = agentRepo.createAgent({
					name: 'test',
					version: '1.0',
					prompt: 'test',
					settings: '{}'
				});

				expect(() => {
					templateRepo.unlinkTemplateFromAgent(agent.id!, 99999);
				}).not.toThrow();
			});

			it('handles setting default for non-existent template', () => {
				const { templateRepo, agentRepo } = bootstrapRepos();

				const agent = agentRepo.createAgent({
					name: 'test',
					version: '1.0',
					prompt: 'test',
					settings: '{}'
				});

				expect(() => {
					templateRepo.setAgentDefaultTemplate(agent.id!, 99999);
				}).not.toThrow();
			});

			it('handles setting default for non-existent response map', () => {
				const { templateRepo, agentRepo } = bootstrapRepos();

				const agent = agentRepo.createAgent({
					name: 'test',
					version: '1.0',
					prompt: 'test',
					settings: '{}'
				});

				expect(() => {
					templateRepo.setAgentDefaultResponseMap(agent.id!, 99999);
				}).not.toThrow();
			});

			it('handles capability extraction with invalid JSON', () => {
				const { templateRepo } = bootstrapRepos();

				// Create template with invalid JSON capability (should be stored as-is)
				const template = templateRepo.createRequestTemplate({
					name: 'Invalid Cap',
					capability: 'not-json',
					body: '{}'
				});

				expect(template.capability).toBe('not-json');

				// Listing should handle invalid JSON gracefully
				const names = templateRepo.listRequestTemplateCapabilityNames();
				expect(names).toContain('not-json'); // Treats as plain string
			});

			it('handles empty capability string', () => {
				const { templateRepo } = bootstrapRepos();

				templateRepo.createRequestTemplate({
					name: 'Empty Cap',
					capability: '',
					body: '{}'
				});

				const names = templateRepo.listRequestTemplateCapabilityNames();
				expect(names).not.toContain('');
			});

			it('handles null capability', () => {
				const { templateRepo } = bootstrapRepos();

				const template = templateRepo.createRequestTemplate({
					name: 'Null Cap',
					body: '{}'
				});

				expect(template.capability).toBeNull();
			});

			it('handles legacy schema field in capability', () => {
				const { templateRepo } = bootstrapRepos();

				templateRepo.createRequestTemplate({
					name: 'Legacy',
					capability: JSON.stringify({ schema: 'legacy-cap' }),
					body: '{}'
				});

				const names = templateRepo.listRequestTemplateCapabilityNames();
				expect(names).toContain('legacy-cap');
			});

			it('filters templates by capability with no matches', () => {
				const { templateRepo } = bootstrapRepos();

				templateRepo.createRequestTemplate({
					name: 'Test',
					capability: JSON.stringify({ name: 'openai-chat' }),
					body: '{}'
				});

				const filtered = templateRepo.listRequestTemplates({ capability: 'non-existent' });
				expect(filtered).toHaveLength(0);
			});

			it('filters response maps by capability with no matches', () => {
				const { templateRepo } = bootstrapRepos();

				templateRepo.createResponseMap({
					name: 'Test',
					capability: JSON.stringify({ name: 'openai-chat' }),
					spec: '{}'
				});

				const filtered = templateRepo.listResponseMaps({ capability: 'non-existent' });
				expect(filtered).toHaveLength(0);
			});

			it('handles multiple templates with same capability', () => {
				const { templateRepo } = bootstrapRepos();

				templateRepo.createRequestTemplate({
					name: 'T1',
					capability: JSON.stringify({ name: 'openai-chat' }),
					body: '{}'
				});
				templateRepo.createRequestTemplate({
					name: 'T2',
					capability: JSON.stringify({ name: 'openai-chat' }),
					body: '{}'
				});

				const filtered = templateRepo.listRequestTemplates({ capability: 'openai-chat' });
				expect(filtered).toHaveLength(2);
			});

			it('generates unique names with multiple collisions', () => {
				const { templateRepo } = bootstrapRepos();

				templateRepo.createRequestTemplate({ name: 'Collision', body: '{}' });
				templateRepo.createRequestTemplate({ name: 'Collision (Agent A)', body: '{}' });
				templateRepo.createRequestTemplate({ name: 'Collision (Agent A 2)', body: '{}' });

				const unique = templateRepo.getUniqueRequestTemplateName('Collision', 'Agent A');
				expect(unique).toBe('Collision (Agent A 3)');
			});

			it('handles unique name generation without agent name', () => {
				const { templateRepo } = bootstrapRepos();

				templateRepo.createRequestTemplate({ name: 'Test', body: '{}' });

				const unique = templateRepo.getUniqueRequestTemplateName('Test');
				expect(unique).toBe('Test (copy)');
			});

			it('gets template link info', () => {
				const { templateRepo, agentRepo } = bootstrapRepos();

				const agent = agentRepo.createAgent({
					name: 'test',
					version: '1.0',
					prompt: 'test',
					settings: '{}'
				});

				const template = templateRepo.createRequestTemplate({ name: 'Test', body: '{}' });

				templateRepo.linkTemplateToAgent(agent.id!, template.id!, true);

				const link = templateRepo.getAgentTemplateLink(agent.id!, template.id!);
				expect(link).toBeDefined();
				expect(link?.is_default).toBe(1);
				expect(link?.linked_at).toBeDefined();
			});

			it('returns undefined for non-existent template link', () => {
				const { templateRepo, agentRepo } = bootstrapRepos();

				const agent = agentRepo.createAgent({
					name: 'test',
					version: '1.0',
					prompt: 'test',
					settings: '{}'
				});

				const link = templateRepo.getAgentTemplateLink(agent.id!, 99999);
				expect(link).toBeUndefined();
			});

			it('gets response map link info', () => {
				const { templateRepo, agentRepo } = bootstrapRepos();

				const agent = agentRepo.createAgent({
					name: 'test',
					version: '1.0',
					prompt: 'test',
					settings: '{}'
				});

				const map = templateRepo.createResponseMap({ name: 'Test', spec: '{}' });

				templateRepo.linkResponseMapToAgent(agent.id!, map.id!, true);

				const link = templateRepo.getAgentResponseMapLink(agent.id!, map.id!);
				expect(link).toBeDefined();
				expect(link?.is_default).toBe(1);
				expect(link?.linked_at).toBeDefined();
			});

			it('returns undefined for non-existent response map link', () => {
				const { templateRepo, agentRepo } = bootstrapRepos();

				const agent = agentRepo.createAgent({
					name: 'test',
					version: '1.0',
					prompt: 'test',
					settings: '{}'
				});

				const link = templateRepo.getAgentResponseMapLink(agent.id!, 99999);
				expect(link).toBeUndefined();
			});

			it('counts template links', () => {
				const { templateRepo, agentRepo } = bootstrapRepos();

				const agent1 = agentRepo.createAgent({
					name: 'agent1',
					version: '1.0',
					prompt: 'test',
					settings: '{}'
				});

				const agent2 = agentRepo.createAgent({
					name: 'agent2',
					version: '1.0',
					prompt: 'test',
					settings: '{}'
				});

				const template = templateRepo.createRequestTemplate({ name: 'Shared', body: '{}' });

				templateRepo.linkTemplateToAgent(agent1.id!, template.id!);
				templateRepo.linkTemplateToAgent(agent2.id!, template.id!);

				const count = templateRepo.getTemplateLinkCount(template.id!);
				expect(count).toBe(2);
			});

			it('counts response map links', () => {
				const { templateRepo, agentRepo } = bootstrapRepos();

				const agent1 = agentRepo.createAgent({
					name: 'agent1',
					version: '1.0',
					prompt: 'test',
					settings: '{}'
				});

				const agent2 = agentRepo.createAgent({
					name: 'agent2',
					version: '1.0',
					prompt: 'test',
					settings: '{}'
				});

				const map = templateRepo.createResponseMap({ name: 'Shared', spec: '{}' });

				templateRepo.linkResponseMapToAgent(agent1.id!, map.id!);
				templateRepo.linkResponseMapToAgent(agent2.id!, map.id!);

				const count = templateRepo.getResponseMapLinkCount(map.id!);
				expect(count).toBe(2);
			});

			it('returns zero for template with no links', () => {
				const { templateRepo } = bootstrapRepos();

				const template = templateRepo.createRequestTemplate({ name: 'Unlinked', body: '{}' });

				const count = templateRepo.getTemplateLinkCount(template.id!);
				expect(count).toBe(0);
			});

			it('returns zero for response map with no links', () => {
				const { templateRepo } = bootstrapRepos();

				const map = templateRepo.createResponseMap({ name: 'Unlinked', spec: '{}' });

				const count = templateRepo.getResponseMapLinkCount(map.id!);
				expect(count).toBe(0);
			});
		});
	});
});
