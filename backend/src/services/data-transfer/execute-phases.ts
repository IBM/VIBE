import type { Conversation, ImportPlanItem, ImportRequest } from '@ibm-vibe/types';
import { ExportableDataType } from '@ibm-vibe/types';
import { createAgent, updateAgent } from '../../db/repositories/agentRepo';
import {
	addMessageToConversation,
	createConversation,
	deleteConversationMessage,
	getConversationMessages,
	updateConversation
} from '../../db/repositories/conversationRepo';
import {
	create as createTurnTarget,
	deleteById as deleteConversationTurnTarget,
	listByConversationId
} from '../../db/repositories/conversationTurnTargetsRepo';
import { createLLMConfig, updateLLMConfig } from '../../db/repositories/configRepo';
import {
	addSuiteEntry,
	createTestSuite,
	deleteSuiteEntry,
	getEntriesInSuite,
	updateTestSuite
} from '../../db/repositories/suiteRepo';
import {
	createRequestTemplate,
	createResponseMap,
	getAgentResponseMaps,
	getAgentTemplates,
	linkResponseMapToAgent,
	linkTemplateToAgent,
	unlinkResponseMapFromAgent,
	unlinkTemplateFromAgent,
	updateRequestTemplate,
	updateResponseMap
} from '../../db/repositories/templateRepo';
import {
	buildAgentItemKey,
	buildAgentNaturalKey,
	buildConversationItemKey,
	buildLLMConfigItemKey,
	buildRequestTemplateItemKey,
	buildResponseMapItemKey,
	buildSuiteItemKey,
	formatConversationEntityName,
	formatLLMConfigEntityName,
	formatRequestTemplateEntityName,
	formatResponseMapEntityName,
	formatSuiteEntityName,
	getConversationReferenceKey,
	getSuiteReferenceKey
} from './identity';
import {
	addToNameLookup,
	getRequiredLookupId,
	getUniqueId,
	ImportValidationError,
	pushSummaryItem,
	type MutableSummary
} from './execute-helpers';
import type { ExistingState, ImportExecutionState } from './execute-state';

type ImportExecutionContext = {
	request: ImportRequest;
	summary: MutableSummary;
	planByItemKey: Map<string, ImportPlanItem>;
	state: ImportExecutionState;
	existing: ExistingState;
};

const getPlanItem = (planByItemKey: Map<string, ImportPlanItem>, itemKey: string): ImportPlanItem => {
	const planItem = planByItemKey.get(itemKey);
	if (!planItem) {
		throw new ImportValidationError(`Missing import plan item: ${itemKey}`);
	}
	return planItem;
};

export const importRequestTemplates = ({
	request,
	summary,
	planByItemKey,
	state,
	existing
}: ImportExecutionContext): void => {
	for (const template of request.bundle.data.request_templates || []) {
		const itemKey = buildRequestTemplateItemKey(template);
		const planItem = getPlanItem(planByItemKey, itemKey);
		const entityName = formatRequestTemplateEntityName(
			template,
			(state.requestTemplateNameCounts.get(template.name) || 0) > 1
		);
		if (planItem.selected_decision === 'skip') {
			pushSummaryItem(summary, itemKey, ExportableDataType.REQUEST_TEMPLATES, entityName, 'skipped');
			continue;
		}

		const existingTemplate = existing.existingTemplatesByName.get(template.name);
		const finalName = planItem.final_name || template.name;
		if (planItem.selected_decision === 'overwrite' && existingTemplate?.id) {
			updateRequestTemplate(existingTemplate.id, {
				name: finalName,
				description: template.description,
				capability: template.capability,
				body: template.body
			});
			state.requestTemplateIdByName.set(template.name, existingTemplate.id);
			state.requestTemplateIdByName.set(finalName, existingTemplate.id);
			pushSummaryItem(summary, itemKey, ExportableDataType.REQUEST_TEMPLATES, finalName, 'updated');
			continue;
		}

		const created = createRequestTemplate({
			name: finalName,
			description: template.description,
			capability: template.capability,
			body: template.body
		});
		if (created.id) {
			state.requestTemplateIdByName.set(finalName, created.id);
			state.requestTemplateIdByName.set(template.name, created.id);
		}
		pushSummaryItem(summary, itemKey, ExportableDataType.REQUEST_TEMPLATES, finalName, 'created');
	}
};

