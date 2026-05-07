'use client';

import { useState, useEffect } from 'react';
import { Modal, TextInput, NumberInput, Dropdown, TextArea, Stack } from '@carbon/react';
import { LLMConfig } from '../../lib/api';
import { useLLMConfigs } from '../../lib/AppDataContext';

interface LLMConfigFormModalProps {
	isOpen: boolean;
	onClose: () => void;
	config?: LLMConfig | null;
}

interface FormData {
	name: string;
	provider: string;
	priority: number;
	configJson: string;
}

export default function LLMConfigFormModal({ isOpen, onClose, config = null }: LLMConfigFormModalProps) {
	const { createLLMConfig, updateLLMConfig } = useLLMConfigs();
	const [error, setError] = useState<string | null>(null);
	const [loading, setLoading] = useState(false);

	// Form data
	const [formData, setFormData] = useState<FormData>({
		name: '',
		provider: 'ollama',
		priority: 100,
		configJson: JSON.stringify({ model: 'llama2', base_url: 'http://localhost:11434' }, null, 2)
	});

	// Initialize form data if editing
	useEffect(() => {
		if (config) {
			try {
				const configObj = JSON.parse(config.config);
				setFormData({
					name: config.name,
					provider: config.provider,
					priority: config.priority,
					configJson: JSON.stringify(configObj, null, 2)
				});
			} catch {
				setError('Error parsing configuration data');
			}
		}
	}, [config]);

	// Provider options
	const providerOptions = [
		{ id: 'ollama', label: 'Ollama' },
		{ id: 'openai', label: 'OpenAI' },
		{ id: 'anthropic', label: 'Anthropic' },
		{ id: 'watsonx', label: 'IBM watsonx' }
	];

	// Handle form input changes
	const handleInputChange = (field: keyof FormData, value: string | number) => {
		setFormData({
			...formData,
			[field]: value
		});
	};

	// Get default config template based on provider
	const getDefaultConfigTemplate = (provider: string): string => {
		switch (provider) {
			case 'ollama':
				return JSON.stringify(
					{
						model: 'llama2',
						base_url: 'http://localhost:11434'
					},
					null,
					2
				);
			case 'openai':
				return JSON.stringify(
					{
						model: 'gpt-4o',
						api_key: '',
						base_url: 'https://api.openai.com/v1'
					},
					null,
					2
				);
			case 'anthropic':
				return JSON.stringify(
					{
						model: 'claude-3-5-sonnet-20240620',
						api_key: '',
						base_url: 'https://api.anthropic.com/v1'
					},
					null,
					2
				);
			case 'watsonx':
				return JSON.stringify(
					{
						model: 'ibm/granite-13b-instruct-v2',
						api_key: '',
						project_id: '',
						base_url: 'https://us-south.ml.cloud.ibm.com'
					},
					null,
					2
				);
			default:
				return JSON.stringify({}, null, 2);
		}
	};

	// Handle provider change to update config template
	const handleProviderChange = ({ selectedItem }: { selectedItem: { id: string; label: string } }) => {
		const newProvider = selectedItem.id;
		setFormData({
			...formData,
			provider: newProvider,
			configJson: config ? formData.configJson : getDefaultConfigTemplate(newProvider)
		});
	};

	// Handle form submission
	const handleSubmit = async () => {
		setError(null);
		setLoading(true);

		try {
			// Validate JSON
			let configObj: Record<string, unknown>;
			try {
				const parsed = JSON.parse(formData.configJson);
				if (!parsed || typeof parsed !== 'object') {
					throw new Error('Invalid JSON configuration');
				}
				configObj = parsed as Record<string, unknown>;
			} catch {
				throw new Error('Invalid JSON configuration');
			}

			// Validate required fields
			if (!formData.name.trim()) {
				throw new Error('Name is required');
			}

			// Provider-specific validation
			if (formData.provider === 'openai' || formData.provider === 'anthropic') {
				const apiKey = configObj.api_key;
				if (typeof apiKey !== 'string' || !apiKey.trim()) {
					throw new Error(`API key is required for ${formData.provider}`);
				}
			}

			if (formData.provider === 'watsonx') {
				const apiKey = configObj.api_key;
				if (typeof apiKey !== 'string' || !apiKey.trim()) {
					throw new Error('API key is required for watsonx');
				}
				const projectId = configObj.project_id;
				if (typeof projectId !== 'string' || !projectId.trim()) {
					throw new Error('Project ID is required for watsonx');
				}
			}

			// Prepare data for API
			const llmConfigData: Omit<LLMConfig, 'id' | 'created_at' | 'updated_at'> = {
				name: formData.name,
				provider: formData.provider,
				config: formData.configJson,
				priority: formData.priority
			};

			// Create or update
			if (config) {
				await updateLLMConfig(config.id!, llmConfigData);
			} else {
				await createLLMConfig(llmConfigData);
			}

			// Close modal on success
			onClose();
		} catch (error) {
			setError(error instanceof Error ? error.message : 'Unknown error occurred');
		} finally {
			setLoading(false);
		}
	};

	return (
		<Modal
			open={isOpen}
			onRequestClose={onClose}
			onRequestSubmit={handleSubmit}
			modalHeading={config ? 'Edit LLM Configuration' : 'Add LLM Configuration'}
			primaryButtonText={config ? 'Update' : 'Create'}
			secondaryButtonText="Cancel"
			primaryButtonDisabled={loading}
		>
			<Stack gap={5}>
				{error && <p style={{ color: 'red' }}>{error}</p>}

				<TextInput
					id="llm-config-name"
					labelText="Name"
					value={formData.name}
					onChange={(e) => handleInputChange('name', e.target.value)}
					placeholder="Enter a descriptive name"
					required
				/>

				<Dropdown
					id="llm-config-provider"
					titleText="Provider"
					label="Select a provider"
					items={providerOptions}
					selectedItem={providerOptions.find((item) => item.id === formData.provider)}
					onChange={handleProviderChange}
				/>

				<NumberInput
					id="llm-config-priority"
					label="Priority"
					min={1}
					max={1000}
					value={formData.priority}
					onChange={(_e, data) => handleInputChange('priority', parseInt(String(data.value), 10))}
					helperText="Lower values have higher priority"
					required
				/>

				<div>
					<TextArea
						id="llm-config-json"
						labelText="Configuration (JSON)"
						value={formData.configJson}
						onChange={(e) => handleInputChange('configJson', e.target.value)}
						placeholder="Enter JSON configuration"
						rows={10}
						style={{ fontFamily: 'monospace' }}
					/>
				</div>
			</Stack>
		</Modal>
	);
}
