import type { Job, JobStatus, PaginatedResponse, SuiteEntry, SuiteRun, TestSuite } from './types';
import { API_URL, fetchJson } from './fetchJson';

const executeSuite = async (suite_id: number, agent_id: number): Promise<{ suite_run_id: number }> => {
	return fetchJson<{ suite_run_id: number }>(
		`${API_URL}/api/execute-suite`,
		{
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ suite_id, agent_id })
		},
		'Failed to execute suite'
	);
};

const getSuiteRun = async (id: number): Promise<SuiteRun> => {
	return fetchJson<SuiteRun>(`${API_URL}/api/suite-runs/${id}`, undefined, 'Failed to fetch suite run');
};

export const suitesApi = {
	// Test suites
	async getTestSuites(): Promise<(TestSuite & { test_count: number })[]> {
		return fetchJson<(TestSuite & { test_count: number })[]>(
			`${API_URL}/api/test-suites`,
			undefined,
			'Failed to fetch test suites'
		);
	},

	executeSuite,

	// Suite runs
	async getSuiteRuns(filters?: {
		limit?: number;
		offset?: number;
		suite_id?: number;
		agent_id?: number;
		status?: JobStatus;
		after?: Date;
		before?: Date;
	}): Promise<SuiteRun[]> {
		const params = new URLSearchParams();
		if (filters?.limit !== undefined) {
			params.append('limit', filters.limit.toString());
		}
		if (filters?.offset !== undefined) params.append('offset', filters.offset.toString());
		if (filters?.suite_id !== undefined) {
			params.append('suite_id', String(filters.suite_id));
		}
		if (filters?.agent_id !== undefined) {
			params.append('agent_id', String(filters.agent_id));
		}
		if (filters?.status !== undefined) {
			params.append('status', String(filters.status));
		}
		if (filters?.after !== undefined) {
			params.append('after', filters.after.toISOString());
		}
		if (filters?.before !== undefined) {
			params.append('before', filters.before.toISOString());
		}

		const result = await fetchJson<SuiteRun[] | PaginatedResponse<SuiteRun>>(
			`${API_URL}/api/suite-runs?${params}`,
			undefined,
			'Failed to fetch suite runs'
		);
		return Array.isArray(result) ? result : result.data;
	},

	async getSuiteRunsWithCount(filters?: {
		limit?: number;
		offset?: number;
		suite_id?: number;
		agent_id?: number;
		status?: JobStatus;
		after?: Date;
		before?: Date;
	}): Promise<PaginatedResponse<SuiteRun>> {
		const params = new URLSearchParams();
		if (filters?.limit !== undefined) {
			params.append('limit', filters.limit.toString());
		}
		if (filters?.offset !== undefined) {
			params.append('offset', filters.offset.toString());
		}
		if (filters?.suite_id !== undefined) {
			params.append('suite_id', String(filters.suite_id));
		}
		if (filters?.agent_id !== undefined) {
			params.append('agent_id', String(filters.agent_id));
		}
		if (filters?.status !== undefined) {
			params.append('status', String(filters.status));
		}
		if (filters?.after !== undefined) {
			params.append('after', filters.after.toISOString());
		}
		if (filters?.before !== undefined) {
			params.append('before', filters.before.toISOString());
		}

		const result = await fetchJson<SuiteRun[] | PaginatedResponse<SuiteRun>>(
			`${API_URL}/api/suite-runs?${params}`,
			undefined,
			'Failed to fetch suite runs'
		);

		if (Array.isArray(result)) {
			return { data: result, total: result.length };
		}
		return result;
	},

	async getSuiteRunJobs(suite_run_id: number): Promise<Job[]> {
		return fetchJson<Job[]>(
			`${API_URL}/api/suite-runs/${suite_run_id}/jobs`,
			undefined,
			'Failed to fetch suite run jobs'
		);
	},

	getSuiteRun,

	async deleteSuiteRun(id: number): Promise<void> {
		await fetchJson<void>(`${API_URL}/api/suite-runs/${id}`, { method: 'DELETE' }, 'Failed to delete suite run');
	},

	async rerunSuiteRun(id: number): Promise<{ suite_run_id: number }> {
		const suiteRun = await getSuiteRun(id);
		return executeSuite(suiteRun.suite_id, suiteRun.agent_id);
	},

	// Suite management
	async createTestSuite(suite: Omit<TestSuite, 'id' | 'created_at' | 'updated_at'>): Promise<TestSuite> {
		return fetchJson<TestSuite>(
			`${API_URL}/api/test-suites`,
			{
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(suite)
			},
			'Failed to create test suite'
		);
	},

	async updateTestSuite(id: number, suite: Partial<TestSuite>): Promise<TestSuite> {
		return fetchJson<TestSuite>(
			`${API_URL}/api/test-suites/${id}`,
			{
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(suite)
			},
			'Failed to update test suite'
		);
	},

	async deleteTestSuite(id: number): Promise<void> {
		await fetchJson<void>(`${API_URL}/api/test-suites/${id}`, { method: 'DELETE' }, 'Failed to delete test suite');
	},

	async addTestToSuite(suite_id: number, test_id: number): Promise<void> {
		await fetchJson<void>(
			`${API_URL}/api/test-suites/${suite_id}/tests`,
			{
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ test_id })
			},
			'Failed to add test to suite'
		);
	},

	// Suite entries
	async getSuiteEntries(suite_id: number): Promise<SuiteEntry[]> {
		return fetchJson<SuiteEntry[]>(
			`${API_URL}/api/test-suites/${suite_id}/entries`,
			undefined,
			'Failed to fetch suite entries'
		);
	},

	async addSuiteEntry(
		suite_id: number,
		entry: { sequence?: number; test_id?: number; child_suite_id?: number; agent_id_override?: number }
	): Promise<SuiteEntry> {
		return fetchJson<SuiteEntry>(
			`${API_URL}/api/test-suites/${suite_id}/entries`,
			{
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(entry)
			},
			'Failed to add suite entry'
		);
	},

	async updateSuiteEntry(
		suite_id: number,
		entry_id: number,
		updates: { sequence?: number; agent_id_override?: number | null }
	): Promise<void> {
		await fetchJson<void>(
			`${API_URL}/api/test-suites/${suite_id}/entries/${entry_id}`,
			{
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(updates)
			},
			'Failed to update suite entry'
		);
	},

	async deleteSuiteEntry(suite_id: number, entry_id: number): Promise<void> {
		await fetchJson<void>(
			`${API_URL}/api/test-suites/${suite_id}/entries/${entry_id}`,
			{ method: 'DELETE' },
			'Failed to delete suite entry'
		);
	},

	async reorderSuiteEntries(
		suite_id: number,
		entry_orders: { entry_id: number; sequence: number }[]
	): Promise<{ success: boolean }> {
		return fetchJson<{ success: boolean }>(
			`${API_URL}/api/test-suites/${suite_id}/entries/reorder`,
			{
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ entry_orders })
			},
			'Failed to reorder suite entries'
		);
	}
};
