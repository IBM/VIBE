'use client';

import { useState } from 'react';
import { Button, Checkbox, InlineLoading, InlineNotification } from '@carbon/react';
import type { ExportBundle, ExportableDataType as ExportableDataTypeType } from '@ibm-vibe/types';
import { ExportableDataType } from '@ibm-vibe/types';
import { api } from '../../lib/api';
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

		const valid = parsed.filter((value): value is ExportableDataTypeType =>
			allExportTypes.includes(value as ExportableDataTypeType)
		);
		return valid.length > 0 ? valid : allExportTypes;
	} catch {
		return allExportTypes;
	}
};

const toFileName = (): string => {
	const date = new Date();
	const yyyy = date.getFullYear();
	const mm = String(date.getMonth() + 1).padStart(2, '0');
	const dd = String(date.getDate()).padStart(2, '0');
	return `vibe-export-${yyyy}-${mm}-${dd}.json`;
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

export default function ExportPanel() {
	const [selectedTypes, setSelectedTypes] = useState<ExportableDataTypeType[]>(() => getStoredSelectedTypes());
	const [isExporting, setIsExporting] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [successMessage, setSuccessMessage] = useState<string | null>(null);

	const hasSelectableTypes = selectedTypes.length > 0;

	const persistSelectedTypes = (next: ExportableDataTypeType[]) => {
		setSelectedTypes(next);
		if (typeof window !== 'undefined') {
			window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
		}
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

	return (
		<div
			id="data-transfer-panel-export"
			role="tabpanel"
			aria-labelledby="data-transfer-tab-export"
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
				<Button onClick={handleExport} disabled={!hasSelectableTypes || isExporting}>
					Export selected
				</Button>
				{isExporting && <InlineLoading description="Exporting..." />}
			</div>
		</div>
	);
}
