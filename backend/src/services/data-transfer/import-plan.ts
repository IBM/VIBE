import type {
	AnalysisItem,
	ExportBundle,
	ExportedAgent,
	ExportedConversation,
	ExportedLLMConfig,
	ExportedRequestTemplate,
	ExportedResponseMap,
	ExportedTestSuite,
	ImportPlan,
	ImportPlanIssue,
	ImportPlanItem,
	ImportPlanTotals,
	ImportRequest,
	ImportResolution
} from '@ibm-vibe/types';
import { EXPORT_BUNDLE_VERSION, ExportableDataType } from '@ibm-vibe/types';
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
	formatSuiteEntityName,
	getAllowedResolutionDecisions
} from './identity';
import { ImportValidationError, getResolution, resolveAgentVersion, resolveCreatedName } from './execute-helpers';
import { loadExistingState, type ExistingState } from './execute-state';

type EntityWithId = { id?: number };

type BundleEntityLookups = {
	agents: Map<string, ExportedAgent>;
	requestTemplates: Map<string, ExportedRequestTemplate>;
	responseMaps: Map<string, ExportedResponseMap>;
	llmConfigs: Map<string, ExportedLLMConfig>;
	conversations: Map<string, ExportedConversation>;
	suites: Map<string, ExportedTestSuite>;
};

type PlannedIdentity = {
	itemKey: string;
	targetId?: number;
};

type PlannedIdentityMaps = {
	agents: Map<string, PlannedIdentity>;
	requestTemplates: Map<string, PlannedIdentity>;
	responseMaps: Map<string, PlannedIdentity>;
	llmConfigs: Map<string, PlannedIdentity>;
	conversations: Map<string, PlannedIdentity>;
	suites: Map<string, PlannedIdentity>;
};

type PlannedIdentityResult = {
	finalName?: string;
	finalVersion?: string;
	finalEntityName?: string;
	identityKey?: string;
	targetId?: number;
	issues: ImportPlanIssue[];
};

const createBundleEntityLookups = (bundle: ExportBundle): BundleEntityLookups => ({
	agents: new Map((bundle.data.agents || []).map((agent) => [buildAgentItemKey(agent), agent])),
	requestTemplates: new Map(
		(bundle.data.request_templates || []).map((template) => [buildRequestTemplateItemKey(template), template])
	),
	responseMaps: new Map(
		(bundle.data.response_maps || []).map((responseMap) => [buildResponseMapItemKey(responseMap), responseMap])
	),
	llmConfigs: new Map((bundle.data.llm_configs || []).map((config) => [buildLLMConfigItemKey(config), config])),
	conversations: new Map(
		(bundle.data.conversations || []).map((conversation) => [buildConversationItemKey(conversation), conversation])
	),
	suites: new Map((bundle.data.test_suites || []).map((suite) => [buildSuiteItemKey(suite), suite]))
});

const createPlannedIdentityMaps = (): PlannedIdentityMaps => ({
	agents: new Map(),
	requestTemplates: new Map(),
	responseMaps: new Map(),
	llmConfigs: new Map(),
	conversations: new Map(),
	suites: new Map()
});

const createIssue = (code: string, message: string, itemKey?: string): ImportPlanIssue => ({
	code,
	message,
	...(itemKey ? { item_key: itemKey } : {})
});

const getAllowedDecisions = (item: AnalysisItem) =>
	item.allowed_decisions || getAllowedResolutionDecisions(item.status);

const getSingleExisting = <T extends EntityWithId>(
	items: T[],
	itemKey: string,
	entityLabel: string
): { item?: T; issues: ImportPlanIssue[] } => {
	if (items.length === 1) {
		return { item: items[0], issues: [] };
	}
	if (items.length === 0) {
		return {
			issues: [createIssue('missing-overwrite-target', `Cannot overwrite missing ${entityLabel}`, itemKey)]
		};
	}
	return {
		issues: [createIssue('ambiguous-overwrite-target', `Cannot overwrite ambiguous ${entityLabel}`, itemKey)]
	};
};

const hasExistingOtherThan = <T extends EntityWithId>(items: T[], targetId?: number): boolean =>
	items.some((item) => item.id !== undefined && item.id !== targetId);

