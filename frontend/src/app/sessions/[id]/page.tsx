'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import {
	Button,
	InlineLoading,
	InlineNotification,
	Tile,
	Tag,
	DataTable,
	Table,
	TableHead,
	TableRow,
	TableHeader,
	TableBody,
	TableCell,
	CodeSnippet,
	OverflowMenu,
	OverflowMenuItem
} from '@carbon/react';
import { ChartLine, Time, CheckmarkFilled, ErrorFilled, Information, ArrowLeft, ArrowRight } from '@carbon/icons-react';
import { api, ExecutionSession, SessionMessage, Conversation, Agent, ConversationTurnTarget } from '../../../lib/api';
import SessionViewer from '../../components/SessionViewer';
import TokenUsageTile from '../../components/TokenUsageTile';
import SimilarityScoreDisplay from '../../components/SimilarityScoreDisplay';
import {
	filterMessagesByRole,
	calculateTotalTokens,
	calculateResponseTime,
	findScoredAssistantMessage,
	calculateMessageTokens
} from '../../../lib/utils';
import styles from './page.module.scss';

export default function SessionDetailPage() {
	const params = useParams<{ id: string }>();
	const router = useRouter();
	const [session, setSession] = useState<ExecutionSession | null>(null);
	const [messages, setMessages] = useState<SessionMessage[]>([]);
	const [conversation, setConversation] = useState<Conversation | null>(null);
	const [agent, setAgent] = useState<Agent | null>(null);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);
	const [regenerating, setRegenerating] = useState(false);
	const [metrics, setMetrics] = useState({
		totalTokens: 0,
		inputTokens: 0,
		outputTokens: 0,
		totalDuration: 0,
		avgResponseTime: 0,
		turnCount: 0,
		similarityScore: 0,
		success: false
	});

	const loadSession = async () => {
		try {
			setLoading(true);
			const id = Number(params.id);

			// Get both session and messages in one call
			const transcriptData = await api.getSessionTranscriptWithSession(id);
			const sessionData = transcriptData.session;
			const messagesData = transcriptData.messages || [];

			setSession(sessionData);
			setMessages(messagesData);

			// Load related data
			if (sessionData.conversation_id) {
				const conversationData = await api.getConversationById(sessionData.conversation_id);
				setConversation(conversationData);
			}

			if (sessionData.agent_id) {
				const agents = await api.getAgents();
				const agentData = agents.find((a) => a.id === sessionData.agent_id);
				setAgent(agentData || null);
			}

			// Calculate metrics
			const assistantMessages = filterMessagesByRole(messagesData, 'assistant');
			const tokenTotals = calculateTotalTokens(messagesData);

			const totalDuration =
				sessionData.completed_at && sessionData.started_at
					? new Date(sessionData.completed_at).getTime() - new Date(sessionData.started_at).getTime()
					: 0;

			const responseTimes = assistantMessages.map((m) => calculateResponseTime(m)).filter((t) => t > 0);

			// Calculate average response time from message metadata, fallback to session duration
			let avgResponseTime = 0;
			if (responseTimes.length > 0) {
				avgResponseTime = responseTimes.reduce((sum, t) => sum + t, 0) / responseTimes.length;
			} else if (assistantMessages.length > 0 && totalDuration > 0) {
				// Fallback: divide total session duration by number of assistant messages
				avgResponseTime = totalDuration / assistantMessages.length;
			}

			// Calculate similarity score and success from assistant messages
			let similarityScore = 0;
			let success = false;

			if (assistantMessages.length > 0) {
				// Use the first assistant message with a similarity score
				const scoredMessage = findScoredAssistantMessage(messagesData);

				if (scoredMessage) {
					similarityScore = scoredMessage.similarity_score!;
					// Determine user turn index for this assistant message
					const assistantIndex = scoredMessage.sequence;
					const userTurnsBefore = messagesData.filter(
						(m) => m.role === 'user' && m.sequence <= assistantIndex
					).length;
					let threshold = 70;
					try {
						if (sessionData.conversation_id) {
							const targets: ConversationTurnTarget[] = await api.getConversationTurnTargets(
								sessionData.conversation_id
							);
							const match = targets.find((t) => t.user_sequence === userTurnsBefore);
							if (match && typeof match.threshold === 'number') {
								threshold = match.threshold;
							}
						}
					} catch {}
					success = similarityScore >= threshold;
				} else {
					success = sessionData.success || false;
				}
			} else {
				success = sessionData.success || false;
			}

			setMetrics({
				totalTokens: tokenTotals.total,
				inputTokens: tokenTotals.input,
				outputTokens: tokenTotals.output,
				totalDuration: totalDuration / 1000, // Convert to seconds
				avgResponseTime: avgResponseTime,
				turnCount: assistantMessages.length,
				similarityScore,
				success
			});
		} catch (err) {
			setError(err instanceof Error ? err.message : 'Failed to load session');
		} finally {
			setLoading(false);
		}
	};

	const handleRegenerateScore = async () => {
		if (!session?.id) return;

		setRegenerating(true);
		setError(null);

		try {
			const assistantMessages = filterMessagesByRole(messages, 'assistant');

			for (const message of assistantMessages) {
				if (message.id) {
					await api.regenerateSimilarityScore(message.id);
				}
			}

			await loadSession();
		} catch (err) {
			setError(err instanceof Error ? err.message : 'Failed to regenerate similarity score');
		} finally {
			setRegenerating(false);
		}
	};

	useEffect(() => {
		loadSession();
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [params.id]);

	if (loading) {
		return <InlineLoading description="Loading session..." />;
	}
	if (error) {
		return <InlineNotification kind="error" title="Error" subtitle={error} hideCloseButton />;
	}
	if (!session) {
		return <InlineNotification kind="error" title="Not found" subtitle="Session not found" hideCloseButton />;
	}

	return (
		<div className={styles.container}>
			{/* Enhanced header */}
			<div className={styles.headerRow}>
				<div className={styles.headerLeft}>
					<h2 className={styles.title}>Session #{session.id}</h2>
					<div className={styles.sessionInfo}>
						<Tag type={metrics.success ? 'green' : 'red'} size="sm">
							{metrics.success ? 'Success' : 'Failed'}
						</Tag>
						<Tag type="blue" size="sm">
							{metrics.totalDuration.toFixed(1)}s
						</Tag>
						<Tag type="purple" size="sm">
							{metrics.turnCount} turns
						</Tag>
						{session.error_message && (
							<Tag type="red" size="sm">
								Error
							</Tag>
						)}
					</div>
					<div className={styles.metadata}>
						<span className={styles.metaItem}>
							<strong>Started:</strong>{' '}
							{session.started_at ? new Date(session.started_at).toLocaleString() : 'Unknown'}
						</span>
						{session.completed_at && (
							<span className={styles.metaItem}>
								<strong>Completed:</strong> {new Date(session.completed_at).toLocaleString()}
							</span>
						)}
						{agent && (
							<span className={styles.metaItem}>
								<strong>Agent:</strong>{' '}
								<Link href={`/agents/${agent.id}`}>
									{agent.name} (v{agent.version})
								</Link>
							</span>
						)}
						{conversation && (
							<span className={styles.metaItem}>
								<strong>Conversation:</strong>{' '}
								<Link href={`/conversations/${conversation.id}`}>{conversation.name}</Link>
							</span>
						)}
					</div>
				</div>
				<div className={styles.headerRight}>
					<OverflowMenu flipped>
						<OverflowMenuItem
							itemText="Regenerate similarity score"
							onClick={handleRegenerateScore}
							disabled={regenerating}
						/>
						<OverflowMenuItem itemText="Export transcript" disabled />
						<OverflowMenuItem itemText="Download logs" disabled />
						<OverflowMenuItem itemText="Compare with others" disabled />
					</OverflowMenu>
					<Button kind="tertiary" onClick={() => router.push('/sessions')} renderIcon={ArrowLeft}>
						Back to sessions
					</Button>
					{session.conversation_id && (
						<Button
							kind="primary"
							onClick={() => router.push(`/conversations/${session.conversation_id}`)}
							renderIcon={ArrowRight}
						>
							View conversation
						</Button>
					)}
				</div>
			</div>

			{/* Performance metrics */}
			<div className={styles.metricsGrid}>
				<Tile className={styles.metricCard}>
					<div className={styles.metricIcon}>
						<Time />
					</div>
					<div className={styles.metricContent}>
						<div className={styles.metricValue}>{metrics.totalDuration.toFixed(1)}s</div>
						<div className={styles.metricLabel}>Total duration</div>
					</div>
				</Tile>
				<Tile className={styles.metricCard}>
					<div className={styles.metricIcon}>
						<ChartLine />
					</div>
					<div className={styles.metricContent}>
						<div className={styles.metricValue}>{metrics.avgResponseTime.toFixed(0)}ms</div>
						<div className={styles.metricLabel}>Avg response time</div>
					</div>
				</Tile>
				<Tile className={styles.metricCard}>
					<div className={styles.metricIcon}>
						<Information />
					</div>
					<div className={styles.metricContent}>
						<div className={styles.metricValue}>{metrics.totalTokens.toLocaleString()}</div>
						<div className={styles.metricLabel}>Total tokens</div>
					</div>
				</Tile>
				<Tile className={styles.metricCard}>
					<div className={styles.metricIcon}>
						<CheckmarkFilled />
					</div>
					<div className={styles.metricContent}>
						<div className={styles.metricValue}>{metrics.turnCount}</div>
						<div className={styles.metricLabel}>Assistant turns</div>
					</div>
				</Tile>
				<Tile className={styles.metricCard}>
					<div className={styles.metricIcon}>
						<ChartLine />
					</div>
					<div className={styles.metricContent}>
						<div className={styles.metricValue}>{metrics.similarityScore.toFixed(1)}%</div>
						<div className={styles.metricLabel}>Similarity score</div>
					</div>
				</Tile>
			</div>

			{/* Token usage breakdown */}
			<TokenUsageTile
				inputTokens={metrics.inputTokens}
				outputTokens={metrics.outputTokens}
				totalTokens={metrics.totalTokens}
			/>

			{/* Error details */}
			{session.error_message && (
				<Tile className={styles.errorTile}>
					<div className={styles.sectionHeader}>
						<h4 className={styles.sectionTitle}>
							<ErrorFilled className={styles.errorIcon} />
							Error details
						</h4>
					</div>
					<CodeSnippet type="multi" feedback="Copied to clipboard">
						{session.error_message}
					</CodeSnippet>
				</Tile>
			)}

			{/* Conversation transcript */}
			<Tile className={styles.transcriptTile}>
				<div className={styles.sectionHeader}>
					<h4 className={styles.sectionTitle}>Conversation transcript</h4>
					<div className={styles.transcriptStats}>
						<Tag type="gray" size="sm">
							{messages.length} messages
						</Tag>
						<Tag type="blue" size="sm">
							{metrics.turnCount} assistant responses
						</Tag>
					</div>
				</div>
				<SessionViewer session={session} messages={messages} />
			</Tile>

			{/* Message analysis */}
			{messages.length > 0 && (
				<Tile className={styles.analysisTile}>
					<div className={styles.sectionHeader}>
						<h4 className={styles.sectionTitle}>Message analysis</h4>
					</div>
					<DataTable
						rows={(() => {
							// Calculate total duration for fallback response time calculation.
							const totalDuration =
								session?.completed_at && session?.started_at
									? new Date(session.completed_at).getTime() - new Date(session.started_at).getTime()
									: 0;
							const assistantCount = messages.filter((m) => m.role === 'assistant').length;

							return messages.map((message, index) => ({
								id: message.id?.toString() || index.toString(),
								sequence: message.sequence,
								role: message.role,
								content:
									message.content.substring(0, 100) + (message.content.length > 100 ? '...' : ''),
								tokens: calculateMessageTokens(message),
								responseTime: (() => {
									const responseTime = calculateResponseTime(message, totalDuration, assistantCount);
									if (responseTime > 0) {
										return `${(responseTime / 1000).toFixed(1)}s`;
									}
									return '-';
								})(),
								similarityScore:
									message.similarity_score !== undefined ? message.similarity_score : null,
								timestamp: message.timestamp ? new Date(message.timestamp).toLocaleString() : '-'
							}));
						})()}
						headers={[
							{ key: 'sequence', header: '#' },
							{ key: 'role', header: 'Role' },
							{ key: 'content', header: 'Content' },
							{ key: 'tokens', header: 'Tokens' },
							{ key: 'responseTime', header: 'Response time' },
							{ key: 'similarityScore', header: 'Similarity score' },
							{ key: 'timestamp', header: 'Timestamp' }
						]}
					>
						{({ rows, headers, getTableProps, getHeaderProps, getRowProps }) => (
							<Table {...getTableProps()}>
								<TableHead>
									<TableRow>
										{headers.map((header, index) => (
											<TableHeader
												{...getHeaderProps({ header })}
												key={`header-${header.key}-${index}`}
											>
												{header.header}
											</TableHeader>
										))}
									</TableRow>
								</TableHead>
								<TableBody>
									{rows.map((row) => (
										<TableRow {...getRowProps({ row })} key={row.id}>
											{row.cells.map((cell) => {
												if (cell.info.header === 'role') {
													return (
														<TableCell key={cell.id}>
															<Tag
																type={
																	cell.value === 'user'
																		? 'blue'
																		: cell.value === 'assistant'
																			? 'green'
																			: 'purple'
																}
																size="sm"
															>
																{cell.value}
															</Tag>
														</TableCell>
													);
												}
												if (cell.info.header === 'similarityScore') {
													const score = cell.value as number | null;
													return (
														<TableCell key={cell.id}>
															<SimilarityScoreDisplay
																score={score || undefined}
																size="sm"
															/>
														</TableCell>
													);
												}
												return <TableCell key={cell.id}>{cell.value}</TableCell>;
											})}
										</TableRow>
									))}
								</TableBody>
							</Table>
						)}
					</DataTable>
				</Tile>
			)}
		</div>
	);
}
