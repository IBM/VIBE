import type { PaginatedResponse, TestResult } from './types';
import { API_URL, fetchJson } from './fetchJson';

export const resultsApi = {
	async getResults(filters?: {
		agent_id?: number;
		test_id?: number;
		limit?: number;
		offset?: number;
	}): Promise<TestResult[]> {
		const params = new URLSearchParams();
		if (filters?.agent_id) params.append('agent_id', filters.agent_id.toString());
		if (filters?.test_id) params.append('test_id', filters.test_id.toString());
		if (filters?.limit !== undefined) params.append('limit', filters.limit.toString());
		if (filters?.offset !== undefined) params.append('offset', filters.offset.toString());

		const result = await fetchJson<TestResult[] | PaginatedResponse<TestResult>>(
			`${API_URL}/api/results?${params}`,
			undefined,
			'Failed to fetch results'
		);
		return Array.isArray(result) ? result : result.data;
	},

	async getResultsWithCount(filters?: {
		agent_id?: number;
		test_id?: number;
		limit?: number;
		offset?: number;
	}): Promise<PaginatedResponse<TestResult>> {
		const params = new URLSearchParams();
		if (filters?.agent_id) {
			params.append('agent_id', filters.agent_id.toString());
		}
		if (filters?.test_id) {
			params.append('test_id', filters.test_id.toString());
		}
		if (filters?.limit !== undefined) {
			params.append('limit', filters.limit.toString());
		}
		if (filters?.offset !== undefined) {
			params.append('offset', filters.offset.toString());
		}

		const result = await fetchJson<TestResult[] | PaginatedResponse<TestResult>>(
			`${API_URL}/api/results?${params}`,
			undefined,
			'Failed to fetch results'
		);
		if (Array.isArray(result)) {
			return { data: result, total: result.length };
		}
		return result;
	},

	async getResultById(id: number): Promise<TestResult> {
		return fetchJson<TestResult>(`${API_URL}/api/results/${id}`, undefined, 'Failed to fetch result');
	},

	async createResult(result: Omit<TestResult, 'id' | 'created_at'>): Promise<TestResult> {
		return fetchJson<TestResult>(
			`${API_URL}/api/results`,
			{
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(result)
			},
			'Failed to create result'
		);
	},

	async scoreResult(resultId: number, llmConfigId?: number): Promise<TestResult> {
		return fetchJson<TestResult>(
			`${API_URL}/api/results/${resultId}/score`,
			{
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ llm_config_id: llmConfigId })
			},
			'Failed to score result'
		);
	}
};
