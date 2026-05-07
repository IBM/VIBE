import type React from 'react';
import { Accordion, Dropdown, TextArea, TextInput } from '@carbon/react';
import { AgentRequestTemplatesSection } from './AgentRequestTemplatesSection';
import { AgentResponseMapsSection } from './AgentResponseMapsSection';
import type { RequestTemplate, ResponseMap } from './AgentFormModal.types';

interface AgentExternalApiFieldsProps {
	formData: Record<string, string>;
	onInputChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => void;
	requestTemplates: RequestTemplate[];
	setRequestTemplates: React.Dispatch<React.SetStateAction<RequestTemplate[]>>;
	responseMaps: ResponseMap[];
	setResponseMaps: React.Dispatch<React.SetStateAction<ResponseMap[]>>;
	newTemplate: Partial<RequestTemplate>;
	setNewTemplate: React.Dispatch<React.SetStateAction<Partial<RequestTemplate>>>;
	newResponseMap: Partial<ResponseMap>;
	setNewResponseMap: React.Dispatch<React.SetStateAction<Partial<ResponseMap>>>;
	shouldShowNewTemplateForm: boolean;
	setShouldShowNewTemplateForm: React.Dispatch<React.SetStateAction<boolean>>;
	shouldShowNewMapForm: boolean;
	setShouldShowNewMapForm: React.Dispatch<React.SetStateAction<boolean>>;
	templateCapabilityNames: string[];
	responseMapCapabilityNames: string[];
	serializeCapabilitiesOrError: (raw: string | undefined) => string | undefined;
	setError: React.Dispatch<React.SetStateAction<string | null>>;
}

export function AgentExternalApiFields({
	formData,
	onInputChange,
	requestTemplates,
	setRequestTemplates,
	responseMaps,
	setResponseMaps,
	newTemplate,
	setNewTemplate,
	newResponseMap,
	setNewResponseMap,
	shouldShowNewTemplateForm,
	setShouldShowNewTemplateForm,
	shouldShowNewMapForm,
	setShouldShowNewMapForm,
	templateCapabilityNames,
	responseMapCapabilityNames,
	serializeCapabilitiesOrError,
	setError
}: AgentExternalApiFieldsProps) {
	return (
		<>
			<TextInput
				id="agent-api-endpoint"
				labelText="API Endpoint"
				placeholder="Enter API endpoint URL (e.g., https://api.example.com/v1/completion)"
				value={formData['agent-api-endpoint'] || ''}
				onChange={onInputChange}
				required
			/>
			<Dropdown
				id="agent-http-method"
				titleText="HTTP Method"
				label="Select HTTP method"
				items={[
					{ id: 'POST', label: 'POST' },
					{ id: 'GET', label: 'GET' },
					{ id: 'PUT', label: 'PUT' },
					{ id: 'PATCH', label: 'PATCH' },
					{ id: 'DELETE', label: 'DELETE' }
				]}
				selectedItem={
					formData['agent-http-method']
						? { id: formData['agent-http-method'], label: formData['agent-http-method'] }
						: { id: 'POST', label: 'POST' }
				}
				onChange={(e) => {
					const event = {
						target: {
							id: 'agent-http-method',
							value: e.selectedItem?.id || 'POST'
						}
					} as React.ChangeEvent<HTMLInputElement>;
					onInputChange(event);
				}}
				helperText="HTTP method to use for API requests (default: POST)"
			/>
			<TextInput
				id="agent-api-key"
				labelText="API Key (Optional)"
				placeholder="Enter API key for authentication"
				value={formData['agent-api-key'] || ''}
				onChange={onInputChange}
				type="password"
			/>
			<TextArea
				id="agent-token-mapping"
				labelText="Token mapping (Optional)"
				placeholder='JSON mapping to extract token usage, e.g.: {"input_tokens": "usage.prompt_tokens", "output_tokens": "usage.completion_tokens"}'
				rows={3}
				value={formData['agent-token-mapping'] || ''}
				onChange={onInputChange}
				helperText="Leave empty for auto-detection (works with OpenAI, Claude, Gemini, etc.) or specify custom mapping"
			/>
			<TextArea
				id="agent-headers"
				labelText="Headers (Optional)"
				placeholder='Enter custom headers as JSON, e.g.: {"Content-Type": "application/json", "X-Custom-Header": "value"}'
				rows={3}
				value={formData['agent-headers'] || ''}
				onChange={onInputChange}
				helperText="Custom HTTP headers as JSON object"
			/>

			<Accordion>
				<AgentRequestTemplatesSection
					requestTemplates={requestTemplates}
					setRequestTemplates={setRequestTemplates}
					newTemplate={newTemplate}
					setNewTemplate={setNewTemplate}
					shouldShowNewTemplateForm={shouldShowNewTemplateForm}
					setShouldShowNewTemplateForm={setShouldShowNewTemplateForm}
					templateCapabilityNames={templateCapabilityNames}
					serializeCapabilitiesOrError={serializeCapabilitiesOrError}
					setError={setError}
				/>
				<AgentResponseMapsSection
					responseMaps={responseMaps}
					setResponseMaps={setResponseMaps}
					newMap={newResponseMap}
					setNewMap={setNewResponseMap}
					shouldShowNewMapForm={shouldShowNewMapForm}
					setShouldShowNewMapForm={setShouldShowNewMapForm}
					mapCapabilityNames={responseMapCapabilityNames}
					serializeCapabilitiesOrError={serializeCapabilitiesOrError}
					setError={setError}
				/>
			</Accordion>
		</>
	);
}
