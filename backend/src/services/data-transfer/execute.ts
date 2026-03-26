import type {
	AnalysisItem,
	Conversation,
	ExportableDataType as ExportableDataTypeType,
	ImportRequest,
	ImportResolution,
	ImportResolutionDecision,
	ImportResultSummary
} from '@ibm-vibe/types';
import { ExportableDataType } from '@ibm-vibe/types';
import db from '../../db/database';
import { createAgent, getAgents, updateAgent } from '../../db/repositories/agentRepo';
import {
	addMessageToConversation,
	createConversation,
	deleteConversationMessage,
	getConversationMessages,
	getConversations,
	updateConversation
} from '../../db/repositories/conversationRepo';
import {
	create as createTurnTarget,
	deleteById as deleteConversationTurnTarget,
	listByConversationId
} from '../../db/repositories/conversationTurnTargetsRepo';
import { createLLMConfig, getLLMConfigs, updateLLMConfig } from '../../db/repositories/configRepo';
import {
	addSuiteEntry,
	createTestSuite,
	deleteSuiteEntry,
	getEntriesInSuite,
	getTestSuites,
	updateTestSuite
} from '../../db/repositories/suiteRepo';
import {
	createRequestTemplate,
	createResponseMap,
	getAgentResponseMaps,
	getAgentTemplates,
	linkResponseMapToAgent,
	linkTemplateToAgent,
	listRequestTemplates,
	listResponseMaps,
	unlinkResponseMapFromAgent,
	unlinkTemplateFromAgent,
	updateRequestTemplate,
	updateResponseMap
} from '../../db/repositories/templateRepo';
import { analyzeImportBundle } from './analyze';
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
	getAllowedResolutionDecisions,
	getConversationReferenceKey,
	getSuiteReferenceKey
} from './identity';

type MutableSummary = ImportResultSummary;
type NameToIds = Map<string, number[]>;

export class ImportValidationError extends Error {
	constructor(message: string) {
		super(message);
		this.name = 'ImportValidationError';
	}
}

const createSummary = (): MutableSummary => ({
	created: 0,
	updated: 0,
	skipped: 0,
	items: []
});

const createNameWithImportedSuffix = (name: string, counter?: number): string => (
	counter === undefined ? `${name} (imported)` : `${name} (imported ${counter})`
);

const getDefaultDecision = (status: AnalysisItem['status']): ImportResolutionDecision => (
	status === 'new' ? 'create_new' : 'skip'
);

const getResolution = (
	resolutions: Record<string, ImportResolution>,
	itemKey: string,
	status: AnalysisItem['status']
): ImportResolution => (
	resolutions[itemKey] || { item_key: itemKey, decision: getDefaultDecision(status) }
);

const resolveCreatedName = (
	originalName: string,
	resolution: ImportResolution | undefined,
	isTaken: (candidate: string) => boolean
): string => {
	if (resolution?.new_name) {
		return resolution.new_name;
	}
	if (!isTaken(originalName)) {
		return originalName;
	}

	let counter: number | undefined;
	let candidate = createNameWithImportedSuffix(originalName);
	while (isTaken(candidate)) {
		counter = counter === undefined ? 2 : counter + 1;
		candidate = createNameWithImportedSuffix(originalName, counter);
	}
	return candidate;
};

const pushSummaryItem = (
	summary: MutableSummary,
	itemKey: string,
	entityType: ExportableDataTypeType,
	entityName: string,
	action: 'created' | 'updated' | 'skipped',
	message?: string
): void => {
	if (action === 'created') summary.created += 1;
	if (action === 'updated') summary.updated += 1;
	if (action === 'skipped') summary.skipped += 1;

	summary.items.push({
		item_key: itemKey,
		entity_type: entityType,
		entity_name: entityName,
		action,
		...(message ? { message } : {})
	});
};

const resolveAgentVersion = (
	originalVersion: string,
	resolution?: ImportResolution
): string => resolution?.new_version || originalVersion;

const addToNameLookup = (lookup: NameToIds, name: string, id: number | undefined): void => {
	if (id === undefined) {
		return;
	}
	const ids = lookup.get(name) || [];
	if (!ids.includes(id)) {
		ids.push(id);
	}
	lookup.set(name, ids);
};

