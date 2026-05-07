'use client';

import { useState, useEffect } from 'react';
import {
	Modal,
	TextInput,
	TextArea,
	Button,
	ToastNotification,
	InlineNotification,
	Tag,
	Tile,
	Grid,
	Column,
	Select,
	SelectItem,
	IconButton,
	Checkbox,
	ComboBox
} from '@carbon/react';
import { Add, TrashCan, ArrowUp, ArrowDown } from '@carbon/icons-react';
import { api, Conversation, ConversationMessage } from '../../lib/api';
import { extractCapabilityName, capabilityNameToJson } from '../../lib/capabilities';
import { TemplatePreviewSelector } from './TemplateSelector';
import { CapabilityInfoPanel } from './TemplateInfoPanel';
import styles from './ConversationFormModal.module.scss';

interface ConversationFormModalProps {
	isOpen: boolean;
	conversation?: Conversation;
	onClose: () => void;
	onSave: (conversation: Conversation) => void;
}

interface TurnTargetMap {
	[userSequence: number]: {
		target_reply: string;
		threshold?: number | null;
		weight?: number | null;
	};
}

// Extended ConversationMessage type for form with optional override fields
type ExtendedConversationMessage = Omit<ConversationMessage, 'conversation_id'> & {
	conversation_id?: number;
	request_template_id?: number;
	response_map_id?: number;
	set_variables?: string;
};

// Extended Conversation type for form data
// Note: default_request_template_id and default_response_map_id are deprecated
// Conversations now specify capability requirements instead
interface ConversationFormData {
	name: string;
	description: string;
	tags: string[];
	variables: string;
	stop_on_failure: boolean;
	required_request_template_capabilities?: string;
	required_response_map_capabilities?: string;
}

