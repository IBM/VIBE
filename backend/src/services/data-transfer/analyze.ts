import type {
	AnalysisItem,
	AnalysisReport,
	AnalysisStatus,
	ExportBundle,
	ImportResolution,
	ImportResolutionDecision
} from '@ibm-vibe/types';
import { ExportableDataType } from '@ibm-vibe/types';
import { getAgents } from '../../db/repositories/agentRepo';
import { getConversations } from '../../db/repositories/conversationRepo';
import { getLLMConfigs } from '../../db/repositories/configRepo';
import { getTestSuites } from '../../db/repositories/suiteRepo';
import { listRequestTemplates, listResponseMaps } from '../../db/repositories/templateRepo';
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

type NameToIds = Map<string, number[]>;

type ExistingLookups = {
	agents: Map<string, number>;
	agentIdsByName: NameToIds;
	conversationIdsByName: NameToIds;
	suiteIdsByName: NameToIds;
	llmConfigIdsByName: NameToIds;
	requestTemplates: Map<string, number>;
	responseMaps: Map<string, number>;
};

type BundleLookups = {
	agents: Set<string>;
	agentNameCounts: Map<string, number>;
	conversationReferences: Set<string>;
	conversationNameCounts: Map<string, number>;
	suiteReferences: Set<string>;
	suiteNameCounts: Map<string, number>;
	llmConfigNameCounts: Map<string, number>;
	requestTemplateNameCounts: Map<string, number>;
	responseMapNameCounts: Map<string, number>;
	requestTemplates: Set<string>;
	responseMaps: Set<string>;
};

const addToNameLookup = (lookup: NameToIds, name: string, id: number | undefined): void => {
	if (id === undefined) {
		return;
	}
	const existing = lookup.get(name) || [];
	existing.push(id);
	lookup.set(name, existing);
};

const countByName = (names: string[]): Map<string, number> =>
	names.reduce<Map<string, number>>((acc, name) => {
		acc.set(name, (acc.get(name) || 0) + 1);
		return acc;
	}, new Map());

const getSingleExistingId = (lookup: NameToIds, name: string): number | undefined => {
	const ids = lookup.get(name) || [];
	return ids.length === 1 ? ids[0] : undefined;
};

const isAmbiguousName = (lookup: NameToIds | Map<string, number>, name: string): boolean => {
	const value = lookup.get(name);
	if (Array.isArray(value)) {
		return value.length > 1;
	}
	return (value || 0) > 1;
};

const isAvailableItem = (itemKey: string, availableItemKeys?: Set<string>): boolean =>
	!availableItemKeys || availableItemKeys.has(itemKey);

const createExistingLookups = (): ExistingLookups => {
	const agentRows = getAgents();
	const conversationRows = getConversations();
	const suiteRows = getTestSuites();
	const llmConfigRows = getLLMConfigs();
	const requestTemplateRows = listRequestTemplates();
	const responseMapRows = listResponseMaps();

	const agentIdsByName: NameToIds = new Map();
	const conversationIdsByName: NameToIds = new Map();
	const suiteIdsByName: NameToIds = new Map();
	const llmConfigIdsByName: NameToIds = new Map();

	for (const agent of agentRows) {
		addToNameLookup(agentIdsByName, agent.name, agent.id);
	}
	for (const conversation of conversationRows) {
		addToNameLookup(conversationIdsByName, conversation.name, conversation.id);
	}
	for (const suite of suiteRows) {
		addToNameLookup(suiteIdsByName, suite.name, suite.id);
	}
	for (const llmConfig of llmConfigRows) {
		addToNameLookup(llmConfigIdsByName, llmConfig.name, llmConfig.id);
	}

	return {
		agents: new Map(
			agentRows
				.filter((agent): agent is typeof agent & { id: number } => agent.id !== undefined)
				.map((agent) => [buildAgentNaturalKey(agent.name, agent.version), agent.id])
		),
		agentIdsByName,
		conversationIdsByName,
		suiteIdsByName,
		llmConfigIdsByName,
		requestTemplates: new Map(
			requestTemplateRows
				.filter((template): template is typeof template & { id: number } => template.id !== undefined)
				.map((template) => [template.name, template.id])
		),
		responseMaps: new Map(
			responseMapRows
				.filter(
					(responseMap): responseMap is typeof responseMap & { id: number } => responseMap.id !== undefined
				)
				.map((responseMap) => [responseMap.name, responseMap.id])
		)
	};
};