const checkPlannedCollision = (
	planned: Map<string, PlannedIdentity>,
	identityKey: string,
	itemKey: string,
	targetId: number | undefined,
	entityLabel: string
): ImportPlanIssue | undefined => {
	const existing = planned.get(identityKey);
	if (!existing || existing.itemKey === itemKey) {
		return undefined;
	}
	if (existing.targetId !== undefined && existing.targetId === targetId) {
		return createIssue(
			'duplicate-overwrite-target',
			`Multiple imported items target the same ${entityLabel}`,
			itemKey
		);
	}
	return createIssue(
		'planned-identity-collision',
		`Multiple imported items resolve to ${entityLabel}: ${identityKey}`,
		itemKey
	);
};

const rememberPlannedIdentity = (
	planned: Map<string, PlannedIdentity>,
	identityKey: string | undefined,
	itemKey: string,
	targetId: number | undefined
): void => {
	if (!identityKey) {
		return;
	}
	planned.set(identityKey, { itemKey, targetId });
};

const isExplicitFinalNameCollision = (
	resolution: ImportResolution,
	finalName: string,
	_originalName: string,
	isTaken: (candidate: string) => boolean
): boolean => !!resolution.new_name && isTaken(finalName);

const buildRequestTemplateIdentity = (
	template: ExportedRequestTemplate,
	item: AnalysisItem,
	resolution: ImportResolution,
	planned: PlannedIdentityMaps,
	existing: ExistingState
): PlannedIdentityResult => {
	const existingTemplate = existing.existingTemplatesByName.get(template.name);
	const targetId = resolution.decision === 'overwrite' ? existingTemplate?.id : undefined;
	const finalName =
		resolution.decision === 'create_new'
			? resolveCreatedName(
					template.name,
					resolution,
					(candidate) =>
						existing.existingTemplatesByName.has(candidate) || planned.requestTemplates.has(candidate)
				)
			: resolution.new_name || template.name;
	const issues: ImportPlanIssue[] = [];

	if (resolution.decision === 'overwrite' && !existingTemplate?.id) {
		issues.push(
			createIssue(
				'missing-overwrite-target',
				`Cannot overwrite missing request template: ${template.name}`,
				item.item_key
			)
		);
	}
	if (
		resolution.decision === 'create_new' &&
		isExplicitFinalNameCollision(
			resolution,
			finalName,
			template.name,
			(candidate) => existing.existingTemplatesByName.has(candidate) || planned.requestTemplates.has(candidate)
		)
	) {
		issues.push(
			createIssue('final-name-collision', `Request template name is already taken: ${finalName}`, item.item_key)
		);
	}
	const existingFinal = existing.existingTemplatesByName.get(finalName);
	if (resolution.decision === 'overwrite' && existingFinal?.id !== undefined && existingFinal.id !== targetId) {
		issues.push(
			createIssue('final-name-collision', `Request template name is already taken: ${finalName}`, item.item_key)
		);
	}
	const plannedCollision = checkPlannedCollision(
		planned.requestTemplates,
		finalName,
		item.item_key,
		targetId,
		'request template'
	);
	if (plannedCollision) {
		issues.push(plannedCollision);
	}

	return {
		finalName,
		finalEntityName: finalName,
		identityKey: finalName,
		targetId,
		issues
	};
};

const buildResponseMapIdentity = (
	responseMap: ExportedResponseMap,
	item: AnalysisItem,
	resolution: ImportResolution,
	planned: PlannedIdentityMaps,
	existing: ExistingState
): PlannedIdentityResult => {
	const existingResponseMap = existing.existingResponseMapsByName.get(responseMap.name);
	const targetId = resolution.decision === 'overwrite' ? existingResponseMap?.id : undefined;
	const finalName =
		resolution.decision === 'create_new'
			? resolveCreatedName(
					responseMap.name,
					resolution,
					(candidate) =>
						existing.existingResponseMapsByName.has(candidate) || planned.responseMaps.has(candidate)
				)
			: resolution.new_name || responseMap.name;
	const issues: ImportPlanIssue[] = [];

	if (resolution.decision === 'overwrite' && !existingResponseMap?.id) {
		issues.push(
			createIssue(
				'missing-overwrite-target',
				`Cannot overwrite missing response map: ${responseMap.name}`,
				item.item_key
			)
		);
	}
	if (
		resolution.decision === 'create_new' &&
		isExplicitFinalNameCollision(
			resolution,
			finalName,
			responseMap.name,
			(candidate) => existing.existingResponseMapsByName.has(candidate) || planned.responseMaps.has(candidate)
		)
	) {
		issues.push(
			createIssue('final-name-collision', `Response map name is already taken: ${finalName}`, item.item_key)
		);
	}
	const existingFinal = existing.existingResponseMapsByName.get(finalName);
	if (resolution.decision === 'overwrite' && existingFinal?.id !== undefined && existingFinal.id !== targetId) {
		issues.push(
			createIssue('final-name-collision', `Response map name is already taken: ${finalName}`, item.item_key)
		);
	}
	const plannedCollision = checkPlannedCollision(
		planned.responseMaps,
		finalName,
		item.item_key,
		targetId,
		'response map'
	);
	if (plannedCollision) {
		issues.push(plannedCollision);
	}

	return {
		finalName,
		finalEntityName: finalName,
		identityKey: finalName,
		targetId,
		issues
	};
};

