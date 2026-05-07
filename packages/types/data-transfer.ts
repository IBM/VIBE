import { z } from 'zod';
import { EXPORT_BUNDLE_VERSION, IMPORT_RESOLUTION_DECISIONS, type ExportBundle } from './index';

const optionalStringSchema = z.string().optional();
const optionalBooleanSchema = z.boolean().optional();
const optionalNumberOrNullSchema = z.number().nullable().optional();

export const exportedAgentTemplateLinkSchema = z.object({
	template_name: z.string(),
	is_default: optionalBooleanSchema
});

export const exportedAgentResponseMapLinkSchema = z.object({
	response_map_name: z.string(),
	is_default: optionalBooleanSchema
});

export const exportedAgentSchema = z.object({
	name: z.string(),
	version: z.string(),
	prompt: z.string(),
	settings: z.string(),
	linked_templates: z.array(exportedAgentTemplateLinkSchema).optional(),
	linked_response_maps: z.array(exportedAgentResponseMapLinkSchema).optional()
});

export const exportedConversationMessageSchema = z.object({
	sequence: z.number(),
	role: z.enum(['user', 'system']),
	content: z.string(),
	metadata: optionalStringSchema,
	request_template_name: optionalStringSchema,
	response_map_name: optionalStringSchema,
	set_variables: optionalStringSchema
});

export const exportedConversationTurnTargetSchema = z.object({
	user_sequence: z.number(),
	target_reply: z.string(),
	threshold: optionalNumberOrNullSchema,
	weight: optionalNumberOrNullSchema
});

export const exportedConversationSchema = z.object({
	name: z.string(),
	reference_key: optionalStringSchema,
	description: optionalStringSchema,
	tags: optionalStringSchema,
	variables: optionalStringSchema,
	required_request_template_capabilities: optionalStringSchema,
	required_response_map_capabilities: optionalStringSchema,
	stop_on_failure: optionalBooleanSchema,
	messages: z.array(exportedConversationMessageSchema).optional(),
	turn_targets: z.array(exportedConversationTurnTargetSchema).optional()
});

export const exportedSuiteEntrySchema = z.object({
	sequence: z.number(),
	conversation_name: optionalStringSchema,
	conversation_reference_key: optionalStringSchema,
	child_suite_name: optionalStringSchema,
	child_suite_reference_key: optionalStringSchema,
	agent_override_name: optionalStringSchema,
	agent_override_version: optionalStringSchema
});

export const exportedTestSuiteSchema = z.object({
	name: z.string(),
	reference_key: optionalStringSchema,
	description: optionalStringSchema,
	tags: optionalStringSchema,
	entries: z.array(exportedSuiteEntrySchema).optional()
});

export const exportedLlmConfigSchema = z.object({
	name: z.string(),
	provider: z.string(),
	config: z.string(),
	priority: z.number()
});

export const exportedRequestTemplateSchema = z.object({
	name: z.string(),
	description: optionalStringSchema,
	capability: optionalStringSchema,
	body: z.string()
});

export const exportedResponseMapSchema = z.object({
	name: z.string(),
	description: optionalStringSchema,
	capability: optionalStringSchema,
	spec: z.string()
});

export const exportBundleDataSchema = z.object({
	agents: z.array(exportedAgentSchema).optional(),
	conversations: z.array(exportedConversationSchema).optional(),
	test_suites: z.array(exportedTestSuiteSchema).optional(),
	llm_configs: z.array(exportedLlmConfigSchema).optional(),
	request_templates: z.array(exportedRequestTemplateSchema).optional(),
	response_maps: z.array(exportedResponseMapSchema).optional()
});

export const exportBundleSchema = z.object({
	version: z.number().int(),
	exported_at: z.string(),
	instance_name: optionalStringSchema,
	data: exportBundleDataSchema
});

export const importResolutionDecisionSchema = z.enum(IMPORT_RESOLUTION_DECISIONS);

export const importResolutionSchema = z.object({
	item_key: z.string(),
	decision: importResolutionDecisionSchema,
	new_name: optionalStringSchema,
	new_version: optionalStringSchema
});

export const importResolutionMapSchema = z.record(importResolutionSchema).superRefine((resolutions, ctx) => {
	for (const [itemKey, resolution] of Object.entries(resolutions)) {
		if (resolution.item_key !== itemKey) {
			ctx.addIssue({
				code: z.ZodIssueCode.custom,
				message: `Resolution key ${itemKey} must match item_key`
			});
		}
	}
});

export const analyzeImportRequestSchema = z.object({
	bundle: exportBundleSchema,
	resolutions: importResolutionMapSchema.optional()
});

export const executeImportRequestSchema = z.object({
	bundle: exportBundleSchema,
	resolutions: importResolutionMapSchema
});

export const parseExportBundle = (value: unknown) => exportBundleSchema.safeParse(value);

export const parseImportResolutionMap = (value: unknown) => importResolutionMapSchema.safeParse(value);

export const parseAnalyzeImportRequest = (value: unknown) => analyzeImportRequestSchema.safeParse(value);

export const parseExecuteImportRequest = (value: unknown) => executeImportRequestSchema.safeParse(value);

export const isSupportedExportBundleVersion = (bundle: Pick<ExportBundle, 'version'>): boolean =>
	bundle.version === EXPORT_BUNDLE_VERSION;
