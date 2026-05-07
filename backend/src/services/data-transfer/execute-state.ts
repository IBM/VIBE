import type { ImportRequest } from '@ibm-vibe/types';
import { getAgents } from '../../db/repositories/agentRepo';
import { getConversations } from '../../db/repositories/conversationRepo';
import { getLLMConfigs } from '../../db/repositories/configRepo';
import { getTestSuites } from '../../db/repositories/suiteRepo';
import { listRequestTemplates, listResponseMaps } from '../../db/repositories/templateRepo';
import { buildAgentNaturalKey } from './identity';
import { addToNameLookup, countByName, type NameToIds } from './execute-helpers';

type ExistingTemplate = ReturnType<typeof listRequestTemplates>[number];
type ExistingResponseMap = ReturnType<typeof listResponseMaps>[number];
type ExistingLlmConfig = ReturnType<typeof getLLMConfigs>[number];
type ExistingAgent = ReturnType<typeof getAgents>[number];
type ExistingConversation = ReturnType<typeof getConversations>[number];
type ExistingSuite = ReturnType<typeof getTestSuites>[number];

export type PendingSuiteEntry = {
	suiteId: number;
	entries: NonNullable<ImportRequest['bundle']['data']['test_suites']>[number]['entries'];
};

export type ExistingState = {
	existingTemplatesByName: Map<string, ExistingTemplate>;
	existingResponseMapsByName: Map<string, ExistingResponseMap>;
	existingLlmConfigsByName: Map<string, ExistingLlmConfig[]>;
	existingAgentsByNaturalKey: Map<string, ExistingAgent>;
	existingConversationsByName: Map<string, ExistingConversation[]>;
	existingSuitesByName: Map<string, ExistingSuite[]>;
};

export type ImportExecutionState = {
	requestTemplateNameCounts: Map<string, number>;
	responseMapNameCounts: Map<string, number>;
	conversationNameCounts: Map<string, number>;
	suiteNameCounts: Map<string, number>;
	llmConfigNameCounts: Map<string, number>;
	requestTemplateIdByName: Map<string, number>;
	responseMapIdByName: Map<string, number>;
	llmConfigIdsByName: NameToIds;
	agentIdByNaturalKey: Map<string, number>;
	agentIdsByName: NameToIds;
	conversationIdByReferenceKey: Map<string, number>;
	conversationIdsByName: NameToIds;
	suiteIdByReferenceKey: Map<string, number>;
	suiteIdsByName: NameToIds;
	pendingSuiteEntries: PendingSuiteEntry[];
};

export const createImportExecutionState = (request: ImportRequest): ImportExecutionState => ({
	requestTemplateNameCounts: countByName(
		(request.bundle.data.request_templates || []).map((template) => template.name)
	),
	responseMapNameCounts: countByName(
		(request.bundle.data.response_maps || []).map((responseMap) => responseMap.name)
	),
	conversationNameCounts: countByName(
		(request.bundle.data.conversations || []).map((conversation) => conversation.name)
	),
	suiteNameCounts: countByName((request.bundle.data.test_suites || []).map((suite) => suite.name)),
	llmConfigNameCounts: countByName((request.bundle.data.llm_configs || []).map((config) => config.name)),
	requestTemplateIdByName: new Map<string, number>(),
	responseMapIdByName: new Map<string, number>(),
	llmConfigIdsByName: new Map<string, number[]>(),
	agentIdByNaturalKey: new Map<string, number>(),
	agentIdsByName: new Map<string, number[]>(),
	conversationIdByReferenceKey: new Map<string, number>(),
	conversationIdsByName: new Map<string, number[]>(),
	suiteIdByReferenceKey: new Map<string, number>(),
	suiteIdsByName: new Map<string, number[]>(),
	pendingSuiteEntries: []
});

export const loadExistingState = (): ExistingState => {
	const existingTemplatesByName = new Map(listRequestTemplates().map((template) => [template.name, template]));
	const existingResponseMapsByName = new Map(
		listResponseMaps().map((responseMap) => [responseMap.name, responseMap])
	);
	const existingLlmConfigsByName = getLLMConfigs().reduce<Map<string, ExistingLlmConfig[]>>((acc, config) => {
		const items = acc.get(config.name) || [];
		items.push(config);
		acc.set(config.name, items);
		return acc;
	}, new Map());
	const existingAgentsByNaturalKey = new Map(
		getAgents().map((agent) => [buildAgentNaturalKey(agent.name, agent.version), agent])
	);
	const existingConversationsByName = getConversations().reduce<Map<string, ExistingConversation[]>>(
		(acc, conversation) => {
			const items = acc.get(conversation.name) || [];
			items.push(conversation);
			acc.set(conversation.name, items);
			return acc;
		},
		new Map()
	);
	const existingSuitesByName = getTestSuites().reduce<Map<string, ExistingSuite[]>>((acc, suite) => {
		const items = acc.get(suite.name) || [];
		items.push(suite);
		acc.set(suite.name, items);
		return acc;
	}, new Map());

	return {
		existingTemplatesByName,
		existingResponseMapsByName,
		existingLlmConfigsByName,
		existingAgentsByNaturalKey,
		existingConversationsByName,
		existingSuitesByName
	};
};

export const seedImportExecutionLookups = (state: ImportExecutionState, existing: ExistingState): void => {
	for (const [name, template] of existing.existingTemplatesByName.entries()) {
		if (template.id) state.requestTemplateIdByName.set(name, template.id);
	}
	for (const [name, responseMap] of existing.existingResponseMapsByName.entries()) {
		if (responseMap.id) state.responseMapIdByName.set(name, responseMap.id);
	}
	for (const [name, configs] of existing.existingLlmConfigsByName.entries()) {
		for (const config of configs) {
			addToNameLookup(state.llmConfigIdsByName, name, config.id);
		}
	}
	for (const [naturalKey, agent] of existing.existingAgentsByNaturalKey.entries()) {
		if (agent.id) {
			state.agentIdByNaturalKey.set(naturalKey, agent.id);
			addToNameLookup(state.agentIdsByName, agent.name, agent.id);
		}
	}
	for (const [name, conversations] of existing.existingConversationsByName.entries()) {
		for (const conversation of conversations) {
			addToNameLookup(state.conversationIdsByName, name, conversation.id);
		}
	}
	for (const [name, suites] of existing.existingSuitesByName.entries()) {
		for (const suite of suites) {
			addToNameLookup(state.suiteIdsByName, name, suite.id);
		}
	}
};
