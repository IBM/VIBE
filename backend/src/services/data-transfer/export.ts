import crypto from 'crypto';
import type {
	ExportBundle,
	ExportBundleData,
	ExportedAgent,
	ExportedConversation,
	ExportedConversationMessage,
	ExportedSuiteEntry,
	ExportedTestSuite,
	Conversation,
	ConversationMessage
} from '@ibm-vibe/types';
import { ExportableDataType } from '@ibm-vibe/types';
import { getAgents, getAgentById } from '../../db/repositories/agentRepo';
import {
	getConversations,
	getConversationById,
	getConversationMessages
} from '../../db/repositories/conversationRepo';
import { listByConversationId } from '../../db/repositories/conversationTurnTargetsRepo';
import { getLLMConfigs } from '../../db/repositories/configRepo';
import { getEntriesInSuite, getTestSuiteById, getTestSuites } from '../../db/repositories/suiteRepo';
import {
	getAgentResponseMaps,
	getAgentTemplates,
	getRequestTemplateById,
	getResponseMapById,
	listRequestTemplates,
	listResponseMaps
} from '../../db/repositories/templateRepo';
import { buildConversationReferenceKey, buildSuiteReferenceKey } from './identity';

const EXPORT_BUNDLE_VERSION = 1;

const toBoolean = (value: unknown): boolean => {
	if (typeof value === 'boolean') return value;
	if (typeof value === 'number') return value === 1;
	if (typeof value === 'string') return value === '1' || value.toLowerCase() === 'true';
	return false;
};

const exportAgents = (): ExportedAgent[] => {
	return getAgents().map((agent) => {
		const linkedTemplates = agent.id
			? getAgentTemplates(agent.id).map((template) => ({
				template_name: template.name,
				is_default: toBoolean(template.is_default)
			}))
			: [];
		const linkedResponseMaps = agent.id
			? getAgentResponseMaps(agent.id).map((responseMap) => ({
				response_map_name: responseMap.name,
				is_default: toBoolean(responseMap.is_default)
			}))
			: [];

		return {
			name: agent.name,
			version: agent.version,
			prompt: agent.prompt,
			settings: agent.settings,
			linked_templates: linkedTemplates,
			linked_response_maps: linkedResponseMaps
		};
	});
};

const exportConversationMessage = (message: ConversationMessage): ExportedConversationMessage => {
	const requestTemplateName = message.request_template_id
		? getRequestTemplateById(message.request_template_id)?.name
		: undefined;
	const responseMapName = message.response_map_id
		? getResponseMapById(message.response_map_id)?.name
		: undefined;

	return {
		sequence: message.sequence,
		role: message.role,
		content: message.content,
		...(message.metadata ? { metadata: message.metadata } : {}),
		...(requestTemplateName ? { request_template_name: requestTemplateName } : {}),
		...(responseMapName ? { response_map_name: responseMapName } : {}),
		...(message.set_variables ? { set_variables: message.set_variables } : {})
	};
};

const buildExportedConversation = (
	conversation: Conversation & { message_count?: number }
): ExportedConversation => {
	const messages = conversation.id ? getConversationMessages(conversation.id).map(exportConversationMessage) : [];
	const turnTargets = conversation.id
		? listByConversationId(conversation.id).map((target) => ({
			user_sequence: target.user_sequence,
			target_reply: target.target_reply,
			...(target.threshold !== undefined ? { threshold: target.threshold } : {}),
			...(target.weight !== undefined ? { weight: target.weight } : {})
		}))
		: [];

	const exportedConversation: ExportedConversation = {
		name: conversation.name,
		...(conversation.description ? { description: conversation.description } : {}),
		...(conversation.tags ? { tags: conversation.tags } : {}),
		...(conversation.variables ? { variables: conversation.variables } : {}),
		...(conversation.required_request_template_capabilities
			? { required_request_template_capabilities: conversation.required_request_template_capabilities }
			: {}),
		...(conversation.required_response_map_capabilities
			? { required_response_map_capabilities: conversation.required_response_map_capabilities }
			: {}),
		...(conversation.stop_on_failure !== undefined ? { stop_on_failure: toBoolean(conversation.stop_on_failure) } : {}),
		messages,
		turn_targets: turnTargets
	};

	return {
		...exportedConversation,
		reference_key: buildConversationReferenceKey(exportedConversation)
	};
};

const exportConversationById = (conversationId: number): ExportedConversation | undefined => {
	const conversation = getConversationById(conversationId);
	if (!conversation) {
		return undefined;
	}
	return buildExportedConversation(conversation);
};

const exportConversations = (): ExportedConversation[] => (
	getConversations().map((conversation: Conversation & { message_count?: number }) => buildExportedConversation(conversation))
);

const suiteExportCache = new Map<number, ExportedTestSuite>();
const suiteReferenceKeyCache = new Map<number, string>();

const buildCyclicSuiteReferenceKey = (
	suiteId: number,
	suite: Pick<ExportedTestSuite, 'name' | 'description' | 'tags'>
): string => {
	const serializedSuite = JSON.stringify({
		suite_id: suiteId,
		name: suite.name,
		...(suite.description !== undefined ? { description: suite.description } : {}),
		...(suite.tags !== undefined ? { tags: suite.tags } : {})
	});
	const hash = crypto.createHash('sha256').update(serializedSuite).digest('hex').slice(0, 12);
	return `suite_cycle:${hash}`;
};

