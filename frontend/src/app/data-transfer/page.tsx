'use client';

import React, { useMemo, useRef, useState } from 'react';
import {
	Button,
	Checkbox,
	InlineLoading,
	InlineNotification
} from '@carbon/react';
import type {
	AnalysisReport,
	ExportBundle,
	ExportableDataType as ExportableDataTypeType,
	ImportRequest,
	ImportResolution,
	ImportResolutionDecision,
	ImportResultSummary
} from '@ibm-vibe/types';
import { ExportableDataType } from '@ibm-vibe/types';
import { api } from '../../lib/api';
import ImportReviewTable from './ImportReviewTable';
import {
	getAllowedResolutionDecisions,
	getDefaultResolutionDecision
} from './resolutionOptions';
import styles from './page.module.scss';

const STORAGE_KEY = 'vibe:export-preferences';

const exportTypeOptions: Array<{ value: ExportableDataTypeType; label: string }> = [
	{ value: ExportableDataType.AGENTS, label: 'Agents' },
	{ value: ExportableDataType.CONVERSATIONS, label: 'Conversations' },
	{ value: ExportableDataType.TEST_SUITES, label: 'Test suites' },
	{ value: ExportableDataType.LLM_CONFIGS, label: 'LLM configs' },
	{ value: ExportableDataType.REQUEST_TEMPLATES, label: 'Request templates' },
	{ value: ExportableDataType.RESPONSE_MAPS, label: 'Response maps' }
];

const allExportTypes = exportTypeOptions.map((option) => option.value);

const getStoredSelectedTypes = (): ExportableDataTypeType[] => {
	if (typeof window === 'undefined') {
		return allExportTypes;
	}
	const raw = window.localStorage.getItem(STORAGE_KEY);
	if (!raw) {
		return allExportTypes;
	}

	try {
		const parsed = JSON.parse(raw);
		if (!Array.isArray(parsed)) {
			return allExportTypes;
		}

		const valid = parsed.filter((value): value is ExportableDataTypeType => (
			allExportTypes.includes(value as ExportableDataTypeType)
		));
		return valid.length > 0 ? valid : allExportTypes;
	} catch {
		return allExportTypes;
	}
};

const toResolutionPayload = (
	decisions: Record<string, ImportResolutionDecision>
): Record<string, ImportResolution> => (
	Object.fromEntries(
		Object.entries(decisions).map(([itemKey, decision]) => [
			itemKey,
			{
				item_key: itemKey,
				decision
			}
		])
	)
);

const reconcileResolutions = (
	report: AnalysisReport,
	draft: Record<string, ImportResolutionDecision> = {}
): Record<string, ImportResolutionDecision> => {
	const next: Record<string, ImportResolutionDecision> = {};

	for (const item of report.items) {
		const preferredDecision = draft[item.item_key];
		const allowedDecisions = getAllowedResolutionDecisions(item);
		next[item.item_key] = preferredDecision && allowedDecisions.includes(preferredDecision)
			? preferredDecision
			: getDefaultResolutionDecision(item.status);
	}

	return next;
};

const toFileName = (): string => {
	const date = new Date();
	const yyyy = date.getFullYear();
	const mm = String(date.getMonth() + 1).padStart(2, '0');
	const dd = String(date.getDate()).padStart(2, '0');
	return `vibe-export-${yyyy}-${mm}-${dd}.json`;
};

const readFileAsText = async (file: File): Promise<string> => {
	const fileWithText = file as File & { text?: () => Promise<string> };
	if (typeof fileWithText.text === 'function') {
		return fileWithText.text();
	}

	return new Promise((resolve, reject) => {
		const reader = new FileReader();
		reader.onload = () => resolve(String(reader.result ?? ''));
		reader.onerror = () => reject(new Error('Failed to read selected file'));
		reader.readAsText(file);
	});
};

