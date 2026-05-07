import type {
	Conversation,
	ConversationExecutionRequest,
	ConversationMessage,
	ConversationMessageDraft
} from '@ibm-vibe/types';
import { matchCapabilities, parseCapabilityInput } from '@ibm-vibe/config';
import { parseJson } from './job-poller-utils';

export interface RequestTemplate {
	id: number;
	body: string;
	is_default?: number;
	capabilities?: string | Record<string, unknown> | null;
}

export interface ResponseMap {
	id: number;
	spec: string;
	is_default?: number;
	capabilities?: string | Record<string, unknown> | null;
}

export interface AgentConfig {
	templates: RequestTemplate[];
	maps: ResponseMap[];
	defaultTemplate?: RequestTemplate;
	defaultMap?: ResponseMap;
}

export type ConversationScriptMessage = Omit<ConversationMessage, 'metadata'> & {
	metadata?: Record<string, unknown>;
};

const parseCapabilities = (value?: string | Record<string, unknown> | null) => {
	return parseCapabilityInput(value);
};

export const validateConversationRequirements = (
	conversation: Conversation,
	resolvedMessages: ConversationScriptMessage[]
): void => {
	const userMessages = resolvedMessages.filter((message) => message.role === 'user');
	if (!userMessages.length) {
		return;
	}

	const requestRequirement = parseCapabilityInput(conversation.required_request_template_capabilities);
	if (requestRequirement) {
		for (const message of userMessages) {
			const metadata = (message.metadata || {}) as Record<string, unknown>;
			const available = metadata.request_capabilities;
			const matchResult = matchCapabilities(requestRequirement, available as Record<string, unknown> | undefined);
			if (!matchResult.ok) {
				throw new Error(
					`Request template capabilities do not satisfy conversation requirements: ${matchResult.reasons.join('; ')}`
				);
			}
		}
	}

	const responseRequirement = parseCapabilityInput(conversation.required_response_map_capabilities);
	if (responseRequirement) {
		for (const message of userMessages) {
			const metadata = (message.metadata || {}) as Record<string, unknown>;
			const available = metadata.response_capabilities;
			const matchResult = matchCapabilities(
				responseRequirement,
				available as Record<string, unknown> | undefined
			);
			if (!matchResult.ok) {
				throw new Error(
					`Response map capabilities do not satisfy conversation requirements: ${matchResult.reasons.join('; ')}`
				);
			}
		}
	}
};

export const resolveConversationScript = (
	conversation: Conversation & { id: number; messages?: ConversationMessageDraft[] },
	agentConfig: AgentConfig
): ConversationExecutionRequest['conversation_script'] => {
	const { templates, maps, defaultTemplate, defaultMap } = agentConfig;
	const conversationDefaultTemplateId = conversation.default_request_template_id;
	const conversationDefaultMapId = conversation.default_response_map_id;
	const conversationVars = parseJson<Record<string, unknown>>(conversation.variables, {});

	const findTemplateById = (id?: number | null) => templates.find((t) => t.id === id);
	const findMapById = (id?: number | null) => maps.find((m) => m.id === id);

	const resolvedMessages: ConversationScriptMessage[] = (conversation.messages || []).map((m) => {
		const conversation_id = m.conversation_id ?? conversation.id;

		if (m.role !== 'user') {
			const metadata =
				typeof m.metadata === 'string'
					? parseJson<Record<string, unknown>>(m.metadata, {})
					: (m.metadata as Record<string, unknown> | undefined) || {};

			return {
				...m,
				conversation_id,
				metadata
			};
		}

		const msgOverrideTemplateId = m.request_template_id;
		const msgOverrideMapId = m.response_map_id;

		const messageVars =
			typeof m.set_variables === 'string' ? parseJson<Record<string, unknown>>(m.set_variables, {}) : {};

		const templateCandidate =
			(msgOverrideTemplateId ? findTemplateById(msgOverrideTemplateId) : undefined) ??
			(conversationDefaultTemplateId ? findTemplateById(conversationDefaultTemplateId) : undefined) ??
			defaultTemplate;

		const mapCandidate =
			(msgOverrideMapId ? findMapById(msgOverrideMapId) : undefined) ??
			(conversationDefaultMapId ? findMapById(conversationDefaultMapId) : undefined) ??
			defaultMap;

		const effectiveTemplate = templateCandidate?.body;
		const effectiveTemplateCapabilities = templateCandidate
			? parseCapabilities(templateCandidate.capabilities)
			: null;

		const effectiveMap = mapCandidate?.spec;
		const effectiveMapCapabilities = mapCandidate ? parseCapabilities(mapCandidate.capabilities) : null;

		const mergedVars = { ...conversationVars, ...messageVars };
		const metadata =
			typeof m.metadata === 'string'
				? parseJson<Record<string, unknown>>(m.metadata, {})
				: (m.metadata as Record<string, unknown> | undefined) || {};

		const mergedMetadata = {
			...metadata,
			...(effectiveTemplate ? { request_template: effectiveTemplate } : {}),
			...(effectiveMap ? { response_mapping: effectiveMap } : {}),
			...(effectiveTemplateCapabilities ? { request_capabilities: effectiveTemplateCapabilities } : {}),
			...(effectiveMapCapabilities ? { response_capabilities: effectiveMapCapabilities } : {}),
			...(Object.keys(mergedVars).length ? { variables: mergedVars } : {})
		};

		return {
			...m,
			conversation_id,
			metadata: mergedMetadata
		};
	});

	validateConversationRequirements(conversation, resolvedMessages);

	return resolvedMessages as ConversationExecutionRequest['conversation_script'];
};
