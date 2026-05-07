import type {
	Agent,
	AgentLinkedResponseMap,
	AgentLinkedTemplate,
	AgentRequestTemplate,
	AgentResponseMap,
	RequestTemplate,
	ResponseMap
} from './types';
import { API_URL, fetchJson } from './fetchJson';

export const agentsApi = {
	// Agent communication configs: Request Templates
	async getAgentRequestTemplates(agentId: number): Promise<AgentRequestTemplate[]> {
		return fetchJson<AgentRequestTemplate[]>(
			`${API_URL}/api/agents/${agentId}/request-templates`,
			undefined,
			'Failed to fetch request templates'
		);
	},

	async createAgentRequestTemplate(
		agentId: number,
		payload: {
			name: string;
			description?: string;
			engine?: string;
			content_type?: string;
			body: string;
			tags?: string;
			capabilities?: string;
			is_default?: boolean;
		}
	): Promise<AgentRequestTemplate> {
		return fetchJson<AgentRequestTemplate>(
			`${API_URL}/api/agents/${agentId}/request-templates`,
			{
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(payload)
			},
			'Failed to create request template'
		);
	},

	async updateAgentRequestTemplate(
		agentId: number,
		templateId: number,
		updates: Partial<{
			name: string;
			description?: string;
			engine?: string;
			content_type?: string;
			body: string;
			tags?: string;
			capabilities?: string;
			is_default?: boolean;
		}>
	): Promise<AgentRequestTemplate> {
		return fetchJson<AgentRequestTemplate>(
			`${API_URL}/api/agents/${agentId}/request-templates/${templateId}`,
			{
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(updates)
			},
			'Failed to update request template'
		);
	},

	async deleteAgentRequestTemplate(agentId: number, templateId: number): Promise<void> {
		await fetchJson<void>(
			`${API_URL}/api/agents/${agentId}/request-templates/${templateId}`,
			{ method: 'DELETE' },
			'Failed to delete request template'
		);
	},

	async setDefaultAgentRequestTemplate(agentId: number, templateId: number): Promise<void> {
		await fetchJson<void>(
			`${API_URL}/api/agents/${agentId}/request-templates/${templateId}/default`,
			{ method: 'POST' },
			'Failed to set default request template'
		);
	},

	// Agent communication configs: Response Maps
	async getAgentResponseMaps(agentId: number): Promise<AgentResponseMap[]> {
		return fetchJson<AgentResponseMap[]>(
			`${API_URL}/api/agents/${agentId}/response-maps`,
			undefined,
			'Failed to fetch response maps'
		);
	},

	async createAgentResponseMap(
		agentId: number,
		payload: {
			name: string;
			description?: string;
			spec: string;
			tags?: string;
			capabilities?: string;
			is_default?: boolean;
		}
	): Promise<AgentResponseMap> {
		return fetchJson<AgentResponseMap>(
			`${API_URL}/api/agents/${agentId}/response-maps`,
			{
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(payload)
			},
			'Failed to create response map'
		);
	},

	async updateAgentResponseMap(
		agentId: number,
		mapId: number,
		updates: Partial<{
			name: string;
			description?: string;
			spec: string;
			tags?: string;
			capabilities?: string;
			is_default?: boolean;
		}>
	): Promise<AgentResponseMap> {
		return fetchJson<AgentResponseMap>(
			`${API_URL}/api/agents/${agentId}/response-maps/${mapId}`,
			{
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(updates)
			},
			'Failed to update response map'
		);
	},

	async deleteAgentResponseMap(agentId: number, mapId: number): Promise<void> {
		await fetchJson<void>(
			`${API_URL}/api/agents/${agentId}/response-maps/${mapId}`,
			{ method: 'DELETE' },
			'Failed to delete response map'
		);
	},

	async setDefaultAgentResponseMap(agentId: number, mapId: number): Promise<void> {
		await fetchJson<void>(
			`${API_URL}/api/agents/${agentId}/response-maps/${mapId}/default`,
			{ method: 'POST' },
			'Failed to set default response map'
		);
	},

	// Agent-template linking
	async getAgentLinkedTemplates(agentId: number): Promise<AgentLinkedTemplate[]> {
		return fetchJson<AgentLinkedTemplate[]>(
			`${API_URL}/api/agents/${agentId}/linked-templates`,
			undefined,
			'Failed to fetch linked templates'
		);
	},

	async linkTemplateToAgent(
		agentId: number,
		payload:
			| { template_id?: number; is_default?: boolean }
			| (Omit<RequestTemplate, 'id' | 'created_at'> & { is_default?: boolean })
	): Promise<RequestTemplate> {
		return fetchJson<RequestTemplate>(
			`${API_URL}/api/agents/${agentId}/linked-templates`,
			{
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(payload)
			},
			'Failed to link template'
		);
	},

	async unlinkTemplateFromAgent(agentId: number, templateId: number): Promise<void> {
		await fetchJson<void>(
			`${API_URL}/api/agents/${agentId}/linked-templates/${templateId}`,
			{ method: 'DELETE' },
			'Failed to unlink template'
		);
	},

	async setAgentLinkedTemplateDefault(agentId: number, templateId: number): Promise<void> {
		await fetchJson<void>(
			`${API_URL}/api/agents/${agentId}/linked-templates/${templateId}/default`,
			{ method: 'POST' },
			'Failed to set default template'
		);
	},

	async getAgentLinkedResponseMaps(agentId: number): Promise<AgentLinkedResponseMap[]> {
		return fetchJson<AgentLinkedResponseMap[]>(
			`${API_URL}/api/agents/${agentId}/linked-response-maps`,
			undefined,
			'Failed to fetch linked response maps'
		);
	},

	async linkResponseMapToAgent(
		agentId: number,
		payload:
			| { response_map_id?: number; is_default?: boolean }
			| (Omit<ResponseMap, 'id' | 'created_at'> & { is_default?: boolean })
	): Promise<ResponseMap> {
		return fetchJson<ResponseMap>(
			`${API_URL}/api/agents/${agentId}/linked-response-maps`,
			{
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(payload)
			},
			'Failed to link response map'
		);
	},

	async unlinkResponseMapFromAgent(agentId: number, mapId: number): Promise<void> {
		await fetchJson<void>(
			`${API_URL}/api/agents/${agentId}/linked-response-maps/${mapId}`,
			{ method: 'DELETE' },
			'Failed to unlink response map'
		);
	},

	async setAgentLinkedResponseMapDefault(agentId: number, mapId: number): Promise<void> {
		await fetchJson<void>(
			`${API_URL}/api/agents/${agentId}/linked-response-maps/${mapId}/default`,
			{ method: 'POST' },
			'Failed to set default response map'
		);
	},

	// Agents
	async getAgents(): Promise<Agent[]> {
		return fetchJson<Agent[]>(`${API_URL}/api/agents`, undefined, 'Failed to fetch agents');
	},

	async getAgentById(id: number): Promise<Agent> {
		return fetchJson<Agent>(`${API_URL}/api/agents/${id}`, undefined, 'Failed to fetch agent');
	},

	async createAgent(agent: Omit<Agent, 'id' | 'created_at'>): Promise<Agent> {
		return fetchJson<Agent>(
			`${API_URL}/api/agents`,
			{
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(agent)
			},
			'Failed to create agent'
		);
	},

	async updateAgent(id: number, agent: Partial<Agent>): Promise<Agent> {
		return fetchJson<Agent>(
			`${API_URL}/api/agents/${id}`,
			{
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(agent)
			},
			'Failed to update agent'
		);
	},

	async deleteAgent(id: number): Promise<void> {
		await fetchJson<void>(`${API_URL}/api/agents/${id}`, { method: 'DELETE' }, 'Failed to delete agent');
	}
};
