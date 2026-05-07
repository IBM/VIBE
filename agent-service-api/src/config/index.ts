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