export default function ConversationFormModal({ isOpen, conversation, onClose, onSave }: ConversationFormModalProps) {
	const [formData, setFormData] = useState<ConversationFormData>({
		name: '',
		description: '',
		tags: [],
		variables: '',
		stop_on_failure: false,
		required_request_template_capabilities: '',
		required_response_map_capabilities: ''
	});
	const [messages, setMessages] = useState<ExtendedConversationMessage[]>([]);
	const [turnTargets, setTurnTargets] = useState<TurnTargetMap>({});
	const [newTag, setNewTag] = useState('');
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);

	// Capability name suggestions for auto-complete
	const [templateCapabilityNames, setTemplateCapabilityNames] = useState<string[]>([]);
	const [responseMapCapabilityNames, setResponseMapCapabilityNames] = useState<string[]>([]);

	// Load capability names on mount
	useEffect(() => {
		if (isOpen) {
			api.getRequestTemplateCapabilityNames().then(setTemplateCapabilityNames);
			api.getResponseMapCapabilityNames().then(setResponseMapCapabilityNames);
		}
	}, [isOpen]);

	/**
	 * Normalizes capability requirement to JSON format for storage.
	 * Input can be a capability name or JSON.
	 */
	const normalizeRequirementField = (raw: string | undefined): string | undefined => {
		// With the simplified model, requirements are just capability names
		// We convert to JSON format: {"name": "..."}
		return capabilityNameToJson(raw);
	};

	useEffect(() => {
		if (conversation) {
			setFormData({
				name: conversation.name || '',
				description: conversation.description || '',
				tags: conversation.tags ? JSON.parse(conversation.tags) : [],
				variables: conversation.variables || '',
				stop_on_failure: Boolean(
					(conversation as Conversation & { stop_on_failure?: boolean }).stop_on_failure
				),
				required_request_template_capabilities: conversation.required_request_template_capabilities || '',
				required_response_map_capabilities: conversation.required_response_map_capabilities || ''
			});
			setMessages((conversation.messages || []) as ExtendedConversationMessage[]);

			// Load turn targets
			if (conversation.id) {
				api.getConversationTurnTargets(conversation.id)
					.then((targets) => {
						const targetMap: TurnTargetMap = {};
						targets.forEach((t) => {
							targetMap[t.user_sequence] = {
								target_reply: t.target_reply,
								threshold: t.threshold,
								weight: t.weight
							};
						});
						setTurnTargets(targetMap);
					})
					.catch(() => setTurnTargets({}));
			}
		} else {
			setFormData({
				name: '',
				description: '',
				tags: [],
				variables: '',
				stop_on_failure: false,
				required_request_template_capabilities: '',
				required_response_map_capabilities: ''
			});
			setMessages([]);
			setTurnTargets({});
		}
		setError(null);
	}, [conversation, isOpen]);

	const handleSubmit = async () => {
		if (!formData.name.trim()) {
			setError('Name is required');
			return;
		}

		if (messages.length === 0) {
			setError('At least one message is required');
			return;
		}

		try {
			setError(null);
			setLoading(true);

			// Convert capability names to JSON format for storage
			const normalizedTemplateRequirement = normalizeRequirementField(
				formData.required_request_template_capabilities
			);
			const normalizedResponseRequirement = normalizeRequirementField(
				formData.required_response_map_capabilities
			);

			const conversationData = {
				name: formData.name,
				description: formData.description,
				tags: JSON.stringify(formData.tags),
				variables: formData.variables,
				stop_on_failure: formData.stop_on_failure,
				required_request_template_capabilities: normalizedTemplateRequirement,
				required_response_map_capabilities: normalizedResponseRequirement,
				messages: messages.map((msg, index) => ({
					...msg,
					sequence: index + 1
				}))
			};

			let savedConversation: Conversation;
			if (conversation?.id) {
				savedConversation = await api.updateConversation(conversation.id, conversationData);
			} else {
				savedConversation = await api.createConversation(conversationData);
			}

			// Save turn targets
			if (savedConversation.id) {
				const userMessages = messages
					.map((msg, index) => ({ ...msg, sequence: index + 1 }))
					.filter((msg) => msg.role === 'user');

				for (const userMsg of userMessages) {
					const target = turnTargets[userMsg.sequence];
					if (target && target.target_reply && target.target_reply.trim()) {
						await api.saveConversationTurnTarget({
							conversation_id: savedConversation.id,
							user_sequence: userMsg.sequence,
							target_reply: target.target_reply,
							threshold: target.threshold,
							weight: target.weight
						});
					}
				}
			}

			onSave(savedConversation);
			onClose();
		} catch (err) {
			setError(err instanceof Error ? err.message : 'Failed to save conversation');
		} finally {
			setLoading(false);
		}
	};

	const addTag = () => {
		if (newTag.trim() && !formData.tags.includes(newTag.trim())) {
			setFormData((prev) => ({
				...prev,
				tags: [...prev.tags, newTag.trim()]
			}));
			setNewTag('');
		}
	};

	const removeTag = (tagToRemove: string) => {
		setFormData((prev) => ({
			...prev,
			tags: prev.tags.filter((tag) => tag !== tagToRemove)
		}));
	};

	const addMessage = () => {
		const newMessage: ExtendedConversationMessage = {
			sequence: messages.length + 1,
			role: 'user',
			content: ''
		};
		setMessages([...messages, newMessage]);
	};

	const updateMessage = (index: number, updates: Partial<ExtendedConversationMessage>) => {
		const updatedMessages = messages.map((msg, i) => (i === index ? { ...msg, ...updates } : msg));
		setMessages(updatedMessages);
	};

	const removeMessage = (index: number) => {
		const updatedMessages = messages.filter((_, i) => i !== index);
		setMessages(updatedMessages);
	};

	const moveMessage = (index: number, direction: 'up' | 'down') => {
		if ((direction === 'up' && index === 0) || (direction === 'down' && index === messages.length - 1)) {
			return;
		}

		const newMessages = [...messages];
		const targetIndex = direction === 'up' ? index - 1 : index + 1;
		[newMessages[index], newMessages[targetIndex]] = [newMessages[targetIndex], newMessages[index]];
		setMessages(newMessages);
	};

	return (
		<Modal
			open={isOpen}
			onRequestClose={onClose}
			modalHeading={conversation ? 'Edit conversation' : 'Create conversation'}
			modalLabel="Conversation"
			primaryButtonText={loading ? 'Saving...' : 'Save'}
			secondaryButtonText="Cancel"
			primaryButtonDisabled={loading}
			onRequestSubmit={handleSubmit}
			size="lg"
		>
			<div className={styles.modalContent}>
				{error && (
					<ToastNotification
						kind="error"
						title="Error"
						subtitle={error}
						onCloseButtonClick={() => setError(null)}
					/>
				)}

				<Grid>
					<Column sm={4} md={8} lg={16}>
						<InlineNotification
							kind="info"
							lowContrast
							hideCloseButton
							title="External API requirements"
							subtitle="Optional. When set, only agents with matching capabilities can execute this conversation."
						/>
					</Column>
					<Column sm={4} md={4} lg={8}>
						<div style={{ marginTop: '0.75rem' }}>
							<ComboBox
								id="req-template-capability"
								titleText="Required request template capability"
								placeholder="Select or type a capability name"
								items={templateCapabilityNames}
								selectedItem={extractCapabilityName(formData.required_request_template_capabilities)}
								onChange={(e) => {
									const capName = e.selectedItem || '';
									setFormData((prev) => ({
										...prev,
										required_request_template_capabilities: capName
									}));
								}}
								allowCustomValue
								helperText="Select a capability that templates must have"
							/>
							{/* Template preview when capability is selected */}
							{formData.required_request_template_capabilities && (
								<div style={{ marginTop: '1rem' }}>
									<TemplatePreviewSelector
										type="request"
										capability={
											extractCapabilityName(formData.required_request_template_capabilities) ||
											undefined
										}
										label="Matching templates"
										helperText="Templates that match the required capability"
									/>
								</div>
							)}
						</div>
					</Column>
					<Column sm={4} md={4} lg={8}>
						<div style={{ marginTop: '0.75rem' }}>
							<ComboBox
								id="req-response-capability"
								titleText="Required response map capability"
								placeholder="Select or type a capability name"
								items={responseMapCapabilityNames}
								selectedItem={extractCapabilityName(formData.required_response_map_capabilities)}
								onChange={(e) => {
									const capName = e.selectedItem || '';
									setFormData((prev) => ({
										...prev,
										required_response_map_capabilities: capName
									}));
								}}
								allowCustomValue
								helperText="Select a capability that response maps must have"
							/>
							{/* Response map preview when capability is selected */}
							{formData.required_response_map_capabilities && (
								<div style={{ marginTop: '1rem' }}>
									<TemplatePreviewSelector
										type="response"
										capability={
											extractCapabilityName(formData.required_response_map_capabilities) ||
											undefined
										}
										label="Matching response maps"
										helperText="Response maps that match the required capability"
									/>
								</div>
							)}
						</div>
					</Column>
					<Column sm={4} md={8} lg={16}>
						<div style={{ marginTop: '1rem' }}>
							<CapabilityInfoPanel />
						</div>
					</Column>
				</Grid>

				<Grid>
					<Column sm={4} md={8} lg={16}>
						<TextInput
							id="name"
							labelText="Name"
							value={formData.name}
							onChange={(e) => setFormData((prev) => ({ ...prev, name: e.target.value }))}
							placeholder="Enter conversation name"
							required
						/>
					</Column>
					<Column sm={4} md={8} lg={16}>
						<TextArea
							id="description"
							labelText="Description"
							value={formData.description}
							onChange={(e) => setFormData((prev) => ({ ...prev, description: e.target.value }))}
							placeholder="Describe what this conversation tests"
							rows={3}
						/>
					</Column>
					<Column sm={4} md={8} lg={16}>
						<div className={styles.tagsSection}>
							<label className={styles.label}>Tags</label>
							<div className={styles.tagInput}>
								<TextInput
									id="new-tag"
									labelText=""
									value={newTag}
									onChange={(e) => setNewTag(e.target.value)}
									placeholder="Add a tag"
									onKeyDown={(e) => {
										if (e.key === 'Enter') {
											e.preventDefault();
											addTag();
										}
									}}
								/>
								<Button size="sm" onClick={addTag}>
									Add
								</Button>
							</div>
							<div className={styles.tagsContainer}>
								{formData.tags.map((tag) => (
									<Tag key={tag} type="blue" size="sm" onClose={() => removeTag(tag)}>
										{tag}
									</Tag>
								))}
							</div>
						</div>
					</Column>
				</Grid>

				<InlineNotification
					className={styles.variablesInfo}
					kind="info"
					lowContrast
					hideCloseButton
					title="Variables quick guide"
					subtitle="Conversation variables seed each run. Override variables (per user message) merge in before the request is sent. Response mapping variables are extracted after the call and available to following turns. Use pointers like $.message.content, $.variables.lastAnswer, or $.lastResponse.data.id. $ refers to the execution context root."
				/>

				<div className={styles.messagesSection}>
					<div className={styles.messagesHeader}>
						<h4>Conversation script</h4>
						<Button kind="tertiary" size="sm" renderIcon={Add} onClick={addMessage}>
							Add message
						</Button>
					</div>

					{messages.length === 0 && (
						<Tile className={styles.emptyState}>
							<p>No messages yet. Add a message to start building your conversation script.</p>
						</Tile>
					)}

					{messages.map((message, index) => {
						const messageSequence = index + 1;
						const isUserMessage = message.role === 'user';
						const turnTarget = turnTargets[messageSequence];

						return (
							<Tile key={index} className={styles.messageItem}>
								<div className={styles.messageHeader}>
									<Select
										id={`role-${index}`}
										labelText="Role"
										value={message.role}
										onChange={(e) =>
											updateMessage(index, { role: e.target.value as 'user' | 'system' })
										}
									>
										<SelectItem value="user" text="User" />
										<SelectItem value="system" text="System" />
									</Select>
									<div className={styles.messageActions}>
										<IconButton
											label="Move up"
											disabled={index === 0}
											onClick={() => moveMessage(index, 'up')}
										>
											<ArrowUp />
										</IconButton>
										<IconButton
											label="Move down"
											disabled={index === messages.length - 1}
											onClick={() => moveMessage(index, 'down')}
										>
											<ArrowDown />
										</IconButton>
										<IconButton label="Delete message" onClick={() => removeMessage(index)}>
											<TrashCan />
										</IconButton>
									</div>
								</div>
								<TextArea
									id={`content-${index}`}
									labelText="Content"
									value={message.content}
									onChange={(e) => updateMessage(index, { content: e.target.value })}
									placeholder="Enter message content"
									rows={3}
								/>
								{isUserMessage && (
									<div className={styles.targetSection}>
										<h6 className={styles.targetTitle}>Expected assistant reply (optional)</h6>
										<TextArea
											id={`target-${index}`}
											labelText=""
											value={turnTarget?.target_reply || ''}
											onChange={(e) =>
												setTurnTargets((prev) => ({
													...prev,
													[messageSequence]: {
														...prev[messageSequence],
														target_reply: e.target.value
													}
												}))
											}
											placeholder="Enter the expected assistant response for similarity scoring"
											rows={2}
										/>
										<TextArea
											id={`setvars-${index}`}
											labelText="Override variables (JSON)"
											placeholder='{"runId": "abc-123", "traceId": "$.lastResponse.id"}'
											rows={2}
											value={message.set_variables || ''}
											onChange={(e) => updateMessage(index, { set_variables: e.target.value })}
											helperText="Merge additional variables before this request runs. Supports pointers like $.message.content, $.variables.lastAnswer, $.lastResponse.data.id (the $ root is the current execution context)."
										/>
										<div className={styles.targetOptions}>
											<TextInput
												id={`threshold-${index}`}
												labelText="Similarity threshold (0-100)"
												type="number"
												min={0}
												max={100}
												value={turnTarget?.threshold?.toString() || ''}
												onChange={(e) =>
													setTurnTargets((prev) => ({
														...prev,
														[messageSequence]: {
															...prev[messageSequence],
															threshold: e.target.value ? Number(e.target.value) : null
														}
													}))
												}
												placeholder="70"
											/>
											<TextInput
												id={`weight-${index}`}
												labelText="Weight"
												type="number"
												min={0}
												step={0.1}
												value={turnTarget?.weight?.toString() || ''}
												onChange={(e) =>
													setTurnTargets((prev) => ({
														...prev,
														[messageSequence]: {
															...prev[messageSequence],
															weight: e.target.value ? Number(e.target.value) : null
														}
													}))
												}
												placeholder="1.0"
											/>
										</div>
									</div>
								)}
							</Tile>
						);
					})}
				</div>
				<Grid>
					<Column sm={4} md={8} lg={16}>
						<TextArea
							id="variables"
							labelText="Conversation variables (JSON)"
							placeholder='{"sessionId":"abc-123", "tenantId":"org_456"}'
							rows={3}
							value={formData.variables}
							onChange={(e) => setFormData((prev) => ({ ...prev, variables: e.target.value }))}
							helperText="Optional: Seed variables available from turn 1. Variables extracted from response mappings (via response_mapping.variables) are automatically available in subsequent turns."
						/>
					</Column>
					<Column sm={4} md={8} lg={16}>
						<div style={{ marginTop: '0.5rem' }}>
							<Checkbox
								id="stop-on-failure"
								labelText="Stop conversation on response failure"
								checked={formData.stop_on_failure}
								onChange={(_evt, data: { checked: boolean }) => {
									setFormData((prev) => ({ ...prev, stop_on_failure: data.checked }));
								}}
							/>
						</div>
					</Column>
				</Grid>
			</div>
		</Modal>
	);
}
