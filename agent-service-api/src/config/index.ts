import dotenv from 'dotenv';
import path from 'path';
import { loadAgentServiceApiConfig } from '@ibm-vibe/config';

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const agentServiceApiConfig = loadAgentServiceApiConfig();

export const SERVER_CONFIG = agentServiceApiConfig.server;
export const BACKEND_CONFIG = agentServiceApiConfig.backend;
export const DEFAULT_TIMEOUT = agentServiceApiConfig.defaults.requestTimeout;
export const HEALTH_CHECK_INTERVAL = agentServiceApiConfig.defaults.healthCheckInterval;
export const POLLER_CONFIG = agentServiceApiConfig.poller;

const backendUrl = new URL(BACKEND_CONFIG.url);
const backendPort = backendUrl.port ? Number(backendUrl.port) : backendUrl.protocol === 'https:' ? 443 : 80;

/**
 * Outbound guard settings. This service's own port and the backend port are always refused
 * as outbound targets, even when loopback is allowed. Otherwise /execute-test could read back
 * the backend's unauthenticated endpoints.
 */
export const OUTBOUND_CONFIG = {
	allowLoopback: agentServiceApiConfig.outbound.allowLoopback,
	allowPrivateNetworks: agentServiceApiConfig.outbound.allowPrivateNetworks,
	denyPorts: [SERVER_CONFIG.port, backendPort]
};