const buildAgentIdentity = (
	agent: ExportedAgent,
	item: AnalysisItem,
	resolution: ImportResolution,
	planned: PlannedIdentityMaps,
	existing: ExistingState
): PlannedIdentityResult => {
	const originalNaturalKey = buildAgentNaturalKey(agent.name, agent.version);
	const existingAgent = existing.existingAgentsByNaturalKey.get(originalNaturalKey);
	const targetId = resolution.decision === 'overwrite' ? existingAgent?.id : undefined;
	const finalVersion = resolveAgentVersion(agent.version, resolution);
	const isTaken = (candidateName: string) =>
		existing.existingAgentsByNaturalKey.has(buildAgentNaturalKey(candidateName, finalVersion)) ||
		planned.agents.has(buildAgentNaturalKey(candidateName, finalVersion));
	const finalName =
		resolution.decision === 'create_new'
			? resolveCreatedName(agent.name, resolution, isTaken)
			: resolution.new_name || agent.name;
	const finalNaturalKey = buildAgentNaturalKey(finalName, finalVersion);
	const issues: ImportPlanIssue[] = [];

	if (resolution.decision === 'overwrite' && !existingAgent?.id) {
		issues.push(
			createIssue(
				'missing-overwrite-target',
				`Cannot overwrite missing agent: ${originalNaturalKey}`,
				item.item_key
			)
		);
	}
	if (
		resolution.decision === 'create_new' &&
		isExplicitFinalNameCollision(resolution, finalName, agent.name, isTaken)
	) {
		issues.push(
			createIssue(
				'final-identity-collision',
				`Agent identity is already taken: ${finalNaturalKey}`,
				item.item_key
			)
		);
	}
	const existingFinal = existing.existingAgentsByNaturalKey.get(finalNaturalKey);
	if (resolution.decision === 'overwrite' && existingFinal?.id !== undefined && existingFinal.id !== targetId) {
		issues.push(
			createIssue(
				'final-identity-collision',
				`Agent identity is already taken: ${finalNaturalKey}`,
				item.item_key
			)
		);
	}
	const plannedCollision = checkPlannedCollision(planned.agents, finalNaturalKey, item.item_key, targetId, 'agent');
	if (plannedCollision) {
		issues.push(plannedCollision);
	}

	return {
		finalName,
		finalVersion,
		finalEntityName: finalNaturalKey,
		identityKey: finalNaturalKey,
		targetId,
		issues
	};
};

