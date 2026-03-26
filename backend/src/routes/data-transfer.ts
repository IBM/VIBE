import { Router } from 'express';
import type { Request, Response } from 'express';
import type { ExportBundle, ImportResolution } from '@ibm-vibe/types';
import { ExportableDataType } from '@ibm-vibe/types';
import { asyncHandler } from '../lib/asyncHandler';
import { logError } from '../lib/logger';
import { buildExportBundle } from '../services/data-transfer/export';
import { analyzeImportBundle } from '../services/data-transfer/analyze';
import { executeImportBundle, ImportValidationError } from '../services/data-transfer/execute';
import { validateBundleSemantics } from '../services/data-transfer/validate';

const router = Router();

const SUPPORTED_EXPORT_BUNDLE_VERSION = 1;
const exportTypeValues = Object.values(ExportableDataType);
const importResolutionDecisionValues = new Set(['skip', 'overwrite', 'create_new']);

const parseExportTypes = (typesQuery: unknown): { types?: ExportableDataType[]; invalid?: string[] } => {
	if (typeof typesQuery !== 'string' || !typesQuery.trim()) {
		return {};
	}

	const parsed = typesQuery
		.split(',')
		.map((value) => value.trim())
		.filter((value) => value.length > 0);

	const invalid = parsed.filter((value) => !exportTypeValues.includes(value as ExportableDataType));
	if (invalid.length > 0) {
		return { invalid };
	}

	return { types: parsed as ExportableDataType[] };
};

const isRecord = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);

const isOptionalString = (value: unknown): boolean => value === undefined || typeof value === 'string';

const isOptionalBoolean = (value: unknown): boolean => value === undefined || typeof value === 'boolean';

const isOptionalNumberOrNull = (value: unknown): boolean => (
	value === undefined || value === null || typeof value === 'number'
);

const isOptionalArrayOf = (value: unknown, predicate: (item: unknown) => boolean): boolean => (
	value === undefined || (Array.isArray(value) && value.every(predicate))
);

const isConversationRole = (value: unknown): boolean => value === 'user' || value === 'system';

const isValidAgentTemplateLink = (value: unknown): boolean => (
	isRecord(value)
	&& typeof value.template_name === 'string'
	&& isOptionalBoolean(value.is_default)
);

const isValidAgentResponseMapLink = (value: unknown): boolean => (
	isRecord(value)
	&& typeof value.response_map_name === 'string'
	&& isOptionalBoolean(value.is_default)
);

const isValidAgent = (value: unknown): boolean => (
	isRecord(value)
	&& typeof value.name === 'string'
	&& typeof value.version === 'string'
	&& typeof value.prompt === 'string'
	&& typeof value.settings === 'string'
	&& isOptionalArrayOf(value.linked_templates, isValidAgentTemplateLink)
	&& isOptionalArrayOf(value.linked_response_maps, isValidAgentResponseMapLink)
);

const isValidConversationMessage = (value: unknown): boolean => (
	isRecord(value)
	&& typeof value.sequence === 'number'
	&& isConversationRole(value.role)
	&& typeof value.content === 'string'
	&& isOptionalString(value.metadata)
	&& isOptionalString(value.request_template_name)
	&& isOptionalString(value.response_map_name)
	&& isOptionalString(value.set_variables)
);

const isValidConversationTurnTarget = (value: unknown): boolean => (
	isRecord(value)
	&& typeof value.user_sequence === 'number'
	&& typeof value.target_reply === 'string'
	&& isOptionalNumberOrNull(value.threshold)
	&& isOptionalNumberOrNull(value.weight)
);

const isValidConversation = (value: unknown): boolean => (
	isRecord(value)
	&& typeof value.name === 'string'
	&& isOptionalString(value.reference_key)
	&& isOptionalString(value.description)
	&& isOptionalString(value.tags)
	&& isOptionalString(value.variables)
	&& isOptionalString(value.required_request_template_capabilities)
	&& isOptionalString(value.required_response_map_capabilities)
	&& isOptionalBoolean(value.stop_on_failure)
	&& isOptionalArrayOf(value.messages, isValidConversationMessage)
	&& isOptionalArrayOf(value.turn_targets, isValidConversationTurnTarget)
);

const isValidSuiteEntry = (value: unknown): boolean => (
	isRecord(value)
	&& typeof value.sequence === 'number'
	&& isOptionalString(value.conversation_name)
	&& isOptionalString(value.conversation_reference_key)
	&& isOptionalString(value.child_suite_name)
	&& isOptionalString(value.child_suite_reference_key)
	&& isOptionalString(value.agent_override_name)
	&& isOptionalString(value.agent_override_version)
);

const isValidTestSuite = (value: unknown): boolean => (
	isRecord(value)
	&& typeof value.name === 'string'
	&& isOptionalString(value.reference_key)
	&& isOptionalString(value.description)
	&& isOptionalString(value.tags)
	&& isOptionalArrayOf(value.entries, isValidSuiteEntry)
);