const countByName = (names: string[]): Map<string, number> => (
	names.reduce<Map<string, number>>((acc, name) => {
		acc.set(name, (acc.get(name) || 0) + 1);
		return acc;
	}, new Map())
);

const getUniqueId = (
	lookup: NameToIds,
	name: string,
	entityLabel: string
): number | undefined => {
	const ids = lookup.get(name) || [];
	if (ids.length > 1) {
		throw new ImportValidationError(`Ambiguous ${entityLabel}: ${name}`);
	}
	return ids[0];
};

const getRequiredLookupId = (
	lookup: Map<string, number>,
	name: string,
	entityLabel: string
): number => {
	const id = lookup.get(name);
	if (!id) {
		throw new ImportValidationError(`Missing ${entityLabel}: ${name}`);
	}
	return id;
};

const validateImportRequest = (request: ImportRequest): Map<string, AnalysisItem> => {
	const analysisReport = analyzeImportBundle(request.bundle, request.resolutions);
	const analysisByItemKey = new Map(analysisReport.items.map((item) => [item.item_key, item]));

	for (const item of analysisReport.items) {
		const resolution = getResolution(request.resolutions, item.item_key, item.status);
		const allowed = item.allowed_decisions || getAllowedResolutionDecisions(item.status);
		if (!allowed.includes(resolution.decision)) {
			throw new ImportValidationError(
				`Invalid decision "${resolution.decision}" for ${item.entity_type} "${item.entity_name}" with status ${item.status}`
			);
		}
	}

	return analysisByItemKey;
};