export const importResponseMaps = ({
	request,
	summary,
	planByItemKey,
	state,
	existing
}: ImportExecutionContext): void => {
	for (const responseMap of request.bundle.data.response_maps || []) {
		const itemKey = buildResponseMapItemKey(responseMap);
		const planItem = getPlanItem(planByItemKey, itemKey);
		const entityName = formatResponseMapEntityName(
			responseMap,
			(state.responseMapNameCounts.get(responseMap.name) || 0) > 1
		);
		if (planItem.selected_decision === 'skip') {
			pushSummaryItem(summary, itemKey, ExportableDataType.RESPONSE_MAPS, entityName, 'skipped');
			continue;
		}

		const existingResponseMap = existing.existingResponseMapsByName.get(responseMap.name);
		const finalName = planItem.final_name || responseMap.name;
		if (planItem.selected_decision === 'overwrite' && existingResponseMap?.id) {
			updateResponseMap(existingResponseMap.id, {
				name: finalName,
				description: responseMap.description,
				capability: responseMap.capability,
				spec: responseMap.spec
			});
			state.responseMapIdByName.set(responseMap.name, existingResponseMap.id);
			state.responseMapIdByName.set(finalName, existingResponseMap.id);
			pushSummaryItem(summary, itemKey, ExportableDataType.RESPONSE_MAPS, finalName, 'updated');
			continue;
		}

		const created = createResponseMap({
			name: finalName,
			description: responseMap.description,
			capability: responseMap.capability,
			spec: responseMap.spec
		});
		if (created.id) {
			state.responseMapIdByName.set(finalName, created.id);
			state.responseMapIdByName.set(responseMap.name, created.id);
		}
		pushSummaryItem(summary, itemKey, ExportableDataType.RESPONSE_MAPS, finalName, 'created');
	}
};

export const importLlmConfigs = ({
	request,
	summary,
	planByItemKey,
	state,
	existing
}: ImportExecutionContext): void => {
	for (const llmConfig of request.bundle.data.llm_configs || []) {
		const itemKey = buildLLMConfigItemKey(llmConfig);
		const planItem = getPlanItem(planByItemKey, itemKey);
		const entityName = formatLLMConfigEntityName(
			llmConfig,
			(state.llmConfigNameCounts.get(llmConfig.name) || 0) > 1
		);
		if (planItem.selected_decision === 'skip') {
			pushSummaryItem(summary, itemKey, ExportableDataType.LLM_CONFIGS, entityName, 'skipped');
			continue;
		}

		const existingMatches = existing.existingLlmConfigsByName.get(llmConfig.name) || [];
		const existingConfig = existingMatches.length === 1 ? existingMatches[0] : undefined;
		const finalName = planItem.final_name || llmConfig.name;
		if (planItem.selected_decision === 'overwrite' && existingConfig?.id) {
			updateLLMConfig(existingConfig.id, {
				name: finalName,
				provider: llmConfig.provider,
				config: llmConfig.config,
				priority: llmConfig.priority
			});
			addToNameLookup(state.llmConfigIdsByName, llmConfig.name, existingConfig.id);
			addToNameLookup(state.llmConfigIdsByName, finalName, existingConfig.id);
			pushSummaryItem(summary, itemKey, ExportableDataType.LLM_CONFIGS, finalName, 'updated');
			continue;
		}

		if (planItem.selected_decision === 'overwrite') {
			throw new ImportValidationError(
				existingMatches.length === 0
					? `Cannot overwrite missing LLM config: ${llmConfig.name}`
					: `Cannot overwrite ambiguous LLM config: ${llmConfig.name}`
			);
		}

		const created = createLLMConfig({
			name: finalName,
			provider: llmConfig.provider,
			config: llmConfig.config,
			priority: llmConfig.priority
		});
		if (created.id) {
			addToNameLookup(state.llmConfigIdsByName, finalName, created.id);
			addToNameLookup(state.llmConfigIdsByName, llmConfig.name, created.id);
		}
		pushSummaryItem(summary, itemKey, ExportableDataType.LLM_CONFIGS, finalName, 'created');
	}
};