const getSuiteReferenceKeyForExport = (suiteId: number, suite: ExportedTestSuite): string => {
	const cachedReferenceKey = suiteReferenceKeyCache.get(suiteId);
	if (cachedReferenceKey) {
		return cachedReferenceKey;
	}

	const referenceKey = buildSuiteReferenceKey(suite);
	suiteReferenceKeyCache.set(suiteId, referenceKey);
	return referenceKey;
};

const buildExportedSuite = (
	suiteId: number,
	includeConversationReferences: boolean,
	visiting = new Set<number>()
): ExportedTestSuite | undefined => {
	if (suiteExportCache.has(suiteId)) {
		return suiteExportCache.get(suiteId);
	}

	const suite = getTestSuiteById(suiteId);
	if (!suite) {
		return undefined;
	}

	if (visiting.has(suiteId)) {
		const cyclicSuite: ExportedTestSuite = {
			name: suite.name,
			...(suite.description !== undefined ? { description: suite.description } : {}),
			...(suite.tags !== undefined ? { tags: suite.tags } : {}),
			entries: []
		};
		const cachedReferenceKey = suiteReferenceKeyCache.get(suiteId);
		const referenceKey = cachedReferenceKey || buildCyclicSuiteReferenceKey(suiteId, cyclicSuite);
		suiteReferenceKeyCache.set(suiteId, referenceKey);
		return {
			...cyclicSuite,
			reference_key: referenceKey
		};
	}

	const nextVisiting = new Set(visiting);
	nextVisiting.add(suiteId);

	const exportedSuite: ExportedTestSuite = {
		name: suite.name,
		...(suite.description !== undefined ? { description: suite.description } : {}),
		...(suite.tags !== undefined ? { tags: suite.tags } : {}),
		entries: exportSuiteEntries(suiteId, includeConversationReferences, nextVisiting)
	};

	const suiteWithReference = {
		...exportedSuite,
		reference_key: getSuiteReferenceKeyForExport(suiteId, exportedSuite)
	};
	suiteExportCache.set(suiteId, suiteWithReference);
	return suiteWithReference;
};

const exportSuiteEntries = (
	suiteId: number,
	includeConversationReferences: boolean,
	visiting = new Set<number>()
): ExportedSuiteEntry[] => {
	return getEntriesInSuite(suiteId).map((entry, index) => {
		const exportedEntry: ExportedSuiteEntry = {
			sequence: entry.sequence ?? index + 1
		};

		if (entry.conversation_id) {
			const conversation = exportConversationById(entry.conversation_id);
			if (conversation?.name) {
				exportedEntry.conversation_name = conversation.name;
				if (includeConversationReferences) {
					exportedEntry.conversation_reference_key = conversation.reference_key;
				}
			}
		}

		if (entry.child_suite_id) {
			const childSuite = buildExportedSuite(entry.child_suite_id, includeConversationReferences, visiting);
			if (childSuite?.name) {
				exportedEntry.child_suite_name = childSuite.name;
				exportedEntry.child_suite_reference_key = childSuite.reference_key;
			}
		}

		if (entry.agent_id_override) {
			const overrideAgent = getAgentById(entry.agent_id_override);
			if (overrideAgent?.name) {
				exportedEntry.agent_override_name = overrideAgent.name;
				exportedEntry.agent_override_version = overrideAgent.version;
			}
		}

		return exportedEntry;
	});
};

const exportTestSuites = (includeConversationReferences: boolean): ExportedTestSuite[] => {
	suiteExportCache.clear();
	suiteReferenceKeyCache.clear();
	return getTestSuites()
		.map((suite) => (suite.id ? buildExportedSuite(suite.id, includeConversationReferences) : undefined))
		.filter((suite): suite is ExportedTestSuite => !!suite);
};

const exportBundleDataByType = (types: Set<ExportableDataType>): ExportBundleData => {
	const data: ExportBundleData = {};

	if (types.has(ExportableDataType.AGENTS)) {
		data.agents = exportAgents();
	}

	if (types.has(ExportableDataType.CONVERSATIONS)) {
		data.conversations = exportConversations();
	}

	if (types.has(ExportableDataType.TEST_SUITES)) {
		data.test_suites = exportTestSuites(types.has(ExportableDataType.CONVERSATIONS));
	}

	if (types.has(ExportableDataType.LLM_CONFIGS)) {
		data.llm_configs = getLLMConfigs().map((config) => ({
			name: config.name,
			provider: config.provider,
			config: config.config,
			priority: config.priority
		}));
	}

	if (types.has(ExportableDataType.REQUEST_TEMPLATES)) {
		data.request_templates = listRequestTemplates().map((template) => ({
			name: template.name,
			...(template.description !== undefined ? { description: template.description } : {}),
			...(template.capability !== undefined ? { capability: template.capability } : {}),
			body: template.body
		}));
	}

	if (types.has(ExportableDataType.RESPONSE_MAPS)) {
		data.response_maps = listResponseMaps().map((responseMap) => ({
			name: responseMap.name,
			...(responseMap.description !== undefined ? { description: responseMap.description } : {}),
			...(responseMap.capability !== undefined ? { capability: responseMap.capability } : {}),
			spec: responseMap.spec
		}));
	}

	return data;
};

export const buildExportBundle = (
	selectedTypes: ExportableDataType[],
	instanceName?: string
): ExportBundle => {
	const typeSet = new Set(selectedTypes);

	return {
		version: EXPORT_BUNDLE_VERSION,
		exported_at: new Date().toISOString(),
		instance_name: instanceName,
		data: exportBundleDataByType(typeSet)
	};
};

