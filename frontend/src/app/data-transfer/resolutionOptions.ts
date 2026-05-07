import type { AnalysisItem, ImportResolutionDecision } from '@ibm-vibe/types';

export const getDefaultResolutionDecision = (status: AnalysisItem['status']): ImportResolutionDecision => {
	if (status === 'new') {
		return 'create_new';
	}
	if (status === 'conflict') {
		return 'skip';
	}
	return 'skip';
};

export const getAllowedResolutionDecisions = (
	item: Pick<AnalysisItem, 'status' | 'allowed_decisions'>
): ImportResolutionDecision[] => {
	if (item.allowed_decisions) {
		return item.allowed_decisions;
	}
	if (item.status === 'new') {
		return ['skip', 'create_new'];
	}
	if (item.status === 'conflict') {
		return ['skip', 'overwrite', 'create_new'];
	}
	return ['skip'];
};

export const formatResolutionDecision = (decision: ImportResolutionDecision): string =>
	decision === 'create_new' ? 'Create new' : decision.charAt(0).toUpperCase() + decision.slice(1);