const downloadBundle = (bundle: ExportBundle): void => {
	if (typeof window === 'undefined') {
		return;
	}

	const text = JSON.stringify(bundle, null, 2);
	const blob = new Blob([text], { type: 'application/json' });
	if (typeof window.URL?.createObjectURL !== 'function') {
		return;
	}

	const url = window.URL.createObjectURL(blob);
	const anchor = document.createElement('a');
	anchor.href = url;
	anchor.download = toFileName();
	document.body.appendChild(anchor);
	anchor.click();
	document.body.removeChild(anchor);
	window.URL.revokeObjectURL(url);
};

export default function DataTransferPage() {
	const [activeTab, setActiveTab] = useState(0);
	const [selectedTypes, setSelectedTypes] = useState<ExportableDataTypeType[]>(() => getStoredSelectedTypes());
	const [isExporting, setIsExporting] = useState(false);
	const [isAnalyzing, setIsAnalyzing] = useState(false);
	const [isImporting, setIsImporting] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [successMessage, setSuccessMessage] = useState<string | null>(null);
	const [importBundle, setImportBundle] = useState<ExportBundle | null>(null);
	const [analysisReport, setAnalysisReport] = useState<AnalysisReport | null>(null);
	const [resolutions, setResolutions] = useState<Record<string, ImportResolutionDecision>>({});
	const [importSummary, setImportSummary] = useState<ImportResultSummary | null>(null);
	const [uploadedFileName, setUploadedFileName] = useState<string | null>(null);
	const fileInputRef = useRef<HTMLInputElement | null>(null);
	const latestAnalysisRequestId = useRef(0);
	const resolutionDraftRef = useRef<Record<string, ImportResolutionDecision>>({});

	const hasSelectableTypes = selectedTypes.length > 0;
	const hasImportData = !!importBundle && !!analysisReport;

	const summaryText = useMemo(() => {
		if (!importSummary) {
			return null;
		}
		return `Created ${importSummary.created}, updated ${importSummary.updated}, skipped ${importSummary.skipped}.`;
	}, [importSummary]);

	const persistSelectedTypes = (next: ExportableDataTypeType[]) => {
		setSelectedTypes(next);
		if (typeof window !== 'undefined') {
			window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
		}
	};

	const beginAnalysisRequest = (): number => {
		latestAnalysisRequestId.current += 1;
		return latestAnalysisRequestId.current;
	};

	const isLatestAnalysisRequest = (requestId: number): boolean => latestAnalysisRequestId.current === requestId;

	const clearImportReview = () => {
		setImportBundle(null);
		setAnalysisReport(null);
		setResolutions({});
		resolutionDraftRef.current = {};
	};

	const analyzeBundle = async (
		bundle: ExportBundle,
		draftResolutions?: Record<string, ImportResolutionDecision>
	): Promise<{
		report: AnalysisReport;
		decisions: Record<string, ImportResolutionDecision>;
	}> => {
		const report = await api.analyzeImport(
			bundle,
			draftResolutions ? toResolutionPayload(draftResolutions) : undefined
		);
		return {
			report,
			decisions: reconcileResolutions(report, draftResolutions)
		};
	};

	const handleToggleExportType = (type: ExportableDataTypeType, checked: boolean) => {
		if (checked) {
			persistSelectedTypes(Array.from(new Set([...selectedTypes, type])));
			return;
		}
		persistSelectedTypes(selectedTypes.filter((selectedType) => selectedType !== type));
	};

	const handleExport = async () => {
		try {
			setIsExporting(true);
			setError(null);
			setSuccessMessage(null);
			const bundle = await api.exportData(selectedTypes);
			downloadBundle(bundle);
			setSuccessMessage('Export completed.');
		} catch (err) {
			setError(err instanceof Error ? err.message : 'Failed to export data');
		} finally {
			setIsExporting(false);
		}
	};

	const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
		const file = event.target.files?.[0];
		if (!file) {
			return;
		}

		const requestId = beginAnalysisRequest();

		try {
			setIsAnalyzing(true);
			setError(null);
			setSuccessMessage(null);
			setImportSummary(null);
			setUploadedFileName(file.name);
			clearImportReview();

			const raw = await readFileAsText(file);
			const parsed = JSON.parse(raw) as ExportBundle;
			if (!isLatestAnalysisRequest(requestId)) {
				return;
			}
			setImportBundle(parsed);

			const initialAnalysis = await analyzeBundle(parsed);
			if (!isLatestAnalysisRequest(requestId)) {
				return;
			}
			const resolvedAnalysis = await analyzeBundle(parsed, initialAnalysis.decisions);
			if (!isLatestAnalysisRequest(requestId)) {
				return;
			}
			resolutionDraftRef.current = resolvedAnalysis.decisions;
			setAnalysisReport(resolvedAnalysis.report);
			setResolutions(resolvedAnalysis.decisions);
		} catch (err) {
			if (!isLatestAnalysisRequest(requestId)) {
				return;
			}
			resolutionDraftRef.current = {};
			setError(err instanceof Error ? err.message : 'Failed to parse or analyze import bundle');
			clearImportReview();
		} finally {
			event.target.value = '';
			if (isLatestAnalysisRequest(requestId)) {
				setIsAnalyzing(false);
			}
		}
	};

	const handleResolutionChange = async (itemKey: string, decision: ImportResolutionDecision) => {
		if (!importBundle) {
			return;
		}

		const requestId = beginAnalysisRequest();
		const previousDraftResolutions = resolutionDraftRef.current;
		const nextDraftResolutions = {
			...previousDraftResolutions,
			[itemKey]: decision
		};
		resolutionDraftRef.current = nextDraftResolutions;

		try {
			setIsAnalyzing(true);
			setError(null);
			setSuccessMessage(null);
			setImportSummary(null);

			const nextAnalysis = await analyzeBundle(importBundle, nextDraftResolutions);
			if (!isLatestAnalysisRequest(requestId)) {
				return;
			}
			resolutionDraftRef.current = nextAnalysis.decisions;
			setAnalysisReport(nextAnalysis.report);
			setResolutions(nextAnalysis.decisions);
		} catch (err) {
			if (!isLatestAnalysisRequest(requestId)) {
				return;
			}
			resolutionDraftRef.current = previousDraftResolutions;
			setError(err instanceof Error ? err.message : 'Failed to analyze import bundle');
		} finally {
			if (isLatestAnalysisRequest(requestId)) {
				setIsAnalyzing(false);
			}
		}
	};

	const handleImport = async () => {
		if (!importBundle || !analysisReport) {
			return;
		}

		try {
			setIsImporting(true);
			setError(null);
			setSuccessMessage(null);

			const request: ImportRequest = {
				bundle: importBundle,
				resolutions: toResolutionPayload(reconcileResolutions(analysisReport, resolutions))
			};

			const summary = await api.executeImport(request);
			setImportSummary(summary);
			clearImportReview();
			setUploadedFileName(null);
			if (fileInputRef.current) {
				fileInputRef.current.value = '';
			}
			setSuccessMessage('Import completed.');
		} catch (err) {
			setError(err instanceof Error ? err.message : 'Failed to execute import');
		} finally {
			setIsImporting(false);
		}
	};

	return (
		<div className={styles.page}>
			<div className={styles.panelHeader}>
				<h2>Data transfer</h2>
			</div>

			{error && (
				<InlineNotification
					kind="error"
					title="Error"
					subtitle={error}
					onCloseButtonClick={() => setError(null)}
				/>
			)}
			{successMessage && (
				<InlineNotification
					kind="success"
					title="Success"
					subtitle={successMessage}
					onCloseButtonClick={() => setSuccessMessage(null)}
				/>
			)}

			<div className={styles.tabButtons} role="tablist" aria-label="Data transfer modes">
				<button
					type="button"
					id="data-transfer-tab-export"
					role="tab"
					aria-selected={activeTab === 0}
					aria-controls="data-transfer-panel-export"
					tabIndex={activeTab === 0 ? 0 : -1}
					className={activeTab === 0 ? styles.activeTabButton : styles.tabButton}
					onClick={() => setActiveTab(0)}
				>
					Export
				</button>
				<button
					type="button"
					id="data-transfer-tab-import"
					role="tab"
					aria-selected={activeTab === 1}
					aria-controls="data-transfer-panel-import"
					tabIndex={activeTab === 1 ? 0 : -1}
					className={activeTab === 1 ? styles.activeTabButton : styles.tabButton}
					onClick={() => setActiveTab(1)}
				>
					Import
				</button>
			</div>

			{activeTab === 0 && (
				<div
					id="data-transfer-panel-export"
					role="tabpanel"
					aria-labelledby="data-transfer-tab-export"
					className={styles.section}
				>
					<h3>Select data to export</h3>
					<p className={styles.helpText}>Selections are saved in your browser for next time.</p>
					<div className={styles.checkboxGrid}>
						{exportTypeOptions.map((option) => (
							<Checkbox
								key={option.value}
								id={`export-type-${option.value}`}
								labelText={option.label}
								checked={selectedTypes.includes(option.value)}
								onChange={(_evt, data) => handleToggleExportType(option.value, !!data.checked)}
							/>
						))}
					</div>

					<div className={styles.actions}>
						<Button
							onClick={handleExport}
							disabled={!hasSelectableTypes || isExporting}
						>
							Export selected
						</Button>
						{isExporting && <InlineLoading description="Exporting..." />}
					</div>
				</div>
			)}

			{activeTab === 1 && (
				<div
					id="data-transfer-panel-import"
					role="tabpanel"
					aria-labelledby="data-transfer-tab-import"
					className={styles.section}
				>
					<h3>Import bundle</h3>
					<label htmlFor="bundle-upload" className={styles.fileLabel}>Import file</label>
					<input
						ref={fileInputRef}
						id="bundle-upload"
						type="file"
						accept="application/json,.json"
						onChange={handleFileUpload}
					/>
					{uploadedFileName && (
						<p className={styles.helpText}>Selected file: {uploadedFileName}</p>
					)}
					{isAnalyzing && <InlineLoading description="Analyzing bundle..." />}

					{analysisReport && (
						<>
							<p className={styles.helpText}>
								New: {analysisReport.totals.new}, conflicts: {analysisReport.totals.conflict}, dependency issues: {analysisReport.totals.dependency_missing}
							</p>
							{analysisReport.totals.dependency_missing > 0 && (
								<p className={styles.helpText}>
									Items with dependency issues can only be skipped until their missing dependencies are available.
								</p>
							)}
							<ImportReviewTable
								items={analysisReport.items}
								resolutions={resolutions}
								onResolutionChange={handleResolutionChange}
							/>
						</>
					)}

					<div className={styles.actions}>
						<Button
							onClick={handleImport}
							disabled={!hasImportData || isImporting || isAnalyzing}
						>
							Import selected
						</Button>
						{isImporting && <InlineLoading description="Importing..." />}
					</div>
					{summaryText && <p className={styles.helpText}>{summaryText}</p>}
					{importSummary && importSummary.items.length > 0 && (
						<div className={styles.reviewTableContainer}>
							<table className={styles.reviewTable}>
								<caption className={styles.tableCaption}>Import results</caption>
								<thead>
									<tr>
										<th scope="col">Type</th>
										<th scope="col">Name</th>
										<th scope="col">Result</th>
										<th scope="col">Details</th>
									</tr>
								</thead>
								<tbody>
									{importSummary.items.map((item) => (
										<tr key={item.item_key}>
											<td>{item.entity_type}</td>
											<td>{item.entity_name}</td>
											<td>{item.action}</td>
											<td>{item.message || 'Completed'}</td>
										</tr>
									))}
								</tbody>
							</table>
						</div>
					)}
				</div>
			)}
		</div>
	);
}

