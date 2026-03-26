import crypto from 'crypto';
import type {
	AnalysisStatus,
	ExportedAgent,
	ExportedConversation,
	ExportedConversationMessage,
	ExportedConversationTurnTarget,
	ExportedLLMConfig,
	ExportedRequestTemplate,
	ExportedResponseMap,
	ExportedSuiteEntry,
	ExportedTestSuite,
	ImportResolutionDecision
} from '@ibm-vibe/types';
import { ExportableDataType } from '@ibm-vibe/types';

const sortObjectKeys = (value: unknown): unknown => {
	if (Array.isArray(value)) {
		return value.map(sortObjectKeys);
	}
	if (value && typeof value === 'object') {
		return Object.keys(value as Record<string, unknown>)
			.sort()
			.reduce<Record<string, unknown>>((acc, key) => {
				acc[key] = sortObjectKeys((value as Record<string, unknown>)[key]);
				return acc;
			}, {});
	}
	return value;
};

const buildHashedReferenceKey = (prefix: string, value: unknown): string => {
	const normalizedJson = JSON.stringify(sortObjectKeys(value));
	const hash = crypto.createHash('sha256').update(normalizedJson).digest('hex').slice(0, 12);
	return `${prefix}:${hash}`;
};

const formatDuplicateEntityName = (name: string, referenceKey: string, isDuplicateName: boolean): string => {
	if (!isDuplicateName) {
		return name;
	}
	return `${name} [${referenceKey.slice(-6)}]`;
};

const normalizeMessages = (
	messages: ExportedConversationMessage[] | undefined
): ExportedConversationMessage[] => [...(messages || [])].sort((a, b) => a.sequence - b.sequence);

const normalizeTurnTargets = (
	turnTargets: ExportedConversationTurnTarget[] | undefined
): ExportedConversationTurnTarget[] => [...(turnTargets || [])].sort((a, b) => a.user_sequence - b.user_sequence);

const normalizeSuiteEntries = (
	entries: ExportedSuiteEntry[] | undefined
): ExportedSuiteEntry[] => [...(entries || [])].sort((a, b) => a.sequence - b.sequence);

const normalizeJsonStringValue = (value: string): unknown => {
	try {
		return sortObjectKeys(JSON.parse(value));
	} catch {
		return value;
	}
};

export const buildItemKey = (entityType: ExportableDataType, entityIdentity: string): string => `${entityType}:${entityIdentity}`;

export const buildAgentNaturalKey = (name: string, version: string): string => `${name}@${version}`;

export const buildAgentItemKey = (agent: Pick<ExportedAgent, 'name' | 'version'>): string => (
	buildItemKey(ExportableDataType.AGENTS, buildAgentNaturalKey(agent.name, agent.version))
);

export const buildConversationReferenceKey = (conversation: ExportedConversation): string => {
	const serializableConversation = {
		name: conversation.name,
		...(conversation.description !== undefined ? { description: conversation.description } : {}),
		...(conversation.tags !== undefined ? { tags: conversation.tags } : {}),
		...(conversation.variables !== undefined ? { variables: conversation.variables } : {}),
		...(conversation.required_request_template_capabilities !== undefined
			? { required_request_template_capabilities: conversation.required_request_template_capabilities }
			: {}),
		...(conversation.required_response_map_capabilities !== undefined
			? { required_response_map_capabilities: conversation.required_response_map_capabilities }
			: {}),
		...(conversation.stop_on_failure !== undefined ? { stop_on_failure: conversation.stop_on_failure } : {}),
		messages: normalizeMessages(conversation.messages),
		turn_targets: normalizeTurnTargets(conversation.turn_targets)
	};

	return buildHashedReferenceKey('conversation', serializableConversation);
};

export const getConversationReferenceKey = (conversation: ExportedConversation): string => buildConversationReferenceKey(conversation);

export const buildConversationItemKey = (conversation: ExportedConversation): string => (
	buildItemKey(ExportableDataType.CONVERSATIONS, getConversationReferenceKey(conversation))
);

export const formatConversationEntityName = (
	conversation: ExportedConversation,
	isDuplicateName: boolean
): string => formatDuplicateEntityName(conversation.name, getConversationReferenceKey(conversation), isDuplicateName);