const createBundleLookups = (bundle: ExportBundle, availableItemKeys?: Set<string>): BundleLookups => {
	const availableAgents = (bundle.data.agents || []).filter((agent) =>
		isAvailableItem(buildAgentItemKey(agent), availableItemKeys)
	);
	const availableConversations = (bundle.data.conversations || []).filter((conversation) =>
		isAvailableItem(buildConversationItemKey(conversation), availableItemKeys)
	);
	const availableSuites = (bundle.data.test_suites || []).filter((suite) =>
		isAvailableItem(buildSuiteItemKey(suite), availableItemKeys)
	);
	const availableLlmConfigs = (bundle.data.llm_configs || []).filter((config) =>
		isAvailableItem(buildLLMConfigItemKey(config), availableItemKeys)
	);
	const availableRequestTemplates = (bundle.data.request_templates || []).filter((template) =>
		isAvailableItem(buildRequestTemplateItemKey(template), availableItemKeys)
	);
	const availableResponseMaps = (bundle.data.response_maps || []).filter((responseMap) =>
		isAvailableItem(buildResponseMapItemKey(responseMap), availableItemKeys)
	);

	return {
		agents: new Set(availableAgents.map((agent) => buildAgentNaturalKey(agent.name, agent.version))),
		agentNameCounts: countByName(availableAgents.map((agent) => agent.name)),
		conversationReferences: new Set(
			availableConversations.map((conversation) => getConversationReferenceKey(conversation))
		),
		conversationNameCounts: countByName(availableConversations.map((conversation) => conversation.name)),
		suiteReferences: new Set(availableSuites.map((suite) => getSuiteReferenceKey(suite))),
		suiteNameCounts: countByName(availableSuites.map((suite) => suite.name)),
		llmConfigNameCounts: countByName(availableLlmConfigs.map((config) => config.name)),
		requestTemplateNameCounts: countByName(availableRequestTemplates.map((template) => template.name)),
		responseMapNameCounts: countByName(availableResponseMaps.map((responseMap) => responseMap.name)),
		requestTemplates: new Set(availableRequestTemplates.map((template) => template.name)),
		responseMaps: new Set(availableResponseMaps.map((responseMap) => responseMap.name))
	};
};

const hasRequestTemplate = (name: string, existing: ExistingLookups, bundle: BundleLookups): boolean =>
	bundle.requestTemplates.has(name) || existing.requestTemplates.has(name);

const hasResponseMap = (name: string, existing: ExistingLookups, bundle: BundleLookups): boolean =>
	bundle.responseMaps.has(name) || existing.responseMaps.has(name);

const formatDependencyLabel = (name: string | undefined, referenceKey: string | undefined): string =>
	name || referenceKey || 'unknown dependency';

const resolveConversationDependencyIssue = (
	entry: { conversation_name?: string; conversation_reference_key?: string },
	existing: ExistingLookups,
	bundle: BundleLookups
): string | undefined => {
	if (entry.conversation_reference_key) {
		if (bundle.conversationReferences.has(entry.conversation_reference_key)) {
			return undefined;
		}
		return `Missing conversation dependency: ${formatDependencyLabel(
			entry.conversation_name,
			entry.conversation_reference_key
		)}`;
	}

	if (!entry.conversation_name) {
		return undefined;
	}

	const bundleCount = bundle.conversationNameCounts.get(entry.conversation_name) || 0;
	if (bundleCount > 1) {
		return `Ambiguous conversation dependency: ${entry.conversation_name}`;
	}
	if (bundleCount === 1) {
		return undefined;
	}

	const existingIds = existing.conversationIdsByName.get(entry.conversation_name) || [];
	if (existingIds.length > 1) {
		return `Ambiguous conversation dependency: ${entry.conversation_name}`;
	}
	if (existingIds.length === 1) {
		return undefined;
	}

	return `Missing conversation dependency: ${entry.conversation_name}`;
};

const resolveSuiteDependencyIssue = (
	entry: { child_suite_name?: string; child_suite_reference_key?: string },
	existing: ExistingLookups,
	bundle: BundleLookups
): string | undefined => {
	if (entry.child_suite_reference_key) {
		if (bundle.suiteReferences.has(entry.child_suite_reference_key)) {
			return undefined;
		}
		return `Missing child suite dependency: ${formatDependencyLabel(
			entry.child_suite_name,
			entry.child_suite_reference_key
		)}`;
	}

	if (!entry.child_suite_name) {
		return undefined;
	}

	const bundleCount = bundle.suiteNameCounts.get(entry.child_suite_name) || 0;
	if (bundleCount > 1) {
		return `Ambiguous child suite dependency: ${entry.child_suite_name}`;
	}
	if (bundleCount === 1) {
		return undefined;
	}

	const existingIds = existing.suiteIdsByName.get(entry.child_suite_name) || [];
	if (existingIds.length > 1) {
		return `Ambiguous child suite dependency: ${entry.child_suite_name}`;
	}
	if (existingIds.length === 1) {
		return undefined;
	}

	return `Missing child suite dependency: ${entry.child_suite_name}`;
};

