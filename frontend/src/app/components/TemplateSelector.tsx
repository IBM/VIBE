'use client';

import { useState, useEffect, useCallback } from 'react';
import { ComboBox, Button, Stack, InlineLoading } from '@carbon/react';
import { Add } from '@carbon/icons-react';
import { api, RequestTemplate, ResponseMap } from '../../lib/api';
import TemplateFormModal from './TemplateFormModal';

type TemplateType = 'request' | 'response';

interface TemplateSelectorProps {
	type: TemplateType;
	/** Currently selected template ID */
	selectedId?: number | null;
	/** Callback when a template is selected */
	onSelect: (template: RequestTemplate | ResponseMap | null) => void;
	/** Optional capability filter */
	capability?: string;
	/** Label for the selector */
	label?: string;
	/** Helper text */
	helperText?: string;
	/** Whether the selector is disabled */
	disabled?: boolean;
	/** Whether to show the "Add new" button */
	showAddNew?: boolean;
	/** Callback when a new template is created (in addition to selecting it) */
	onTemplateCreated?: (template: RequestTemplate | ResponseMap) => void;
}

interface TemplateItem {
	id: number;
	name: string;
	capability?: string;
	template: RequestTemplate | ResponseMap;
}

/**
 * A reusable component for selecting global templates or response maps.
 * Includes a ComboBox with search, optional capability filtering, and an "Add new" button.
 */
