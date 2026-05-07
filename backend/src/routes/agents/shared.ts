import type { AgentRequestTemplate, AgentResponseMap } from '@ibm-vibe/types';
import * as templateRepo from '../../db/repositories/templateRepo';
import { serializeCapabilities } from '../../lib/communicationCapabilities';

export const getCapabilityUpdate = (payload: Record<string, unknown>): string | null | undefined => {
	if (Object.prototype.hasOwnProperty.call(payload, 'capabilities')) {
		return serializeCapabilities(payload.capabilities);
	}
	if (Object.prototype.hasOwnProperty.call(payload, 'capability')) {
		return serializeCapabilities(payload.capability);
	}
	return undefined;
};

export const toLegacyRequestTemplate = (
	agentId: number,
	template: templateRepo.RequestTemplate & { is_default?: number | boolean },
	isDefaultOverride?: number | boolean
): AgentRequestTemplate =>
	({
		id: template.id,
		agent_id: agentId,
		name: template.name,
		description: template.description ?? null,
		engine: null,
		content_type: null,
		body: template.body,
		tags: null,
		is_default: isDefaultOverride ?? template.is_default ?? 0,
		capabilities: template.capability ?? null,
		created_at: template.created_at
	}) as unknown as AgentRequestTemplate;

export const toLegacyResponseMap = (
	agentId: number,
	map: templateRepo.ResponseMap & { is_default?: number | boolean },
	isDefaultOverride?: number | boolean
): AgentResponseMap =>
	({
		id: map.id,
		agent_id: agentId,
		name: map.name,
		description: map.description ?? null,
		spec: map.spec,
		tags: null,
		is_default: isDefaultOverride ?? map.is_default ?? 0,
		capabilities: map.capability ?? null,
		created_at: map.created_at
	}) as unknown as AgentResponseMap;