const resolveAgentOverrideIssue = (
	name: string,
	version: string | undefined,
	existing: ExistingLookups,
	bundle: BundleLookups
): string | undefined => {
	if (version) {
		const key = buildAgentNaturalKey(name, version);
		return bundle.agents.has(key) || existing.agents.has(key)
			? undefined
			: `Missing agent override dependency: ${key}`;
	}

	const bundleCount = bundle.agentNameCounts.get(name) || 0;
	if (bundleCount > 1) {
		return `Ambiguous agent override dependency: ${name}`;
	}
	if (bundleCount === 1) {
		return undefined;
	}

	const existingIds = existing.agentIdsByName.get(name) || [];
	if (existingIds.length > 1) {
		return `Ambiguous agent override dependency: ${name}`;
	}
	if (existingIds.length === 1) {
		return undefined;
	}

	return `Missing agent override dependency: ${name}`;
};

const deriveStatus = (existingId: number | undefined, issues: string[]): AnalysisStatus => {
	if (issues.length > 0) {
		return 'dependency_missing';
	}
	if (existingId !== undefined) {
		return 'conflict';
	}
	return 'new';
};

const getDefaultAllowedDecisions = (status: AnalysisStatus): ImportResolutionDecision[] => {
	if (status === 'new') {
		return ['skip', 'create_new'];
	}
	if (status === 'conflict') {
		return ['skip', 'overwrite', 'create_new'];
	}
	return ['skip'];
};

const createItem = (
	itemKey: string,
	entityType: ExportableDataType,
	entityName: string,
	existingId: number | undefined,
	issues: string[],
	allowedDecisions?: ImportResolutionDecision[],
	statusOverride?: AnalysisStatus
): AnalysisItem => {
	const status = statusOverride || deriveStatus(existingId, issues);
	return {
		item_key: itemKey,
		entity_type: entityType,
		entity_name: entityName,
		status,
		...(existingId !== undefined ? { existing_id: existingId } : {}),
		...(issues.length > 0 ? { issues } : {}),
		...(allowedDecisions && JSON.stringify(allowedDecisions) !== JSON.stringify(getDefaultAllowedDecisions(status))
			? { allowed_decisions: allowedDecisions }
			: {})
	};
};

const analyzeAgents = (
	bundle: ExportBundle,
	existing: ExistingLookups,
	bundleLookups: BundleLookups
): AnalysisItem[] => {
	return (bundle.data.agents || []).map((agent) => {
		const entityName = buildAgentNaturalKey(agent.name, agent.version);
		const existingId = existing.agents.get(entityName);
		const issues: string[] = [];

		for (const linkedTemplate of agent.linked_templates || []) {
			if (!hasRequestTemplate(linkedTemplate.template_name, existing, bundleLookups)) {
				issues.push(`Missing request template dependency: ${linkedTemplate.template_name}`);
			}
		}

		for (const linkedResponseMap of agent.linked_response_maps || []) {
			if (!hasResponseMap(linkedResponseMap.response_map_name, existing, bundleLookups)) {
				issues.push(`Missing response map dependency: ${linkedResponseMap.response_map_name}`);
			}
		}

		return createItem(
			buildAgentItemKey(agent),
			ExportableDataType.AGENTS,
			entityName,
			existingId,
			Array.from(new Set(issues))
		);
	});
};

const analyzeRequestTemplates = (
	bundle: ExportBundle,
	existing: ExistingLookups,
	bundleLookups: BundleLookups
): AnalysisItem[] => {
	return (bundle.data.request_templates || []).map((template) => {
		const existingId = existing.requestTemplates.get(template.name);
		const hasDuplicateImportedName = (bundleLookups.requestTemplateNameCounts.get(template.name) || 0) > 1;
		const allowedDecisions: ImportResolutionDecision[] | undefined =
			existingId !== undefined && hasDuplicateImportedName ? ['skip', 'create_new'] : undefined;

		return createItem(
			buildRequestTemplateItemKey(template),
			ExportableDataType.REQUEST_TEMPLATES,
			formatRequestTemplateEntityName(template, hasDuplicateImportedName),
			existingId,
			[],
			allowedDecisions
		);
	});
};