const buildLlmConfigIdentity = (
	config: ExportedLLMConfig,
	item: AnalysisItem,
	resolution: ImportResolution,
	planned: PlannedIdentityMaps,
	existing: ExistingState
): PlannedIdentityResult => {
	const existingMatches = existing.existingLlmConfigsByName.get(config.name) || [];
	const existingResult =
		resolution.decision === 'overwrite'
			? getSingleExisting(existingMatches, item.item_key, `LLM config: ${config.name}`)
			: { item: undefined, issues: [] };
	const targetId = existingResult.item?.id;
	const finalName =
		resolution.decision === 'create_new'
			? resolveCreatedName(
					config.name,
					resolution,
					(candidate) =>
						(existing.existingLlmConfigsByName.get(candidate) || []).length > 0 ||
						planned.llmConfigs.has(candidate)
				)
			: resolution.new_name || config.name;
	const issues = [...existingResult.issues];

	if (
		resolution.decision === 'create_new' &&
		isExplicitFinalNameCollision(
			resolution,
			finalName,
			config.name,
			(candidate) =>
				(existing.existingLlmConfigsByName.get(candidate) || []).length > 0 || planned.llmConfigs.has(candidate)
		)
	) {
		issues.push(
			createIssue('final-name-collision', `LLM config name is already taken: ${finalName}`, item.item_key)
		);
	}
	if (
		resolution.decision === 'overwrite' &&
		hasExistingOtherThan(existing.existingLlmConfigsByName.get(finalName) || [], targetId)
	) {
		issues.push(
			createIssue('final-name-collision', `LLM config name is already taken: ${finalName}`, item.item_key)
		);
	}
	const plannedCollision = checkPlannedCollision(
		planned.llmConfigs,
		finalName,
		item.item_key,
		targetId,
		'LLM config'
	);
	if (plannedCollision) {
		issues.push(plannedCollision);
	}

	return {
		finalName,
		finalEntityName: finalName,
		identityKey: finalName,
		targetId,
		issues
	};
};

const buildConversationIdentity = (
	conversation: ExportedConversation,
	item: AnalysisItem,
	resolution: ImportResolution,
	planned: PlannedIdentityMaps,
	existing: ExistingState
): PlannedIdentityResult => {
	const existingMatches = existing.existingConversationsByName.get(conversation.name) || [];
	const existingResult =
		resolution.decision === 'overwrite'
			? getSingleExisting(existingMatches, item.item_key, `conversation: ${conversation.name}`)
			: { item: undefined, issues: [] };
	const targetId = existingResult.item?.id;
	const finalName =
		resolution.decision === 'create_new'
			? resolveCreatedName(
					conversation.name,
					resolution,
					(candidate) =>
						(existing.existingConversationsByName.get(candidate) || []).length > 0 ||
						planned.conversations.has(candidate)
				)
			: resolution.new_name || conversation.name;
	const issues = [...existingResult.issues];

	if (
		resolution.decision === 'create_new' &&
		isExplicitFinalNameCollision(
			resolution,
			finalName,
			conversation.name,
			(candidate) =>
				(existing.existingConversationsByName.get(candidate) || []).length > 0 ||
				planned.conversations.has(candidate)
		)
	) {
		issues.push(
			createIssue('final-name-collision', `Conversation name is already taken: ${finalName}`, item.item_key)
		);
	}
	if (
		resolution.decision === 'overwrite' &&
		hasExistingOtherThan(existing.existingConversationsByName.get(finalName) || [], targetId)
	) {
		issues.push(
			createIssue('final-name-collision', `Conversation name is already taken: ${finalName}`, item.item_key)
		);
	}
	const plannedCollision = checkPlannedCollision(
		planned.conversations,
		finalName,
		item.item_key,
		targetId,
		'conversation'
	);
	if (plannedCollision) {
		issues.push(plannedCollision);
	}

	return {
		finalName,
		finalEntityName: formatConversationEntityName({ ...conversation, name: finalName }, false),
		identityKey: finalName,
		targetId,
		issues
	};
};

const buildSuiteIdentity = (
	suite: ExportedTestSuite,
	item: AnalysisItem,
	resolution: ImportResolution,
	planned: PlannedIdentityMaps,
	existing: ExistingState
): PlannedIdentityResult => {
	const existingMatches = existing.existingSuitesByName.get(suite.name) || [];
	const existingResult =
		resolution.decision === 'overwrite'
			? getSingleExisting(existingMatches, item.item_key, `suite: ${suite.name}`)
			: { item: undefined, issues: [] };
	const targetId = existingResult.item?.id;
	const finalName =
		resolution.decision === 'create_new'
			? resolveCreatedName(
					suite.name,
					resolution,
					(candidate) =>
						(existing.existingSuitesByName.get(candidate) || []).length > 0 || planned.suites.has(candidate)
				)
			: resolution.new_name || suite.name;
	const issues = [...existingResult.issues];

	if (
		resolution.decision === 'create_new' &&
		isExplicitFinalNameCollision(
			resolution,
			finalName,
			suite.name,
			(candidate) =>
				(existing.existingSuitesByName.get(candidate) || []).length > 0 || planned.suites.has(candidate)
		)
	) {
		issues.push(createIssue('final-name-collision', `Suite name is already taken: ${finalName}`, item.item_key));
	}
	if (
		resolution.decision === 'overwrite' &&
		hasExistingOtherThan(existing.existingSuitesByName.get(finalName) || [], targetId)
	) {
		issues.push(createIssue('final-name-collision', `Suite name is already taken: ${finalName}`, item.item_key));
	}
	const plannedCollision = checkPlannedCollision(planned.suites, finalName, item.item_key, targetId, 'suite');
	if (plannedCollision) {
		issues.push(plannedCollision);
	}

	return {
		finalName,
		finalEntityName: formatSuiteEntityName({ ...suite, name: finalName }, false),
		identityKey: finalName,
		targetId,
		issues
	};
};

