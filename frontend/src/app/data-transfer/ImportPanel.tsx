'use client';

import React, { useMemo, useRef, useState } from 'react';
import { Button, InlineLoading, InlineNotification } from '@carbon/react';
import type { ExportBundle, ImportPlan, ImportRequest, ImportResolution, ImportResultSummary } from '@ibm-vibe/types';
import { EXPORT_BUNDLE_VERSION } from '@ibm-vibe/types';
import { isSupportedExportBundleVersion, parseExportBundle } from '@ibm-vibe/types/data-transfer';
import { api } from '../../lib/api';
import ImportResultsTable from './ImportResultsTable';
import ImportReviewTable from './ImportReviewTable';
import styles from './page.module.scss';

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

const parseUploadedBundle = (raw: string): ExportBundle => {
	let parsedJson: unknown;

	try {
		parsedJson = JSON.parse(raw);
	} catch {
		throw new Error('Selected file is not valid JSON');
	}

	const parsedBundle = parseExportBundle(parsedJson);
	if (!parsedBundle.success) {
		throw new Error('Selected file is not a valid data transfer bundle');
	}
	if (!isSupportedExportBundleVersion(parsedBundle.data)) {
		throw new Error(`Unsupported bundle version: ${parsedBundle.data.version}. Expected ${EXPORT_BUNDLE_VERSION}.`);
	}

	return parsedBundle.data;
};

export default function ImportPanel() {
	const [isAnalyzing, setIsAnalyzing] = useState(false);
	const [isImporting, setIsImporting] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [successMessage, setSuccessMessage] = useState<string | null>(null);
	const [importBundle, setImportBundle] = useState<ExportBundle | null>(null);
	const [importPlan, setImportPlan] = useState<ImportPlan | null>(null);
	const [resolutions, setResolutions] = useState<Record<string, ImportResolution>>({});
	const [importSummary, setImportSummary] = useState<ImportResultSummary | null>(null);
	const [uploadedFileName, setUploadedFileName] = useState<string | null>(null);
	const fileInputRef = useRef<HTMLInputElement | null>(null);
	const latestAnalysisRequestId = useRef(0);
	const resolutionDraftRef = useRef<Record<string, ImportResolution>>({});

	const hasImportData = !!importBundle && !!importPlan;
	const summaryText = useMemo(() => {
		if (!importSummary) {
			return null;
		}
		return `Created ${importSummary.created}, updated ${importSummary.updated}, skipped ${importSummary.skipped}.`;
	}, [importSummary]);

	const beginAnalysisRequest = (): number => {
		latestAnalysisRequestId.current += 1;
		return latestAnalysisRequestId.current;
	};

	const isLatestAnalysisRequest = (requestId: number): boolean => latestAnalysisRequestId.current === requestId;

	const clearImportReview = () => {
		setImportBundle(null);
		setImportPlan(null);
		setResolutions({});
		resolutionDraftRef.current = {};
	};

	const analyzeBundle = async (
		bundle: ExportBundle,
		draftResolutions?: Record<string, ImportResolution>
	): Promise<ImportPlan> => api.analyzeImport(bundle, draftResolutions);

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
			const parsed = parseUploadedBundle(raw);
			if (!isLatestAnalysisRequest(requestId)) {
				return;
			}
			setImportBundle(parsed);

			const plan = await analyzeBundle(parsed);
			if (!isLatestAnalysisRequest(requestId)) {
				return;
			}
			resolutionDraftRef.current = plan.resolutions;
			setImportPlan(plan);
			setResolutions(plan.resolutions);
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

	const handleResolutionChange = async (itemKey: string, decision: ImportResolution['decision']) => {
		if (!importBundle) {
			return;
		}

		const requestId = beginAnalysisRequest();
		const previousDraftResolutions = resolutionDraftRef.current;
		const nextDraftResolutions = {
			...previousDraftResolutions,
			[itemKey]: {
				item_key: itemKey,
				decision
			}
		};
		resolutionDraftRef.current = nextDraftResolutions;

		try {
			setIsAnalyzing(true);
			setError(null);
			setSuccessMessage(null);
			setImportSummary(null);

			const nextPlan = await analyzeBundle(importBundle, nextDraftResolutions);
			if (!isLatestAnalysisRequest(requestId)) {
				return;
			}
			resolutionDraftRef.current = nextPlan.resolutions;
			setImportPlan(nextPlan);
			setResolutions(nextPlan.resolutions);
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
		if (!importBundle || !importPlan) {
			return;
		}

		try {
			setIsImporting(true);
			setError(null);
			setSuccessMessage(null);

			const request: ImportRequest = {
				bundle: importBundle,
				resolutions
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
		<div
			id="data-transfer-panel-import"
			role="tabpanel"
			aria-labelledby="data-transfer-tab-import"
			className={styles.section}
		>
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

			<h3>Import bundle</h3>
			<label htmlFor="bundle-upload" className={styles.fileLabel}>
				Import file
			</label>
			<input
				ref={fileInputRef}
				id="bundle-upload"
				type="file"
				accept="application/json,.json"
				onChange={handleFileUpload}
			/>
			{uploadedFileName && <p className={styles.helpText}>Selected file: {uploadedFileName}</p>}
			{isAnalyzing && <InlineLoading description="Analyzing bundle..." />}

			{importPlan && (
				<>
					<p className={styles.helpText}>
						New: {importPlan.totals.new}, conflicts: {importPlan.totals.conflict}, dependency issues:{' '}
						{importPlan.totals.dependency_missing}
					</p>
					{importPlan.totals.dependency_missing > 0 && (
						<p className={styles.helpText}>
							Items with dependency issues can only be skipped until their missing dependencies are
							available.
						</p>
					)}
					{!importPlan.executable && (
						<p className={styles.helpText}>Resolve blocked import items before importing.</p>
					)}
					<ImportReviewTable
						items={importPlan.items}
						resolutions={resolutions}
						onResolutionChange={handleResolutionChange}
					/>
				</>
			)}

			<div className={styles.actions}>
				<Button
					onClick={handleImport}
					disabled={!hasImportData || !importPlan?.executable || isImporting || isAnalyzing}
				>
					Import selected
				</Button>
				{isImporting && <InlineLoading description="Importing..." />}
			</div>
			{summaryText && <p className={styles.helpText}>{summaryText}</p>}
			{importSummary && <ImportResultsTable summary={importSummary} />}
		</div>
	);
}
