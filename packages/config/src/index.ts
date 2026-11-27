import { z } from 'zod';

const booleanFlag = (defaultValue: boolean) =>
	z
		.enum(['true', 'false'])
		.default(defaultValue ? 'true' : 'false')
		.transform((value) => value === 'true');

const outboundEnvSchema = {
	OUTBOUND_ALLOW_LOOPBACK: booleanFlag(true),
	OUTBOUND_ALLOW_PRIVATE_NETWORKS: booleanFlag(false)
};

const backendEnvSchema = z.object({
	PORT: z.coerce.number().default(5100),
	HOST: z.string().default('localhost'),
	AGENT_SERVICE_URL: z.string().default('http://localhost:5002'),
	AGENT_SERVICE_TIMEOUT: z.coerce.number().nonnegative().default(0),
	DB_PATH: z.string().default('./data/agent-testing.db'),
	...outboundEnvSchema
});

const agentServiceApiSchema = z.object({
	PORT: z.coerce.number().default(5003),
	HOST: z.string().default('localhost'),
	BACKEND_URL: z.string().default('http://localhost:5100'),
	BACKEND_TIMEOUT: z.coerce.number().positive().default(30000),
	DEFAULT_TIMEOUT: z.coerce.number().positive().default(60000),
	HEALTH_CHECK_INTERVAL: z.coerce.number().positive().default(60000),
	POLLER_BASE_INTERVAL_MS: z.coerce.number().positive().default(5000),
	POLLER_MAX_INTERVAL_MS: z.coerce.number().positive().default(60000),
	POLLER_BACKOFF_MULTIPLIER: z.coerce.number().positive().default(1.5),
	POLLER_MAX_CONCURRENT_JOBS: z.coerce.number().int().positive().default(3),
	...outboundEnvSchema
});

const frontendEnvSchema = z.object({
	NEXT_PUBLIC_API_URL: z.string().default('http://localhost:5100'),
	NEXT_PUBLIC_INSTANCE_NAME: z.string().optional()
});

type EnvSource = Record<string, string | undefined>;

export const loadBackendConfig = (
	env: EnvSource = process.env
): {
	server: { port: number; host: string };
	agentService: { url: string; timeout: number };
	database: { path: string };
	outbound: { allowLoopback: boolean; allowPrivateNetworks: boolean };
} => {
	const parsed = backendEnvSchema.parse(env);
	return {
		server: {
			port: parsed.PORT,
			host: parsed.HOST
		},
		agentService: {
			url: parsed.AGENT_SERVICE_URL,
			timeout: parsed.AGENT_SERVICE_TIMEOUT
		},
		database: {
			path: parsed.DB_PATH
		},
		outbound: {
			allowLoopback: parsed.OUTBOUND_ALLOW_LOOPBACK,
			allowPrivateNetworks: parsed.OUTBOUND_ALLOW_PRIVATE_NETWORKS
		}
	};
};

export const loadAgentServiceApiConfig = (
	env: EnvSource = process.env
): {
	server: { port: number; host: string };
	backend: { url: string; timeout: number };
	defaults: { requestTimeout: number; healthCheckInterval: number };
	poller: {
		baseIntervalMs: number;
		maxIntervalMs: number;
		backoffMultiplier: number;
		maxConcurrentJobs: number;
	};
	outbound: { allowLoopback: boolean; allowPrivateNetworks: boolean };
} => {
	const parsed = agentServiceApiSchema.parse(env);
	return {
		server: {
			port: parsed.PORT,
			host: parsed.HOST
		},
		backend: {
			url: parsed.BACKEND_URL,
			timeout: parsed.BACKEND_TIMEOUT
		},
		defaults: {
			requestTimeout: parsed.DEFAULT_TIMEOUT,
			healthCheckInterval: parsed.HEALTH_CHECK_INTERVAL
		},
		poller: {
			baseIntervalMs: parsed.POLLER_BASE_INTERVAL_MS,
			maxIntervalMs: parsed.POLLER_MAX_INTERVAL_MS,
			backoffMultiplier: parsed.POLLER_BACKOFF_MULTIPLIER,
			maxConcurrentJobs: parsed.POLLER_MAX_CONCURRENT_JOBS
		},
		outbound: {
			allowLoopback: parsed.OUTBOUND_ALLOW_LOOPBACK,
			allowPrivateNetworks: parsed.OUTBOUND_ALLOW_PRIVATE_NETWORKS
		}
	};
};

export const loadFrontendConfig = (
	env: EnvSource = process.env
): {
	apiUrl: string;
	instanceName: string | null;
} => {
	const parsed = frontendEnvSchema.parse(env);
	return {
		apiUrl: parsed.NEXT_PUBLIC_API_URL,
		instanceName: parsed.NEXT_PUBLIC_INSTANCE_NAME ?? null
	};
};

export type BackendConfig = ReturnType<typeof loadBackendConfig>;
export type AgentServiceApiConfig = ReturnType<typeof loadAgentServiceApiConfig>;
export type FrontendRuntimeConfig = ReturnType<typeof loadFrontendConfig>;

export { matchCapabilities, parseCapabilityInput, extractCapabilityName } from './capabilityMatcher';