export const importAgents = ({ request, summary, planByItemKey, state, existing }: ImportExecutionContext): void => {
	for (const agent of request.bundle.data.agents || []) {
		const originalNaturalKey = buildAgentNaturalKey(agent.name, agent.version);
		const itemKey = buildAgentItemKey(agent);
		const planItem = getPlanItem(planByItemKey, itemKey);
		if (planItem.selected_decision === 'skip') {
			pushSummaryItem(summary, itemKey, ExportableDataType.AGENTS, originalNaturalKey, 'skipped');
			continue;
		}

		const existingAgent = existing.existingAgentsByNaturalKey.get(originalNaturalKey);
		const finalVersion = planItem.final_version || agent.version;
		const finalName = planItem.final_name || agent.name;
		const finalNaturalKey = buildAgentNaturalKey(finalName, finalVersion);

		let targetAgentId: number | undefined;
		if (planItem.selected_decision === 'overwrite') {
			if (!existingAgent?.id) {
				throw new ImportValidationError(`Cannot overwrite missing agent: ${originalNaturalKey}`);
			}
			for (const template of getAgentTemplates(existingAgent.id)) {
				if (template.id !== undefined) {
					unlinkTemplateFromAgent(existingAgent.id, template.id);
				}
			}
			for (const responseMap of getAgentResponseMaps(existingAgent.id)) {
				if (responseMap.id !== undefined) {
					unlinkResponseMapFromAgent(existingAgent.id, responseMap.id);
				}
			}
			updateAgent(existingAgent.id, {
				name: finalName,
				version: finalVersion,
				prompt: agent.prompt,
				settings: agent.settings
			});
			targetAgentId = existingAgent.id;
			pushSummaryItem(summary, itemKey, ExportableDataType.AGENTS, finalNaturalKey, 'updated');
		} else {
			const created = createAgent({
				name: finalName,
				version: finalVersion,
				prompt: agent.prompt,
				settings: agent.settings
			});
			targetAgentId = created.id;
			pushSummaryItem(summary, itemKey, ExportableDataType.AGENTS, finalNaturalKey, 'created');
		}

		if (!targetAgentId) {
			continue;
		}

		state.agentIdByNaturalKey.set(originalNaturalKey, targetAgentId);
		state.agentIdByNaturalKey.set(finalNaturalKey, targetAgentId);
		addToNameLookup(state.agentIdsByName, agent.name, targetAgentId);
		addToNameLookup(state.agentIdsByName, finalName, targetAgentId);

		for (const linkedTemplate of agent.linked_templates || []) {
			const templateId = getRequiredLookupId(
				state.requestTemplateIdByName,
				linkedTemplate.template_name,
				`request template dependency: ${linkedTemplate.template_name}`
			);
			linkTemplateToAgent(targetAgentId, templateId, linkedTemplate.is_default);
		}

		for (const linkedResponseMap of agent.linked_response_maps || []) {
			const responseMapId = getRequiredLookupId(
				state.responseMapIdByName,
				linkedResponseMap.response_map_name,
				`response map dependency: ${linkedResponseMap.response_map_name}`
			);
			linkResponseMapToAgent(targetAgentId, responseMapId, linkedResponseMap.is_default);
		}
	}
};