export const executeImportBundle = (request: ImportRequest): ImportResultSummary => {
	const summary = createSummary();
	const analysisByItemKey = validateImportRequest(request);
	const requestTemplateNameCounts = countByName((request.bundle.data.request_templates || []).map((template) => template.name));
	const responseMapNameCounts = countByName((request.bundle.data.response_maps || []).map((responseMap) => responseMap.name));
	const conversationNameCounts = countByName((request.bundle.data.conversations || []).map((conversation) => conversation.name));
	const suiteNameCounts = countByName((request.bundle.data.test_suites || []).map((suite) => suite.name));
	const llmConfigNameCounts = countByName((request.bundle.data.llm_configs || []).map((config) => config.name));

	const requestTemplateIdByName = new Map<string, number>();
	const responseMapIdByName = new Map<string, number>();
	const llmConfigIdsByName: NameToIds = new Map();
	const agentIdByNaturalKey = new Map<string, number>();
	const agentIdsByName: NameToIds = new Map();
	const conversationIdByReferenceKey = new Map<string, number>();
	const conversationIdsByName: NameToIds = new Map();
	const suiteIdByReferenceKey = new Map<string, number>();
	const suiteIdsByName: NameToIds = new Map();

	const runImport = db.transaction(() => {
		const existingTemplatesByName = new Map(listRequestTemplates().map((template) => [template.name, template]));
		const existingResponseMapsByName = new Map(listResponseMaps().map((responseMap) => [responseMap.name, responseMap]));
		const existingLlmConfigsByName = getLLMConfigs().reduce<Map<string, Array<{ id?: number; name: string }>>>(
			(acc, config) => {
				const items = acc.get(config.name) || [];
				items.push(config);
				acc.set(config.name, items);
				return acc;
			},
			new Map()
		);
		const existingAgentsByNaturalKey = new Map(
			getAgents().map((agent) => [buildAgentNaturalKey(agent.name, agent.version), agent])
		);
		const existingConversationsByName = getConversations().reduce<Map<string, Array<{ id?: number; name: string }>>>(
			(acc, conversation) => {
				const items = acc.get(conversation.name) || [];
				items.push(conversation);
				acc.set(conversation.name, items);
				return acc;
			},
			new Map()
		);
		const existingSuitesByName = getTestSuites().reduce<Map<string, Array<{ id?: number; name: string }>>>(
			(acc, suite) => {
				const items = acc.get(suite.name) || [];
				items.push(suite);
				acc.set(suite.name, items);
				return acc;
			},
			new Map()
		);

		for (const [name, template] of existingTemplatesByName.entries()) {
			if (template.id) requestTemplateIdByName.set(name, template.id);
		}
		for (const [name, responseMap] of existingResponseMapsByName.entries()) {
			if (responseMap.id) responseMapIdByName.set(name, responseMap.id);
		}
		for (const [name, configs] of existingLlmConfigsByName.entries()) {
			for (const config of configs) {
				addToNameLookup(llmConfigIdsByName, name, config.id);
			}
		}
		for (const [naturalKey, agent] of existingAgentsByNaturalKey.entries()) {
			if (agent.id) {
				agentIdByNaturalKey.set(naturalKey, agent.id);
				addToNameLookup(agentIdsByName, agent.name, agent.id);
			}
		}
		for (const [name, conversations] of existingConversationsByName.entries()) {
			for (const conversation of conversations) {
				addToNameLookup(conversationIdsByName, name, conversation.id);
			}
		}
		for (const [name, suites] of existingSuitesByName.entries()) {
			for (const suite of suites) {
				addToNameLookup(suiteIdsByName, name, suite.id);
			}
		}

		for (const template of request.bundle.data.request_templates || []) {
			const itemKey = buildRequestTemplateItemKey(template);
			const resolution = getResolution(request.resolutions, itemKey, analysisByItemKey.get(itemKey)?.status || 'new');
			const entityName = formatRequestTemplateEntityName(
				template,
				(requestTemplateNameCounts.get(template.name) || 0) > 1
			);
			if (resolution.decision === 'skip') {
				pushSummaryItem(summary, itemKey, ExportableDataType.REQUEST_TEMPLATES, entityName, 'skipped');
				continue;
			}

			const existing = existingTemplatesByName.get(template.name);
			if (resolution.decision === 'overwrite' && existing?.id) {
				updateRequestTemplate(existing.id, {
					name: template.name,
					description: template.description,
					capability: template.capability,
					body: template.body
				});
				requestTemplateIdByName.set(template.name, existing.id);
				pushSummaryItem(summary, itemKey, ExportableDataType.REQUEST_TEMPLATES, entityName, 'updated');
				continue;
			}

			const finalName = resolveCreatedName(template.name, resolution, (candidate) => requestTemplateIdByName.has(candidate));
			const created = createRequestTemplate({
				name: finalName,
				description: template.description,
				capability: template.capability,
				body: template.body
			});
			if (created.id) {
				requestTemplateIdByName.set(finalName, created.id);
				requestTemplateIdByName.set(template.name, created.id);
			}
			pushSummaryItem(summary, itemKey, ExportableDataType.REQUEST_TEMPLATES, finalName, 'created');
		}

		for (const responseMap of request.bundle.data.response_maps || []) {
			const itemKey = buildResponseMapItemKey(responseMap);
			const resolution = getResolution(request.resolutions, itemKey, analysisByItemKey.get(itemKey)?.status || 'new');
			const entityName = formatResponseMapEntityName(
				responseMap,
				(responseMapNameCounts.get(responseMap.name) || 0) > 1
			);
			if (resolution.decision === 'skip') {
				pushSummaryItem(summary, itemKey, ExportableDataType.RESPONSE_MAPS, entityName, 'skipped');
				continue;
			}

			const existing = existingResponseMapsByName.get(responseMap.name);
			if (resolution.decision === 'overwrite' && existing?.id) {
				updateResponseMap(existing.id, {
					name: responseMap.name,
					description: responseMap.description,
					capability: responseMap.capability,
					spec: responseMap.spec
				});
				responseMapIdByName.set(responseMap.name, existing.id);
				pushSummaryItem(summary, itemKey, ExportableDataType.RESPONSE_MAPS, entityName, 'updated');
				continue;
			}

			const finalName = resolveCreatedName(responseMap.name, resolution, (candidate) => responseMapIdByName.has(candidate));
			const created = createResponseMap({
				name: finalName,
				description: responseMap.description,
				capability: responseMap.capability,
				spec: responseMap.spec
			});
			if (created.id) {
				responseMapIdByName.set(finalName, created.id);
				responseMapIdByName.set(responseMap.name, created.id);
			}
			pushSummaryItem(summary, itemKey, ExportableDataType.RESPONSE_MAPS, finalName, 'created');
		}

		for (const llmConfig of request.bundle.data.llm_configs || []) {
			const itemKey = buildLLMConfigItemKey(llmConfig);
			const resolution = getResolution(request.resolutions, itemKey, analysisByItemKey.get(itemKey)?.status || 'new');
			const entityName = formatLLMConfigEntityName(
				llmConfig,
				(llmConfigNameCounts.get(llmConfig.name) || 0) > 1
			);
			if (resolution.decision === 'skip') {
				pushSummaryItem(summary, itemKey, ExportableDataType.LLM_CONFIGS, entityName, 'skipped');
				continue;
			}

			const existingMatches = existingLlmConfigsByName.get(llmConfig.name) || [];
			const existing = existingMatches.length === 1 ? existingMatches[0] : undefined;
			const finalName = resolution.decision === 'create_new'
				? resolveCreatedName(
					llmConfig.name,
					resolution,
					(candidate) => (llmConfigIdsByName.get(candidate) || []).length > 0
				)
				: (resolution.new_name || llmConfig.name);
			if (resolution.decision === 'overwrite' && existing?.id) {
				updateLLMConfig(existing.id, {
					name: finalName,
					provider: llmConfig.provider,
					config: llmConfig.config,
					priority: llmConfig.priority
				});
				addToNameLookup(llmConfigIdsByName, llmConfig.name, existing.id);
				addToNameLookup(llmConfigIdsByName, finalName, existing.id);
				pushSummaryItem(summary, itemKey, ExportableDataType.LLM_CONFIGS, finalName, 'updated');
				continue;
			}

			if (resolution.decision === 'overwrite') {
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
				addToNameLookup(llmConfigIdsByName, finalName, created.id);
				addToNameLookup(llmConfigIdsByName, llmConfig.name, created.id);
			}
			pushSummaryItem(summary, itemKey, ExportableDataType.LLM_CONFIGS, finalName, 'created');
		}

		for (const agent of request.bundle.data.agents || []) {
			const originalNaturalKey = buildAgentNaturalKey(agent.name, agent.version);
			const itemKey = buildAgentItemKey(agent);
			const resolution = getResolution(request.resolutions, itemKey, analysisByItemKey.get(itemKey)?.status || 'new');
			if (resolution.decision === 'skip') {
				pushSummaryItem(summary, itemKey, ExportableDataType.AGENTS, originalNaturalKey, 'skipped');
				continue;
			}

			const existing = existingAgentsByNaturalKey.get(originalNaturalKey);
			const finalVersion = resolveAgentVersion(agent.version, resolution);
			const finalName = resolution.decision === 'create_new'
				? resolveCreatedName(
					agent.name,
					resolution,
					(candidate) => agentIdByNaturalKey.has(buildAgentNaturalKey(candidate, finalVersion))
				)
				: (resolution.new_name || agent.name);
			const finalNaturalKey = buildAgentNaturalKey(finalName, finalVersion);

			let targetAgentId: number | undefined;
			if (resolution.decision === 'overwrite') {
				if (!existing?.id) {
					throw new ImportValidationError(`Cannot overwrite missing agent: ${originalNaturalKey}`);
				}
				for (const template of getAgentTemplates(existing.id)) {
					if (template.id !== undefined) {
						unlinkTemplateFromAgent(existing.id, template.id);
					}
				}
				for (const responseMap of getAgentResponseMaps(existing.id)) {
					if (responseMap.id !== undefined) {
						unlinkResponseMapFromAgent(existing.id, responseMap.id);
					}
				}
				updateAgent(existing.id, {
					name: finalName,
					version: finalVersion,
					prompt: agent.prompt,
					settings: agent.settings
				});
				targetAgentId = existing.id;
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

			if (!targetAgentId) continue;
			agentIdByNaturalKey.set(originalNaturalKey, targetAgentId);
			agentIdByNaturalKey.set(finalNaturalKey, targetAgentId);
			addToNameLookup(agentIdsByName, agent.name, targetAgentId);
			addToNameLookup(agentIdsByName, finalName, targetAgentId);

			for (const linkedTemplate of agent.linked_templates || []) {
				const templateId = getRequiredLookupId(
					requestTemplateIdByName,
					linkedTemplate.template_name,
					`request template dependency: ${linkedTemplate.template_name}`
				);
				linkTemplateToAgent(targetAgentId, templateId, linkedTemplate.is_default);
			}

			for (const linkedResponseMap of agent.linked_response_maps || []) {
				const responseMapId = getRequiredLookupId(
					responseMapIdByName,
					linkedResponseMap.response_map_name,
					`response map dependency: ${linkedResponseMap.response_map_name}`
				);
				linkResponseMapToAgent(targetAgentId, responseMapId, linkedResponseMap.is_default);
			}
		}

		for (const conversation of request.bundle.data.conversations || []) {
			const itemKey = buildConversationItemKey(conversation);
			const resolution = getResolution(request.resolutions, itemKey, analysisByItemKey.get(itemKey)?.status || 'new');
			const entityName = formatConversationEntityName(
				conversation,
				(conversationNameCounts.get(conversation.name) || 0) > 1
			);
			if (resolution.decision === 'skip') {
				pushSummaryItem(summary, itemKey, ExportableDataType.CONVERSATIONS, entityName, 'skipped');
				continue;
			}

			const existingMatches = existingConversationsByName.get(conversation.name) || [];
			const existing = existingMatches.length === 1 ? existingMatches[0] : undefined;
			const finalName = resolution.decision === 'create_new'
				? resolveCreatedName(
					conversation.name,
					resolution,
					(candidate) => (conversationIdsByName.get(candidate) || []).length > 0
				)
				: (resolution.new_name || conversation.name);

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
			if (resolution.decision === 'overwrite') {
				if (!existing?.id) {
					throw new ImportValidationError(
						existingMatches.length === 0
							? `Cannot overwrite missing conversation: ${conversation.name}`
							: `Cannot overwrite ambiguous conversation: ${conversation.name}`
					);
				}
				for (const target of listByConversationId(existing.id)) {
					if (target.id !== undefined) {
						deleteConversationTurnTarget(target.id);
					}
				}
				for (const message of getConversationMessages(existing.id)) {
					if (message.id !== undefined) {
						deleteConversationMessage(message.id);
					}
				}
				updateConversation(existing.id, payload);
				targetConversationId = existing.id;
				pushSummaryItem(summary, itemKey, ExportableDataType.CONVERSATIONS, entityName, 'updated');
			} else {
				const created = createConversation(payload);
				targetConversationId = created.id;
				pushSummaryItem(summary, itemKey, ExportableDataType.CONVERSATIONS, entityName, 'created');
			}

			if (!targetConversationId) continue;
			const referenceKey = getConversationReferenceKey(conversation);
			conversationIdByReferenceKey.set(referenceKey, targetConversationId);
			addToNameLookup(conversationIdsByName, conversation.name, targetConversationId);
			addToNameLookup(conversationIdsByName, finalName, targetConversationId);

			for (const message of conversation.messages || []) {
				const requestTemplateId = message.request_template_name
					? getRequiredLookupId(
						requestTemplateIdByName,
						message.request_template_name,
						`request template dependency in message #${message.sequence}: ${message.request_template_name}`
					)
					: undefined;
				const responseMapId = message.response_map_name
					? getRequiredLookupId(
						responseMapIdByName,
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

		const pendingSuiteEntries: Array<{
			suiteId: number;
			entries: NonNullable<typeof request.bundle.data.test_suites>[number]['entries'];
		}> = [];

		for (const suite of request.bundle.data.test_suites || []) {
			const itemKey = buildSuiteItemKey(suite);
			const resolution = getResolution(request.resolutions, itemKey, analysisByItemKey.get(itemKey)?.status || 'new');
			const entityName = formatSuiteEntityName(
				suite,
				(suiteNameCounts.get(suite.name) || 0) > 1
			);
			if (resolution.decision === 'skip') {
				pushSummaryItem(summary, itemKey, ExportableDataType.TEST_SUITES, entityName, 'skipped');
				continue;
			}

			const existingMatches = existingSuitesByName.get(suite.name) || [];
			const existing = existingMatches.length === 1 ? existingMatches[0] : undefined;
			const finalName = resolution.decision === 'create_new'
				? resolveCreatedName(
					suite.name,
					resolution,
					(candidate) => (suiteIdsByName.get(candidate) || []).length > 0
				)
				: (resolution.new_name || suite.name);

			let targetSuiteId: number | undefined;
			if (resolution.decision === 'overwrite') {
				if (!existing?.id) {
					throw new ImportValidationError(
						existingMatches.length === 0
							? `Cannot overwrite missing suite: ${suite.name}`
							: `Cannot overwrite ambiguous suite: ${suite.name}`
					);
				}
				for (const entry of getEntriesInSuite(existing.id)) {
					deleteSuiteEntry(entry.id);
				}
				updateTestSuite(existing.id, {
					name: finalName,
					description: suite.description,
					tags: suite.tags
				});
				targetSuiteId = existing.id;
				pushSummaryItem(summary, itemKey, ExportableDataType.TEST_SUITES, entityName, 'updated');
			} else {
				const created = createTestSuite({
					name: finalName,
					description: suite.description,
					tags: suite.tags
				});
				targetSuiteId = created.id;
				pushSummaryItem(summary, itemKey, ExportableDataType.TEST_SUITES, entityName, 'created');
			}

			if (!targetSuiteId) continue;
			suiteIdByReferenceKey.set(getSuiteReferenceKey(suite), targetSuiteId);
			addToNameLookup(suiteIdsByName, suite.name, targetSuiteId);
			addToNameLookup(suiteIdsByName, finalName, targetSuiteId);
			pendingSuiteEntries.push({
				suiteId: targetSuiteId,
				entries: suite.entries || []
			});
		}

		for (const pending of pendingSuiteEntries) {
			for (const entry of pending.entries || []) {
				let conversationId: number | undefined;
				if (entry.conversation_reference_key) {
					conversationId = conversationIdByReferenceKey.get(entry.conversation_reference_key);
					if (!conversationId) {
						throw new ImportValidationError(
							`Missing conversation dependency: ${entry.conversation_name || entry.conversation_reference_key}`
						);
					}
				}
				if (conversationId === undefined && entry.conversation_name) {
					conversationId = getUniqueId(
						conversationIdsByName,
						entry.conversation_name,
						`conversation dependency: ${entry.conversation_name}`
					);
				}
				if (entry.conversation_name && !conversationId) {
					throw new ImportValidationError(`Missing conversation dependency: ${entry.conversation_name}`);
				}

				let childSuiteId: number | undefined;
				if (entry.child_suite_reference_key) {
					childSuiteId = suiteIdByReferenceKey.get(entry.child_suite_reference_key);
					if (!childSuiteId) {
						throw new ImportValidationError(
							`Missing child suite dependency: ${entry.child_suite_name || entry.child_suite_reference_key}`
						);
					}
				}
				if (childSuiteId === undefined && entry.child_suite_name) {
					childSuiteId = getUniqueId(
						suiteIdsByName,
						entry.child_suite_name,
						`child suite dependency: ${entry.child_suite_name}`
					);
				}
				if (entry.child_suite_name && !childSuiteId) {
					throw new ImportValidationError(`Missing child suite dependency: ${entry.child_suite_name}`);
				}

				let overrideAgentId: number | undefined;
				if (entry.agent_override_name && entry.agent_override_version) {
					overrideAgentId = agentIdByNaturalKey.get(
						buildAgentNaturalKey(entry.agent_override_name, entry.agent_override_version)
					);
					if (!overrideAgentId) {
						throw new ImportValidationError(
							`Missing agent override dependency: ${buildAgentNaturalKey(entry.agent_override_name, entry.agent_override_version)}`
						);
					}
				} else if (entry.agent_override_name) {
					overrideAgentId = getUniqueId(
						agentIdsByName,
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
	});

	runImport();
	return summary;
};

