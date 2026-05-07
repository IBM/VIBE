import type {
	AnalysisItem,
	ExportableDataType as ExportableDataTypeType,
	ImportRequest,
	ImportResolution,
	ImportResolutionDecision,
	ImportResultSummary
} from '@ibm-vibe/types';
import { analyzeImportBundle } from './analyze';
import { getAllowedResolutionDecisions } from './identity';

export type MutableSummary = ImportResultSummary;
export type NameToIds = Map<string, number[]>;

export class ImportValidationError extends Error {
	constructor(message: string) {
		super(message);
		this.name = 'ImportValidationError';
	}
}

export const createSummary = (): MutableSummary => ({
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

export const getResolution = (
	resolutions: Record<string, ImportResolution>,
	itemKey: string,
	status: AnalysisItem['status']
): ImportResolution => (
	resolutions[itemKey] || { item_key: itemKey, decision: getDefaultDecision(status) }
);

export const resolveCreatedName = (
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

export const pushSummaryItem = (
	summary: MutableSummary,
	itemKey: string,
	entityType: ExportableDataTypeType,
	entityName: string,
	action: ImportResultSummary['items'][number]['action'],
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

export const resolveAgentVersion = (
	originalVersion: string,
	resolution?: ImportResolution
): string => resolution?.new_version || originalVersion;

export const addToNameLookup = (
	lookup: NameToIds,
	name: string,
	id: number | undefined
): void => {
	if (id === undefined) {
		return;
	}
	const ids = lookup.get(name) || [];
	if (!ids.includes(id)) {
		ids.push(id);
	}
	lookup.set(name, ids);
};

export const countByName = (names: string[]): Map<string, number> => (
	names.reduce<Map<string, number>>((acc, name) => {
		acc.set(name, (acc.get(name) || 0) + 1);
		return acc;
	}, new Map())
);

export const getUniqueId = (
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

export const getRequiredLookupId = (
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

export const validateImportRequest = (request: ImportRequest): Map<string, AnalysisItem> => {
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