export const importConversations = ({
	request,
	summary,
	planByItemKey,
	state,
	existing
}: ImportExecutionContext): void => {
	for (const conversation of request.bundle.data.conversations || []) {
		const itemKey = buildConversationItemKey(conversation);
		const planItem = getPlanItem(planByItemKey, itemKey);
		const entityName = formatConversationEntityName(
			conversation,
			(state.conversationNameCounts.get(conversation.name) || 0) > 1
		);
		if (planItem.selected_decision === 'skip') {
			pushSummaryItem(summary, itemKey, ExportableDataType.CONVERSATIONS, entityName, 'skipped');
			continue;
		}

		const existingMatches = existing.existingConversationsByName.get(conversation.name) || [];
		const existingConversation = existingMatches.length === 1 ? existingMatches[0] : undefined;
		const finalName = planItem.final_name || conversation.name;

		const payload: Conversation = {
			name: finalName,
			description: conversation.description,
			tags: conversation.tags,
			variables: conversation.variables,
			required_request_template_capabilities: conversation.required_request_template_capabilities,
			required_response_map_capabilities: conversation.required_response_map_capabilities,
			stop_on_failure: conversation.stop_on_failure
		};

		let targetConversationId: number | undefined;
		if (planItem.selected_decision === 'overwrite') {
			if (!existingConversation?.id) {
				throw new ImportValidationError(
					existingMatches.length === 0
						? `Cannot overwrite missing conversation: ${conversation.name}`
						: `Cannot overwrite ambiguous conversation: ${conversation.name}`
				);
			}
			for (const target of listByConversationId(existingConversation.id)) {
				if (target.id !== undefined) {
					deleteConversationTurnTarget(target.id);
				}
			}
			for (const message of getConversationMessages(existingConversation.id)) {
				if (message.id !== undefined) {
					deleteConversationMessage(message.id);
				}
			}
			updateConversation(existingConversation.id, payload);
			targetConversationId = existingConversation.id;
			pushSummaryItem(summary, itemKey, ExportableDataType.CONVERSATIONS, finalName, 'updated');
		} else {
			const created = createConversation(payload);
			targetConversationId = created.id;
			pushSummaryItem(summary, itemKey, ExportableDataType.CONVERSATIONS, finalName, 'created');
		}

		if (!targetConversationId) {
			continue;
		}

		const referenceKey = getConversationReferenceKey(conversation);
		state.conversationIdByReferenceKey.set(referenceKey, targetConversationId);
		addToNameLookup(state.conversationIdsByName, conversation.name, targetConversationId);
		addToNameLookup(state.conversationIdsByName, finalName, targetConversationId);

		for (const message of conversation.messages || []) {
			const requestTemplateId = message.request_template_name
				? getRequiredLookupId(
						state.requestTemplateIdByName,
						message.request_template_name,
						`request template dependency in message #${message.sequence}: ${message.request_template_name}`
					)
				: undefined;
			const responseMapId = message.response_map_name
				? getRequiredLookupId(
						state.responseMapIdByName,
						message.response_map_name,
						`response map dependency in message #${message.sequence}: ${message.response_map_name}`
					)
				: undefined;

			addMessageToConversation({
				conversation_id: targetConversationId,
				sequence: message.sequence,
				role: message.role,
				content: message.content,
				metadata: message.metadata,
				request_template_id: requestTemplateId,
				response_map_id: responseMapId,
				set_variables: message.set_variables
			});
		}

		for (const target of conversation.turn_targets || []) {
			createTurnTarget(
				targetConversationId,
				target.user_sequence,
				target.target_reply,
				target.threshold,
				target.weight
			);
		}
	}
};

