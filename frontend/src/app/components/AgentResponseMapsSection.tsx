import type React from 'react';
import { AccordionItem, Button, Checkbox, CodeSnippet, ComboBox, Stack, Tag, TextArea, TextInput } from '@carbon/react';
import { Add, Edit, TrashCan } from '@carbon/icons-react';
import { extractCapabilityName } from '../../lib/capabilities';
import styles from './AgentFormModal.module.scss';
import type { ResponseMap } from './AgentFormModal.types';

interface AgentResponseMapsSectionProps {
	responseMaps: ResponseMap[];
	setResponseMaps: React.Dispatch<React.SetStateAction<ResponseMap[]>>;
	newMap: Partial<ResponseMap>;
	setNewMap: React.Dispatch<React.SetStateAction<Partial<ResponseMap>>>;
	shouldShowNewMapForm: boolean;
	setShouldShowNewMapForm: React.Dispatch<React.SetStateAction<boolean>>;
	mapCapabilityNames: string[];
	serializeCapabilitiesOrError: (raw: string | undefined) => string | undefined;
	setError: React.Dispatch<React.SetStateAction<string | null>>;
}

export function AgentResponseMapsSection({
	responseMaps,
	setResponseMaps,
	newMap,
	setNewMap,
	shouldShowNewMapForm,
	setShouldShowNewMapForm,
	mapCapabilityNames,
	serializeCapabilitiesOrError,
	setError
}: AgentResponseMapsSectionProps) {
	return (
		<AccordionItem title="Response maps (recommended)" open>
			<div className={styles.templatesSection}>
				<p className={styles.sectionDescription}>
					Response maps define how to extract data from API responses. At least one map is needed to execute
					conversations.
				</p>

				{responseMaps
					.filter((m) => !m._isDeleted)
					.map((map, idx) => (
						<div key={map.id || `new-${idx}`} className={styles.mapItem}>
							<div className={styles.mapHeader}>
								<div className={styles.mapTitle}>
									<strong>{map.name}</strong>
									{map.is_default && (
										<Tag type="green" size="sm">
											default
										</Tag>
									)}
								</div>
								<div className={styles.mapActions}>
									<Button
										kind="ghost"
										size="sm"
										renderIcon={Edit}
										onClick={() => {
											setResponseMaps(
												responseMaps.map((m) =>
													m.id === map.id ? { ...m, _isEditing: !m._isEditing } : m
												)
											);
										}}
									>
										{map._isEditing ? 'Cancel' : 'Edit'}
									</Button>
									<Button
										kind="danger--ghost"
										size="sm"
										renderIcon={TrashCan}
										onClick={() => {
											setResponseMaps(
												responseMaps.map((m) =>
													m.id === map.id ? { ...m, _isDeleted: true } : m
												)
											);
										}}
									>
										Delete
									</Button>
								</div>
							</div>
							{map._isEditing ? (
								<Stack gap={4}>
									<TextInput
										id={`map-name-${idx}`}
										labelText="Name"
										value={map.name}
										onChange={(e) => {
											setResponseMaps(
												responseMaps.map((m) =>
													m.id === map.id ? { ...m, name: e.target.value } : m
												)
											);
										}}
									/>
									<TextArea
										id={`map-spec-${idx}`}
										labelText="Spec (JSON)"
										value={map.spec}
										onChange={(e) => {
											setResponseMaps(
												responseMaps.map((m) =>
													m.id === map.id ? { ...m, spec: e.target.value } : m
												)
											);
										}}
										rows={4}
									/>
									<ComboBox
										id={`map-capabilities-${idx}`}
										titleText="Capability"
										placeholder="Select or type a capability name"
										items={mapCapabilityNames}
										selectedItem={extractCapabilityName(map.capabilities)}
										onChange={(e) => {
											setResponseMaps(
												responseMaps.map((m) =>
													m.id === map.id ? { ...m, capabilities: e.selectedItem || '' } : m
												)
											);
										}}
										allowCustomValue
										helperText="Tag this response map with a capability name for matching"
									/>
									<Checkbox
										id={`map-default-${idx}`}
										labelText="Set as default"
										checked={!!map.is_default}
										onChange={(_evt, { checked }) => {
											setResponseMaps(
												responseMaps.map((m) =>
													m.id === map.id
														? { ...m, is_default: checked }
														: { ...m, is_default: false }
												)
											);
										}}
									/>
								</Stack>
							) : (
								<CodeSnippet type="multi" feedback="Copied to clipboard">
									{map.spec}
								</CodeSnippet>
							)}
						</div>
					))}

				{!shouldShowNewMapForm && (
					<Button kind="tertiary" size="sm" renderIcon={Add} onClick={() => setShouldShowNewMapForm(true)}>
						Add new response map
					</Button>
				)}

				{shouldShowNewMapForm && (
					<div className={styles.newMapForm}>
						<h6 className={styles.newFormTitle}>Add new response map</h6>
						<Stack gap={4}>
							<TextInput
								id="new-map-name"
								labelText="Name"
								value={newMap.name || ''}
								onChange={(e) => setNewMap({ ...newMap, name: e.target.value })}
								placeholder="e.g., default, openai-style"
							/>
							<TextArea
								id="new-map-spec"
								labelText="Spec (JSON)"
								value={newMap.spec || ''}
								onChange={(e) => setNewMap({ ...newMap, spec: e.target.value })}
								placeholder='{"output": "choices.0.message.content"}'
								rows={4}
							/>
							<ComboBox
								id="new-map-capabilities"
								titleText="Capability"
								placeholder="Select or type a capability name"
								items={mapCapabilityNames}
								selectedItem={extractCapabilityName(newMap.capabilities)}
								onChange={(e) => setNewMap({ ...newMap, capabilities: e.selectedItem || '' })}
								allowCustomValue
								helperText="Tag this response map with a capability name (e.g., openai-chat, ollama-generate)"
							/>
							<Checkbox
								id="new-map-default"
								labelText="Set as default"
								checked={!!newMap.is_default}
								onChange={(_evt, { checked }) => setNewMap({ ...newMap, is_default: checked })}
							/>
							<div className={styles.formActions}>
								<Button
									kind="secondary"
									size="sm"
									onClick={() => {
										setShouldShowNewMapForm(false);
										setNewMap({ name: '', spec: '', capabilities: '', is_default: false });
									}}
								>
									Cancel
								</Button>
								<Button
									kind="primary"
									size="sm"
									onClick={() => {
										try {
											JSON.parse(newMap.spec || '');
										} catch (err) {
											setError(
												`Invalid JSON in response map spec: ${err instanceof Error ? err.message : 'Unknown error'}`
											);
											return;
										}

										const normalizedCaps = serializeCapabilitiesOrError(newMap.capabilities);

										const newResponseMap = {
											...newMap,
											capabilities: normalizedCaps || '',
											id: Date.now(),
											_isNew: true
										} as ResponseMap & { _isNew: boolean };
										setResponseMaps([...responseMaps, newResponseMap]);
										setShouldShowNewMapForm(false);
										setNewMap({ name: '', spec: '', capabilities: '', is_default: false });
										setError(null);
									}}
									disabled={!newMap.name || !newMap.spec}
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
