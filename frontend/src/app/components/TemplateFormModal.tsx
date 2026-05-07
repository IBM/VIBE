'use client';

import { useState, useEffect } from 'react';
import { Modal, TextInput, TextArea, ComboBox, Stack, InlineNotification } from '@carbon/react';
import { api, RequestTemplate, ResponseMap } from '../../lib/api';

type TemplateType = 'request' | 'response';

interface TemplateFormModalProps {
	isOpen: boolean;
	onClose: () => void;
	onSave: (template: RequestTemplate | ResponseMap) => void;
	type: TemplateType;
	template?: RequestTemplate | ResponseMap | null;
}

interface FormData {
	name: string;
	description: string;
	capability: string;
	body: string; // For request templates
	spec: string; // For response maps
}

/**
 * Modal for creating/editing global request templates or response maps.
 */
export default function TemplateFormModal({ isOpen, onClose, onSave, type, template = null }: TemplateFormModalProps) {
	const [error, setError] = useState<string | null>(null);
	const [loading, setLoading] = useState(false);
	const [capabilityNames, setCapabilityNames] = useState<string[]>([]);

	const isRequestTemplate = type === 'request';
	const isEditing = template !== null;

	// Form data
	const [formData, setFormData] = useState<FormData>({
		name: '',
		description: '',
		capability: '',
		body: isRequestTemplate ? getDefaultRequestTemplateBody() : '',
		spec: !isRequestTemplate ? getDefaultResponseMapSpec() : ''
	});

	// Load capability names for autocomplete
	useEffect(() => {
		const loadCapabilityNames = async () => {
			try {
				const names = isRequestTemplate
					? await api.getRequestTemplateCapabilityNames()
					: await api.getResponseMapCapabilityNames();
				setCapabilityNames(names);
			} catch {
				// Best-effort: capability autocomplete is optional
				setCapabilityNames([]);
			}
		};
		if (isOpen) {
			loadCapabilityNames();
		}
	}, [isOpen, isRequestTemplate]);

	// Initialize form data when editing
	useEffect(() => {
		if (template) {
			const capability = extractCapabilityName(template.capability);
			setFormData({
				name: template.name || '',
				description: template.description || '',
				capability: capability || '',
				body: isRequestTemplate ? (template as RequestTemplate).body || '' : '',
				spec: !isRequestTemplate ? (template as ResponseMap).spec || '' : ''
			});
		} else {
			// Reset for new template
			setFormData({
				name: '',
				description: '',
				capability: '',
				body: isRequestTemplate ? getDefaultRequestTemplateBody() : '',
				spec: !isRequestTemplate ? getDefaultResponseMapSpec() : ''
			});
		}
	}, [template, isRequestTemplate]);

	const handleInputChange = (field: keyof FormData, value: string) => {
		setFormData((prev) => ({ ...prev, [field]: value }));
		setError(null);
	};

	const handleSubmit = async () => {
		setError(null);
		setLoading(true);

		try {
			// Validate required fields
			if (!formData.name.trim()) {
				throw new Error('Name is required');
			}

			const content = isRequestTemplate ? formData.body : formData.spec;
			if (!content.trim()) {
				throw new Error(isRequestTemplate ? 'Body is required' : 'Spec is required');
			}

			// Validate JSON
			try {
				JSON.parse(content);
			} catch {
				throw new Error(`Invalid JSON in ${isRequestTemplate ? 'body' : 'spec'}`);
			}

			// Prepare capability as JSON
			const capability = formData.capability.trim()
				? JSON.stringify({ name: formData.capability.trim() })
				: undefined;

			let savedTemplate: RequestTemplate | ResponseMap;

			if (isRequestTemplate) {
				const payload = {
					name: formData.name.trim(),
					description: formData.description.trim() || undefined,
					capability,
					body: formData.body
				};

				if (isEditing && template?.id) {
					savedTemplate = await api.updateTemplate(template.id, payload);
				} else {
					savedTemplate = await api.createTemplate(payload);
				}
			} else {
				const payload = {
					name: formData.name.trim(),
					description: formData.description.trim() || undefined,
					capability,
					spec: formData.spec
				};

				if (isEditing && template?.id) {
					savedTemplate = await api.updateResponseMap(template.id, payload);
				} else {
					savedTemplate = await api.createResponseMap(payload);
				}
			}

			onSave(savedTemplate);
			onClose();
		} catch (err) {
			setError(err instanceof Error ? err.message : 'Failed to save template');
		} finally {
			setLoading(false);
		}
	};

	const modalHeading = isEditing
		? `Edit ${isRequestTemplate ? 'request template' : 'response map'}`
		: `Create ${isRequestTemplate ? 'request template' : 'response map'}`;

	return (
		<Modal
			open={isOpen}
			onRequestClose={onClose}
			onRequestSubmit={handleSubmit}
			modalHeading={modalHeading}
			primaryButtonText={isEditing ? 'Update' : 'Create'}
			secondaryButtonText="Cancel"
			primaryButtonDisabled={loading}
			size="lg"
		>
			<Stack gap={5}>
				{error && <InlineNotification kind="error" title="Error" subtitle={error} hideCloseButton />}

				<TextInput
					id="template-name"
					labelText="Name"
					value={formData.name}
					onChange={(e) => handleInputChange('name', e.target.value)}
					placeholder="e.g., OpenAI Chat Template"
					required
					helperText="A unique, human-readable name for this template"
				/>

				<TextInput
					id="template-description"
					labelText="Description"
					value={formData.description}
					onChange={(e) => handleInputChange('description', e.target.value)}
					placeholder="Optional description"
				/>

				<ComboBox
					id="template-capability"
					titleText="Capability"
					items={capabilityNames}
					selectedItem={formData.capability || null}
					onChange={({ selectedItem }) => handleInputChange('capability', selectedItem || '')}
					onInputChange={(inputText) => handleInputChange('capability', inputText || '')}
					placeholder="e.g., openai-chat"
					helperText="A tag that identifies what format this template uses. Conversations can require specific capabilities."
					allowCustomValue
				/>

				{isRequestTemplate ? (
					<TextArea
						id="template-body"
						labelText="Body (JSON)"
						value={formData.body}
						onChange={(e) => handleInputChange('body', e.target.value)}
						placeholder='{"model": "gpt-4", "messages": [...]}'
						rows={12}
						style={{ fontFamily: 'monospace' }}
						helperText="JSON template with {{placeholders}}. Use {{input}} for user message, {{conversation_history}} for chat history."
					/>
				) : (
					<TextArea
						id="template-spec"
						labelText="Spec (JSON)"
						value={formData.spec}
						onChange={(e) => handleInputChange('spec', e.target.value)}
						placeholder='{"output": "choices.0.message.content"}'
						rows={12}
						style={{ fontFamily: 'monospace' }}
						helperText="Defines how to extract data from API responses. Use dot notation for paths."
					/>
				)}
			</Stack>
		</Modal>
	);
}

// Helper functions

function getDefaultRequestTemplateBody(): string {
	return JSON.stringify(
		{
			model: 'gpt-4',
			messages: [{ role: 'user', content: '{{input}}' }]
		},
		null,
		2
	);
}

function getDefaultResponseMapSpec(): string {
	return JSON.stringify(
		{
			output: 'choices.0.message.content'
		},
		null,
		2
	);
}

function extractCapabilityName(capability: string | undefined | null): string | null {
	if (!capability) return null;
	try {
		const parsed = JSON.parse(capability);
		return parsed?.name || null;
	} catch {
		// If not valid JSON, treat as plain string
		return capability;
	}
}