export const importSuites = ({ request, summary, planByItemKey, state, existing }: ImportExecutionContext): void => {
	for (const suite of request.bundle.data.test_suites || []) {
		const itemKey = buildSuiteItemKey(suite);
		const planItem = getPlanItem(planByItemKey, itemKey);
		const entityName = formatSuiteEntityName(suite, (state.suiteNameCounts.get(suite.name) || 0) > 1);
		if (planItem.selected_decision === 'skip') {
			pushSummaryItem(summary, itemKey, ExportableDataType.TEST_SUITES, entityName, 'skipped');
			continue;
		}

		const existingMatches = existing.existingSuitesByName.get(suite.name) || [];
		const existingSuite = existingMatches.length === 1 ? existingMatches[0] : undefined;
		const finalName = planItem.final_name || suite.name;

		let targetSuiteId: number | undefined;
		if (planItem.selected_decision === 'overwrite') {
			if (!existingSuite?.id) {
				throw new ImportValidationError(
					existingMatches.length === 0
						? `Cannot overwrite missing suite: ${suite.name}`
						: `Cannot overwrite ambiguous suite: ${suite.name}`
				);
			}
			for (const entry of getEntriesInSuite(existingSuite.id)) {
				deleteSuiteEntry(entry.id);
			}
			updateTestSuite(existingSuite.id, {
				name: finalName,
				description: suite.description,
				tags: suite.tags
			});
			targetSuiteId = existingSuite.id;
			pushSummaryItem(summary, itemKey, ExportableDataType.TEST_SUITES, finalName, 'updated');
		} else {
			const created = createTestSuite({
				name: finalName,
				description: suite.description,
				tags: suite.tags
			});
			targetSuiteId = created.id;
			pushSummaryItem(summary, itemKey, ExportableDataType.TEST_SUITES, finalName, 'created');
		}

		if (!targetSuiteId) {
			continue;
		}

		state.suiteIdByReferenceKey.set(getSuiteReferenceKey(suite), targetSuiteId);
		addToNameLookup(state.suiteIdsByName, suite.name, targetSuiteId);
		addToNameLookup(state.suiteIdsByName, finalName, targetSuiteId);
		state.pendingSuiteEntries.push({
			suiteId: targetSuiteId,
			entries: suite.entries || []
		});
	}
};

export const importPendingSuiteEntries = ({
	summary: _summary,
	state
}: Pick<ImportExecutionContext, 'summary' | 'state'>): void => {
	for (const pending of state.pendingSuiteEntries) {
		for (const entry of pending.entries || []) {
			let conversationId: number | undefined;
			if (entry.conversation_reference_key) {
				conversationId = state.conversationIdByReferenceKey.get(entry.conversation_reference_key);
				if (!conversationId) {
					throw new ImportValidationError(
						`Missing conversation dependency: ${entry.conversation_name || entry.conversation_reference_key}`
					);
				}
			}
			if (conversationId === undefined && entry.conversation_name) {
				conversationId = getUniqueId(
					state.conversationIdsByName,
					entry.conversation_name,
					`conversation dependency: ${entry.conversation_name}`
				);
			}
			if (entry.conversation_name && !conversationId) {
				throw new ImportValidationError(`Missing conversation dependency: ${entry.conversation_name}`);
			}

			let childSuiteId: number | undefined;
			if (entry.child_suite_reference_key) {
				childSuiteId = state.suiteIdByReferenceKey.get(entry.child_suite_reference_key);
				if (!childSuiteId) {
					throw new ImportValidationError(
						`Missing child suite dependency: ${entry.child_suite_name || entry.child_suite_reference_key}`
					);
				}
			}
			if (childSuiteId === undefined && entry.child_suite_name) {
				childSuiteId = getUniqueId(
					state.suiteIdsByName,
					entry.child_suite_name,
					`child suite dependency: ${entry.child_suite_name}`
				);
			}
			if (entry.child_suite_name && !childSuiteId) {
				throw new ImportValidationError(`Missing child suite dependency: ${entry.child_suite_name}`);
			}

			let overrideAgentId: number | undefined;
			if (entry.agent_override_name && entry.agent_override_version) {
				overrideAgentId = state.agentIdByNaturalKey.get(
					buildAgentNaturalKey(entry.agent_override_name, entry.agent_override_version)
				);
				if (!overrideAgentId) {
					throw new ImportValidationError(
						`Missing agent override dependency: ${buildAgentNaturalKey(entry.agent_override_name, entry.agent_override_version)}`
					);
				}
			} else if (entry.agent_override_name) {
				overrideAgentId = getUniqueId(
					state.agentIdsByName,
					entry.agent_override_name,
					`agent override dependency: ${entry.agent_override_name}`
				);
				if (!overrideAgentId) {
					throw new ImportValidationError(`Missing agent override dependency: ${entry.agent_override_name}`);
				}
			}

			addSuiteEntry({
				parent_suite_id: pending.suiteId,
				sequence: entry.sequence,
				conversation_id: conversationId,
				child_suite_id: childSuiteId,
				agent_id_override: overrideAgentId
			});
		}
	}
};
