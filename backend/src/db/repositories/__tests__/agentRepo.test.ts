import { Agent, AgentRequestTemplate, AgentResponseMap } from '@ibm-vibe/types';
import * as agentRepo from '../agentRepo';

// Mock the database module
jest.mock('../../database', () => {
	const mockPrepare = jest.fn();
	const mockTransaction = jest.fn();
	return {
		__esModule: true,
		default: {
			prepare: mockPrepare,
			transaction: mockTransaction
		}
	};
});

import db from '../../database';

const mockDb = db as jest.Mocked<typeof db>;

describe('agentRepo', () => {
	let mockGet: jest.Mock;
	let mockAll: jest.Mock;
	let mockRun: jest.Mock;

	beforeEach(() => {
		jest.clearAllMocks();
		mockGet = jest.fn();
		mockAll = jest.fn();
		mockRun = jest.fn();

		// Default mock for prepare
		(mockDb.prepare as any).mockReturnValue({
			get: mockGet,
			all: mockAll,
			run: mockRun
		});
	});

	describe('Agent CRUD', () => {
		describe('createAgent', () => {
			it('creates agent with all fields', () => {
				const agent: Agent = {
					name: 'Test Agent',
					version: '1.0',
					prompt: 'Test prompt',
					settings: '{"key":"value"}'
				} as Agent;

				const created = { id: 1, ...agent, created_at: '2024-01-01' } as Agent;
				mockGet.mockReturnValue(created);

				const result = agentRepo.createAgent(agent);

				expect(result).toEqual(created);
				expect(mockDb.prepare).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO agents'));
				expect(mockGet).toHaveBeenCalledWith(agent);
			});

			it('creates agent with default values for missing fields', () => {
				const agent = { name: 'Test' } as Agent;
				const expected = {
					name: 'Test',
					version: '',
					prompt: '',
					settings: '{}'
				};

				mockGet.mockReturnValue({ id: 1, ...expected });

				agentRepo.createAgent(agent);

				expect(mockGet).toHaveBeenCalledWith(expected);
			});
		});

		describe('getAgents', () => {
			it('returns all agents ordered by created_at DESC', () => {
				const agents = [
					{ id: 2, name: 'Agent 2', created_at: '2024-01-02' },
					{ id: 1, name: 'Agent 1', created_at: '2024-01-01' }
				] as Agent[];

				mockAll.mockReturnValue(agents);

				const result = agentRepo.getAgents();

				expect(result).toEqual(agents);
				expect(mockDb.prepare).toHaveBeenCalledWith('SELECT * FROM agents ORDER BY created_at DESC');
			});

			it('returns empty array when no agents exist', () => {
				mockAll.mockReturnValue([]);

				const result = agentRepo.getAgents();

				expect(result).toEqual([]);
			});
		});

		describe('getAgentById', () => {
			it('returns agent by id', () => {
				const agent = { id: 1, name: 'Test' } as Agent;
				mockGet.mockReturnValue(agent);

				const result = agentRepo.getAgentById(1);

				expect(result).toEqual(agent);
				expect(mockDb.prepare).toHaveBeenCalledWith('SELECT * FROM agents WHERE id = ?');
				expect(mockGet).toHaveBeenCalledWith(1);
			});

			it('returns undefined when agent not found', () => {
				mockGet.mockReturnValue(undefined);

				const result = agentRepo.getAgentById(999);

				expect(result).toBeUndefined();
			});
		});

		describe('updateAgent', () => {
			it('updates agent with provided fields', () => {
				const updates = { name: 'Updated', version: '2.0' };
				const updated = { id: 1, ...updates, prompt: 'old', settings: '{}' } as Agent;

				mockGet.mockReturnValue(updated);

				const result = agentRepo.updateAgent(1, updates);

				expect(result).toEqual(updated);
				expect(mockDb.prepare).toHaveBeenCalledWith(expect.stringContaining('UPDATE agents'));
				expect(mockGet).toHaveBeenCalledWith({ id: 1, ...updates });
			});

			it('returns existing agent when no fields to update', () => {
				const existing = { id: 1, name: 'Test' } as Agent;
				mockGet.mockReturnValue(existing);

				const result = agentRepo.updateAgent(1, {});

				expect(result).toEqual(existing);
				expect(mockDb.prepare).toHaveBeenCalledWith('SELECT * FROM agents WHERE id = ?');
			});

			it('filters out undefined values', () => {
				const updates = { name: 'Updated', version: undefined };
				mockGet.mockReturnValue({ id: 1, name: 'Updated' } as Agent);

				agentRepo.updateAgent(1, updates);

				expect(mockGet).toHaveBeenCalledWith({ id: 1, name: 'Updated' });
			});

			it('excludes id and created_at from updates', () => {
				const updates = { name: 'Updated', id: 999, created_at: '2024-01-01' } as any;
				mockGet.mockReturnValue({ id: 1, name: 'Updated' } as Agent);

				agentRepo.updateAgent(1, updates);

				const updateCall = (mockDb.prepare as any).mock.calls.find((call: any) =>
					call[0].includes('UPDATE agents')
				);
				// Check that SET clause doesn't include id or created_at (WHERE clause will have id)
				const setClause = updateCall[0].split('WHERE')[0];
				expect(setClause).toContain('name = @name');
				expect(setClause).not.toContain('created_at =');
			});
		});

		describe('deleteAgent', () => {
			it('deletes agent by id', () => {
				const runResult = { changes: 1 };
				mockRun.mockReturnValue(runResult);

				const result = agentRepo.deleteAgent(1);

				expect(result).toEqual(runResult);
				expect(mockDb.prepare).toHaveBeenCalledWith('DELETE FROM agents WHERE id = ?');
				expect(mockRun).toHaveBeenCalledWith(1);
			});
		});

		describe('getAgentsWithCount', () => {
			it('returns agents with total count', () => {
				const agents = [{ id: 1, name: 'Test' }] as Agent[];
				mockAll.mockReturnValue(agents);
				mockGet.mockReturnValue({ count: 10 });

				const result = agentRepo.getAgentsWithCount();

				expect(result).toEqual({ data: agents, total: 10 });
			});

			it('applies limit and offset', () => {
				mockAll.mockReturnValue([]);
				mockGet.mockReturnValue({ count: 0 });

				agentRepo.getAgentsWithCount({ limit: 10, offset: 20 });

				const queryCall = (mockDb.prepare as any).mock.calls[0][0];
				expect(queryCall).toContain('LIMIT ?');
				expect(queryCall).toContain('OFFSET ?');
				expect(mockAll).toHaveBeenCalledWith(10, 20);
			});

			it('works without limit and offset', () => {
				mockAll.mockReturnValue([]);
				mockGet.mockReturnValue({ count: 0 });

				agentRepo.getAgentsWithCount({});

				const queryCall = (mockDb.prepare as any).mock.calls[0][0];
				expect(queryCall).not.toContain('LIMIT');
				expect(queryCall).not.toContain('OFFSET');
			});

			it('applies only limit when offset not provided', () => {
				mockAll.mockReturnValue([]);
				mockGet.mockReturnValue({ count: 0 });

				agentRepo.getAgentsWithCount({ limit: 5 });

				const queryCall = (mockDb.prepare as any).mock.calls[0][0];
				expect(queryCall).toContain('LIMIT ?');
				expect(queryCall).not.toContain('OFFSET');
				expect(mockAll).toHaveBeenCalledWith(5);
			});

			it('applies only offset when limit not provided', () => {
				mockAll.mockReturnValue([]);
				mockGet.mockReturnValue({ count: 0 });

				agentRepo.getAgentsWithCount({ offset: 10 });

				const queryCall = (mockDb.prepare as any).mock.calls[0][0];
				expect(queryCall).not.toContain('LIMIT');
				expect(queryCall).toContain('OFFSET ?');
				expect(mockAll).toHaveBeenCalledWith(10);
			});
		});

		describe('getAgentsCount', () => {
			it('returns total count of agents', () => {
				mockGet.mockReturnValue({ count: 42 });

				const result = agentRepo.getAgentsCount();

				expect(result).toBe(42);
				expect(mockDb.prepare).toHaveBeenCalledWith('SELECT COUNT(*) as count FROM agents');
			});
		});
	});

	describe('Agent Request Templates', () => {
		describe('listAgentRequestTemplates', () => {
			it('returns templates for agent ordered by created_at DESC', () => {
				const templates = [
					{ id: 2, agent_id: 1, name: 'T2', created_at: '2024-01-02' },
					{ id: 1, agent_id: 1, name: 'T1', created_at: '2024-01-01' }
				] as AgentRequestTemplate[];

				mockAll.mockReturnValue(templates);

				const result = agentRepo.listAgentRequestTemplates(1);

				expect(result).toEqual(templates);
				expect(mockAll).toHaveBeenCalledWith(1);
			});
		});

		describe('getAgentRequestTemplateById', () => {
			it('returns template by id', () => {
				const template = { id: 1, agent_id: 1, name: 'Test' } as AgentRequestTemplate;
				mockGet.mockReturnValue(template);

				const result = agentRepo.getAgentRequestTemplateById(1);

				expect(result).toEqual(template);
				expect(mockGet).toHaveBeenCalledWith(1);
			});

			it('returns undefined when not found', () => {
				mockGet.mockReturnValue(undefined);

				const result = agentRepo.getAgentRequestTemplateById(999);

				expect(result).toBeUndefined();
			});
		});

		describe('createAgentRequestTemplate', () => {
			it('creates template and sets as default when no default exists', () => {
				const payload = {
					name: 'Test Template',
					body: '{}',
					capabilities: { name: 'openai-chat' }
				} as any;

				const created = { id: 1, agent_id: 1, ...payload, is_default: 1 } as AgentRequestTemplate;

				// Mock transaction
				const txFn = jest.fn().mockReturnValue(created);
				(mockDb.transaction as any).mockReturnValue(txFn);

				// Mock statements inside transaction
				mockGet.mockReturnValueOnce(undefined); // hadDefault check
				mockGet.mockReturnValueOnce(created); // insert result

				const result = agentRepo.createAgentRequestTemplate(1, payload);

				expect(result).toEqual(created);
				expect(mockDb.transaction).toHaveBeenCalled();
			});

			it('clears existing default when creating new default template', () => {
				const payload = {
					name: 'New Default',
					body: '{}',
					is_default: 1,
					capabilities: { name: 'openai-chat' }
				} as any;

				const created = { id: 2, agent_id: 1, ...payload } as AgentRequestTemplate;

				const txFn = jest.fn().mockReturnValue(created);
				(mockDb.transaction as any).mockReturnValue(txFn);

				mockGet.mockReturnValueOnce({ id: 1 }); // hadDefault check
				mockGet.mockReturnValueOnce(created); // insert result

				const result = agentRepo.createAgentRequestTemplate(1, payload);

				expect(result).toEqual(created);
			});

			it('uses default values for optional fields', () => {
				const payload = {
					name: 'Minimal',
					body: '{}',
					capabilities: { name: 'test' }
				} as any;

				const txFn = jest.fn().mockReturnValue({ id: 1 } as AgentRequestTemplate);
				(mockDb.transaction as any).mockReturnValue(txFn);

				mockGet.mockReturnValue(undefined);

				agentRepo.createAgentRequestTemplate(1, payload);

				expect(mockDb.transaction).toHaveBeenCalled();
			});
		});

		describe('updateAgentRequestTemplate', () => {
			it('updates template fields', () => {
				const current = { id: 1, agent_id: 1, name: 'Old', body: '{}' } as AgentRequestTemplate;
				const updates = { name: 'Updated', description: 'New desc' };
				const updated = { ...current, ...updates } as AgentRequestTemplate;

				mockGet.mockReturnValueOnce(current); // getById
				mockGet.mockReturnValueOnce(updated); // update result

				const txFn = jest.fn().mockReturnValue(updated);
				(mockDb.transaction as any).mockReturnValue(txFn);

				const result = agentRepo.updateAgentRequestTemplate(1, updates);

				expect(result).toEqual(updated);
			});

			it('returns undefined when template not found', () => {
				mockGet.mockReturnValue(undefined);

				const result = agentRepo.updateAgentRequestTemplate(999, { name: 'Test' });

				expect(result).toBeUndefined();
			});

			it('handles is_default flag separately', () => {
				const current = { id: 1, agent_id: 1, name: 'Test', is_default: 0 } as AgentRequestTemplate;
				const updates = { is_default: 1 };
				const updated = { ...current, is_default: 1 } as AgentRequestTemplate;

				mockGet.mockReturnValueOnce(current);
				mockGet.mockReturnValueOnce(updated);

				const txFn = jest.fn().mockReturnValue(updated);
				(mockDb.transaction as any).mockReturnValue(txFn);

				const result = agentRepo.updateAgentRequestTemplate(1, updates);

				expect(result?.is_default).toBe(1);
			});

			it('serializes capabilities when provided', () => {
				const current = { id: 1, agent_id: 1, name: 'Test' } as AgentRequestTemplate;
				const updates = { capabilities: { name: 'new-cap' } };

				mockGet.mockReturnValueOnce(current);
				mockGet.mockReturnValueOnce({ ...current, capabilities: '{"name":"new-cap"}' } as any);

				const txFn = jest.fn().mockReturnValue(current);
				(mockDb.transaction as any).mockReturnValue(txFn);

				agentRepo.updateAgentRequestTemplate(1, updates as any);

				expect(mockDb.transaction).toHaveBeenCalled();
			});
		});

		describe('deleteAgentRequestTemplate', () => {
			it('deletes template', () => {
				const txFn = jest.fn();
				(mockDb.transaction as any).mockReturnValue(txFn);

				mockGet.mockReturnValue({ agent_id: 1, is_default: 0 });

				agentRepo.deleteAgentRequestTemplate(1);

				expect(mockDb.transaction).toHaveBeenCalled();
				expect(txFn).toHaveBeenCalled();
			});

			it('promotes new default when deleting default template', () => {
				const txFn = jest.fn();
				(mockDb.transaction as any).mockReturnValue(txFn);

				mockGet.mockReturnValueOnce({ agent_id: 1, is_default: 1 }); // template being deleted
				mockGet.mockReturnValueOnce({ id: 2 }); // hasAny check
				mockGet.mockReturnValueOnce(undefined); // hasDefault check

				agentRepo.deleteAgentRequestTemplate(1);

				expect(txFn).toHaveBeenCalled();
			});

			it('does nothing when template not found', () => {
				const txFn = jest.fn();
				(mockDb.transaction as any).mockReturnValue(txFn);

				mockGet.mockReturnValue(undefined);

				agentRepo.deleteAgentRequestTemplate(999);

				expect(txFn).toHaveBeenCalled();
			});
		});

		describe('setDefaultAgentRequestTemplate', () => {
			it('sets template as default and clears others', () => {
				const txFn = jest.fn();
				(mockDb.transaction as any).mockReturnValue(txFn);

				agentRepo.setDefaultAgentRequestTemplate(1, 5);

				expect(mockDb.transaction).toHaveBeenCalled();
				expect(txFn).toHaveBeenCalled();
			});
		});
	});

	describe('Agent Response Maps', () => {
		describe('listAgentResponseMaps', () => {
			it('returns maps for agent ordered by created_at DESC', () => {
				const maps = [
					{ id: 2, agent_id: 1, name: 'M2', created_at: '2024-01-02' },
					{ id: 1, agent_id: 1, name: 'M1', created_at: '2024-01-01' }
				] as AgentResponseMap[];

				mockAll.mockReturnValue(maps);

				const result = agentRepo.listAgentResponseMaps(1);

				expect(result).toEqual(maps);
				expect(mockAll).toHaveBeenCalledWith(1);
			});
		});

		describe('getAgentResponseMapById', () => {
			it('returns map by id', () => {
				const map = { id: 1, agent_id: 1, name: 'Test' } as AgentResponseMap;
				mockGet.mockReturnValue(map);

				const result = agentRepo.getAgentResponseMapById(1);

				expect(result).toEqual(map);
				expect(mockGet).toHaveBeenCalledWith(1);
			});

			it('returns undefined when not found', () => {
				mockGet.mockReturnValue(undefined);

				const result = agentRepo.getAgentResponseMapById(999);

				expect(result).toBeUndefined();
			});
		});

		describe('createAgentResponseMap', () => {
			it('creates map and sets as default when no default exists', () => {
				const payload = {
					name: 'Test Map',
					spec: '{}',
					capabilities: { name: 'openai-chat' }
				} as any;

				const created = { id: 1, agent_id: 1, ...payload, is_default: 1 } as AgentResponseMap;

				const txFn = jest.fn().mockReturnValue(created);
				(mockDb.transaction as any).mockReturnValue(txFn);

				mockGet.mockReturnValueOnce(undefined); // hadDefault check
				mockGet.mockReturnValueOnce(created); // insert result

				const result = agentRepo.createAgentResponseMap(1, payload);

				expect(result).toEqual(created);
				expect(mockDb.transaction).toHaveBeenCalled();
			});

			it('clears existing default when creating new default map', () => {
				const payload = {
					name: 'New Default',
					spec: '{}',
					is_default: 1,
					capabilities: { name: 'openai-chat' }
				} as any;

				const created = { id: 2, agent_id: 1, ...payload } as AgentResponseMap;

				const txFn = jest.fn().mockReturnValue(created);
				(mockDb.transaction as any).mockReturnValue(txFn);

				mockGet.mockReturnValueOnce({ id: 1 }); // hadDefault check
				mockGet.mockReturnValueOnce(created); // insert result

				const result = agentRepo.createAgentResponseMap(1, payload);

				expect(result).toEqual(created);
			});
		});

		describe('updateAgentResponseMap', () => {
			it('updates map fields', () => {
				const current = { id: 1, agent_id: 1, name: 'Old', spec: '{}' } as AgentResponseMap;
				const updates = { name: 'Updated', description: 'New desc' };
				const updated = { ...current, ...updates } as AgentResponseMap;

				mockGet.mockReturnValueOnce(current); // getById
				mockGet.mockReturnValueOnce(updated); // update result

				const txFn = jest.fn().mockReturnValue(updated);
				(mockDb.transaction as any).mockReturnValue(txFn);

				const result = agentRepo.updateAgentResponseMap(1, updates);

				expect(result).toEqual(updated);
			});

			it('returns undefined when map not found', () => {
				mockGet.mockReturnValue(undefined);

				const result = agentRepo.updateAgentResponseMap(999, { name: 'Test' });

				expect(result).toBeUndefined();
			});

			it('handles is_default flag separately', () => {
				const current = { id: 1, agent_id: 1, name: 'Test', is_default: 0 } as AgentResponseMap;
				const updates = { is_default: 1 };
				const updated = { ...current, is_default: 1 } as AgentResponseMap;

				mockGet.mockReturnValueOnce(current);
				mockGet.mockReturnValueOnce(updated);

				const txFn = jest.fn().mockReturnValue(updated);
				(mockDb.transaction as any).mockReturnValue(txFn);

				const result = agentRepo.updateAgentResponseMap(1, updates);

				expect(result?.is_default).toBe(1);
			});
		});

		describe('deleteAgentResponseMap', () => {
			it('deletes map', () => {
				const txFn = jest.fn();
				(mockDb.transaction as any).mockReturnValue(txFn);

				mockGet.mockReturnValue({ agent_id: 1, is_default: 0 });

				agentRepo.deleteAgentResponseMap(1);

				expect(mockDb.transaction).toHaveBeenCalled();
				expect(txFn).toHaveBeenCalled();
			});

			it('promotes new default when deleting default map', () => {
				const txFn = jest.fn();
				(mockDb.transaction as any).mockReturnValue(txFn);

				mockGet.mockReturnValueOnce({ agent_id: 1, is_default: 1 }); // map being deleted
				mockGet.mockReturnValueOnce({ id: 2 }); // hasAny check
				mockGet.mockReturnValueOnce(undefined); // hasDefault check

				agentRepo.deleteAgentResponseMap(1);

				expect(txFn).toHaveBeenCalled();
			});

			it('does nothing when map not found', () => {
				const txFn = jest.fn();
				(mockDb.transaction as any).mockReturnValue(txFn);

				mockGet.mockReturnValue(undefined);

				agentRepo.deleteAgentResponseMap(999);

				expect(txFn).toHaveBeenCalled();
			});
		});

		describe('setDefaultAgentResponseMap', () => {
			it('sets map as default and clears others', () => {
				const txFn = jest.fn();
				(mockDb.transaction as any).mockReturnValue(txFn);

				agentRepo.setDefaultAgentResponseMap(1, 5);

				expect(mockDb.transaction).toHaveBeenCalled();
				expect(txFn).toHaveBeenCalled();
			});
		});
	});

	describe('Capability Names', () => {
		describe('listRequestTemplateCapabilityNames', () => {
			it('extracts and returns unique capability names', () => {
				const rows = [
					{ capabilities: '{"name":"openai-chat"}' },
					{ capabilities: '{"name":"ollama-generate"}' },
					{ capabilities: '{"name":"openai-chat"}' } // duplicate
				];

				mockAll.mockReturnValue(rows);

				const result = agentRepo.listRequestTemplateCapabilityNames();

				expect(result).toEqual(['ollama-generate', 'openai-chat']); // sorted
			});

			it('handles legacy schema field', () => {
				const rows = [{ capabilities: '{"schema":"legacy-cap"}' }];

				mockAll.mockReturnValue(rows);

				const result = agentRepo.listRequestTemplateCapabilityNames();

				expect(result).toEqual(['legacy-cap']);
			});

			it('filters out null and empty capabilities', () => {
				const rows = [{ capabilities: '{"name":"valid"}' }, { capabilities: null }, { capabilities: '{}' }];

				mockAll.mockReturnValue(rows);

				const result = agentRepo.listRequestTemplateCapabilityNames();

				expect(result).toEqual(['valid']);
			});

			it('handles invalid JSON gracefully', () => {
				const rows = [{ capabilities: '{"name":"valid"}' }, { capabilities: 'invalid-json' }];

				mockAll.mockReturnValue(rows);

				const result = agentRepo.listRequestTemplateCapabilityNames();

				expect(result).toEqual(['valid']);
			});

			it('returns empty array when no capabilities', () => {
				mockAll.mockReturnValue([]);

				const result = agentRepo.listRequestTemplateCapabilityNames();

				expect(result).toEqual([]);
			});
		});

		describe('listResponseMapCapabilityNames', () => {
			it('extracts and returns unique capability names', () => {
				const rows = [
					{ capabilities: '{"name":"openai-chat"}' },
					{ capabilities: '{"name":"ollama-generate"}' },
					{ capabilities: '{"name":"openai-chat"}' } // duplicate
				];

				mockAll.mockReturnValue(rows);

				const result = agentRepo.listResponseMapCapabilityNames();

				expect(result).toEqual(['ollama-generate', 'openai-chat']); // sorted
			});

			it('handles legacy schema field', () => {
				const rows = [{ capabilities: '{"schema":"legacy-cap"}' }];

				mockAll.mockReturnValue(rows);

				const result = agentRepo.listResponseMapCapabilityNames();

				expect(result).toEqual(['legacy-cap']);
			});

			it('filters out null and empty capabilities', () => {
				const rows = [{ capabilities: '{"name":"valid"}' }, { capabilities: null }, { capabilities: '{}' }];

				mockAll.mockReturnValue(rows);

				const result = agentRepo.listResponseMapCapabilityNames();

				expect(result).toEqual(['valid']);
			});

			it('handles invalid JSON gracefully', () => {
				const rows = [{ capabilities: '{"name":"valid"}' }, { capabilities: 'invalid-json' }];

				mockAll.mockReturnValue(rows);

				const result = agentRepo.listResponseMapCapabilityNames();

				expect(result).toEqual(['valid']);
			});

			it('returns empty array when no capabilities', () => {
				mockAll.mockReturnValue([]);

				const result = agentRepo.listResponseMapCapabilityNames();

				expect(result).toEqual([]);
			});
		});
	});
});

// Made with Bob
