'use client';

import { useState, useEffect } from 'react';
import { Form, Select, SelectItem, Button, InlineLoading, Tile, Tag, Grid, Column } from '@carbon/react';
import { PlayFilled, Chat } from '@carbon/icons-react';
import { api, Conversation } from '@/lib/api';
import { useAgents } from '@/lib/AppDataContext';
import styles from './ConversationExecutor.module.scss';
import { ExpandableText } from './ExpandableText';

export default function ConversationExecutor() {
	const { agents, fetchAgents } = useAgents();

	// Local state for conversations (not in context yet)
	const [conversations, setConversations] = useState<Conversation[]>([]);
	const [loadingConversations, setLoadingConversations] = useState(false);
	const [selectedConversationDetails, setSelectedConversationDetails] = useState<Conversation | null>(null);
	const [loadingConversationDetails, setLoadingConversationDetails] = useState(false);

	const [selectedAgentId, setSelectedAgentId] = useState<number | undefined>();
	const [selectedConversationId, setSelectedConversationId] = useState<number | undefined>();
	const [isSubmitting, setIsSubmitting] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [successMessage, setSuccessMessage] = useState<string | null>(null);

	// Fetch data on component mount
	useEffect(() => {
		if (agents.length === 0) {
			fetchAgents();
		}
		fetchConversations();
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, []);

	const fetchConversations = async () => {
		setLoadingConversations(true);
		try {
			const response = await api.getConversations({ limit: 100, offset: 0 });
			setConversations(response.data || []);
		} catch {
			setConversations([]);
			setError('Failed to fetch conversations');
		} finally {
			setLoadingConversations(false);
		}
	};

	useEffect(() => {
		let cancelled = false;

		const loadSelectedConversation = async () => {
			if (!selectedConversationId) {
				setSelectedConversationDetails(null);
				setLoadingConversationDetails(false);
				return;
			}

			setLoadingConversationDetails(true);

			try {
				const fullConversation = await api.getConversationById(selectedConversationId);
				if (!cancelled) {
					setSelectedConversationDetails(fullConversation);
				}
			} catch {
				if (!cancelled) {
					const fallbackConversation = conversations.find((c) => c.id === selectedConversationId);
					setSelectedConversationDetails(fallbackConversation || null);
				}
			} finally {
				if (!cancelled) {
					setLoadingConversationDetails(false);
				}
			}
		};

		loadSelectedConversation();

		return () => {
			cancelled = true;
		};
	}, [selectedConversationId, conversations]);

	const handleAgentChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
		setSelectedAgentId(Number(event.target.value));
		setError(null);
		setSuccessMessage(null);
	};

	const handleConversationChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
		const value = event.target.value;
		setSelectedConversationDetails(null);
		if (value) {
			setLoadingConversationDetails(true);
			setSelectedConversationId(Number(value));
		} else {
			setLoadingConversationDetails(false);
			setSelectedConversationId(undefined);
		}
		setError(null);
		setSuccessMessage(null);
	};

	const executeConversation = async () => {
		if (!selectedAgentId || !selectedConversationId) {
			setError('Please select both an agent and a conversation');
			return;
		}

		setIsSubmitting(true);
		setError(null);
		setSuccessMessage(null);

		try {
			const job = await api.executeConversation(selectedAgentId, selectedConversationId);
			setSuccessMessage(`Job #${job.job_id} created successfully and is now queued for execution`);
		} catch (error) {
			setError(error instanceof Error ? error.message : 'Failed to execute conversation');
		} finally {
			setIsSubmitting(false);
		}
	};

	const formatTags = (tagsString?: string): string[] => {
		if (!tagsString) {
			return [];
		}
		try {
			return JSON.parse(tagsString);
		} catch {
			return [];
		}
	};

	const selectedConversation =
		selectedConversationDetails || conversations.find((c) => c.id === selectedConversationId);

	return (
		<Grid>
			<Column sm={4} md={6} lg={8}>
				<Form>
					<div className={styles.fieldGroup}>
						<Select
							id="agent-select"
							labelText="Select agent"
							helperText="Choose an agent to execute the conversation"
							value={selectedAgentId || ''}
							onChange={handleAgentChange}
						>
							<SelectItem value="" text="Choose an agent" disabled />
							{agents.map((agent) => (
								<SelectItem
									key={agent.id}
									value={agent.id}
									text={`${agent.name} (v${agent.version})`}
								/>
							))}
						</Select>
					</div>

					<div className={styles.fieldGroup}>
						<Select
							id="conversation-select"
							labelText="Select conversation"
							helperText="Choose a conversation script to execute"
							value={selectedConversationId || ''}
							onChange={handleConversationChange}
							disabled={loadingConversations}
						>
							<SelectItem
								value=""
								text={loadingConversations ? 'Loading conversations...' : 'Choose a conversation'}
								disabled
							/>
							{conversations.map((conversation) => (
								<SelectItem key={conversation.id} value={conversation.id} text={conversation.name} />
							))}
						</Select>
					</div>

					<Button
						kind="primary"
						onClick={executeConversation}
						disabled={isSubmitting || !selectedAgentId || !selectedConversationId || loadingConversations}
						renderIcon={PlayFilled}
					>
						{isSubmitting ? <InlineLoading description="Creating job..." /> : 'Execute conversation'}
					</Button>
				</Form>

				{error && <Tile className={styles.errorTile}>{error}</Tile>}

				{successMessage && <Tile className={styles.successTile}>{successMessage}</Tile>}
			</Column>

			<Column sm={4} md={2} lg={8}>
				{selectedConversation && (
					<Tile className={styles.previewTile}>
						<div className={styles.previewHeader}>
							<Chat size={20} className={styles.headerIcon} />
							<h4 className={styles.previewTitle}>Conversation preview</h4>
						</div>

						<div className={styles.fieldGroup}>
							<strong>{selectedConversation.name}</strong>
							{selectedConversation.description && (
								<div className={styles.previewDescription}>
									<ExpandableText
										text={selectedConversation.description}
										previewChars={160}
										threshold={240}
									/>
								</div>
							)}
						</div>

						{formatTags(selectedConversation.tags).length > 0 && (
							<div className={styles.tagList}>
								{formatTags(selectedConversation.tags).map((tag, i) => (
									<Tag key={i} type="blue" size="sm" className={styles.tag}>
										{tag}
									</Tag>
								))}
							</div>
						)}

						{loadingConversationDetails ? (
							<p className={styles.noMessages}>Loading conversation script...</p>
						) : selectedConversation.messages && selectedConversation.messages.length > 0 ? (
							<div>
								<strong>Script ({selectedConversation.messages.length} messages):</strong>
								<ul className={styles.scriptList}>
									{selectedConversation.messages.slice(0, 3).map((message, i) => (
										<li key={i} className={styles.scriptItem}>
											<strong>{message.role}:</strong>{' '}
											<ExpandableText text={message.content} previewChars={60} threshold={80} />
										</li>
									))}
									{selectedConversation.messages.length > 3 && (
										<li className={styles.scriptMore}>
											... and {selectedConversation.messages.length - 3} more messages
										</li>
									)}
								</ul>
							</div>
						) : (
							<p className={styles.noMessages}>No messages defined in this conversation</p>
						)}
					</Tile>
				)}
			</Column>
		</Grid>
	);
}
