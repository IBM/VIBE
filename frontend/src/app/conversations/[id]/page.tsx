'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
	Button,
	InlineLoading,
	InlineNotification,
	Tile,
	Tag,
	Modal,
	ComboBox,
	OverflowMenu,
	OverflowMenuItem,
	TextArea
} from '@carbon/react';
import { Edit, Play, ChartLine, Information, Warning, CheckmarkFilled, ArrowLeft } from '@carbon/icons-react';
import { api, Conversation, ExecutionSession, SessionMessage, Agent } from '../../../lib/api';
import { loadSessionMessages, calculateSessionStats } from '../../../lib/utils';
import SessionViewer from '../../components/SessionViewer';
import ConversationFormModal from '../../components/ConversationFormModal';
import DeleteConfirmationModal from '../../components/DeleteConfirmationModal';
import SessionsTable from '../../components/SessionsTable';
import styles from './page.module.scss';

export default function ConversationDetailPage() {
	const params = useParams<{ id: string }>();
	const router = useRouter();
	const [conversation, setConversation] = useState<Conversation | null>(null);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);

	const [sessions, setSessions] = useState<ExecutionSession[]>([]);
	const [latestSession, setLatestSession] = useState<ExecutionSession | null>(null);
	const [latestMessages, setLatestMessages] = useState<SessionMessage[]>([]);
	const [sessionMessages, setSessionMessages] = useState<Map<number, SessionMessage[]>>(new Map());
	const [executing, setExecuting] = useState(false);
	const [agents, setAgents] = useState<Agent[]>([]);
	const [execModalOpen, setExecModalOpen] = useState(false);
	const [selectedAgent, setSelectedAgent] = useState<Agent | null>(null);
	const [agentTemplates, setAgentTemplates] = useState<
		Array<{ id: number; name: string; body: string; is_default?: number }>
	>([]);
	const [agentResponseMaps, setAgentResponseMaps] = useState<
		Array<{ id: number; name: string; spec: string; is_default?: number }>
	>([]);
	const [selectedTemplate, setSelectedTemplate] = useState<{ id: number; name: string } | null>(null);
	const [selectedMap, setSelectedMap] = useState<{ id: number; name: string } | null>(null);
	const [runVariables, setRunVariables] = useState<string>('');
	const [editModalOpen, setEditModalOpen] = useState(false);
	const [deleteModalOpen, setDeleteModalOpen] = useState(false);
	const [duplicating, setDuplicating] = useState(false);
	const [stats, setStats] = useState({
		totalRuns: 0,
		successRate: 0,
		avgDuration: 0,
		lastRun: null as string | null
	});

	const load = async () => {
		try {
			setLoading(true);
			const id = Number(params.id);
			const c = await api.getConversationById(id);
			setConversation(c);

			// Load all sessions for this conversation
			const sessionsResp = await api.getExecutionSessions({ conversation_id: id, limit: 100, offset: 0 });
			const allSessions = Array.isArray(sessionsResp) ? sessionsResp : sessionsResp.data;
			setSessions(allSessions || []);

			// Load messages for all sessions to calculate accurate success status
			const messagesMap = await loadSessionMessages(allSessions || []);
			setSessionMessages(messagesMap);

			// Get latest session details
			const latest = allSessions?.[0];
			if (latest) {
				const transcriptData = await api.getSessionTranscriptWithSession(latest.id!);
				setLatestSession(transcriptData.session);
				setLatestMessages(transcriptData.messages || []);

				// Calculate stats using similarity-based success
				const successfulRuns = allSessions.filter((session) => {
					let success = session.success || false;
					if (session.id) {
						const messages = messagesMap.get(session.id);
						if (messages && messages.length > 0) {
							const assistantMessages = messages.filter((m) => m.role === 'assistant');
							if (assistantMessages.length > 0) {
								const scoredMessage = assistantMessages.find(
									(m) =>
										m.similarity_scoring_status === 'completed' &&
										typeof m.similarity_score === 'number'
								);
								if (scoredMessage) {
									success = scoredMessage.similarity_score! >= 70; // Default threshold TODO
								}
							}
						}
					}
					return success;
				}).length;

				// Use utility function for base stats
				const baseStats = calculateSessionStats(allSessions);
				setStats({
					totalRuns: baseStats.totalRuns,
					successRate: baseStats.totalRuns > 0 ? (successfulRuns / baseStats.totalRuns) * 100 : 0,
					avgDuration: baseStats.avgDuration,
					lastRun: baseStats.lastRun
				});
			} else {
				setLatestSession(null);
				setLatestMessages([]);
				setStats({ totalRuns: 0, successRate: 0, avgDuration: 0, lastRun: null });
			}
		} catch (err) {
			setError(err instanceof Error ? err.message : 'failed to load conversation');
		} finally {
			setLoading(false);
		}
	};

	useEffect(() => {
		load();
		api.getAgents()
			.then(setAgents)
			.catch(() => {});
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [params.id]);

	useEffect(() => {
		// When agent is selected in the execute modal, load its templates/maps
		(async () => {
			try {
				if (!selectedAgent) {
					setAgentTemplates([]);
					setAgentResponseMaps([]);
					return;
				}
				const [tpls, maps] = await Promise.all([
					api.getAgentRequestTemplates(selectedAgent.id!),
					api.getAgentResponseMaps(selectedAgent.id!)
				]);
				setAgentTemplates(tpls || []);
				setAgentResponseMaps(maps || []);
				// Pre-select conversation defaults if present
				if (conversation?.default_request_template_id) {
					const t = (tpls || []).find((t) => t.id === conversation.default_request_template_id);
					setSelectedTemplate(t ? { id: t.id, name: t.name } : null);
				} else {
					const def = (tpls || []).find((t) => Number(t.is_default) === 1);
					setSelectedTemplate(def ? { id: def.id, name: def.name } : null);
				}
				if (conversation?.default_response_map_id) {
					const m = (maps || []).find((m) => m.id === conversation.default_response_map_id);
					setSelectedMap(m ? { id: m.id, name: m.name } : null);
				} else {
					const defm = (maps || []).find((m) => Number(m.is_default) === 1);
					setSelectedMap(defm ? { id: defm.id, name: defm.name } : null);
				}
				// Seed run variables from conversation
				setRunVariables(conversation?.variables || '');
			} catch {}
		})();
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [selectedAgent, execModalOpen]);

	const handleExecuteWithAgent = async (agentId: number) => {
		if (!conversation?.id) return;
		try {
			setExecuting(true);
			// Persist selected defaults and variables before run (best-effort)
			try {
				await api.updateConversation(conversation.id, {
					default_request_template_id: selectedTemplate?.id,
					default_response_map_id: selectedMap?.id,
					variables: runVariables || undefined
				});
			} catch {}
			await api.executeConversation(agentId, conversation.id);
			// refresh after a short delay or navigate to jobs
			setTimeout(load, 1000);
		} catch (err) {
			setError(err instanceof Error ? err.message : 'failed to execute conversation');
		} finally {
			setExecuting(false);
		}
	};

	const handleEditSuccess = () => {
		setEditModalOpen(false);
		load();
	};

	const handleDuplicate = async () => {
		if (!conversation) {
			return;
		}

		setDuplicating(true);
		setError(null);

		try {
			// Create a copy of the conversation with a new name
			const duplicatedConversation = {
				...conversation,
				name: `${conversation.name} (Copy)`,
				id: undefined // Remove ID to create new conversation
			};

			const newConversation = await api.createConversation(duplicatedConversation);
			router.push(`/conversations/${newConversation.id}`);
		} catch (err) {
			setError(err instanceof Error ? err.message : 'Failed to duplicate conversation');
		} finally {
			setDuplicating(false);
		}
	};

	if (loading) {
		return <InlineLoading description="loading conversation" />;
	}
	if (error) {
		return <InlineNotification kind="error" title="Error" subtitle={error} hideCloseButton />;
	}
	if (!conversation) {
		return <InlineNotification kind="error" title="Not found" subtitle="conversation not found" hideCloseButton />;
	}

	return (
		<div className={styles.container}>
			<div className={styles.headerRow}>
				<div className={styles.headerLeft}>
					<h2 className={styles.title}>{conversation.name}</h2>
					{conversation.description && <p className={styles.description}>{conversation.description}</p>}
					<div className={styles.metadata}>
						{conversation.tags
							? JSON.parse(conversation.tags).map((t: string, i: number) => (
									<Tag key={i} type="blue" size="sm">
										{t}
									</Tag>
								))
							: null}
						<Tag type="gray" size="sm">
							{stats.totalRuns} runs
						</Tag>
						<Tag
							type={stats.successRate >= 80 ? 'green' : stats.successRate >= 60 ? 'cool-gray' : 'red'}
							size="sm"
						>
							{stats.successRate.toFixed(0)}% success
						</Tag>
					</div>
				</div>
				<div className={styles.headerRight}>
					<OverflowMenu flipped>
						<OverflowMenuItem itemText="Edit conversation" onClick={() => setEditModalOpen(true)} />
						<OverflowMenuItem itemText="Duplicate" onClick={handleDuplicate} disabled={duplicating} />
						<OverflowMenuItem itemText="Export" disabled />
						<OverflowMenuItem itemText="Delete" onClick={() => setDeleteModalOpen(true)} isDelete />
					</OverflowMenu>
					<Button kind="tertiary" onClick={() => router.push('/conversations')} renderIcon={ArrowLeft}>
						Back
					</Button>
					<Button
						kind="primary"
						disabled={executing}
						onClick={() => setExecModalOpen(true)}
						renderIcon={Play}
					>
						Execute
					</Button>
				</div>
			</div>

			{/* Statistics Cards */}
			<div className={styles.statsGrid}>
				<Tile className={styles.statCard}>
					<div className={styles.statIcon}>
						<ChartLine />
					</div>
					<div className={styles.statContent}>
						<div className={styles.statValue}>{stats.totalRuns}</div>
						<div className={styles.statLabel}>Total runs</div>
					</div>
				</Tile>
				<Tile className={styles.statCard}>
					<div className={styles.statIcon}>
						<CheckmarkFilled />
					</div>
					<div className={styles.statContent}>
						<div className={styles.statValue}>{stats.successRate.toFixed(0)}%</div>
						<div className={styles.statLabel}>Success rate</div>
					</div>
				</Tile>
				<Tile className={styles.statCard}>
					<div className={styles.statIcon}>
						<Information />
					</div>
					<div className={styles.statContent}>
						<div className={styles.statValue}>{stats.avgDuration.toFixed(1)}s</div>
						<div className={styles.statLabel}>Avg duration</div>
					</div>
				</Tile>
				<Tile className={styles.statCard}>
					<div className={styles.statIcon}>
						<Warning />
					</div>
					<div className={styles.statContent}>
						<div className={styles.statValue}>
							{stats.lastRun ? new Date(stats.lastRun).toLocaleDateString() : 'Never'}
						</div>
						<div className={styles.statLabel}>Last run</div>
					</div>
				</Tile>
			</div>

			{/* Main Content */}
			<div className={styles.contentGrid}>
				{/* Script Section */}
				<div className={styles.scriptSection}>
					<Tile className={styles.scriptTile}>
						<div className={styles.sectionHeader}>
							<h4 className={styles.sectionTitle}>Conversation script</h4>
							<Button kind="ghost" size="sm" renderIcon={Edit} onClick={() => setEditModalOpen(true)}>
								Edit
							</Button>
						</div>
						{conversation.messages && conversation.messages.length > 0 ? (
							<div className={styles.scriptContent}>
								{conversation.messages.map((m) => (
									<div key={m.sequence} className={styles.scriptMessage}>
										<Tag type="purple" size="sm" className={styles.messageRole}>
											{m.role}
										</Tag>
										<div className={styles.messageContent}>{m.content}</div>
									</div>
								))}
							</div>
						) : (
							<div className={styles.emptyState}>
								<Information />
								<span>No messages defined</span>
							</div>
						)}
					</Tile>
				</div>

				{/* Latest session section */}
				<div className={styles.sessionSection}>
					<Tile className={styles.sessionTile}>
						<div className={styles.sectionHeader}>
							<h4 className={styles.sectionTitle}>Latest execution</h4>
							{latestSession && (
								<Button
									kind="ghost"
									size="sm"
									onClick={() => router.push(`/sessions/${latestSession.id}`)}
								>
									View details
								</Button>
							)}
						</div>
						{latestSession ? (
							<SessionViewer session={latestSession} messages={latestMessages} />
						) : (
							<div className={styles.emptyState}>
								<Play />
								<span>No executions yet</span>
							</div>
						)}
					</Tile>
				</div>
			</div>

			{/* Execution History */}
			{sessions.length > 0 && (
				<Tile className={styles.historyTile}>
					<div className={styles.sectionHeader}>
						<h4 className={styles.sectionTitle}>Execution history</h4>
						<Button kind="ghost" size="sm" onClick={() => router.push('/sessions')}>
							View all sessions
						</Button>
					</div>
					<SessionsTable
						sessions={sessions}
						agents={agents}
						limit={5}
						sessionMessages={sessionMessages}
						conversations={conversation ? [conversation] : []}
						hiddenColumns={['conversation']}
					/>
				</Tile>
			)}

			{/* Execute modal */}
			<Modal
				open={execModalOpen}
				modalHeading="Execute conversation"
				primaryButtonText={executing ? 'Executing...' : 'Run'}
				primaryButtonDisabled={executing || !selectedAgent}
				secondaryButtonText="Cancel"
				onRequestClose={() => setExecModalOpen(false)}
				onRequestSubmit={async () => {
					if (!selectedAgent || !conversation) {
						return;
					}
					await handleExecuteWithAgent(selectedAgent.id!);
					setExecModalOpen(false);
				}}
			>
				<div className={styles.modalField}>
					<ComboBox
						id="agent-selector"
						titleText="Select agent"
						items={agents}
						itemToString={(item) => (item ? `${item.name} (v${item.version})` : '')}
						selectedItem={selectedAgent}
						onChange={({ selectedItem }) => setSelectedAgent(selectedItem as Agent)}
						placeholder="Choose an agent"
					/>
				</div>
				{selectedAgent && (
					<>
						<div className={styles.modalField}>
							<ComboBox
								id="template-selector"
								titleText="Default request template"
								items={agentTemplates.map((t) => ({ id: t.id, name: t.name }))}
								itemToString={(item) => (item ? `${item.name}` : '')}
								selectedItem={selectedTemplate}
								onChange={({ selectedItem }) =>
									setSelectedTemplate(selectedItem as { id: number; name: string } | null)
								}
								placeholder="Select template (optional)"
							/>
						</div>
						<div className={styles.modalField}>
							<ComboBox
								id="map-selector"
								titleText="Default response map"
								items={agentResponseMaps.map((m) => ({ id: m.id, name: m.name }))}
								itemToString={(item) => (item ? `${item.name}` : '')}
								selectedItem={selectedMap}
								onChange={({ selectedItem }) =>
									setSelectedMap(selectedItem as { id: number; name: string } | null)
								}
								placeholder="Select response map (optional)"
							/>
						</div>
						<div className={styles.modalField}>
							<TextArea
								id="run-variables"
								labelText="Run variables (JSON)"
								helperText="Optional: Seed variables for this execution. These override conversation defaults and are available from turn 1. Use template placeholders like {{varName}} in request templates. Variables extracted from responses (via response maps) are automatically merged and available in subsequent turns."
								rows={4}
								value={runVariables}
								onChange={(e) => setRunVariables(e.target.value)}
								placeholder='{"sessionId": "abc-123", "userId": "user_456"}'
							/>
						</div>
					</>
				)}
			</Modal>

			{/* Edit conversation modal */}
			<ConversationFormModal
				isOpen={editModalOpen}
				conversation={conversation}
				onClose={() => setEditModalOpen(false)}
				onSave={handleEditSuccess}
			/>

			<DeleteConfirmationModal
				isOpen={deleteModalOpen}
				deleteType="conversation"
				deleteName={conversation?.name || ''}
				deleteId={conversation?.id || null}
				onClose={() => setDeleteModalOpen(false)}
				onSuccess={() => {
					router.push('/conversations');
				}}
			/>
		</div>
	);
}
