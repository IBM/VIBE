import type { ExportBundle } from '@ibm-vibe/types';
import {
	buildAgentItemKey,
	buildConversationItemKey,
	buildConversationReferenceKey,
	buildLLMConfigItemKey,
	buildRequestTemplateItemKey,
	buildResponseMapItemKey,
	buildSuiteItemKey,
	buildSuiteReferenceKey
} from './identity';

const registerItemKey = (itemKeys: Map<string, string>, itemKey: string, entityLabel: string): string | undefined => {
	const existing = itemKeys.get(itemKey);
	if (existing) {
		return `Duplicate bundle item identity detected for ${entityLabel} and ${existing}`;
	}
	itemKeys.set(itemKey, entityLabel);
	return undefined;
};

export const validateBundleSemantics = (bundle: ExportBundle): string | undefined => {
	const itemKeys = new Map<string, string>();
	const conversationByReferenceKey = new Map<string, NonNullable<ExportBundle['data']['conversations']>[number]>();
	const suiteByReferenceKey = new Map<string, NonNullable<ExportBundle['data']['test_suites']>[number]>();

	for (const agent of bundle.data.agents || []) {
		const duplicateKeyError = registerItemKey(
			itemKeys,
			buildAgentItemKey(agent),
			`agent "${agent.name}@${agent.version}"`
		);
		if (duplicateKeyError) {
			return duplicateKeyError;
		}
	}

	for (const conversation of bundle.data.conversations || []) {
		const canonicalReferenceKey = buildConversationReferenceKey(conversation);
		if (conversation.reference_key && conversation.reference_key !== canonicalReferenceKey) {
			return `Conversation "${conversation.name}" has an invalid reference key`;
		}
		const duplicateKeyError = registerItemKey(
			itemKeys,
			buildConversationItemKey(conversation),
			`conversation "${conversation.name}"`
		);
		if (duplicateKeyError) {
			return duplicateKeyError;
		}
		conversationByReferenceKey.set(canonicalReferenceKey, conversation);
	}

	for (const suite of bundle.data.test_suites || []) {
		const canonicalReferenceKey = buildSuiteReferenceKey(suite);
		if (suite.reference_key && suite.reference_key !== canonicalReferenceKey) {
			return `Suite "${suite.name}" has an invalid reference key`;
		}
		const duplicateKeyError = registerItemKey(itemKeys, buildSuiteItemKey(suite), `suite "${suite.name}"`);
		if (duplicateKeyError) {
			return duplicateKeyError;
		}
		suiteByReferenceKey.set(canonicalReferenceKey, suite);
	}

	for (const config of bundle.data.llm_configs || []) {
		const duplicateKeyError = registerItemKey(
			itemKeys,
			buildLLMConfigItemKey(config),
			`LLM config "${config.name}"`
		);
		if (duplicateKeyError) {
			return duplicateKeyError;
		}
	}

	for (const template of bundle.data.request_templates || []) {
		const duplicateKeyError = registerItemKey(
			itemKeys,
			buildRequestTemplateItemKey(template),
			`request template "${template.name}"`
		);
		if (duplicateKeyError) {
			return duplicateKeyError;
		}
	}

	for (const responseMap of bundle.data.response_maps || []) {
		const duplicateKeyError = registerItemKey(
			itemKeys,
			buildResponseMapItemKey(responseMap),
			`response map "${responseMap.name}"`
		);
		if (duplicateKeyError) {
			return duplicateKeyError;
		}
	}

	for (const suite of bundle.data.test_suites || []) {
		for (const entry of suite.entries || []) {
			const hasConversationTarget = !!entry.conversation_name || !!entry.conversation_reference_key;
			const hasChildSuiteTarget = !!entry.child_suite_name || !!entry.child_suite_reference_key;

			if (!hasConversationTarget && !hasChildSuiteTarget) {
				return `Suite "${suite.name}" entry #${entry.sequence} must reference a conversation or child suite`;
			}

			if (entry.conversation_reference_key) {
				const referencedConversation = conversationByReferenceKey.get(entry.conversation_reference_key);
				if (!referencedConversation) {
					return `Suite "${suite.name}" entry #${entry.sequence} references a conversation that is not present in the bundle`;
				}
				if (entry.conversation_name && entry.conversation_name !== referencedConversation.name) {
					return `Suite "${suite.name}" entry #${entry.sequence} has a mismatched conversation name and reference key`;
				}
			}

			if (entry.child_suite_reference_key) {
				const referencedSuite = suiteByReferenceKey.get(entry.child_suite_reference_key);
				if (!referencedSuite) {
					return `Suite "${suite.name}" entry #${entry.sequence} references a child suite that is not present in the bundle`;
				}
				if (entry.child_suite_name && entry.child_suite_name !== referencedSuite.name) {
					return `Suite "${suite.name}" entry #${entry.sequence} has a mismatched child suite name and reference key`;
				}
			}
		}
	}

	return undefined;
};