const isValidLlmConfig = (value: unknown): boolean => (
	isRecord(value)
	&& typeof value.name === 'string'
	&& typeof value.provider === 'string'
	&& typeof value.config === 'string'
	&& typeof value.priority === 'number'
);

const isValidRequestTemplate = (value: unknown): boolean => (
	isRecord(value)
	&& typeof value.name === 'string'
	&& typeof value.body === 'string'
	&& isOptionalString(value.description)
	&& isOptionalString(value.capability)
);

const isValidResponseMap = (value: unknown): boolean => (
	isRecord(value)
	&& typeof value.name === 'string'
	&& typeof value.spec === 'string'
	&& isOptionalString(value.description)
	&& isOptionalString(value.capability)
);

const isValidBundleData = (value: unknown): boolean => (
	isRecord(value)
	&& isOptionalArrayOf(value.agents, isValidAgent)
	&& isOptionalArrayOf(value.conversations, isValidConversation)
	&& isOptionalArrayOf(value.test_suites, isValidTestSuite)
	&& isOptionalArrayOf(value.llm_configs, isValidLlmConfig)
	&& isOptionalArrayOf(value.request_templates, isValidRequestTemplate)
	&& isOptionalArrayOf(value.response_maps, isValidResponseMap)
);

const isValidBundle = (bundle: unknown): bundle is ExportBundle => (
	isRecord(bundle)
	&& typeof bundle.version === 'number'
	&& typeof bundle.exported_at === 'string'
	&& isOptionalString(bundle.instance_name)
	&& isValidBundleData(bundle.data)
);

const isResolutionMap = (resolutions: unknown): resolutions is Record<string, ImportResolution> => {
	return isRecord(resolutions) && Object.entries(resolutions).every(([key, value]) => (
		isRecord(value)
		&& typeof value.item_key === 'string'
		&& value.item_key === key
		&& typeof value.decision === 'string'
		&& importResolutionDecisionValues.has(value.decision)
		&& isOptionalString(value.new_name)
		&& isOptionalString(value.new_version)
	));
};

const isImportValidationError = (error: unknown): error is ImportValidationError => (
	error instanceof ImportValidationError
		|| (error instanceof Error && error.name === 'ImportValidationError')
);

router.get('/export', asyncHandler(async (req: Request, res: Response) => {
	try {
		const parsed = parseExportTypes(req.query.types);
		if (parsed.invalid && parsed.invalid.length > 0) {
			return res.status(400).json({ error: `Invalid export types: ${parsed.invalid.join(', ')}` });
		}
		if (!parsed.types || parsed.types.length === 0) {
			return res.status(400).json({ error: 'At least one export type must be provided' });
		}

		const instanceName = process.env.NEXT_PUBLIC_INSTANCE_NAME || process.env.INSTANCE_NAME || 'backend';
		const bundle = buildExportBundle(parsed.types, instanceName);
		return res.json(bundle);
	} catch (error) {
		logError('Error exporting data:', error);
		return res.status(500).json({ error: 'Failed to export data' });
	}
}));

router.post('/analyze', asyncHandler(async (req: Request, res: Response) => {
	try {
		const { bundle, resolutions } = req.body as { bundle?: unknown; resolutions?: unknown };
		if (!isValidBundle(bundle)) {
			return res.status(400).json({ error: 'Invalid bundle payload' });
		}
		if (bundle.version !== SUPPORTED_EXPORT_BUNDLE_VERSION) {
			return res.status(400).json({ error: `Unsupported bundle version: ${bundle.version}` });
		}
		const bundleValidationError = validateBundleSemantics(bundle);
		if (bundleValidationError) {
			return res.status(400).json({ error: bundleValidationError });
		}
		if (resolutions !== undefined && !isResolutionMap(resolutions)) {
			return res.status(400).json({ error: 'Invalid resolutions payload' });
		}

		const report = analyzeImportBundle(bundle, resolutions);
		return res.json(report);
	} catch (error) {
		logError('Error analyzing import bundle:', error);
		return res.status(500).json({ error: 'Failed to analyze import bundle' });
	}
}));

router.post('/import', asyncHandler(async (req: Request, res: Response) => {
	try {
		const payload = req.body as { bundle?: unknown; resolutions?: unknown };
		if (!isValidBundle(payload.bundle) || !isResolutionMap(payload.resolutions)) {
			return res.status(400).json({ error: 'Invalid import payload' });
		}
		if (payload.bundle.version !== SUPPORTED_EXPORT_BUNDLE_VERSION) {
			return res.status(400).json({ error: `Unsupported bundle version: ${payload.bundle.version}` });
		}
		const bundleValidationError = validateBundleSemantics(payload.bundle);
		if (bundleValidationError) {
			return res.status(400).json({ error: bundleValidationError });
		}

		const summary = executeImportBundle({
			bundle: payload.bundle,
			resolutions: payload.resolutions
		});
		return res.json(summary);
	} catch (error) {
		if (isImportValidationError(error)) {
			return res.status(400).json({ error: error.message });
		}
		logError('Error executing import bundle:', error);
		return res.status(500).json({ error: 'Failed to execute import bundle' });
	}
}));

export default router;

