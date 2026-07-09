/* eslint-disable @typescript-eslint/no-explicit-any */
import { api } from '../api';
import type { LLMRequestOptions } from '@ibm-vibe/types';

describe('api client', () => {
	const originalFetch = global.fetch;

	afterEach(() => {
		if (originalFetch) {
			global.fetch = originalFetch;
		}
		jest.resetAllMocks();
	});

	describe('getAgents', () => {
		it('returns parsed payloads on success', async () => {
			const agents = [{ id: 1, name: 'Agent', version: '1.0', prompt: '', settings: '{}' }];
			global.fetch = jest.fn().mockResolvedValue({
				ok: true,
				json: async () => agents
			} as Response);

			await expect(api.getAgents()).resolves.toEqual(agents);
			expect(global.fetch).toHaveBeenCalledWith('http://localhost:5100/api/agents');
		});

		it('throws descriptive errors when the backend responds with an error', async () => {
			global.fetch = jest.fn().mockResolvedValue({
				ok: false,
				json: async () => ({ error: 'Failed to fetch agents' })
			} as Response);

			await expect(api.getAgents()).rejects.toThrow('Failed to fetch agents');
		});
	});

	describe('getStats', () => {
		it('fetches stats successfully', async () => {
			const stats = { totalAgents: 5, totalTests: 10 };
			global.fetch = jest.fn().mockResolvedValue({
				ok: true,
				json: async () => stats
			} as Response);

			await expect(api.getStats()).resolves.toEqual(stats);
			expect(global.fetch).toHaveBeenCalledWith('http://localhost:5100/api/stats');
		});

		it('throws error on failure', async () => {
			global.fetch = jest.fn().mockResolvedValue({
				ok: false,
				json: async () => ({ error: 'Stats error' })
			} as Response);

			await expect(api.getStats()).rejects.toThrow('Stats error');
		});
	});

	describe('Agent Request Templates', () => {
		it('getAgentRequestTemplates fetches templates', async () => {
			const templates = [{ id: 1, name: 'Template', body: 'test' }];
			global.fetch = jest.fn().mockResolvedValue({
				ok: true,
				json: async () => templates
			} as Response);

			await expect(api.getAgentRequestTemplates(1)).resolves.toEqual(templates);
			expect(global.fetch).toHaveBeenCalledWith('http://localhost:5100/api/agents/1/request-templates');
		});

		it('createAgentRequestTemplate creates template', async () => {
			const template = { id: 1, name: 'New', body: 'test' };
			global.fetch = jest.fn().mockResolvedValue({
				ok: true,
				json: async () => template
			} as Response);

			await expect(api.createAgentRequestTemplate(1, { name: 'New', body: 'test' })).resolves.toEqual(template);
		});

		it('updateAgentRequestTemplate updates template', async () => {
			const template = { id: 1, name: 'Updated', body: 'test' };
			global.fetch = jest.fn().mockResolvedValue({
				ok: true,
				json: async () => template
			} as Response);

			await expect(api.updateAgentRequestTemplate(1, 1, { name: 'Updated' })).resolves.toEqual(template);
		});

		it('deleteAgentRequestTemplate deletes template', async () => {
			global.fetch = jest.fn().mockResolvedValue({
				ok: true,
				json: async () => ({})
			} as Response);

			await expect(api.deleteAgentRequestTemplate(1, 1)).resolves.toBeUndefined();
		});

		it('setDefaultAgentRequestTemplate sets default', async () => {
			global.fetch = jest.fn().mockResolvedValue({
				ok: true,
				json: async () => ({})
			} as Response);

			await expect(api.setDefaultAgentRequestTemplate(1, 1)).resolves.toBeUndefined();
		});
	});

	describe('Agent Response Maps', () => {
		it('getAgentResponseMaps fetches maps', async () => {
			const maps = [{ id: 1, name: 'Map', spec: '{}' }];
			global.fetch = jest.fn().mockResolvedValue({
				ok: true,
				json: async () => maps
			} as Response);

			await expect(api.getAgentResponseMaps(1)).resolves.toEqual(maps);
		});

		it('createAgentResponseMap creates map', async () => {
			const map = { id: 1, name: 'New', spec: '{}' };
			global.fetch = jest.fn().mockResolvedValue({
				ok: true,
				json: async () => map
			} as Response);

			await expect(api.createAgentResponseMap(1, { name: 'New', spec: '{}' })).resolves.toEqual(map);
		});

		it('updateAgentResponseMap updates map', async () => {
			const map = { id: 1, name: 'Updated', spec: '{}' };
			global.fetch = jest.fn().mockResolvedValue({
				ok: true,
				json: async () => map
			} as Response);

			await expect(api.updateAgentResponseMap(1, 1, { name: 'Updated' })).resolves.toEqual(map);
		});

		it('deleteAgentResponseMap deletes map', async () => {
			global.fetch = jest.fn().mockResolvedValue({
				ok: true,
				json: async () => ({})
			} as Response);

			await expect(api.deleteAgentResponseMap(1, 1)).resolves.toBeUndefined();
		});

		it('setDefaultAgentResponseMap sets default', async () => {
			global.fetch = jest.fn().mockResolvedValue({
				ok: true,
				json: async () => ({})
			} as Response);

			await expect(api.setDefaultAgentResponseMap(1, 1)).resolves.toBeUndefined();
		});
	});

	describe('Capability Names', () => {
		it('getRequestTemplateCapabilityNames returns names', async () => {
			const names = ['cap1', 'cap2'];
			global.fetch = jest.fn().mockResolvedValue({
				ok: true,
				json: async () => names
			} as Response);

			await expect(api.getRequestTemplateCapabilityNames()).resolves.toEqual(names);
		});

		it('getRequestTemplateCapabilityNames returns empty array on error', async () => {
			global.fetch = jest.fn().mockResolvedValue({
				ok: false,
				json: async () => ({ error: 'Error' })
			} as Response);

			await expect(api.getRequestTemplateCapabilityNames()).resolves.toEqual([]);
		});

		it('getResponseMapCapabilityNames returns names', async () => {
			const names = ['cap1', 'cap2'];
			global.fetch = jest.fn().mockResolvedValue({
				ok: true,
				json: async () => names
			} as Response);

			await expect(api.getResponseMapCapabilityNames()).resolves.toEqual(names);
		});

		it('getResponseMapCapabilityNames returns empty array on error', async () => {
			global.fetch = jest.fn().mockResolvedValue({
				ok: false,
				json: async () => ({ error: 'Error' })
			} as Response);

			await expect(api.getResponseMapCapabilityNames()).resolves.toEqual([]);
		});
	});

	describe('Global Templates', () => {
		it('getTemplates fetches all templates', async () => {
			const templates = [{ id: 1, name: 'Template' }];
			global.fetch = jest.fn().mockResolvedValue({
				ok: true,
				json: async () => templates
			} as Response);

			await expect(api.getTemplates()).resolves.toEqual(templates);
			expect(global.fetch).toHaveBeenCalledWith('http://localhost:5100/api/templates?');
		});

		it('getTemplates filters by capability', async () => {
			const templates = [{ id: 1, name: 'Template' }];
			global.fetch = jest.fn().mockResolvedValue({
				ok: true,
				json: async () => templates
			} as Response);

			await expect(api.getTemplates('test-cap')).resolves.toEqual(templates);
			expect(global.fetch).toHaveBeenCalledWith('http://localhost:5100/api/templates?capability=test-cap');
		});

		it('getTemplateById fetches single template', async () => {
			const template = { id: 1, name: 'Template' };
			global.fetch = jest.fn().mockResolvedValue({
				ok: true,
				json: async () => template
			} as Response);

			await expect(api.getTemplateById(1)).resolves.toEqual(template);
		});

		it('createTemplate creates new template', async () => {
			const template = { id: 1, name: 'New' };
			global.fetch = jest.fn().mockResolvedValue({
				ok: true,
				json: async () => template
			} as Response);

			await expect(
				api.createTemplate({ name: 'New', body: 'test' } as Omit<any, 'id' | 'created_at'>)
			).resolves.toEqual(template);
		});

		it('updateTemplate updates template', async () => {
			const template = { id: 1, name: 'Updated' };
			global.fetch = jest.fn().mockResolvedValue({
				ok: true,
				json: async () => template
			} as Response);

			await expect(api.updateTemplate(1, { name: 'Updated' })).resolves.toEqual(template);
		});

		it('deleteTemplate deletes template', async () => {
			global.fetch = jest.fn().mockResolvedValue({
				ok: true,
				json: async () => ({})
			} as Response);

			await expect(api.deleteTemplate(1)).resolves.toBeUndefined();
		});
	});

	describe('Global Response Maps', () => {
		it('getResponseMaps fetches all maps', async () => {
			const maps = [{ id: 1, name: 'Map' }];
			global.fetch = jest.fn().mockResolvedValue({
				ok: true,
				json: async () => maps
			} as Response);

			await expect(api.getResponseMaps()).resolves.toEqual(maps);
		});

		it('getResponseMaps filters by capability', async () => {
			const maps = [{ id: 1, name: 'Map' }];
			global.fetch = jest.fn().mockResolvedValue({
				ok: true,
				json: async () => maps
			} as Response);

			await expect(api.getResponseMaps('test-cap')).resolves.toEqual(maps);
			expect(global.fetch).toHaveBeenCalledWith('http://localhost:5100/api/response-maps?capability=test-cap');
		});

		it('getResponseMapById fetches single map', async () => {
			const map = { id: 1, name: 'Map' };
			global.fetch = jest.fn().mockResolvedValue({
				ok: true,
				json: async () => map
			} as Response);

			await expect(api.getResponseMapById(1)).resolves.toEqual(map);
		});

		it('createResponseMap creates new map', async () => {
			const map = { id: 1, name: 'New' };
			global.fetch = jest.fn().mockResolvedValue({
				ok: true,
				json: async () => map
			} as Response);

			await expect(
				api.createResponseMap({ name: 'New', spec: '{}' } as Omit<any, 'id' | 'created_at'>)
			).resolves.toEqual(map);
		});

		it('updateResponseMap updates map', async () => {
			const map = { id: 1, name: 'Updated' };
			global.fetch = jest.fn().mockResolvedValue({
				ok: true,
				json: async () => map
			} as Response);

			await expect(api.updateResponseMap(1, { name: 'Updated' })).resolves.toEqual(map);
		});

		it('deleteResponseMap deletes map', async () => {
			global.fetch = jest.fn().mockResolvedValue({
				ok: true,
				json: async () => ({})
			} as Response);

			await expect(api.deleteResponseMap(1)).resolves.toBeUndefined();
		});
	});

	describe('Agent-Template Linking', () => {
		it('getAgentLinkedTemplates fetches linked templates', async () => {
			const templates = [{ id: 1, name: 'Template' }];
			global.fetch = jest.fn().mockResolvedValue({
				ok: true,
				json: async () => templates
			} as Response);

			await expect(api.getAgentLinkedTemplates(1)).resolves.toEqual(templates);
		});

		it('linkTemplateToAgent links template', async () => {
			const template = { id: 1, name: 'Template' };
			global.fetch = jest.fn().mockResolvedValue({
				ok: true,
				json: async () => template
			} as Response);

			await expect(api.linkTemplateToAgent(1, { template_id: 1 })).resolves.toEqual(template);
		});

		it('unlinkTemplateFromAgent unlinks template', async () => {
			global.fetch = jest.fn().mockResolvedValue({
				ok: true,
				json: async () => ({})
			} as Response);

			await expect(api.unlinkTemplateFromAgent(1, 1)).resolves.toBeUndefined();
		});

		it('setAgentLinkedTemplateDefault sets default', async () => {
			global.fetch = jest.fn().mockResolvedValue({
				ok: true,
				json: async () => ({})
			} as Response);

			await expect(api.setAgentLinkedTemplateDefault(1, 1)).resolves.toBeUndefined();
		});
	});

	describe('Agent-ResponseMap Linking', () => {
		it('getAgentLinkedResponseMaps fetches linked maps', async () => {
			const maps = [{ id: 1, name: 'Map' }];
			global.fetch = jest.fn().mockResolvedValue({
				ok: true,
				json: async () => maps
			} as Response);

			await expect(api.getAgentLinkedResponseMaps(1)).resolves.toEqual(maps);
		});

		it('linkResponseMapToAgent links map', async () => {
			const map = { id: 1, name: 'Map' };
			global.fetch = jest.fn().mockResolvedValue({
				ok: true,
				json: async () => map
			} as Response);

			await expect(api.linkResponseMapToAgent(1, { response_map_id: 1 })).resolves.toEqual(map);
		});

		it('unlinkResponseMapFromAgent unlinks map', async () => {
			global.fetch = jest.fn().mockResolvedValue({
				ok: true,
				json: async () => ({})
			} as Response);

			await expect(api.unlinkResponseMapFromAgent(1, 1)).resolves.toBeUndefined();
		});

		it('setAgentLinkedResponseMapDefault sets default', async () => {
			global.fetch = jest.fn().mockResolvedValue({
				ok: true,
				json: async () => ({})
			} as Response);

			await expect(api.setAgentLinkedResponseMapDefault(1, 1)).resolves.toBeUndefined();
		});
	});

	describe('Agents CRUD', () => {
		it('getAgentById fetches single agent', async () => {
			const agent = { id: 1, name: 'Agent' };
			global.fetch = jest.fn().mockResolvedValue({
				ok: true,
				json: async () => agent
			} as Response);

			await expect(api.getAgentById(1)).resolves.toEqual(agent);
		});

		it('createAgent creates new agent', async () => {
			const agent = { id: 1, name: 'New Agent' };
			global.fetch = jest.fn().mockResolvedValue({
				ok: true,
				json: async () => agent
			} as Response);

			await expect(api.createAgent({ name: 'New Agent' } as Omit<any, 'id' | 'created_at'>)).resolves.toEqual(
				agent
			);
		});

		it('updateAgent updates agent', async () => {
			const agent = { id: 1, name: 'Updated' };
			global.fetch = jest.fn().mockResolvedValue({
				ok: true,
				json: async () => agent
			} as Response);

			await expect(api.updateAgent(1, { name: 'Updated' })).resolves.toEqual(agent);
		});

		it('deleteAgent deletes agent', async () => {
			global.fetch = jest.fn().mockResolvedValue({
				ok: true,
				json: async () => ({})
			} as Response);

			await expect(api.deleteAgent(1)).resolves.toBeUndefined();
		});

		it('deleteAgent handles non-JSON error responses', async () => {
			global.fetch = jest.fn().mockResolvedValue({
				ok: false,
				status: 500,
				headers: new Headers({ 'content-type': 'text/plain' }),
				json: async () => {
					throw new Error('Not JSON');
				}
			} as unknown as Response);

			await expect(api.deleteAgent(1)).rejects.toThrow('Failed to delete agent (Status: 500)');
		});
	});

	describe('Tests CRUD', () => {
		it('getTests fetches all tests', async () => {
			const tests = [{ id: 1, name: 'Test' }];
			global.fetch = jest.fn().mockResolvedValue({
				ok: true,
				json: async () => tests
			} as Response);

			await expect(api.getTests()).resolves.toEqual(tests);
		});

		it('getTestById fetches single test', async () => {
			const test = { id: 1, name: 'Test' };
			global.fetch = jest.fn().mockResolvedValue({
				ok: true,
				json: async () => test
			} as Response);

			await expect(api.getTestById(1)).resolves.toEqual(test);
		});

		it('createTest creates new test', async () => {
			const test = { id: 1, name: 'New Test' };
			global.fetch = jest.fn().mockResolvedValue({
				ok: true,
				json: async () => test
			} as Response);

			await expect(
				api.createTest({ name: 'New Test' } as Omit<any, 'id' | 'created_at' | 'updated_at'>)
			).resolves.toEqual(test);
		});

		it('updateTest updates test', async () => {
			const test = { id: 1, name: 'Updated' };
			global.fetch = jest.fn().mockResolvedValue({
				ok: true,
				json: async () => test
			} as Response);

			await expect(api.updateTest(1, { name: 'Updated' })).resolves.toEqual(test);
		});

		it('deleteTest deletes test', async () => {
			global.fetch = jest.fn().mockResolvedValue({
				ok: true,
				json: async () => ({})
			} as Response);

			await expect(api.deleteTest(1)).resolves.toBeUndefined();
		});

		it('deleteTest handles non-JSON error responses', async () => {
			global.fetch = jest.fn().mockResolvedValue({
				ok: false,
				status: 404,
				headers: new Headers({ 'content-type': 'text/html' }),
				json: async () => {
					throw new Error('Not JSON');
				}
			} as unknown as Response);

			await expect(api.deleteTest(1)).rejects.toThrow('Failed to delete test (Status: 404)');
		});
	});

	describe('Results', () => {
		it('getResults fetches results with filters', async () => {
			const results = [{ id: 1, score: 0.9 }];
			global.fetch = jest.fn().mockResolvedValue({
				ok: true,
				json: async () => results
			} as Response);

			await expect(api.getResults({ agent_id: 1, test_id: 2 })).resolves.toEqual(results);
		});

		it('getResults handles paginated response', async () => {
			const results = { data: [{ id: 1 }], total: 1 };
			global.fetch = jest.fn().mockResolvedValue({
				ok: true,
				json: async () => results
			} as Response);

			await expect(api.getResults()).resolves.toEqual([{ id: 1 }]);
		});

		it('getResultsWithCount returns paginated response', async () => {
			const results = { data: [{ id: 1 }], total: 1 };
			global.fetch = jest.fn().mockResolvedValue({
				ok: true,
				json: async () => results
			} as Response);

			await expect(api.getResultsWithCount()).resolves.toEqual(results);
		});

		it('getResultsWithCount handles array response', async () => {
			const results = [{ id: 1 }];
			global.fetch = jest.fn().mockResolvedValue({
				ok: true,
				json: async () => results
			} as Response);

			await expect(api.getResultsWithCount()).resolves.toEqual({ data: results, total: 1 });
		});

		it('getResultById fetches single result', async () => {
			const result = { id: 1, score: 0.9 };
			global.fetch = jest.fn().mockResolvedValue({
				ok: true,
				json: async () => result
			} as Response);

			await expect(api.getResultById(1)).resolves.toEqual(result);
		});

		it('createResult creates new result', async () => {
			const result = { id: 1, score: 0.9 };
			global.fetch = jest.fn().mockResolvedValue({
				ok: true,
				json: async () => result
			} as Response);

			await expect(api.createResult({ score: 0.9 } as Omit<any, 'id' | 'created_at'>)).resolves.toEqual(result);
		});

		it('scoreResult scores a result', async () => {
			const result = { id: 1, score: 0.95 };
			global.fetch = jest.fn().mockResolvedValue({
				ok: true,
				json: async () => result
			} as Response);

			await expect(api.scoreResult(1, 2)).resolves.toEqual(result);
		});
	});

	describe('Execute', () => {
		it('executeTest executes a test', async () => {
			const result = { id: 1, score: 0.9 };
			global.fetch = jest.fn().mockResolvedValue({
				ok: true,
				json: async () => result
			} as Response);

			await expect(api.executeTest(1, 2)).resolves.toEqual(result);
		});

		it('executeTest throws error on failure', async () => {
			global.fetch = jest.fn().mockResolvedValue({
				ok: false,
				json: async () => ({ error: 'Execution failed' })
			} as Response);

			await expect(api.executeTest(1, 2)).rejects.toThrow('Execution failed');
		});
	});

	describe('Test Suites', () => {
		it('getTestSuites fetches all suites', async () => {
			const suites = [{ id: 1, name: 'Suite', test_count: 5 }];
			global.fetch = jest.fn().mockResolvedValue({
				ok: true,
				json: async () => suites
			} as Response);

			await expect(api.getTestSuites()).resolves.toEqual(suites);
		});

		it('createTestSuite creates new suite', async () => {
			const suite = { id: 1, name: 'New Suite' };
			global.fetch = jest.fn().mockResolvedValue({
				ok: true,
				json: async () => suite
			} as Response);

			await expect(api.createTestSuite({ name: 'New Suite' })).resolves.toEqual(suite);
		});

		it('updateTestSuite updates suite', async () => {
			const suite = { id: 1, name: 'Updated' };
			global.fetch = jest.fn().mockResolvedValue({
				ok: true,
				json: async () => suite
			} as Response);

			await expect(api.updateTestSuite(1, { name: 'Updated' })).resolves.toEqual(suite);
		});

		it('deleteTestSuite deletes suite', async () => {
			global.fetch = jest.fn().mockResolvedValue({
				ok: true,
				json: async () => ({})
			} as Response);

			await expect(api.deleteTestSuite(1)).resolves.toBeUndefined();
		});

		it('addTestToSuite adds test to suite', async () => {
			global.fetch = jest.fn().mockResolvedValue({
				ok: true,
				json: async () => ({})
			} as Response);

			await expect(api.addTestToSuite(1, 2)).resolves.toBeUndefined();
		});

		it('executeSuite executes a suite', async () => {
			const result = { suite_run_id: 123 };
			global.fetch = jest.fn().mockResolvedValue({
				ok: true,
				json: async () => result
			} as Response);

			await expect(api.executeSuite(1, 2)).resolves.toEqual(result);
		});
	});

	describe('Suite Runs', () => {
		it('getSuiteRuns fetches runs with filters', async () => {
			const runs = [{ id: 1, status: 'completed' }];
			global.fetch = jest.fn().mockResolvedValue({
				ok: true,
				json: async () => runs
			} as Response);

			await expect(api.getSuiteRuns({ suite_id: 1 })).resolves.toEqual(runs);
		});

		it('getSuiteRuns handles date filters', async () => {
			const runs = [{ id: 1 }];
			const after = new Date('2024-01-01');
			const before = new Date('2024-12-31');
			global.fetch = jest.fn().mockResolvedValue({
				ok: true,
				json: async () => runs
			} as Response);

			await api.getSuiteRuns({ after, before });
			expect(global.fetch).toHaveBeenCalledWith(expect.stringContaining('after=2024-01-01'));
		});

		it('getSuiteRunsWithCount returns paginated response', async () => {
			const result = { data: [{ id: 1 }], total: 1 };
			global.fetch = jest.fn().mockResolvedValue({
				ok: true,
				json: async () => result
			} as Response);

			await expect(api.getSuiteRunsWithCount()).resolves.toEqual(result);
		});

		it('getSuiteRun fetches single run', async () => {
			const run = { id: 1, status: 'completed' };
			global.fetch = jest.fn().mockResolvedValue({
				ok: true,
				json: async () => run
			} as Response);

			await expect(api.getSuiteRun(1)).resolves.toEqual(run);
		});

		it('getSuiteRunJobs fetches jobs for run', async () => {
			const jobs = [{ id: 'job1', status: 'completed' }];
			global.fetch = jest.fn().mockResolvedValue({
				ok: true,
				json: async () => jobs
			} as Response);

			await expect(api.getSuiteRunJobs(1)).resolves.toEqual(jobs);
		});

		it('deleteSuiteRun deletes run', async () => {
			global.fetch = jest.fn().mockResolvedValue({
				ok: true,
				json: async () => ({})
			} as Response);

			await expect(api.deleteSuiteRun(1)).resolves.toBeUndefined();
		});

		it('deleteSuiteRun handles error gracefully', async () => {
			global.fetch = jest.fn().mockResolvedValue({
				ok: false,
				json: async () => {
					throw new Error('Not JSON');
				}
			} as unknown as Response);

			await expect(api.deleteSuiteRun(1)).rejects.toThrow('Failed to delete suite run');
		});

		it('rerunSuiteRun reruns a suite', async () => {
			const run = { id: 1, suite_id: 2, agent_id: 3 };
			const result = { suite_run_id: 456 };
			global.fetch = jest
				.fn()
				.mockResolvedValueOnce({
					ok: true,
					json: async () => run
				} as Response)
				.mockResolvedValueOnce({
					ok: true,
					json: async () => result
				} as Response);

			await expect(api.rerunSuiteRun(1)).resolves.toEqual(result);
		});
	});

	describe('Jobs', () => {
		it('getJobs fetches all jobs', async () => {
			const jobs = [{ id: 'job1', status: 'pending' }];
			global.fetch = jest.fn().mockResolvedValue({
				ok: true,
				json: async () => jobs
			} as Response);

			await expect(api.getJobs()).resolves.toEqual(jobs);
		});

		it('getJobsWithCount returns paginated response', async () => {
			const result = { data: [{ id: 'job1' }], total: 1 };
			global.fetch = jest.fn().mockResolvedValue({
				ok: true,
				json: async () => result
			} as Response);

			await expect(api.getJobsWithCount({ limit: 10 })).resolves.toEqual(result);
		});

		it('createJob creates new job', async () => {
			const job = { id: 'job1', status: 'pending' };
			global.fetch = jest.fn().mockResolvedValue({
				ok: true,
				json: async () => job
			} as Response);

			await expect(api.createJob(1, 2)).resolves.toEqual(job);
		});

		it('getJobStatus fetches job status', async () => {
			const job = { id: 'job1', status: 'running' };
			global.fetch = jest.fn().mockResolvedValue({
				ok: true,
				json: async () => job
			} as Response);

			await expect(api.getJobStatus('job1')).resolves.toEqual(job);
		});

		it('cancelJob cancels a job', async () => {
			global.fetch = jest.fn().mockResolvedValue({
				ok: true,
				json: async () => ({})
			} as Response);

			await expect(api.cancelJob('job1')).resolves.toBeUndefined();
		});

		it('cancelJob handles error gracefully', async () => {
			global.fetch = jest.fn().mockResolvedValue({
				ok: false,
				json: async () => {
					throw new Error('Not JSON');
				}
			} as unknown as Response);

			await expect(api.cancelJob('job1')).rejects.toThrow('Failed to cancel job');
		});

		it('deleteJob deletes a job', async () => {
			global.fetch = jest.fn().mockResolvedValue({
				ok: true,
				json: async () => ({})
			} as Response);

			await expect(api.deleteJob('job1')).resolves.toBeUndefined();
		});
	});

	describe('LLM Configs', () => {
		it('getLLMConfigs fetches all configs', async () => {
			const configs = [{ id: 1, name: 'Config', provider: 'openai' }];
			global.fetch = jest.fn().mockResolvedValue({
				ok: true,
				json: async () => configs
			} as Response);

			await expect(api.getLLMConfigs()).resolves.toEqual(configs);
		});

		it('getLLMConfigById fetches single config', async () => {
			const config = { id: 1, name: 'Config' };
			global.fetch = jest.fn().mockResolvedValue({
				ok: true,
				json: async () => config
			} as Response);

			await expect(api.getLLMConfigById(1)).resolves.toEqual(config);
		});

		it('createLLMConfig creates new config', async () => {
			const config = { id: 1, name: 'New Config' };
			global.fetch = jest.fn().mockResolvedValue({
				ok: true,
				json: async () => config
			} as Response);

			await expect(
				api.createLLMConfig({ name: 'New Config' } as Omit<any, 'id' | 'created_at' | 'updated_at'>)
			).resolves.toEqual(config);
		});

		it('updateLLMConfig updates config', async () => {
			const config = { id: 1, name: 'Updated' };
			global.fetch = jest.fn().mockResolvedValue({
				ok: true,
				json: async () => config
			} as Response);

			await expect(api.updateLLMConfig(1, { name: 'Updated' })).resolves.toEqual(config);
		});

		it('deleteLLMConfig deletes config', async () => {
			global.fetch = jest.fn().mockResolvedValue({
				ok: true,
				json: async () => ({})
			} as Response);

			await expect(api.deleteLLMConfig(1)).resolves.toBeUndefined();
		});

		it('deleteLLMConfig handles non-JSON error', async () => {
			global.fetch = jest.fn().mockResolvedValue({
				ok: false,
				status: 500,
				headers: new Headers({ 'content-type': 'text/plain' }),
				json: async () => {
					throw new Error('Not JSON');
				}
			} as unknown as Response);

			await expect(api.deleteLLMConfig(1)).rejects.toThrow('Failed to delete LLM config (Status: 500)');
		});

		it('callLLM calls LLM with config', async () => {
			const response = { content: 'Response' };
			global.fetch = jest.fn().mockResolvedValue({
				ok: true,
				json: async () => response
			} as Response);

			await expect(api.callLLM(1, { prompt: 'Test' } as LLMRequestOptions)).resolves.toEqual(response);
		});

		it('callLLMWithFallback calls LLM with fallback', async () => {
			const response = { content: 'Response' };
			global.fetch = jest.fn().mockResolvedValue({
				ok: true,
				json: async () => response
			} as Response);

			await expect(api.callLLMWithFallback({ prompt: 'Test' } as LLMRequestOptions)).resolves.toEqual(response);
		});
	});

	describe('Suite Entries', () => {
		it('getSuiteEntries fetches entries', async () => {
			const entries = [{ id: 1, sequence: 1 }];
			global.fetch = jest.fn().mockResolvedValue({
				ok: true,
				json: async () => entries
			} as Response);

			await expect(api.getSuiteEntries(1)).resolves.toEqual(entries);
		});

		it('addSuiteEntry adds entry', async () => {
			const entry = { id: 1, sequence: 1 };
			global.fetch = jest.fn().mockResolvedValue({
				ok: true,
				json: async () => entry
			} as Response);

			await expect(api.addSuiteEntry(1, { test_id: 2 })).resolves.toEqual(entry);
		});

		it('updateSuiteEntry updates entry', async () => {
			global.fetch = jest.fn().mockResolvedValue({
				ok: true,
				json: async () => ({})
			} as Response);

			await expect(api.updateSuiteEntry(1, 2, { sequence: 3 })).resolves.toBeUndefined();
		});

		it('deleteSuiteEntry deletes entry', async () => {
			global.fetch = jest.fn().mockResolvedValue({
				ok: true,
				json: async () => ({})
			} as Response);

			await expect(api.deleteSuiteEntry(1, 2)).resolves.toBeUndefined();
		});

		it('reorderSuiteEntries reorders entries', async () => {
			const result = { success: true };
			global.fetch = jest.fn().mockResolvedValue({
				ok: true,
				json: async () => result
			} as Response);

			await expect(api.reorderSuiteEntries(1, [{ entry_id: 1, sequence: 2 }])).resolves.toEqual(result);
		});
	});

	describe('Conversations', () => {
		it('getConversations fetches conversations', async () => {
			const result = { data: [{ id: 1, name: 'Conv' }], total: 1 };
			global.fetch = jest.fn().mockResolvedValue({
				ok: true,
				json: async () => result
			} as Response);

			await expect(api.getConversations()).resolves.toEqual(result);
		});

		it('getConversationById fetches single conversation', async () => {
			const conv = { id: 1, name: 'Conv' };
			global.fetch = jest.fn().mockResolvedValue({
				ok: true,
				json: async () => conv
			} as Response);

			await expect(api.getConversationById(1)).resolves.toEqual(conv);
		});

		it('createConversation creates conversation', async () => {
			const conv = { id: 1, name: 'New' };
			global.fetch = jest.fn().mockResolvedValue({
				ok: true,
				json: async () => conv
			} as Response);

			await expect(
				api.createConversation({ name: 'New' } as Omit<any, 'id' | 'created_at' | 'updated_at'>)
			).resolves.toEqual(conv);
		});

		it('updateConversation updates conversation', async () => {
			const conv = { id: 1, name: 'Updated' };
			global.fetch = jest.fn().mockResolvedValue({
				ok: true,
				json: async () => conv
			} as Response);

			await expect(api.updateConversation(1, { name: 'Updated' })).resolves.toEqual(conv);
		});

		it('deleteConversation deletes conversation', async () => {
			global.fetch = jest.fn().mockResolvedValue({
				ok: true,
				json: async () => ({})
			} as Response);

			await expect(api.deleteConversation(1)).resolves.toBeUndefined();
		});

		it('addMessageToConversation adds message', async () => {
			const message = { id: 1, role: 'user', content: 'Hello' };
			global.fetch = jest.fn().mockResolvedValue({
				ok: true,
				json: async () => message
			} as Response);

			await expect(
				api.addMessageToConversation(1, { role: 'user', content: 'Hello' } as Omit<
					any,
					'id' | 'conversation_id' | 'created_at'
				>)
			).resolves.toEqual(message);
		});

		it('updateConversationMessage updates message', async () => {
			const message = { id: 1, content: 'Updated' };
			global.fetch = jest.fn().mockResolvedValue({
				ok: true,
				json: async () => message
			} as Response);

			await expect(api.updateConversationMessage(1, 2, { content: 'Updated' })).resolves.toEqual(message);
		});

		it('deleteConversationMessage deletes message', async () => {
			global.fetch = jest.fn().mockResolvedValue({
				ok: true,
				json: async () => ({})
			} as Response);

			await expect(api.deleteConversationMessage(1, 2)).resolves.toBeUndefined();
		});

		it('reorderConversationMessages reorders messages', async () => {
			global.fetch = jest.fn().mockResolvedValue({
				ok: true,
				json: async () => ({})
			} as Response);

			await expect(api.reorderConversationMessages(1, [{ id: 1, sequence: 2 }])).resolves.toBeUndefined();
		});

		it('executeConversation executes conversation', async () => {
			const result = { job_id: 'job1', message: 'Started' };
			global.fetch = jest.fn().mockResolvedValue({
				ok: true,
				json: async () => result
			} as Response);

			await expect(api.executeConversation(1, 2)).resolves.toEqual(result);
		});

		it('executeConversation handles error with details array', async () => {
			global.fetch = jest.fn().mockResolvedValue({
				ok: false,
				json: async () => ({ error: 'Failed', details: ['Detail 1', 'Detail 2'] })
			} as Response);

			await expect(api.executeConversation(1, 2)).rejects.toThrow('Failed\nDetail 1\nDetail 2');
		});

		it('executeConversation handles error with details string', async () => {
			global.fetch = jest.fn().mockResolvedValue({
				ok: false,
				json: async () => ({ error: 'Failed', details: 'Single detail' })
			} as Response);

			await expect(api.executeConversation(1, 2)).rejects.toThrow('Failed\nSingle detail');
		});

		it('executeConversation handles error without details', async () => {
			global.fetch = jest.fn().mockResolvedValue({
				ok: false,
				json: async () => ({ error: 'Failed' })
			} as Response);

			await expect(api.executeConversation(1, 2)).rejects.toThrow('Failed');
		});
	});

	describe('Execution Sessions', () => {
		it('getExecutionSessions fetches sessions', async () => {
			const result = { data: [{ id: 1 }], total: 1 };
			global.fetch = jest.fn().mockResolvedValue({
				ok: true,
				json: async () => result
			} as Response);

			await expect(api.getExecutionSessions({ conversation_id: 1 })).resolves.toEqual(result);
		});

		it('getExecutionSessionById fetches single session', async () => {
			const session = { id: 1, status: 'completed' };
			global.fetch = jest.fn().mockResolvedValue({
				ok: true,
				json: async () => session
			} as Response);

			await expect(api.getExecutionSessionById(1)).resolves.toEqual(session);
		});

		it('getSessionTranscript fetches transcript', async () => {
			const messages = [{ id: 1, content: 'Hello' }];
			global.fetch = jest.fn().mockResolvedValue({
				ok: true,
				json: async () => ({ messages })
			} as Response);

			await expect(api.getSessionTranscript(1)).resolves.toEqual(messages);
		});

		it('getSessionTranscriptWithSession fetches transcript with session', async () => {
			const data = { session: { id: 1 }, messages: [{ id: 1 }] };
			global.fetch = jest.fn().mockResolvedValue({
				ok: true,
				json: async () => data
			} as Response);

			await expect(api.getSessionTranscriptWithSession(1)).resolves.toEqual(data);
		});

		it('getSessionTranscriptWithSession handles missing messages', async () => {
			const data = { session: { id: 1 } };
			global.fetch = jest.fn().mockResolvedValue({
				ok: true,
				json: async () => data
			} as Response);

			await expect(api.getSessionTranscriptWithSession(1)).resolves.toEqual({ session: { id: 1 }, messages: [] });
		});

		it('regenerateSimilarityScore regenerates score', async () => {
			global.fetch = jest.fn().mockResolvedValue({
				ok: true,
				json: async () => ({})
			} as Response);

			await expect(api.regenerateSimilarityScore(1)).resolves.toBeUndefined();
		});
	});

	describe('Conversation Turn Targets', () => {
		it('getConversationTurnTargets fetches targets', async () => {
			const targets = [{ id: 1, turn_number: 1 }];
			global.fetch = jest.fn().mockResolvedValue({
				ok: true,
				json: async () => targets
			} as Response);

			await expect(api.getConversationTurnTargets(1)).resolves.toEqual(targets);
		});

		it('saveConversationTurnTarget saves target', async () => {
			const target = { id: 1, turn_number: 1 };
			global.fetch = jest.fn().mockResolvedValue({
				ok: true,
				json: async () => target
			} as Response);

			await expect(
				api.saveConversationTurnTarget({ conversation_id: 1, turn_number: 1 } as Omit<
					any,
					'id' | 'created_at' | 'updated_at'
				>)
			).resolves.toEqual(target);
		});

		it('deleteConversationTurnTarget deletes target', async () => {
			global.fetch = jest.fn().mockResolvedValue({
				ok: true,
				json: async () => ({})
			} as Response);

			await expect(api.deleteConversationTurnTarget(1)).resolves.toBeUndefined();
		});
	});
});

// Made with Bob