export default function TemplateSelector({
	type,
	selectedId,
	onSelect,
	capability,
	label,
	helperText,
	disabled = false,
	showAddNew = true,
	onTemplateCreated
}: TemplateSelectorProps) {
	const [templates, setTemplates] = useState<TemplateItem[]>([]);
	const [loading, setLoading] = useState(false);
	const [showModal, setShowModal] = useState(false);
	const [selectedItem, setSelectedItem] = useState<TemplateItem | null>(null);

	const isRequestTemplate = type === 'request';

	// Load templates
	const loadTemplates = useCallback(async () => {
		setLoading(true);
		try {
			const data = isRequestTemplate ? await api.getTemplates(capability) : await api.getResponseMaps(capability);

			const items: TemplateItem[] = data.map((t) => ({
				id: t.id!,
				name: t.name,
				capability: extractCapabilityName(t.capability),
				template: t
			}));

			setTemplates(items);

			// Set initial selection
			if (selectedId) {
				const selected = items.find((item) => item.id === selectedId);
				setSelectedItem(selected || null);
			}
		} catch {
			setTemplates([]);
			setSelectedItem(null);
		} finally {
			setLoading(false);
		}
	}, [isRequestTemplate, capability, selectedId]);

	useEffect(() => {
		loadTemplates();
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, []);

	// Update selection when selectedId changes
	useEffect(() => {
		if (selectedId) {
			const selected = templates.find((item) => item.id === selectedId);
			setSelectedItem(selected || null);
		} else {
			setSelectedItem(null);
		}
	}, [selectedId, templates]);

	const handleSelect = (item: TemplateItem | null) => {
		setSelectedItem(item);
		onSelect(item?.template || null);
	};

	const handleTemplateCreated = (template: RequestTemplate | ResponseMap) => {
		const newItem: TemplateItem = {
			id: template.id!,
			name: template.name,
			capability: extractCapabilityName(template.capability),
			template
		};

		setTemplates((prev) => [newItem, ...prev]);
		setSelectedItem(newItem);
		onSelect(template);

		if (onTemplateCreated) {
			onTemplateCreated(template);
		}
	};

	const defaultLabel = isRequestTemplate ? 'Request template' : 'Response map';
	const defaultHelperText = isRequestTemplate
		? 'Select a request template or create a new one'
		: 'Select a response map or create a new one';

	const itemToString = (item: TemplateItem | null) => {
		if (!item) {
			return '';
		}
		return item.capability ? `${item.name} (${item.capability})` : item.name;
	};

	return (
		<>
			<Stack gap={3} orientation="horizontal">
				<div style={{ flex: 1 }}>
					{loading ? (
						<InlineLoading description="Loading templates..." />
					) : (
						<ComboBox
							id={`template-selector-${type}`}
							titleText={label || defaultLabel}
							items={templates}
							selectedItem={selectedItem}
							onChange={({ selectedItem }) => handleSelect(selectedItem as TemplateItem | null)}
							itemToString={itemToString}
							placeholder="Select or search..."
							helperText={helperText || defaultHelperText}
							disabled={disabled}
						/>
					)}
				</div>
				{showAddNew && (
					<div
						style={{ alignSelf: 'flex-end', paddingBottom: helperText || defaultHelperText ? '20px' : '0' }}
					>
						<Button
							kind="ghost"
							size="md"
							renderIcon={Add}
							onClick={() => setShowModal(true)}
							disabled={disabled}
						>
							Add new
						</Button>
					</div>
				)}
			</Stack>

			<TemplateFormModal
				isOpen={showModal}
				onClose={() => setShowModal(false)}
				onSave={handleTemplateCreated}
				type={type}
			/>
		</>
	);
}

// Also export a simpler version for preview only (no add button, readonly)
export function TemplatePreviewSelector({
	type,
	capability,
	label,
	helperText
}: {
	type: TemplateType;
	capability?: string;
	label?: string;
	helperText?: string;
}) {
	const [templates, setTemplates] = useState<TemplateItem[]>([]);
	const [loading, setLoading] = useState(false);
	const [selectedItem, setSelectedItem] = useState<TemplateItem | null>(null);

	const isRequestTemplate = type === 'request';

	useEffect(() => {
		const loadTemplates = async () => {
			if (!capability) {
				setTemplates([]);
				return;
			}

			setLoading(true);
			try {
				const data = isRequestTemplate
					? await api.getTemplates(capability)
					: await api.getResponseMaps(capability);

				const items: TemplateItem[] = data.map((t) => ({
					id: t.id!,
					name: t.name,
					capability: extractCapabilityName(t.capability),
					template: t
				}));

				setTemplates(items);

				// Auto-select first if only one
				if (items.length === 1) {
					setSelectedItem(items[0]);
				}
			} catch {
				setTemplates([]);
				setSelectedItem(null);
			} finally {
				setLoading(false);
			}
		};

		loadTemplates();
	}, [isRequestTemplate, capability]);

	const defaultLabel = isRequestTemplate ? 'Preview request template' : 'Preview response map';
	const defaultHelperText = capability
		? `Templates matching capability "${capability}"`
		: 'Select a capability requirement first';

	const itemToString = (item: TemplateItem | null) => {
		if (!item) {
			return '';
		}
		return item.name;
	};

	return (
		<div>
			{loading ? (
				<InlineLoading description="Loading..." />
			) : (
				<ComboBox
					id={`template-preview-${type}`}
					titleText={label || defaultLabel}
					items={templates}
					selectedItem={selectedItem}
					onChange={({ selectedItem }) => setSelectedItem(selectedItem as TemplateItem | null)}
					itemToString={itemToString}
					placeholder={templates.length ? 'Select to preview...' : 'No matching templates'}
					helperText={helperText || defaultHelperText}
					disabled={!capability || templates.length === 0}
				/>
			)}

			{selectedItem && (
				<div style={{ marginTop: '1rem' }}>
					<pre
						style={{
							background: '#f4f4f4',
							padding: '1rem',
							borderRadius: '4px',
							fontSize: '12px',
							overflow: 'auto',
							maxHeight: '200px'
						}}
					>
						{isRequestTemplate
							? (selectedItem.template as RequestTemplate).body
							: (selectedItem.template as ResponseMap).spec}
					</pre>
				</div>
			)}
		</div>
	);
}

function extractCapabilityName(capability: string | undefined | null): string | undefined {
	if (!capability) {
		return undefined;
	}
	try {
		const parsed = JSON.parse(capability);
		return parsed?.name || undefined;
	} catch {
		return capability;
	}
}