const analyzeResponseMaps = (
	bundle: ExportBundle,
	existing: ExistingLookups,
	bundleLookups: BundleLookups
): AnalysisItem[] => {
	return (bundle.data.response_maps || []).map((responseMap) => {
		const existingId = existing.responseMaps.get(responseMap.name);
		const hasDuplicateImportedName = (bundleLookups.responseMapNameCounts.get(responseMap.name) || 0) > 1;
		const allowedDecisions: ImportResolutionDecision[] | undefined =
			existingId !== undefined && hasDuplicateImportedName ? ['skip', 'create_new'] : undefined;

		return createItem(
			buildResponseMapItemKey(responseMap),
			ExportableDataType.RESPONSE_MAPS,
			formatResponseMapEntityName(responseMap, hasDuplicateImportedName),
			existingId,
			[],
			allowedDecisions
		);
	});
};

const analyzeConversations = (
	bundle: ExportBundle,
	existing: ExistingLookups,
	bundleLookups: BundleLookups
): AnalysisItem[] => {
	return (bundle.data.conversations || []).map((conversation) => {
		const existingId = getSingleExistingId(existing.conversationIdsByName, conversation.name);
		const issues: string[] = [];
		const hasDuplicateImportedName = (bundleLookups.conversationNameCounts.get(conversation.name) || 0) > 1;
		const hasAmbiguousExistingName = isAmbiguousName(existing.conversationIdsByName, conversation.name);
		const allowedDecisions: ImportResolutionDecision[] | undefined =
			hasAmbiguousExistingName || (existingId !== undefined && hasDuplicateImportedName)
				? ['skip', 'create_new']
				: undefined;

		if (hasAmbiguousExistingName) {
			issues.push(`Ambiguous existing conversation name: ${conversation.name}`);
		}

		for (const message of conversation.messages || []) {
			if (
				message.request_template_name &&
				!hasRequestTemplate(message.request_template_name, existing, bundleLookups)
			) {
				issues.push(
					`Missing request template dependency in message #${message.sequence}: ${message.request_template_name}`
				);
			}
			if (message.response_map_name && !hasResponseMap(message.response_map_name, existing, bundleLookups)) {
				issues.push(
					`Missing response map dependency in message #${message.sequence}: ${message.response_map_name}`
				);
			}
		}

		return createItem(
			buildConversationItemKey(conversation),
			ExportableDataType.CONVERSATIONS,
			formatConversationEntityName(conversation, hasDuplicateImportedName),
			existingId,
			Array.from(new Set(issues)),
			allowedDecisions,
			hasAmbiguousExistingName ? 'conflict' : undefined
		);
	});
};

const analyzeSuites = (
	bundle: ExportBundle,
	existing: ExistingLookups,
	bundleLookups: BundleLookups
): AnalysisItem[] => {
	return (bundle.data.test_suites || []).map((suite) => {
		const existingId = getSingleExistingId(existing.suiteIdsByName, suite.name);
		const issues: string[] = [];
		const hasDuplicateImportedName = (bundleLookups.suiteNameCounts.get(suite.name) || 0) > 1;
		const hasAmbiguousExistingName = isAmbiguousName(existing.suiteIdsByName, suite.name);
		const allowedDecisions: ImportResolutionDecision[] | undefined =
			hasAmbiguousExistingName || (existingId !== undefined && hasDuplicateImportedName)
				? ['skip', 'create_new']
				: undefined;

		if (hasAmbiguousExistingName) {
			issues.push(`Ambiguous existing suite name: ${suite.name}`);
		}

		for (const entry of suite.entries || []) {
			const conversationIssue = resolveConversationDependencyIssue(entry, existing, bundleLookups);
			if (conversationIssue) {
				issues.push(conversationIssue);
			}
			if (entry.child_suite_name) {
				const suiteIssue = resolveSuiteDependencyIssue(entry, existing, bundleLookups);
				if (suiteIssue) {
					issues.push(suiteIssue);
				}
			}
			if (entry.agent_override_name) {
				const agentIssue = resolveAgentOverrideIssue(
					entry.agent_override_name,
					entry.agent_override_version,
					existing,
					bundleLookups
				);
				if (agentIssue) {
					issues.push(agentIssue);
				}
			}
		}

		return createItem(
			buildSuiteItemKey(suite),
			ExportableDataType.TEST_SUITES,
			formatSuiteEntityName(suite, hasDuplicateImportedName),
			existingId,
			Array.from(new Set(issues)),
			allowedDecisions,
			hasAmbiguousExistingName ? 'conflict' : undefined
		);
	});
};

