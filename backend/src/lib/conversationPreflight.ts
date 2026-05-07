import type { Conversation, ConversationMessage } from '@ibm-vibe/types';
import { matchCapabilities, parseCapabilityInput } from '@ibm-vibe/config';

type TemplateRow = { id: number; is_default?: number | boolean; capabilities?: string | null };
type MapRow = { id: number; is_default?: number | boolean; capabilities?: string | null };

export interface ConversationPreflightResult {
	ok: boolean;
	errors: string[];
}

const toBool = (value: unknown) => Number(value) === 1 || value === true;

const pickDefault = <T extends { is_default?: number | boolean }>(items: T[]): T | undefined => {
	const explicit = items.find((item) => toBool(item.is_default));
	return explicit ?? items[0];
};

export const preflightConversationExecution = (input: {
	agent_job_type: string;
	conversation: Conversation;
	messages: ConversationMessage[];
	agent_templates: TemplateRow[];
	agent_response_maps: MapRow[];
}): ConversationPreflightResult => {
	const { agent_job_type, conversation, messages, agent_templates, agent_response_maps } = input;

	const errors: string[] = [];

	const requiresTemplateCaps = !!parseCapabilityInput(conversation.required_request_template_capabilities);
	const requiresMapCaps = !!parseCapabilityInput(conversation.required_response_map_capabilities);
	const requiresExternal = requiresTemplateCaps || requiresMapCaps;

	if (requiresExternal && agent_job_type !== 'external_api') {
		errors.push(
			'Conversation defines external API capability requirements but the selected agent is not an external API agent.'
		);
		return { ok: false, errors };
	}

	// Only validate template/map presence/IDs if agent is external_api (conversation execution uses them)
	if (agent_job_type === 'external_api') {
		const userMessages = messages.filter((m) => m.role === 'user');
		if (userMessages.length > 0) {
			if (!agent_templates.length) {
				errors.push('Agent has no request templates. Add at least one request template before executing.');
			}
			if (!agent_response_maps.length) {
				errors.push('Agent has no response maps. Add at least one response map before executing.');
			}
		}

		const agentDefaultTemplate = pickDefault(agent_templates);
		const agentDefaultMap = pickDefault(agent_response_maps);

		const findTemplate = (id?: number | null) => agent_templates.find((t) => t.id === id);
		const findMap = (id?: number | null) => agent_response_maps.find((m) => m.id === id);

		if (conversation.default_request_template_id && !findTemplate(conversation.default_request_template_id)) {
			errors.push(
				`Conversation default request template id ${conversation.default_request_template_id} is not available for this agent.`
			);
		}
		if (conversation.default_response_map_id && !findMap(conversation.default_response_map_id)) {
			errors.push(
				`Conversation default response map id ${conversation.default_response_map_id} is not available for this agent.`
			);
		}

		for (const message of userMessages) {
			if (message.request_template_id && !findTemplate(message.request_template_id)) {
				errors.push(
					`Message ${message.sequence} references request template id ${message.request_template_id} which is not available for this agent.`
				);
			}
			if (message.response_map_id && !findMap(message.response_map_id)) {
				errors.push(
					`Message ${message.sequence} references response map id ${message.response_map_id} which is not available for this agent.`
				);
			}
		}

		// Capability matching per effective selection
		const requestReq = parseCapabilityInput(conversation.required_request_template_capabilities);
		const responseReq = parseCapabilityInput(conversation.required_response_map_capabilities);

		if ((requestReq || responseReq) && (agent_templates.length === 0 || agent_response_maps.length === 0)) {
			// Already recorded above; keep output consistent
		} else {
			for (const message of userMessages) {
				const effectiveTemplate =
					(message.request_template_id ? findTemplate(message.request_template_id) : undefined) ??
					(conversation.default_request_template_id
						? findTemplate(conversation.default_request_template_id)
						: undefined) ??
					agentDefaultTemplate;

				const effectiveMap =
					(message.response_map_id ? findMap(message.response_map_id) : undefined) ??
					(conversation.default_response_map_id
						? findMap(conversation.default_response_map_id)
						: undefined) ??
					agentDefaultMap;

				if (requestReq) {
					const available = parseCapabilityInput(effectiveTemplate?.capabilities);
					const match = matchCapabilities(requestReq, available);
					if (!match.ok) {
						errors.push(
							`Message ${message.sequence} request template does not satisfy requirements: ${match.reasons.join('; ')}`
						);
					}
				}

				if (responseReq) {
					const available = parseCapabilityInput(effectiveMap?.capabilities);
					const match = matchCapabilities(responseReq, available);
					if (!match.ok) {
						errors.push(
							`Message ${message.sequence} response map does not satisfy requirements: ${match.reasons.join('; ')}`
						);
					}
				}
			}
		}
	}

	return { ok: errors.length === 0, errors };
};
