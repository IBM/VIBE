// Types for different agent configurations

// Base agent settings interface
export interface BaseAgentSettings {
	type: string;
}

// CrewAI Agent settings
export interface CrewAISettings extends BaseAgentSettings {
	type: 'crewai';
	model: string;
	temperature: number;
	max_tokens: number;
	base_url: string;
	role: string;
	goal: string;
	backstory: string;
	allow_delegation: boolean;
	allow_code_execution: boolean;
	memory: boolean;
	verbose: boolean;
	tools: string[];
}

// External API Agent settings
export interface ExternalAPISettings extends BaseAgentSettings {
	type: 'external_api';
	api_endpoint: string;
	api_key?: string;
	request_template?: string;
	response_mapping?: string;
	headers?: Record<string, string>;
	http_method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
}

// Type guard functions
export function isCrewAISettings(settings: BaseAgentSettings): settings is CrewAISettings {
	return settings.type === 'crewai';
}

export function isExternalAPISettings(settings: BaseAgentSettings): settings is ExternalAPISettings {
	return settings.type === 'external_api';
}