const buildIdentityResult = (
	item: AnalysisItem,
	resolution: ImportResolution,
	lookups: BundleEntityLookups,
	planned: PlannedIdentityMaps,
	existing: ExistingState
): PlannedIdentityResult => {
	if (item.entity_type === ExportableDataType.REQUEST_TEMPLATES) {
		const template = lookups.requestTemplates.get(item.item_key);
		return template
			? buildRequestTemplateIdentity(template, item, resolution, planned, existing)
			: { issues: [createIssue('missing-bundle-item', `Missing bundle item: ${item.item_key}`, item.item_key)] };
	}
	if (item.entity_type === ExportableDataType.RESPONSE_MAPS) {
		const responseMap = lookups.responseMaps.get(item.item_key);
		return responseMap
			? buildResponseMapIdentity(responseMap, item, resolution, planned, existing)
			: { issues: [createIssue('missing-bundle-item', `Missing bundle item: ${item.item_key}`, item.item_key)] };
	}
	if (item.entity_type === ExportableDataType.LLM_CONFIGS) {
		const config = lookups.llmConfigs.get(item.item_key);
		return config
			? buildLlmConfigIdentity(config, item, resolution, planned, existing)
			: { issues: [createIssue('missing-bundle-item', `Missing bundle item: ${item.item_key}`, item.item_key)] };
	}
	if (item.entity_type === ExportableDataType.AGENTS) {
		const agent = lookups.agents.get(item.item_key);
		return agent
			? buildAgentIdentity(agent, item, resolution, planned, existing)
			: { issues: [createIssue('missing-bundle-item', `Missing bundle item: ${item.item_key}`, item.item_key)] };
	}
	if (item.entity_type === ExportableDataType.CONVERSATIONS) {
		const conversation = lookups.conversations.get(item.item_key);
		return conversation
			? buildConversationIdentity(conversation, item, resolution, planned, existing)
			: { issues: [createIssue('missing-bundle-item', `Missing bundle item: ${item.item_key}`, item.item_key)] };
	}
	const suite = lookups.suites.get(item.item_key);
	return suite
		? buildSuiteIdentity(suite, item, resolution, planned, existing)
		: { issues: [createIssue('missing-bundle-item', `Missing bundle item: ${item.item_key}`, item.item_key)] };
};

const createNormalizedResolution = (
	itemKey: string,
	resolution: ImportResolution,
	identity: PlannedIdentityResult
): ImportResolution => ({
	item_key: itemKey,
	decision: resolution.decision,
	...(resolution.decision !== 'skip' && identity.finalName ? { new_name: identity.finalName } : {}),
	...(resolution.decision !== 'skip' && identity.finalVersion ? { new_version: identity.finalVersion } : {})
});

