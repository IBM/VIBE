import type React from 'react';
import { AccordionItem, Button, Checkbox, CodeSnippet, ComboBox, Stack, Tag, TextArea, TextInput } from '@carbon/react';
import { Add, Edit, TrashCan } from '@carbon/icons-react';
import { extractCapabilityName } from '../../lib/capabilities';
import styles from './AgentFormModal.module.scss';
import type { RequestTemplate } from './AgentFormModal.types';

interface AgentRequestTemplatesSectionProps {
	requestTemplates: RequestTemplate[];
	setRequestTemplates: React.Dispatch<React.SetStateAction<RequestTemplate[]>>;
	newTemplate: Partial<RequestTemplate>;
	setNewTemplate: React.Dispatch<React.SetStateAction<Partial<RequestTemplate>>>;
	shouldShowNewTemplateForm: boolean;
	setShouldShowNewTemplateForm: React.Dispatch<React.SetStateAction<boolean>>;
	templateCapabilityNames: string[];
	serializeCapabilitiesOrError: (raw: string | undefined) => string | undefined;
	setError: React.Dispatch<React.SetStateAction<string | null>>;
}

export function AgentRequestTemplatesSection({
	requestTemplates,
	setRequestTemplates,
	newTemplate,
	setNewTemplate,
	shouldShowNewTemplateForm,
	setShouldShowNewTemplateForm,
	templateCapabilityNames,
	serializeCapabilitiesOrError,
	setError
}: AgentRequestTemplatesSectionProps) {
	return (
		<AccordionItem title="Request templates (recommended)" open>
			<div className={styles.templatesSection}>
				<p className={styles.sectionDescription}>
					Templates define how to format requests to your API. At least one template is needed to execute
					conversations.
				</p>

				{requestTemplates
					.filter((t) => !t._isDeleted)
					.map((template, idx) => (
						<div key={template.id || `new-${idx}`} className={styles.templateItem}>
							<div className={styles.templateHeader}>
								<div className={styles.templateTitle}>
									<strong>{template.name}</strong>
									{template.is_default && (
										<Tag type="green" size="sm">
											default
										</Tag>
									)}
								</div>
								<div className={styles.templateActions}>
									<Button
										kind="ghost"
										size="sm"
										renderIcon={Edit}
										onClick={() => {
											setRequestTemplates(
												requestTemplates.map((t) =>
													t.id === template.id ? { ...t, _isEditing: !t._isEditing } : t
												)
											);
										}}
									>
										{template._isEditing ? 'Cancel' : 'Edit'}
									</Button>
									<Button
										kind="danger--ghost"
										size="sm"
										renderIcon={TrashCan}
										onClick={() => {
											setRequestTemplates(
												requestTemplates.map((t) =>
													t.id === template.id ? { ...t, _isDeleted: true } : t
												)
											);
										}}
									>
										Delete
									</Button>
								</div>
							</div>
							{template._isEditing ? (
								<Stack gap={4}>
									<TextInput
										id={`template-name-${idx}`}
										labelText="Name"
										value={template.name}
										onChange={(e) => {
											setRequestTemplates(
												requestTemplates.map((t) =>
													t.id === template.id ? { ...t, name: e.target.value } : t
												)
											);
										}}
									/>
									<TextArea
										id={`template-body-${idx}`}
										labelText="Body (JSON)"
										value={template.body}
										onChange={(e) => {
											setRequestTemplates(
												requestTemplates.map((t) =>
													t.id === template.id ? { ...t, body: e.target.value } : t
												)
											);
										}}
										rows={4}
									/>
									<ComboBox
										id={`template-capabilities-${idx}`}
										titleText="Capability"
										placeholder="Select or type a capability name"
										items={templateCapabilityNames}
										selectedItem={extractCapabilityName(template.capabilities)}
										onChange={(e) => {
											setRequestTemplates(
												requestTemplates.map((t) =>
													t.id === template.id
														? { ...t, capabilities: e.selectedItem || '' }
														: t
												)
											);
										}}
										allowCustomValue
										helperText="Tag this template with a capability name for matching"
									/>
									<Checkbox
										id={`template-default-${idx}`}
										labelText="Set as default"
										checked={!!template.is_default}
										onChange={(_evt, { checked }) => {
											setRequestTemplates(
												requestTemplates.map((t) =>
													t.id === template.id
														? { ...t, is_default: checked }
														: { ...t, is_default: false }
												)
											);
										}}
									/>
								</Stack>
							) : (
								<CodeSnippet type="multi" feedback="Copied to clipboard">
									{template.body}
								</CodeSnippet>
							)}
						</div>
					))}

				{!shouldShowNewTemplateForm && (
					<Button
						kind="tertiary"
						size="sm"
						renderIcon={Add}
						data-testid="open-template-form"
						onClick={() => setShouldShowNewTemplateForm(true)}
					>
						Add new template
					</Button>
				)}

				{shouldShowNewTemplateForm && (
					<div className={styles.newTemplateForm}>
						<h6 className={styles.newFormTitle}>Add new template</h6>
						<Stack gap={4}>
							<TextInput
								id="new-template-name"
								labelText="Name"
								value={newTemplate.name || ''}
								onChange={(e) => setNewTemplate({ ...newTemplate, name: e.target.value })}
								placeholder="e.g., default, openai-style"
							/>
							<TextArea
								id="new-template-body"
								labelText="Body (JSON)"
								value={newTemplate.body || ''}
								onChange={(e) => setNewTemplate({ ...newTemplate, body: e.target.value })}
								placeholder='{"model": "gpt-4", "messages": [{"role": "user", "content": "{{input}}"}]}'
								rows={4}
							/>
							<ComboBox
								id="new-template-capabilities"
								titleText="Capability"
								placeholder="Select or type a capability name"
								items={templateCapabilityNames}
								selectedItem={extractCapabilityName(newTemplate.capabilities)}
								onChange={(e) => setNewTemplate({ ...newTemplate, capabilities: e.selectedItem || '' })}
								allowCustomValue
								helperText="Tag this template with a capability name (e.g., openai-chat, ollama-generate)"
							/>
							<Checkbox
								id="new-template-default"
								labelText="Set as default"
								checked={!!newTemplate.is_default}
								onChange={(_evt, { checked }) =>
									setNewTemplate({ ...newTemplate, is_default: checked })
								}
							/>
							<div className={styles.formActions}>
								<Button
									kind="secondary"
									size="sm"
									onClick={() => {
										setShouldShowNewTemplateForm(false);
										setNewTemplate({ name: '', body: '', capabilities: '', is_default: false });
									}}
								>
									Cancel
								</Button>
								<Button
									kind="primary"
									size="sm"
									onClick={() => {
										try {
											JSON.parse(newTemplate.body || '');
										} catch (err) {
											setError(
												`Invalid JSON in template body: ${err instanceof Error ? err.message : 'Unknown error'}`
											);
											return;
										}

										const normalizedCaps = serializeCapabilitiesOrError(newTemplate.capabilities);

										const newTpl = {
											...newTemplate,
											capabilities: normalizedCaps || '',
											id: Date.now(),
											_isNew: true
										} as RequestTemplate & { _isNew: boolean };
										setRequestTemplates([...requestTemplates, newTpl]);
										setShouldShowNewTemplateForm(false);
										setNewTemplate({ name: '', body: '', capabilities: '', is_default: false });
										setError(null);
									}}
									disabled={!newTemplate.name || !newTemplate.body}
								>
									Add
								</Button>
							</div>
						</Stack>
					</div>
				)}
			</div>
		</AccordionItem>
	);
}
