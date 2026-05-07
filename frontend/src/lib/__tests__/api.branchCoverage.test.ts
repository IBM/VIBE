/* eslint-disable @typescript-eslint/no-explicit-any */
import { api } from '../api';

describe('api client (branch coverage for optional filters)', () => {
	const originalFetch = global.fetch;

	afterEach(() => {
		if (originalFetch) {
			global.fetch = originalFetch;
		}
		jest.resetAllMocks();
	});

	describe('getResultsWithCount - optional filter parameters', () => {
		it('includes agent_id when provided', async () => {
			global.fetch = jest.fn().mockResolvedValue({
				ok: true,
				json: async () => ({ data: [], total: 0 })
			} as Response);

			await api.getResultsWithCount({ agent_id: 5 });
			expect(global.fetch).toHaveBeenCalledWith(expect.stringContaining('agent_id=5'));
		});

		it('includes test_id when provided', async () => {
			global.fetch = jest.fn().mockResolvedValue({
				ok: true,
				json: async () => ({ data: [], total: 0 })
			} as Response);

			await api.getResultsWithCount({ test_id: 10 });
			expect(global.fetch).toHaveBeenCalledWith(expect.stringContaining('test_id=10'));
		});

		it('includes limit when provided', async () => {
			global.fetch = jest.fn().mockResolvedValue({
				ok: true,
				json: async () => ({ data: [], total: 0 })
			} as Response);

			await api.getResultsWithCount({ limit: 20 });
			expect(global.fetch).toHaveBeenCalledWith(expect.stringContaining('limit=20'));
		});

		it('includes offset when provided', async () => {
			global.fetch = jest.fn().mockResolvedValue({
				ok: true,
				json: async () => ({ data: [], total: 0 })
			} as Response);

			await api.getResultsWithCount({ offset: 30 });
			expect(global.fetch).toHaveBeenCalledWith(expect.stringContaining('offset=30'));
		});
	});

	describe('getSuiteRuns - optional filter parameters', () => {
		it('includes limit when provided', async () => {
			global.fetch = jest.fn().mockResolvedValue({
				ok: true,
				json: async () => []
			} as Response);

			await api.getSuiteRuns({ limit: 15 });
			expect(global.fetch).toHaveBeenCalledWith(expect.stringContaining('limit=15'));
		});

		it('includes suite_id when provided', async () => {
			global.fetch = jest.fn().mockResolvedValue({
				ok: true,
				json: async () => []
			} as Response);

			await api.getSuiteRuns({ suite_id: 7 });
			expect(global.fetch).toHaveBeenCalledWith(expect.stringContaining('suite_id=7'));
		});

		it('includes agent_id when provided', async () => {
			global.fetch = jest.fn().mockResolvedValue({
				ok: true,
				json: async () => []
			} as Response);

			await api.getSuiteRuns({ agent_id: 3 });
			expect(global.fetch).toHaveBeenCalledWith(expect.stringContaining('agent_id=3'));
		});

		it('includes status when provided', async () => {
			global.fetch = jest.fn().mockResolvedValue({
				ok: true,
				json: async () => []
			} as Response);

			await api.getSuiteRuns({ status: 'completed' });
			expect(global.fetch).toHaveBeenCalledWith(expect.stringContaining('status=completed'));
		});

		it('includes after date when provided', async () => {
			const afterDate = new Date('2024-01-15T10:00:00Z');
			global.fetch = jest.fn().mockResolvedValue({
				ok: true,
				json: async () => []
			} as Response);

			await api.getSuiteRuns({ after: afterDate });
			const callUrl = (global.fetch as jest.Mock).mock.calls[0][0];
			expect(callUrl).toContain('after=');
			expect(decodeURIComponent(callUrl)).toContain('2024-01-15T10:00:00.000Z');
		});

		it('includes before date when provided', async () => {
			const beforeDate = new Date('2024-12-31T23:59:59Z');
			global.fetch = jest.fn().mockResolvedValue({
				ok: true,
				json: async () => []
			} as Response);

			await api.getSuiteRuns({ before: beforeDate });
			const callUrl = (global.fetch as jest.Mock).mock.calls[0][0];
			expect(callUrl).toContain('before=');
			expect(decodeURIComponent(callUrl)).toContain('2024-12-31T23:59:59.000Z');
		});
	});

	describe('getSuiteRunsWithCount - optional filter parameters', () => {
		it('includes limit when provided', async () => {
			global.fetch = jest.fn().mockResolvedValue({
				ok: true,
				json: async () => ({ data: [], total: 0 })
			} as Response);

			await api.getSuiteRunsWithCount({ limit: 25 });
			expect(global.fetch).toHaveBeenCalledWith(expect.stringContaining('limit=25'));
		});

		it('includes offset when provided', async () => {
			global.fetch = jest.fn().mockResolvedValue({
				ok: true,
				json: async () => ({ data: [], total: 0 })
			} as Response);

			await api.getSuiteRunsWithCount({ offset: 50 });
			expect(global.fetch).toHaveBeenCalledWith(expect.stringContaining('offset=50'));
		});

		it('includes suite_id when provided', async () => {
			global.fetch = jest.fn().mockResolvedValue({
				ok: true,
				json: async () => ({ data: [], total: 0 })
			} as Response);

			await api.getSuiteRunsWithCount({ suite_id: 8 });
			expect(global.fetch).toHaveBeenCalledWith(expect.stringContaining('suite_id=8'));
		});

		it('includes agent_id when provided', async () => {
			global.fetch = jest.fn().mockResolvedValue({
				ok: true,
				json: async () => ({ data: [], total: 0 })
			} as Response);

			await api.getSuiteRunsWithCount({ agent_id: 4 });
			expect(global.fetch).toHaveBeenCalledWith(expect.stringContaining('agent_id=4'));
		});

		it('includes status when provided', async () => {
			global.fetch = jest.fn().mockResolvedValue({
				ok: true,
				json: async () => ({ data: [], total: 0 })
			} as Response);

			await api.getSuiteRunsWithCount({ status: 'failed' });
			expect(global.fetch).toHaveBeenCalledWith(expect.stringContaining('status=failed'));
		});

		it('includes after date when provided', async () => {
			const afterDate = new Date('2024-06-01T00:00:00Z');
			global.fetch = jest.fn().mockResolvedValue({
				ok: true,
				json: async () => ({ data: [], total: 0 })
			} as Response);

			await api.getSuiteRunsWithCount({ after: afterDate });
			const callUrl = (global.fetch as jest.Mock).mock.calls[0][0];
			expect(callUrl).toContain('after=');
			expect(decodeURIComponent(callUrl)).toContain('2024-06-01T00:00:00.000Z');
		});

		it('includes before date when provided', async () => {
			const beforeDate = new Date('2024-06-30T23:59:59Z');
			global.fetch = jest.fn().mockResolvedValue({
				ok: true,
				json: async () => ({ data: [], total: 0 })
			} as Response);

			await api.getSuiteRunsWithCount({ before: beforeDate });
			const callUrl = (global.fetch as jest.Mock).mock.calls[0][0];
			expect(callUrl).toContain('before=');
			expect(decodeURIComponent(callUrl)).toContain('2024-06-30T23:59:59.000Z');
		});
	});

	describe('getJobsWithCount - optional filter parameters', () => {
		it('includes limit when provided', async () => {
			global.fetch = jest.fn().mockResolvedValue({
				ok: true,
				json: async () => ({ data: [], total: 0 })
			} as Response);

			await api.getJobsWithCount({ limit: 100 });
			expect(global.fetch).toHaveBeenCalledWith(expect.stringContaining('limit=100'));
		});

		it('includes offset when provided', async () => {
			global.fetch = jest.fn().mockResolvedValue({
				ok: true,
				json: async () => ({ data: [], total: 0 })
			} as Response);

			await api.getJobsWithCount({ offset: 200 });
			expect(global.fetch).toHaveBeenCalledWith(expect.stringContaining('offset=200'));
		});
	});

	describe('getConversations - optional filter parameters', () => {
		it('includes offset when provided', async () => {
			global.fetch = jest.fn().mockResolvedValue({
				ok: true,
				json: async () => ({ data: [], total: 0 })
			} as Response);

			await api.getConversations({ offset: 40 });
			expect(global.fetch).toHaveBeenCalledWith(expect.stringContaining('offset=40'));
		});
	});

	describe('getExecutionSessions - optional filter parameters', () => {
		it('includes agent_id when provided', async () => {
			global.fetch = jest.fn().mockResolvedValue({
				ok: true,
				json: async () => ({ data: [], total: 0 })
			} as Response);

			await api.getExecutionSessions({ agent_id: 6 });
			expect(global.fetch).toHaveBeenCalledWith(expect.stringContaining('agent_id=6'));
		});

		it('includes limit when provided', async () => {
			global.fetch = jest.fn().mockResolvedValue({
				ok: true,
				json: async () => ({ data: [], total: 0 })
			} as Response);

			await api.getExecutionSessions({ limit: 30 });
			expect(global.fetch).toHaveBeenCalledWith(expect.stringContaining('limit=30'));
		});

		it('includes offset when provided', async () => {
			global.fetch = jest.fn().mockResolvedValue({
				ok: true,
				json: async () => ({ data: [], total: 0 })
			} as Response);

			await api.getExecutionSessions({ offset: 60 });
			expect(global.fetch).toHaveBeenCalledWith(expect.stringContaining('offset=60'));
		});
	});

	describe('getResults - optional filter parameters', () => {
		it('includes limit when provided', async () => {
			global.fetch = jest.fn().mockResolvedValue({
				ok: true,
				json: async () => []
			} as Response);

			await api.getResults({ limit: 15 });
			expect(global.fetch).toHaveBeenCalledWith(expect.stringContaining('limit=15'));
		});

		it('includes offset when provided', async () => {
			global.fetch = jest.fn().mockResolvedValue({
				ok: true,
				json: async () => []
			} as Response);

			await api.getResults({ offset: 25 });
			expect(global.fetch).toHaveBeenCalledWith(expect.stringContaining('offset=25'));
		});
	});

	describe('getJobs - optional filter parameters', () => {
		it('includes limit when provided', async () => {
			global.fetch = jest.fn().mockResolvedValue({
				ok: true,
				json: async () => []
			} as Response);

			await api.getJobs({ limit: 50 });
			expect(global.fetch).toHaveBeenCalledWith(expect.stringContaining('limit=50'));
		});

		it('includes offset when provided', async () => {
			global.fetch = jest.fn().mockResolvedValue({
				ok: true,
				json: async () => []
			} as Response);

			await api.getJobs({ offset: 75 });
			expect(global.fetch).toHaveBeenCalledWith(expect.stringContaining('offset=75'));
		});
	});

	describe('Error handling - fallback branches in complex error handlers', () => {
		it('deleteAgent uses fallback when errorData.error is falsy', async () => {
			global.fetch = jest.fn().mockResolvedValue({
				ok: false,
				status: 500,
				headers: new Headers({ 'content-type': 'application/json' }),
				json: async () => ({})
			} as unknown as Response);

			await expect(api.deleteAgent(1)).rejects.toThrow('Failed to delete agent (Status: 500)');
		});

		it('deleteTest uses fallback when errorData.error is falsy', async () => {
			global.fetch = jest.fn().mockResolvedValue({
				ok: false,
				status: 404,
				headers: new Headers({ 'content-type': 'application/json' }),
				json: async () => ({})
			} as unknown as Response);

			await expect(api.deleteTest(1)).rejects.toThrow('Failed to delete test (Status: 404)');
		});

		it('deleteLLMConfig uses fallback when errorData.error is falsy', async () => {
			global.fetch = jest.fn().mockResolvedValue({
				ok: false,
				status: 400,
				headers: new Headers({ 'content-type': 'application/json' }),
				json: async () => ({})
			} as unknown as Response);

			await expect(api.deleteLLMConfig(1)).rejects.toThrow('Failed to delete LLM config (Status: 400)');
		});

		it('deleteSuiteRun uses fallback when error.error is falsy', async () => {
			global.fetch = jest.fn().mockResolvedValue({
				ok: false,
				json: async () => ({})
			} as Response);

			await expect(api.deleteSuiteRun(1)).rejects.toThrow('Failed to delete suite run');
		});

		it('cancelJob uses fallback when error.error is falsy', async () => {
			global.fetch = jest.fn().mockResolvedValue({
				ok: false,
				json: async () => ({})
			} as Response);

			await expect(api.cancelJob('job1')).rejects.toThrow('Failed to cancel job');
		});

		it('deleteJob uses fallback when error.error is falsy', async () => {
			global.fetch = jest.fn().mockResolvedValue({
				ok: false,
				json: async () => ({})
			} as Response);

			await expect(api.deleteJob('job1')).rejects.toThrow('Failed to delete job');
		});
	});

	describe('Error handling - fallback error messages', () => {
		it('getStats uses fallback when error.error is missing', async () => {
			global.fetch = jest.fn().mockResolvedValue({
				ok: false,
				json: async () => ({})
			} as Response);

			await expect(api.getStats()).rejects.toThrow('Failed to fetch stats');
		});

		it('getAgentRequestTemplates uses fallback when error.error is missing', async () => {
			global.fetch = jest.fn().mockResolvedValue({
				ok: false,
				json: async () => ({})
			} as Response);

			await expect(api.getAgentRequestTemplates(1)).rejects.toThrow('Failed to fetch request templates');
		});

		it('createAgentRequestTemplate uses fallback when error.error is missing', async () => {
			global.fetch = jest.fn().mockResolvedValue({
				ok: false,
				json: async () => ({})
			} as Response);

			await expect(api.createAgentRequestTemplate(1, { name: 't', body: 'b' })).rejects.toThrow(
				'Failed to create request template'
			);
		});

		it('updateAgentRequestTemplate uses fallback when error.error is missing', async () => {
			global.fetch = jest.fn().mockResolvedValue({
				ok: false,
				json: async () => ({})
			} as Response);

			await expect(api.updateAgentRequestTemplate(1, 2, { name: 't' })).rejects.toThrow(
				'Failed to update request template'
			);
		});

		it('deleteAgentRequestTemplate uses fallback when error.error is missing', async () => {
			global.fetch = jest.fn().mockResolvedValue({
				ok: false,
				json: async () => ({})
			} as Response);

			await expect(api.deleteAgentRequestTemplate(1, 2)).rejects.toThrow('Failed to delete request template');
		});

		it('setDefaultAgentRequestTemplate uses fallback when error.error is missing', async () => {
			global.fetch = jest.fn().mockResolvedValue({
				ok: false,
				json: async () => ({})
			} as Response);

			await expect(api.setDefaultAgentRequestTemplate(1, 2)).rejects.toThrow(
				'Failed to set default request template'
			);
		});

		it('getAgentResponseMaps uses fallback when error.error is missing', async () => {
			global.fetch = jest.fn().mockResolvedValue({
				ok: false,
				json: async () => ({})
			} as Response);

			await expect(api.getAgentResponseMaps(1)).rejects.toThrow('Failed to fetch response maps');
		});

		it('createAgentResponseMap uses fallback when error.error is missing', async () => {
			global.fetch = jest.fn().mockResolvedValue({
				ok: false,
				json: async () => ({})
			} as Response);

			await expect(api.createAgentResponseMap(1, { name: 'm', spec: '{}' })).rejects.toThrow(
				'Failed to create response map'
			);
		});

		it('updateAgentResponseMap uses fallback when error.error is missing', async () => {
			global.fetch = jest.fn().mockResolvedValue({
				ok: false,
				json: async () => ({})
			} as Response);

			await expect(api.updateAgentResponseMap(1, 2, { name: 'm' })).rejects.toThrow(
				'Failed to update response map'
			);
		});

		it('deleteAgentResponseMap uses fallback when error.error is missing', async () => {
			global.fetch = jest.fn().mockResolvedValue({
				ok: false,
				json: async () => ({})
			} as Response);

			await expect(api.deleteAgentResponseMap(1, 2)).rejects.toThrow('Failed to delete response map');
		});

		it('setDefaultAgentResponseMap uses fallback when error.error is missing', async () => {
			global.fetch = jest.fn().mockResolvedValue({
				ok: false,
				json: async () => ({})
			} as Response);

			await expect(api.setDefaultAgentResponseMap(1, 2)).rejects.toThrow('Failed to set default response map');
		});

		it('getTemplates uses fallback when error.error is missing', async () => {
			global.fetch = jest.fn().mockResolvedValue({
				ok: false,
				json: async () => ({})
			} as Response);

			await expect(api.getTemplates()).rejects.toThrow('Failed to fetch templates');
		});

		it('getTemplateById uses fallback when error.error is missing', async () => {
			global.fetch = jest.fn().mockResolvedValue({
				ok: false,
				json: async () => ({})
			} as Response);

			await expect(api.getTemplateById(1)).rejects.toThrow('Failed to fetch template');
		});

		it('createTemplate uses fallback when error.error is missing', async () => {
			global.fetch = jest.fn().mockResolvedValue({
				ok: false,
				json: async () => ({})
			} as Response);

			await expect(api.createTemplate({ name: 't', body: 'b' } as any)).rejects.toThrow(
				'Failed to create template'
			);
		});

		it('updateTemplate uses fallback when error.error is missing', async () => {
			global.fetch = jest.fn().mockResolvedValue({
				ok: false,
				json: async () => ({})
			} as Response);

			await expect(api.updateTemplate(1, { name: 't' } as any)).rejects.toThrow('Failed to update template');
		});

		it('deleteTemplate uses fallback when error.error is missing', async () => {
			global.fetch = jest.fn().mockResolvedValue({
				ok: false,
				json: async () => ({})
			} as Response);

			await expect(api.deleteTemplate(1)).rejects.toThrow('Failed to delete template');
		});

		it('getResponseMaps uses fallback when error.error is missing', async () => {
			global.fetch = jest.fn().mockResolvedValue({
				ok: false,
				json: async () => ({})
			} as Response);

			await expect(api.getResponseMaps()).rejects.toThrow('Failed to fetch response maps');
		});

		it('getResponseMapById uses fallback when error.error is missing', async () => {
			global.fetch = jest.fn().mockResolvedValue({
				ok: false,
				json: async () => ({})
			} as Response);

			await expect(api.getResponseMapById(1)).rejects.toThrow('Failed to fetch response map');
		});

		it('createResponseMap uses fallback when error.error is missing', async () => {
			global.fetch = jest.fn().mockResolvedValue({
				ok: false,
				json: async () => ({})
			} as Response);

			await expect(api.createResponseMap({ name: 'm', spec: '{}' } as any)).rejects.toThrow(
				'Failed to create response map'
			);
		});

		it('updateResponseMap uses fallback when error.error is missing', async () => {
			global.fetch = jest.fn().mockResolvedValue({
				ok: false,
				json: async () => ({})
			} as Response);

			await expect(api.updateResponseMap(1, { name: 'm' } as any)).rejects.toThrow(
				'Failed to update response map'
			);
		});

		it('deleteResponseMap uses fallback when error.error is missing', async () => {
			global.fetch = jest.fn().mockResolvedValue({
				ok: false,
				json: async () => ({})
			} as Response);

			await expect(api.deleteResponseMap(1)).rejects.toThrow('Failed to delete response map');
		});

		it('getAgentLinkedTemplates uses fallback when error.error is missing', async () => {
			global.fetch = jest.fn().mockResolvedValue({
				ok: false,
				json: async () => ({})
			} as Response);

			await expect(api.getAgentLinkedTemplates(1)).rejects.toThrow('Failed to fetch linked templates');
		});

		it('linkTemplateToAgent uses fallback when error.error is missing', async () => {
			global.fetch = jest.fn().mockResolvedValue({
				ok: false,
				json: async () => ({})
			} as Response);

			await expect(api.linkTemplateToAgent(1, { template_id: 2 })).rejects.toThrow('Failed to link template');
		});

		it('unlinkTemplateFromAgent uses fallback when error.error is missing', async () => {
			global.fetch = jest.fn().mockResolvedValue({
				ok: false,
				json: async () => ({})
			} as Response);

			await expect(api.unlinkTemplateFromAgent(1, 2)).rejects.toThrow('Failed to unlink template');
		});

		it('setAgentLinkedTemplateDefault uses fallback when error.error is missing', async () => {
			global.fetch = jest.fn().mockResolvedValue({
				ok: false,
				json: async () => ({})
			} as Response);

			await expect(api.setAgentLinkedTemplateDefault(1, 2)).rejects.toThrow('Failed to set default template');
		});

		it('getAgentLinkedResponseMaps uses fallback when error.error is missing', async () => {
			global.fetch = jest.fn().mockResolvedValue({
				ok: false,
				json: async () => ({})
			} as Response);

			await expect(api.getAgentLinkedResponseMaps(1)).rejects.toThrow('Failed to fetch linked response maps');
		});

		it('linkResponseMapToAgent uses fallback when error.error is missing', async () => {
			global.fetch = jest.fn().mockResolvedValue({
				ok: false,
				json: async () => ({})
			} as Response);

			await expect(api.linkResponseMapToAgent(1, { response_map_id: 2 })).rejects.toThrow(
				'Failed to link response map'
			);
		});

		it('unlinkResponseMapFromAgent uses fallback when error.error is missing', async () => {
			global.fetch = jest.fn().mockResolvedValue({
				ok: false,
				json: async () => ({})
			} as Response);

			await expect(api.unlinkResponseMapFromAgent(1, 2)).rejects.toThrow('Failed to unlink response map');
		});

		it('setAgentLinkedResponseMapDefault uses fallback when error.error is missing', async () => {
			global.fetch = jest.fn().mockResolvedValue({
				ok: false,
				json: async () => ({})
			} as Response);

			await expect(api.setAgentLinkedResponseMapDefault(1, 2)).rejects.toThrow(
				'Failed to set default response map'
			);
		});

		it('getAgents uses fallback when error.error is missing', async () => {
			global.fetch = jest.fn().mockResolvedValue({
				ok: false,
				json: async () => ({})
			} as Response);

			await expect(api.getAgents()).rejects.toThrow('Failed to fetch agents');
		});

		it('getAgentById uses fallback when error.error is missing', async () => {
			global.fetch = jest.fn().mockResolvedValue({
				ok: false,
				json: async () => ({})
			} as Response);

			await expect(api.getAgentById(1)).rejects.toThrow('Failed to fetch agent');
		});

		it('createAgent uses fallback when error.error is missing', async () => {
			global.fetch = jest.fn().mockResolvedValue({
				ok: false,
				json: async () => ({})
			} as Response);

			await expect(
				api.createAgent({ name: 'a', version: '1', prompt: '', settings: '{}' } as any)
			).rejects.toThrow('Failed to create agent');
		});

		it('updateAgent uses fallback when error.error is missing', async () => {
			global.fetch = jest.fn().mockResolvedValue({
				ok: false,
				json: async () => ({})
			} as Response);

			await expect(api.updateAgent(1, { name: 'a' } as any)).rejects.toThrow('Failed to update agent');
		});

		it('getTests uses fallback when error.error is missing', async () => {
			global.fetch = jest.fn().mockResolvedValue({
				ok: false,
				json: async () => ({})
			} as Response);

			await expect(api.getTests()).rejects.toThrow('Failed to fetch tests');
		});

		it('createTest uses fallback when error.error is missing', async () => {
			global.fetch = jest.fn().mockResolvedValue({
				ok: false,
				json: async () => ({})
			} as Response);

			await expect(
				api.createTest({ name: 't', description: '', input: 'i', expected_output: 'o' } as any)
			).rejects.toThrow('Failed to create test');
		});

		it('getTestById uses fallback when error.error is missing', async () => {
			global.fetch = jest.fn().mockResolvedValue({
				ok: false,
				json: async () => ({})
			} as Response);

			await expect(api.getTestById(1)).rejects.toThrow('Failed to fetch test');
		});

		it('updateTest uses fallback when error.error is missing', async () => {
			global.fetch = jest.fn().mockResolvedValue({
				ok: false,
				json: async () => ({})
			} as Response);

			await expect(api.updateTest(1, { name: 't' } as any)).rejects.toThrow('Failed to update test');
		});

		it('getResults uses fallback when error.error is missing', async () => {
			global.fetch = jest.fn().mockResolvedValue({
				ok: false,
				json: async () => ({})
			} as Response);

			await expect(api.getResults()).rejects.toThrow('Failed to fetch results');
		});

		it('getResultsWithCount uses fallback when error.error is missing', async () => {
			global.fetch = jest.fn().mockResolvedValue({
				ok: false,
				json: async () => ({})
			} as Response);

			await expect(api.getResultsWithCount()).rejects.toThrow('Failed to fetch results');
		});

		it('getResultById uses fallback when error.error is missing', async () => {
			global.fetch = jest.fn().mockResolvedValue({
				ok: false,
				json: async () => ({})
			} as Response);

			await expect(api.getResultById(1)).rejects.toThrow('Failed to fetch result');
		});

		it('createResult uses fallback when error.error is missing', async () => {
			global.fetch = jest.fn().mockResolvedValue({
				ok: false,
				json: async () => ({})
			} as Response);

			await expect(
				api.createResult({ agent_id: 1, test_id: 1, output: 'o', status: 'completed' } as any)
			).rejects.toThrow('Failed to create result');
		});

		it('scoreResult uses fallback when error.error is missing', async () => {
			global.fetch = jest.fn().mockResolvedValue({
				ok: false,
				json: async () => ({})
			} as Response);

			await expect(api.scoreResult(1)).rejects.toThrow('Failed to score result');
		});

		it('executeTest uses fallback when error.error is missing', async () => {
			global.fetch = jest.fn().mockResolvedValue({
				ok: false,
				json: async () => ({})
			} as Response);

			await expect(api.executeTest(1, 1)).rejects.toThrow('Failed to execute test');
		});

		it('getTestSuites uses fallback when error.error is missing', async () => {
			global.fetch = jest.fn().mockResolvedValue({
				ok: false,
				json: async () => ({})
			} as Response);

			await expect(api.getTestSuites()).rejects.toThrow('Failed to fetch test suites');
		});

		it('executeSuite uses fallback when error.error is missing', async () => {
			global.fetch = jest.fn().mockResolvedValue({
				ok: false,
				json: async () => ({})
			} as Response);

			await expect(api.executeSuite(1, 1)).rejects.toThrow('Failed to execute suite');
		});

		it('getSuiteRuns uses fallback when error.error is missing', async () => {
			global.fetch = jest.fn().mockResolvedValue({
				ok: false,
				json: async () => ({})
			} as Response);

			await expect(api.getSuiteRuns()).rejects.toThrow('Failed to fetch suite runs');
		});

		it('getSuiteRunsWithCount uses fallback when error.error is missing', async () => {
			global.fetch = jest.fn().mockResolvedValue({
				ok: false,
				json: async () => ({})
			} as Response);

			await expect(api.getSuiteRunsWithCount()).rejects.toThrow('Failed to fetch suite runs');
		});

		it('getSuiteRunJobs uses fallback when error.error is missing', async () => {
			global.fetch = jest.fn().mockResolvedValue({
				ok: false,
				json: async () => ({})
			} as Response);

			await expect(api.getSuiteRunJobs(1)).rejects.toThrow('Failed to fetch suite run jobs');
		});

		it('getSuiteRun uses fallback when error.error is missing', async () => {
			global.fetch = jest.fn().mockResolvedValue({
				ok: false,
				json: async () => ({})
			} as Response);

			await expect(api.getSuiteRun(1)).rejects.toThrow('Failed to fetch suite run');
		});

		it('getJobs uses fallback when error.error is missing', async () => {
			global.fetch = jest.fn().mockResolvedValue({
				ok: false,
				json: async () => ({})
			} as Response);

			await expect(api.getJobs()).rejects.toThrow('Failed to fetch jobs');
		});

		it('getJobsWithCount uses fallback when error.error is missing', async () => {
			global.fetch = jest.fn().mockResolvedValue({
				ok: false,
				json: async () => ({})
			} as Response);

			await expect(api.getJobsWithCount()).rejects.toThrow('Failed to fetch jobs');
		});

		it('createJob uses fallback when error.error is missing', async () => {
			global.fetch = jest.fn().mockResolvedValue({
				ok: false,
				json: async () => ({})
			} as Response);

			await expect(api.createJob(1, 1)).rejects.toThrow('Failed to create job');
		});

		it('getJobStatus uses fallback when error.error is missing', async () => {
			global.fetch = jest.fn().mockResolvedValue({
				ok: false,
				json: async () => ({})
			} as Response);

			await expect(api.getJobStatus('job1')).rejects.toThrow('Failed to fetch job status');
		});

		it('createTestSuite uses fallback when error.error is missing', async () => {
			global.fetch = jest.fn().mockResolvedValue({
				ok: false,
				json: async () => ({})
			} as Response);

			await expect(api.createTestSuite({ name: 's' } as any)).rejects.toThrow('Failed to create test suite');
		});

		it('updateTestSuite uses fallback when error.error is missing', async () => {
			global.fetch = jest.fn().mockResolvedValue({
				ok: false,
				json: async () => ({})
			} as Response);

			await expect(api.updateTestSuite(1, { name: 's' } as any)).rejects.toThrow('Failed to update test suite');
		});

		it('deleteTestSuite uses fallback when error.error is missing', async () => {
			global.fetch = jest.fn().mockResolvedValue({
				ok: false,
				json: async () => ({})
			} as Response);

			await expect(api.deleteTestSuite(1)).rejects.toThrow('Failed to delete test suite');
		});

		it('addTestToSuite uses fallback when error.error is missing', async () => {
			global.fetch = jest.fn().mockResolvedValue({
				ok: false,
				json: async () => ({})
			} as Response);

			await expect(api.addTestToSuite(1, 2)).rejects.toThrow('Failed to add test to suite');
		});

		it('getLLMConfigs uses fallback when error.error is missing', async () => {
			global.fetch = jest.fn().mockResolvedValue({
				ok: false,
				json: async () => ({})
			} as Response);

			await expect(api.getLLMConfigs()).rejects.toThrow('Failed to fetch LLM configs');
		});

		it('getLLMConfigById uses fallback when error.error is missing', async () => {
			global.fetch = jest.fn().mockResolvedValue({
				ok: false,
				json: async () => ({})
			} as Response);

			await expect(api.getLLMConfigById(1)).rejects.toThrow('Failed to fetch LLM config');
		});

		it('createLLMConfig uses fallback when error.error is missing', async () => {
			global.fetch = jest.fn().mockResolvedValue({
				ok: false,
				json: async () => ({})
			} as Response);

			await expect(
				api.createLLMConfig({ name: 'c', provider: 'x', config: '{}', priority: 1 } as any)
			).rejects.toThrow('Failed to create LLM config');
		});

		it('updateLLMConfig uses fallback when error.error is missing', async () => {
			global.fetch = jest.fn().mockResolvedValue({
				ok: false,
				json: async () => ({})
			} as Response);

			await expect(api.updateLLMConfig(1, { name: 'c' } as any)).rejects.toThrow('Failed to update LLM config');
		});

		it('callLLM uses fallback when error.error is missing', async () => {
			global.fetch = jest.fn().mockResolvedValue({
				ok: false,
				json: async () => ({})
			} as Response);

			await expect(api.callLLM(1, { prompt: 'hi' } as any)).rejects.toThrow('Failed to call LLM');
		});

		it('callLLMWithFallback uses fallback when error.error is missing', async () => {
			global.fetch = jest.fn().mockResolvedValue({
				ok: false,
				json: async () => ({})
			} as Response);

			await expect(api.callLLMWithFallback({ prompt: 'hi' } as any)).rejects.toThrow(
				'Failed to call LLM with fallback'
			);
		});

		it('getSuiteEntries uses fallback when error.error is missing', async () => {
			global.fetch = jest.fn().mockResolvedValue({
				ok: false,
				json: async () => ({})
			} as Response);

			await expect(api.getSuiteEntries(1)).rejects.toThrow('Failed to fetch suite entries');
		});

		it('addSuiteEntry uses fallback when error.error is missing', async () => {
			global.fetch = jest.fn().mockResolvedValue({
				ok: false,
				json: async () => ({})
			} as Response);

			await expect(api.addSuiteEntry(1, { test_id: 2 })).rejects.toThrow('Failed to add suite entry');
		});

		it('updateSuiteEntry uses fallback when error.error is missing', async () => {
			global.fetch = jest.fn().mockResolvedValue({
				ok: false,
				json: async () => ({})
			} as Response);

			await expect(api.updateSuiteEntry(1, 2, { sequence: 1 })).rejects.toThrow('Failed to update suite entry');
		});

		it('deleteSuiteEntry uses fallback when error.error is missing', async () => {
			global.fetch = jest.fn().mockResolvedValue({
				ok: false,
				json: async () => ({})
			} as Response);

			await expect(api.deleteSuiteEntry(1, 2)).rejects.toThrow('Failed to delete suite entry');
		});

		it('reorderSuiteEntries uses fallback when error.error is missing', async () => {
			global.fetch = jest.fn().mockResolvedValue({
				ok: false,
				json: async () => ({})
			} as Response);

			await expect(api.reorderSuiteEntries(1, [{ entry_id: 1, sequence: 1 }])).rejects.toThrow(
				'Failed to reorder suite entries'
			);
		});

		it('getConversations uses fallback when error.error is missing', async () => {
			global.fetch = jest.fn().mockResolvedValue({
				ok: false,
				json: async () => ({})
			} as Response);

			await expect(api.getConversations()).rejects.toThrow('Failed to fetch conversations');
		});

		it('getConversationById uses fallback when error.error is missing', async () => {
			global.fetch = jest.fn().mockResolvedValue({
				ok: false,
				json: async () => ({})
			} as Response);

			await expect(api.getConversationById(1)).rejects.toThrow('Failed to fetch conversation');
		});

		it('createConversation uses fallback when error.error is missing', async () => {
			global.fetch = jest.fn().mockResolvedValue({
				ok: false,
				json: async () => ({})
			} as Response);

			await expect(api.createConversation({ name: 'c', description: '' } as any)).rejects.toThrow(
				'Failed to create conversation'
			);
		});

		it('updateConversation uses fallback when error.error is missing', async () => {
			global.fetch = jest.fn().mockResolvedValue({
				ok: false,
				json: async () => ({})
			} as Response);

			await expect(api.updateConversation(1, { name: 'c' } as any)).rejects.toThrow(
				'Failed to update conversation'
			);
		});

		it('deleteConversation uses fallback when error.error is missing', async () => {
			global.fetch = jest.fn().mockResolvedValue({
				ok: false,
				json: async () => ({})
			} as Response);

			await expect(api.deleteConversation(1)).rejects.toThrow('Failed to delete conversation');
		});

		it('addMessageToConversation uses fallback when error.error is missing', async () => {
			global.fetch = jest.fn().mockResolvedValue({
				ok: false,
				json: async () => ({})
			} as Response);

			await expect(
				api.addMessageToConversation(1, { role: 'user', content: 'hi', sequence: 1 } as any)
			).rejects.toThrow('Failed to add message to conversation');
		});

		it('updateConversationMessage uses fallback when error.error is missing', async () => {
			global.fetch = jest.fn().mockResolvedValue({
				ok: false,
				json: async () => ({})
			} as Response);

			await expect(api.updateConversationMessage(1, 2, { content: 'x' } as any)).rejects.toThrow(
				'Failed to update conversation message'
			);
		});

		it('deleteConversationMessage uses fallback when error.error is missing', async () => {
			global.fetch = jest.fn().mockResolvedValue({
				ok: false,
				json: async () => ({})
			} as Response);

			await expect(api.deleteConversationMessage(1, 1)).rejects.toThrow('Failed to delete conversation message');
		});

		it('reorderConversationMessages uses fallback when error.error is missing', async () => {
			global.fetch = jest.fn().mockResolvedValue({
				ok: false,
				json: async () => ({})
			} as Response);

			await expect(api.reorderConversationMessages(1, [{ id: 1, sequence: 1 }])).rejects.toThrow(
				'Failed to reorder conversation messages'
			);
		});

		it('getExecutionSessions uses fallback when error.error is missing', async () => {
			global.fetch = jest.fn().mockResolvedValue({
				ok: false,
				json: async () => ({})
			} as Response);

			await expect(api.getExecutionSessions()).rejects.toThrow('Failed to fetch execution sessions');
		});

		it('getExecutionSessionById uses fallback when error.error is missing', async () => {
			global.fetch = jest.fn().mockResolvedValue({
				ok: false,
				json: async () => ({})
			} as Response);

			await expect(api.getExecutionSessionById(1)).rejects.toThrow('Failed to fetch execution session');
		});

		it('getSessionTranscript uses fallback when error.error is missing', async () => {
			global.fetch = jest.fn().mockResolvedValue({
				ok: false,
				json: async () => ({})
			} as Response);

			await expect(api.getSessionTranscript(1)).rejects.toThrow('Failed to fetch session transcript');
		});

		it('getSessionTranscriptWithSession uses fallback when error.error is missing', async () => {
			global.fetch = jest.fn().mockResolvedValue({
				ok: false,
				json: async () => ({})
			} as Response);

			await expect(api.getSessionTranscriptWithSession(1)).rejects.toThrow('Failed to fetch session transcript');
		});

		it('regenerateSimilarityScore uses fallback when error.error is missing', async () => {
			global.fetch = jest.fn().mockResolvedValue({
				ok: false,
				json: async () => ({})
			} as Response);

			await expect(api.regenerateSimilarityScore(1)).rejects.toThrow('Failed to regenerate similarity score');
		});

		it('getConversationTurnTargets uses fallback when error.error is missing', async () => {
			global.fetch = jest.fn().mockResolvedValue({
				ok: false,
				json: async () => ({})
			} as Response);

			await expect(api.getConversationTurnTargets(1)).rejects.toThrow('Failed to fetch turn targets');
		});

		it('saveConversationTurnTarget uses fallback when error.error is missing', async () => {
			global.fetch = jest.fn().mockResolvedValue({
				ok: false,
				json: async () => ({})
			} as Response);

			await expect(
				api.saveConversationTurnTarget({ conversation_id: 1, sequence: 1, expected_similarity: 0.5 } as any)
			).rejects.toThrow('Failed to save turn target');
		});

		it('deleteConversationTurnTarget uses fallback when error.error is missing', async () => {
			global.fetch = jest.fn().mockResolvedValue({
				ok: false,
				json: async () => ({})
			} as Response);

			await expect(api.deleteConversationTurnTarget(1)).rejects.toThrow('Failed to delete turn target');
		});
	});
});