const analyzeLlmConfigs = (
	bundle: ExportBundle,
	existing: ExistingLookups,
	bundleLookups: BundleLookups
): AnalysisItem[] => {
	return (bundle.data.llm_configs || []).map((config) => {
		const existingId = getSingleExistingId(existing.llmConfigIdsByName, config.name);
		const issues: string[] = [];
		const hasDuplicateImportedName = (bundleLookups.llmConfigNameCounts.get(config.name) || 0) > 1;
		const hasAmbiguousExistingName = isAmbiguousName(existing.llmConfigIdsByName, config.name);
		const allowedDecisions: ImportResolutionDecision[] | undefined =
			hasAmbiguousExistingName || (existingId !== undefined && hasDuplicateImportedName)
				? ['skip', 'create_new']
				: undefined;

		if (hasAmbiguousExistingName) {
			issues.push(`Ambiguous existing LLM config name: ${config.name}`);
		}

		return createItem(
			buildLLMConfigItemKey(config),
			ExportableDataType.LLM_CONFIGS,
			formatLLMConfigEntityName(config, hasDuplicateImportedName),
			existingId,
			Array.from(new Set(issues)),
			allowedDecisions,
			hasAmbiguousExistingName ? 'conflict' : undefined
		);
	});
};

const buildAnalysisItems = (
	bundle: ExportBundle,
	existing: ExistingLookups,
	bundleLookups: BundleLookups
): AnalysisItem[] => [
	...analyzeRequestTemplates(bundle, existing, bundleLookups),
	...analyzeResponseMaps(bundle, existing, bundleLookups),
	...analyzeLlmConfigs(bundle, existing, bundleLookups),
	...analyzeAgents(bundle, existing, bundleLookups),
	...analyzeConversations(bundle, existing, bundleLookups),
	...analyzeSuites(bundle, existing, bundleLookups)
];

const calculateTotals = (items: AnalysisItem[]): AnalysisReport['totals'] => {
	return items.reduce(
		(acc, item) => {
			if (item.status === 'new') {
				acc.new += 1;
			} else if (item.status === 'conflict') {
				acc.conflict += 1;
			} else if (item.status === 'dependency_missing') {
				acc.dependency_missing += 1;
			}
			return acc;
		},
		{ new: 0, conflict: 0, dependency_missing: 0 }
	);
};

const buildAnalysisReport = (
	bundle: ExportBundle,
	existing: ExistingLookups,
	availableItemKeys?: Set<string>
): AnalysisReport => {
	const items = buildAnalysisItems(bundle, existing, createBundleLookups(bundle, availableItemKeys));
	const totals = calculateTotals(items);
	return {
		items,
		totals,
		has_issues: totals.conflict > 0 || totals.dependency_missing > 0
	};
};

const getDefaultResolutionDecision = (status: AnalysisStatus): ImportResolutionDecision =>
	status === 'new' ? 'create_new' : 'skip';

const getAnalysisDecision = (
	item: AnalysisItem,
	resolutions: Record<string, ImportResolution>
): ImportResolutionDecision => resolutions[item.item_key]?.decision || getDefaultResolutionDecision(item.status);

const createAvailableItemKeys = (report: AnalysisReport, resolutions: Record<string, ImportResolution>): Set<string> =>
	new Set(
		report.items
			.filter((item) => getAnalysisDecision(item, resolutions) !== 'skip' && item.status !== 'dependency_missing')
			.map((item) => item.item_key)
	);

const areSetsEqual = (left: Set<string>, right: Set<string>): boolean => {
	if (left.size !== right.size) {
		return false;
	}
	for (const value of left) {
		if (!right.has(value)) {
			return false;
		}
	}
	return true;
};

export const analyzeImportBundle = (
	bundle: ExportBundle,
	resolutions?: Record<string, ImportResolution>
): AnalysisReport => {
	const existing = createExistingLookups();
	const initialReport = buildAnalysisReport(bundle, existing);
	if (!resolutions) {
		return initialReport;
	}

	let availableItemKeys = createAvailableItemKeys(initialReport, resolutions);

	while (true) {
		const report = buildAnalysisReport(bundle, existing, availableItemKeys);
		const nextAvailableItemKeys = createAvailableItemKeys(report, resolutions);
		if (areSetsEqual(availableItemKeys, nextAvailableItemKeys)) {
			return report;
		}
		availableItemKeys = nextAvailableItemKeys;
	}
};
