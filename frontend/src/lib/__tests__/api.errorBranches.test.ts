/* eslint-disable @typescript-eslint/no-explicit-any */
import { api } from '../api';

describe('api client (error branches)', () => {
	const originalFetch = global.fetch;

	const makeNotOkJsonResponse = (payload: any = { error: 'Boom' }) =>
		({
			ok: false,
			status: 500,
			headers: {
				get: () => 'application/json'
			},
			json: async () => payload
		}) as unknown as Response;

	afterEach(() => {
		if (originalFetch) {
			global.fetch = originalFetch;
		}
		jest.resetAllMocks();
	});

	it('throws backend error payload for most endpoints', async () => {
		global.fetch = jest.fn().mockResolvedValue(makeNotOkJsonResponse({ error: 'Boom' }));

		const calls: Array<[string, () => Promise<unknown>]> = [
			['getStats', () => api.getStats()],

			['getAgentRequestTemplates', () => api.getAgentRequestTemplates(1)],
			['createAgentRequestTemplate', () => api.createAgentRequestTemplate(1, { name: 't', body: 'b' })],
			['updateAgentRequestTemplate', () => api.updateAgentRequestTemplate(1, 2, { name: 't2' })],
			['deleteAgentRequestTemplate', () => api.deleteAgentRequestTemplate(1, 2)],
			['setDefaultAgentRequestTemplate', () => api.setDefaultAgentRequestTemplate(1, 2)],

			['getAgentResponseMaps', () => api.getAgentResponseMaps(1)],
			['createAgentResponseMap', () => api.createAgentResponseMap(1, { name: 'm', spec: '{}' })],
			['updateAgentResponseMap', () => api.updateAgentResponseMap(1, 2, { name: 'm2' })],
			['deleteAgentResponseMap', () => api.deleteAgentResponseMap(1, 2)],
			['setDefaultAgentResponseMap', () => api.setDefaultAgentResponseMap(1, 2)],

			// Global templates/maps
			['getTemplates', () => api.getTemplates()],
			['getTemplateById', () => api.getTemplateById(1)],
			['createTemplate', () => api.createTemplate({ name: 't', body: 'b' } as any)],
			['updateTemplate', () => api.updateTemplate(1, { name: 'u' } as any)],
			['deleteTemplate', () => api.deleteTemplate(1)],

			['getResponseMaps', () => api.getResponseMaps()],
			['getResponseMapById', () => api.getResponseMapById(1)],
			['createResponseMap', () => api.createResponseMap({ name: 'm', spec: '{}' } as any)],
			['updateResponseMap', () => api.updateResponseMap(1, { name: 'u' } as any)],
			['deleteResponseMap', () => api.deleteResponseMap(1)],

			// Agent-template linking
			['getAgentLinkedTemplates', () => api.getAgentLinkedTemplates(1)],
			['linkTemplateToAgent', () => api.linkTemplateToAgent(1, { template_id: 2 })],
			['unlinkTemplateFromAgent', () => api.unlinkTemplateFromAgent(1, 2)],
			['setAgentLinkedTemplateDefault', () => api.setAgentLinkedTemplateDefault(1, 2)],

			['getAgentLinkedResponseMaps', () => api.getAgentLinkedResponseMaps(1)],
			['linkResponseMapToAgent', () => api.linkResponseMapToAgent(1, { response_map_id: 2 })],
			['unlinkResponseMapFromAgent', () => api.unlinkResponseMapFromAgent(1, 2)],
			['setAgentLinkedResponseMapDefault', () => api.setAgentLinkedResponseMapDefault(1, 2)],

			// Agents
			['getAgents', () => api.getAgents()],
			['getAgentById', () => api.getAgentById(1)],
			['createAgent', () => api.createAgent({ name: 'a', version: '1', prompt: '', settings: '{}' } as any)],
			['updateAgent', () => api.updateAgent(1, { name: 'a2' } as any)],
			['deleteAgent', () => api.deleteAgent(1)],

			// Tests
			['getTests', () => api.getTests()],
			[
				'createTest',
				() => api.createTest({ name: 't', description: '', input: 'i', expected_output: 'o' } as any)
			],
			['getTestById', () => api.getTestById(1)],
			['updateTest', () => api.updateTest(1, { name: 't2' } as any)],
			['deleteTest', () => api.deleteTest(1)],

			// Results
			['getResults', () => api.getResults()],
			['getResultsWithCount', () => api.getResultsWithCount()],
			['getResultById', () => api.getResultById(1)],
			[
				'createResult',
				() => api.createResult({ agent_id: 1, test_id: 1, output: 'o', status: 'completed' } as any)
			],
			['scoreResult', () => api.scoreResult(1)],
			['executeTest', () => api.executeTest(1, 1)],

			// Suites, runs, jobs
			['getTestSuites', () => api.getTestSuites()],
			['executeSuite', () => api.executeSuite(1, 1)],
			['getSuiteRuns', () => api.getSuiteRuns({ status: 'running' as any })],
			['getSuiteRunsWithCount', () => api.getSuiteRunsWithCount({ limit: 1 })],
			['getSuiteRunJobs', () => api.getSuiteRunJobs(1)],
			['getSuiteRun', () => api.getSuiteRun(1)],
			['deleteSuiteRun', () => api.deleteSuiteRun(1)],
			['rerunSuiteRun', () => api.rerunSuiteRun(1)],

			['getJobs', () => api.getJobs()],
			['getJobsWithCount', () => api.getJobsWithCount({ limit: 1 })],
			['createJob', () => api.createJob(1, 1)],
			['getJobStatus', () => api.getJobStatus('job-1')],
			['cancelJob', () => api.cancelJob('job-1')],
			['deleteJob', () => api.deleteJob('job-1')],

			['createTestSuite', () => api.createTestSuite({ name: 's' } as any)],
			['updateTestSuite', () => api.updateTestSuite(1, { name: 's2' } as any)],
			['deleteTestSuite', () => api.deleteTestSuite(1)],
			['addTestToSuite', () => api.addTestToSuite(1, 2)],

			// LLM configs (excluding deleteLLMConfig special cases below)
			['getLLMConfigs', () => api.getLLMConfigs()],
			['getLLMConfigById', () => api.getLLMConfigById(1)],
			[
				'createLLMConfig',
				() => api.createLLMConfig({ name: 'c', provider: 'x', config: '{}', priority: 1 } as any)
			],
			['updateLLMConfig', () => api.updateLLMConfig(1, { name: 'c2' } as any)],
			['callLLM', () => api.callLLM(1, { prompt: 'hi' } as any)],
			['callLLMWithFallback', () => api.callLLMWithFallback({ prompt: 'hi' } as any)],

			// Suite entries
			['getSuiteEntries', () => api.getSuiteEntries(1)],
			['addSuiteEntry', () => api.addSuiteEntry(1, { test_id: 2 })],
			['updateSuiteEntry', () => api.updateSuiteEntry(1, 2, { sequence: 1 })],
			['deleteSuiteEntry', () => api.deleteSuiteEntry(1, 2)],
			['reorderSuiteEntries', () => api.reorderSuiteEntries(1, [{ entry_id: 1, sequence: 1 }])],

			// Conversations (excluding executeConversation special cases below)
			['getConversations', () => api.getConversations({ limit: 1 })],
			['getConversationById', () => api.getConversationById(1)],
			['createConversation', () => api.createConversation({ name: 'c', description: '' } as any)],
			['updateConversation', () => api.updateConversation(1, { name: 'c2' } as any)],
			['deleteConversation', () => api.deleteConversation(1)],
			[
				'addMessageToConversation',
				() => api.addMessageToConversation(1, { role: 'user', content: 'hi', sequence: 1 } as any)
			],
			['updateConversationMessage', () => api.updateConversationMessage(1, 2, { content: 'x' } as any)],
			['deleteConversationMessage', () => api.deleteConversationMessage(1, 1)],
			['reorderConversationMessages', () => api.reorderConversationMessages(1, [{ id: 1, sequence: 1 }])],

			// Sessions + targets
			['getExecutionSessions', () => api.getExecutionSessions({ conversation_id: 1 })],
			['getExecutionSessionById', () => api.getExecutionSessionById(1)],
			['getSessionTranscript', () => api.getSessionTranscript(1)],
			['getSessionTranscriptWithSession', () => api.getSessionTranscriptWithSession(1)],
			['regenerateSimilarityScore', () => api.regenerateSimilarityScore(1)],

			['getConversationTurnTargets', () => api.getConversationTurnTargets(1)],
			[
				'saveConversationTurnTarget',
				() =>
					api.saveConversationTurnTarget({ conversation_id: 1, sequence: 1, expected_similarity: 0.5 } as any)
			],
			['deleteConversationTurnTarget', () => api.deleteConversationTurnTarget(1)]
		];

		for (const [name, call] of calls) {
			// eslint-disable-next-line no-await-in-loop
			await expect(call()).rejects.toThrow('Boom');
			expect(name).toBeTruthy();
		}
	});

	it('deleteLLMConfig builds descriptive errors when backend returns non-json', async () => {
		global.fetch = jest.fn().mockResolvedValue({
			ok: false,
			status: 418,
			headers: { get: () => 'text/plain' },
			json: async () => ({ error: 'Ignored' })
		} as unknown as Response);

		await expect(api.deleteLLMConfig(1)).rejects.toThrow('Failed to delete LLM config (Status: 418)');
	});

	it('deleteLLMConfig prefers JSON error message when present', async () => {
		global.fetch = jest.fn().mockResolvedValue({
			ok: false,
			status: 400,
			headers: { get: () => 'application/json; charset=utf-8' },
			json: async () => ({ error: 'Boom' })
		} as unknown as Response);

		await expect(api.deleteLLMConfig(1)).rejects.toThrow('Boom');
	});

	it('deleteLLMConfig ignores JSON parsing errors', async () => {
		global.fetch = jest.fn().mockResolvedValue({
			ok: false,
			status: 500,
			headers: { get: () => 'application/json' },
			json: async () => {
				throw new Error('bad json');
			}
		} as unknown as Response);

		await expect(api.deleteLLMConfig(1)).rejects.toThrow('Failed to delete LLM config (Status: 500)');
	});

	it('executeConversation includes details list in error', async () => {
		global.fetch = jest.fn().mockResolvedValue(makeNotOkJsonResponse({ error: 'Boom', details: ['a', 'b'] }));
		await expect(api.executeConversation(1, 2)).rejects.toThrow('Boom\na\nb');
	});

	it('executeConversation falls back if error payload is not json', async () => {
		global.fetch = jest.fn().mockResolvedValue({
			ok: false,
			status: 500,
			headers: { get: () => 'application/json' },
			json: async () => {
				throw new Error('no json');
			}
		} as unknown as Response);

		await expect(api.executeConversation(1, 2)).rejects.toThrow('Failed to execute conversation');
	});

	it('covers array/object normalization branches for list endpoints', async () => {
		// getResults: array vs { data }
		global.fetch = jest.fn().mockResolvedValue({
			ok: true,
			json: async () => [{ id: 1 }]
		} as unknown as Response);
		await expect(api.getResults()).resolves.toEqual([{ id: 1 }]);

		global.fetch = jest.fn().mockResolvedValue({
			ok: true,
			json: async () => ({ data: [{ id: 2 }] })
		} as unknown as Response);
		await expect(api.getResults()).resolves.toEqual([{ id: 2 }]);

		// getResultsWithCount: array -> { data, total } vs object passthrough
		global.fetch = jest.fn().mockResolvedValue({
			ok: true,
			json: async () => [{ id: 1 }, { id: 2 }]
		} as unknown as Response);
		await expect(api.getResultsWithCount()).resolves.toEqual({ data: [{ id: 1 }, { id: 2 }], total: 2 });

		global.fetch = jest.fn().mockResolvedValue({
			ok: true,
			json: async () => ({ data: [{ id: 3 }], total: 10 })
		} as unknown as Response);
		await expect(api.getResultsWithCount()).resolves.toEqual({ data: [{ id: 3 }], total: 10 });

		// getSuiteRuns + getSuiteRunsWithCount
		global.fetch = jest.fn().mockResolvedValue({
			ok: true,
			json: async () => [{ id: 1 }]
		} as unknown as Response);
		await expect(api.getSuiteRuns()).resolves.toEqual([{ id: 1 }]);

		global.fetch = jest.fn().mockResolvedValue({
			ok: true,
			json: async () => ({ data: [{ id: 2 }] })
		} as unknown as Response);
		await expect(api.getSuiteRuns()).resolves.toEqual([{ id: 2 }]);

		global.fetch = jest.fn().mockResolvedValue({
			ok: true,
			json: async () => [{ id: 1 }, { id: 2 }]
		} as unknown as Response);
		await expect(api.getSuiteRunsWithCount()).resolves.toEqual({ data: [{ id: 1 }, { id: 2 }], total: 2 });

		global.fetch = jest.fn().mockResolvedValue({
			ok: true,
			json: async () => ({ data: [{ id: 3 }], total: 10 })
		} as unknown as Response);
		await expect(api.getSuiteRunsWithCount()).resolves.toEqual({ data: [{ id: 3 }], total: 10 });

		// getJobs + getJobsWithCount
		global.fetch = jest.fn().mockResolvedValue({
			ok: true,
			json: async () => [{ id: 'j1' }]
		} as unknown as Response);
		await expect(api.getJobs()).resolves.toEqual([{ id: 'j1' }]);

		global.fetch = jest.fn().mockResolvedValue({
			ok: true,
			json: async () => ({ data: [{ id: 'j2' }] })
		} as unknown as Response);
		await expect(api.getJobs()).resolves.toEqual([{ id: 'j2' }]);

		global.fetch = jest.fn().mockResolvedValue({
			ok: true,
			json: async () => [{ id: 'j1' }, { id: 'j2' }]
		} as unknown as Response);
		await expect(api.getJobsWithCount()).resolves.toEqual({ data: [{ id: 'j1' }, { id: 'j2' }], total: 2 });

		global.fetch = jest.fn().mockResolvedValue({
			ok: true,
			json: async () => ({ data: [{ id: 'j3' }], total: 10 })
		} as unknown as Response);
		await expect(api.getJobsWithCount()).resolves.toEqual({ data: [{ id: 'j3' }], total: 10 });
	});
});