const createPlanItem = (
	item: AnalysisItem,
	resolution: ImportResolution,
	lookups: BundleEntityLookups,
	planned: PlannedIdentityMaps,
	existing: ExistingState
): { item: ImportPlanItem; resolution: ImportResolution; issues: ImportPlanIssue[] } => {
	const allowedDecisions = getAllowedDecisions(item);
	const analysisIssues = (item.issues || []).map((message) => createIssue('analysis-issue', message, item.item_key));
	const blockingIssues: ImportPlanIssue[] =
		resolution.decision === 'skip'
			? []
			: analysisIssues.filter((issue) => !issue.message.startsWith('Ambiguous existing '));
	const isDecisionAllowed = allowedDecisions.includes(resolution.decision);
	if (!isDecisionAllowed) {
		blockingIssues.push(
			createIssue(
				'invalid-decision',
				`Invalid decision "${resolution.decision}" for ${item.entity_type} "${item.entity_name}" with status ${item.status}`,
				item.item_key
			)
		);
	}

	const identity =
		resolution.decision === 'skip'
			? { issues: [] }
			: buildIdentityResult(item, resolution, lookups, planned, existing);
	blockingIssues.push(...identity.issues);

	const executable = resolution.decision === 'skip' || (isDecisionAllowed && blockingIssues.length === 0);
	const normalizedResolution = createNormalizedResolution(item.item_key, resolution, identity);
	const displayIssues = [...analysisIssues, ...blockingIssues];
	const planItem: ImportPlanItem = {
		...item,
		issues: displayIssues.length > 0 ? displayIssues.map((issue) => issue.message) : item.issues,
		allowed_decisions: allowedDecisions,
		selected_decision: resolution.decision,
		executable,
		action:
			resolution.decision === 'overwrite'
				? 'updated'
				: resolution.decision === 'create_new'
					? 'created'
					: 'skipped',
		...(identity.finalName ? { final_name: identity.finalName } : {}),
		...(identity.finalVersion ? { final_version: identity.finalVersion } : {}),
		...(identity.finalEntityName ? { final_entity_name: identity.finalEntityName } : {})
	};

	if (executable && resolution.decision !== 'skip') {
		const plannedMap =
			item.entity_type === ExportableDataType.REQUEST_TEMPLATES
				? planned.requestTemplates
				: item.entity_type === ExportableDataType.RESPONSE_MAPS
					? planned.responseMaps
					: item.entity_type === ExportableDataType.LLM_CONFIGS
						? planned.llmConfigs
						: item.entity_type === ExportableDataType.AGENTS
							? planned.agents
							: item.entity_type === ExportableDataType.CONVERSATIONS
								? planned.conversations
								: planned.suites;
		rememberPlannedIdentity(plannedMap, identity.identityKey, item.item_key, identity.targetId);
	}

	return { item: planItem, resolution: normalizedResolution, issues: blockingIssues };
};

const calculatePlanTotals = (items: ImportPlanItem[]): ImportPlanTotals => {
	return items.reduce<ImportPlanTotals>(
		(acc, item) => {
			if (item.status === 'new') acc.new += 1;
			if (item.status === 'conflict') acc.conflict += 1;
			if (item.status === 'dependency_missing') acc.dependency_missing += 1;
			if (item.selected_decision !== 'skip') acc.selected += 1;
			if (item.executable) acc.executable += 1;
			if (!item.executable) acc.blocked += 1;
			if (item.selected_decision === 'create_new') acc.create_new += 1;
			if (item.selected_decision === 'overwrite') acc.overwrite += 1;
			if (item.selected_decision === 'skip') acc.skip += 1;
			return acc;
		},
		{
			new: 0,
			conflict: 0,
			dependency_missing: 0,
			selected: 0,
			executable: 0,
			blocked: 0,
			create_new: 0,
			overwrite: 0,
			skip: 0
		}
	);
};

export const buildImportPlan = (request: ImportRequest): ImportPlan => {
	const analysisReport = analyzeImportBundle(request.bundle, request.resolutions);
	const lookups = createBundleEntityLookups(request.bundle);
	const existing = loadExistingState();
	const planned = createPlannedIdentityMaps();
	const resolutions: Record<string, ImportResolution> = {};
	const issues: ImportPlanIssue[] = [];

	const items = analysisReport.items.map((analysisItem) => {
		const resolution = getResolution(request.resolutions, analysisItem.item_key, analysisItem.status);
		const result = createPlanItem(analysisItem, resolution, lookups, planned, existing);
		resolutions[analysisItem.item_key] = result.resolution;
		issues.push(...result.issues);
		return result.item;
	});

	const totals = calculatePlanTotals(items);
	return {
		version: EXPORT_BUNDLE_VERSION,
		generated_at: new Date().toISOString(),
		items,
		totals,
		has_issues: analysisReport.has_issues || issues.length > 0,
		executable: totals.blocked === 0,
		issues,
		resolutions
	};
};

export const assertImportPlanExecutable = (plan: ImportPlan): void => {
	if (plan.executable) {
		return;
	}
	const firstIssue = plan.issues[0];
	throw new ImportValidationError(firstIssue?.message || 'Import plan is not executable');
};
