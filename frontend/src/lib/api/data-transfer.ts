import type {
	AnalysisReport,
	ExportBundle,
	ExportableDataType,
	ImportResolution,
	ImportRequest,
	ImportResultSummary
} from '@ibm-vibe/types';
import { API_URL, fetchJson } from './fetchJson';

export const dataTransferApi = {
	async exportData(types: ExportableDataType[]): Promise<ExportBundle> {
		const serializedTypes = types.join(',');
		return fetchJson<ExportBundle>(
			`${API_URL}/api/data-transfer/export?types=${serializedTypes}`,
			undefined,
			'Failed to export data'
		);
	},

	async analyzeImport(
		bundle: ExportBundle,
		resolutions?: Record<string, ImportResolution>
	): Promise<AnalysisReport> {
		return fetchJson<AnalysisReport>(
			`${API_URL}/api/data-transfer/analyze`,
			{
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					bundle,
					...(resolutions ? { resolutions } : {})
				})
			},
			'Failed to analyze import bundle'
		);
	},

	async executeImport(request: ImportRequest): Promise<ImportResultSummary> {
		return fetchJson<ImportResultSummary>(
			`${API_URL}/api/data-transfer/import`,
			{
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(request)
			},
			'Failed to execute import'
		);
	}
};

