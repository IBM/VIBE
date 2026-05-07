import { loadBackendConfig } from '@ibm-vibe/config';

const backendConfig = loadBackendConfig();

export const agentServiceConfig = backendConfig.agentService;
export const serverConfig = backendConfig.server;
export const dbConfig = backendConfig.database;

// Default pagination settings for large resources
export const paginationConfig = {
	// Default maximum number of rows to return when the client does not specify limit/offset
	// Applies to potentially large tables such as results, jobs and suite-runs
	defaultLargeLimit: 50
};
