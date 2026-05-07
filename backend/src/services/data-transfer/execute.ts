import type { ImportRequest, ImportResultSummary } from '@ibm-vibe/types';
import db from '../../db/database';
import { createSummary } from './execute-helpers';
import {
	importAgents,
	importConversations,
	importLlmConfigs,
	importPendingSuiteEntries,
	importRequestTemplates,
	importResponseMaps,
	importSuites
} from './execute-phases';
import { createImportExecutionState, loadExistingState, seedImportExecutionLookups } from './execute-state';
import { assertImportPlanExecutable, buildImportPlan } from './import-plan';

export { ImportValidationError } from './execute-helpers';

export const executeImportBundle = (request: ImportRequest): ImportResultSummary => {
	const summary = createSummary();

	const runImport = db.transaction(() => {
		const plan = buildImportPlan(request);
		assertImportPlanExecutable(plan);
		const planByItemKey = new Map(plan.items.map((item) => [item.item_key, item]));
		const state = createImportExecutionState(request);
		const existing = loadExistingState();
		seedImportExecutionLookups(state, existing);

		const context = {
			request,
			summary,
			planByItemKey,
			state,
			existing
		};

		importRequestTemplates(context);
		importResponseMaps(context);
		importLlmConfigs(context);
		importAgents(context);
		importConversations(context);
		importSuites(context);
		importPendingSuiteEntries({
			summary,
			state
		});
	});

	runImport();
	return summary;
};
