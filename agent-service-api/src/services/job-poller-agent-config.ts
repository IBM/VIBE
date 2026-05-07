import axios from 'axios';
import { AgentConfig, RequestTemplate, ResponseMap } from './conversation-script-resolver';

export async function fetchAgentConfig(backendUrl: string, agentId: number): Promise<AgentConfig> {
	const [templatesRes, mapsRes] = await Promise.all([
		axios.get<RequestTemplate[]>(`${backendUrl}/api/agents/${agentId}/request-templates`),
		axios.get<ResponseMap[]>(`${backendUrl}/api/agents/${agentId}/response-maps`)
	]);
	const templates: RequestTemplate[] = templatesRes.data || [];
	const maps: ResponseMap[] = mapsRes.data || [];

	return {
		templates,
		maps,
		defaultTemplate: templates.find((t) => Number(t.is_default) === 1),
		defaultMap: maps.find((m) => Number(m.is_default) === 1)
	};
}