export const buildSuiteReferenceKey = (suite: ExportedTestSuite): string => {
	const serializableSuite = {
		name: suite.name,
		...(suite.description !== undefined ? { description: suite.description } : {}),
		...(suite.tags !== undefined ? { tags: suite.tags } : {}),
		entries: normalizeSuiteEntries(suite.entries).map((entry) => ({
			sequence: entry.sequence,
			...(entry.conversation_name !== undefined ? { conversation_name: entry.conversation_name } : {}),
			...(entry.conversation_reference_key !== undefined
				? { conversation_reference_key: entry.conversation_reference_key }
				: {}),
			...(entry.child_suite_name !== undefined ? { child_suite_name: entry.child_suite_name } : {}),
			...(entry.child_suite_reference_key !== undefined
				? { child_suite_reference_key: entry.child_suite_reference_key }
				: {}),
			...(entry.agent_override_name !== undefined ? { agent_override_name: entry.agent_override_name } : {}),
			...(entry.agent_override_version !== undefined ? { agent_override_version: entry.agent_override_version } : {})
		}))
	};

	return buildHashedReferenceKey('suite', serializableSuite);
};

export const getSuiteReferenceKey = (suite: ExportedTestSuite): string => buildSuiteReferenceKey(suite);

export const buildSuiteItemKey = (suite: ExportedTestSuite): string => (
	buildItemKey(ExportableDataType.TEST_SUITES, getSuiteReferenceKey(suite))
);

export const formatSuiteEntityName = (
	suite: ExportedTestSuite,
	isDuplicateName: boolean
): string => formatDuplicateEntityName(suite.name, getSuiteReferenceKey(suite), isDuplicateName);

export const buildLLMConfigReferenceKey = (config: ExportedLLMConfig): string => {
	const serializableConfig = {
		name: config.name,
		provider: config.provider,
		config: normalizeJsonStringValue(config.config),
		priority: config.priority
	};

	return buildHashedReferenceKey('llm_config', serializableConfig);
};

export const buildLLMConfigItemKey = (config: ExportedLLMConfig): string => (
	buildItemKey(ExportableDataType.LLM_CONFIGS, buildLLMConfigReferenceKey(config))
);

export const formatLLMConfigEntityName = (
	config: ExportedLLMConfig,
	isDuplicateName: boolean
): string => formatDuplicateEntityName(config.name, buildLLMConfigReferenceKey(config), isDuplicateName);

export const buildRequestTemplateReferenceKey = (template: ExportedRequestTemplate): string => {
	const serializableTemplate = {
		name: template.name,
		...(template.description !== undefined ? { description: template.description } : {}),
		...(template.capability !== undefined ? { capability: template.capability } : {}),
		body: normalizeJsonStringValue(template.body)
	};

	return buildHashedReferenceKey('request_template', serializableTemplate);
};

export const buildRequestTemplateItemKey = (template: ExportedRequestTemplate): string => (
	buildItemKey(ExportableDataType.REQUEST_TEMPLATES, buildRequestTemplateReferenceKey(template))
);

export const formatRequestTemplateEntityName = (
	template: ExportedRequestTemplate,
	isDuplicateName: boolean
): string => formatDuplicateEntityName(template.name, buildRequestTemplateReferenceKey(template), isDuplicateName);

export const buildResponseMapReferenceKey = (responseMap: ExportedResponseMap): string => {
	const serializableResponseMap = {
		name: responseMap.name,
		...(responseMap.description !== undefined ? { description: responseMap.description } : {}),
		...(responseMap.capability !== undefined ? { capability: responseMap.capability } : {}),
		spec: normalizeJsonStringValue(responseMap.spec)
	};

	return buildHashedReferenceKey('response_map', serializableResponseMap);
};

export const buildResponseMapItemKey = (responseMap: ExportedResponseMap): string => (
	buildItemKey(ExportableDataType.RESPONSE_MAPS, buildResponseMapReferenceKey(responseMap))
);

export const formatResponseMapEntityName = (
	responseMap: ExportedResponseMap,
	isDuplicateName: boolean
): string => formatDuplicateEntityName(responseMap.name, buildResponseMapReferenceKey(responseMap), isDuplicateName);

export const getAllowedResolutionDecisions = (
	status: AnalysisStatus
): ImportResolutionDecision[] => {
	if (status === 'new') {
		return ['skip', 'create_new'];
	}
	if (status === 'conflict') {
		return ['skip', 'overwrite', 'create_new'];
	}
	return ['skip'];
};
