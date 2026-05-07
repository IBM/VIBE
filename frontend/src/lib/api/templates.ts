import type { RequestTemplate, ResponseMap } from './types';
import { API_URL, fetchJson } from './fetchJson';

const fetchCapabilityNames = async (url: string): Promise<string[]> => {
	try {
		const data = await fetchJson<unknown>(url, undefined, 'Failed to fetch capability names');
		if (!Array.isArray(data)) {
			return [];
		}
		return data.filter((value): value is string => typeof value === 'string');
	} catch {
		return [];
	}
};

export const templatesApi = {
	// Capability names - for auto-complete in dropdowns
	async getRequestTemplateCapabilityNames(): Promise<string[]> {
		return fetchCapabilityNames(`${API_URL}/api/templates/capability-names`);
	},

	async getResponseMapCapabilityNames(): Promise<string[]> {
		return fetchCapabilityNames(`${API_URL}/api/response-maps/capability-names`);
	},

	// Global request templates
	async getTemplates(capability?: string): Promise<RequestTemplate[]> {
		const params = new URLSearchParams();
		if (capability) params.append('capability', capability);
		return fetchJson<RequestTemplate[]>(
			`${API_URL}/api/templates?${params}`,
			undefined,
			'Failed to fetch templates'
		);
	},

	async getTemplateById(id: number): Promise<RequestTemplate> {
		return fetchJson<RequestTemplate>(`${API_URL}/api/templates/${id}`, undefined, 'Failed to fetch template');
	},

	async createTemplate(template: Omit<RequestTemplate, 'id' | 'created_at'>): Promise<RequestTemplate> {
		return fetchJson<RequestTemplate>(
			`${API_URL}/api/templates`,
			{
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(template)
			},
			'Failed to create template'
		);
	},

	async updateTemplate(
		id: number,
		updates: Partial<Omit<RequestTemplate, 'id' | 'created_at'>>
	): Promise<RequestTemplate> {
		return fetchJson<RequestTemplate>(
			`${API_URL}/api/templates/${id}`,
			{
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(updates)
			},
			'Failed to update template'
		);
	},

	async deleteTemplate(id: number): Promise<void> {
		await fetchJson<void>(`${API_URL}/api/templates/${id}`, { method: 'DELETE' }, 'Failed to delete template');
	},

	// Global response maps
	async getResponseMaps(capability?: string): Promise<ResponseMap[]> {
		const params = new URLSearchParams();
		if (capability) params.append('capability', capability);
		return fetchJson<ResponseMap[]>(
			`${API_URL}/api/response-maps?${params}`,
			undefined,
			'Failed to fetch response maps'
		);
	},

	async getResponseMapById(id: number): Promise<ResponseMap> {
		return fetchJson<ResponseMap>(`${API_URL}/api/response-maps/${id}`, undefined, 'Failed to fetch response map');
	},

	async createResponseMap(map: Omit<ResponseMap, 'id' | 'created_at'>): Promise<ResponseMap> {
		return fetchJson<ResponseMap>(
			`${API_URL}/api/response-maps`,
			{
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(map)
			},
			'Failed to create response map'
		);
	},

	async updateResponseMap(
		id: number,
		updates: Partial<Omit<ResponseMap, 'id' | 'created_at'>>
	): Promise<ResponseMap> {
		return fetchJson<ResponseMap>(
			`${API_URL}/api/response-maps/${id}`,
			{
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(updates)
			},
			'Failed to update response map'
		);
	},

	async deleteResponseMap(id: number): Promise<void> {
		await fetchJson<void>(
			`${API_URL}/api/response-maps/${id}`,
			{ method: 'DELETE' },
			'Failed to delete response map'
		);
	}
};
