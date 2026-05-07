'use client';

import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { DataTable, Table, TableHead, TableRow, TableHeader, TableBody, TableCell, Tag, Button } from '@carbon/react';
import { ViewFilled } from '@carbon/icons-react';
import { ExecutionSession, Agent, SessionMessage, Conversation } from '../../lib/api';
import SimilarityScoreDisplay from './SimilarityScoreDisplay';

interface SessionsTableProps {
	sessions: ExecutionSession[];
	agents: Agent[];
	limit?: number;
	sessionMessages?: Map<number, SessionMessage[]>; // Optional messages for accurate success calculation
	conversations?: Conversation[]; // Optional conversations for displaying names
	onViewSession?: (sessionId: number) => void;
	hiddenColumns?: string[]; // Optional array of column keys to hide
}

export default function SessionsTable({
	sessions,
	agents,
	limit,
	sessionMessages,
	conversations,
	onViewSession,
	hiddenColumns = []
}: SessionsTableProps) {
	const router = useRouter();

	const handleViewSession = (sessionId: number) => {
		if (onViewSession) {
			onViewSession(sessionId);
		} else {
			router.push(`/sessions/${sessionId}`);
		}
	};

	const agentMap = new Map(agents.map((agent) => [agent.id, agent]));
	const conversationMap = new Map(conversations?.map((conv) => [conv.id, conv]) || []);

	const displaySessions = limit ? sessions.slice(0, limit) : sessions;

	const sessionRows = displaySessions.map((session) => {
		const agent = agentMap.get(session.agent_id);
		const conversation = conversationMap.get(session.conversation_id);
		const duration =
			session.completed_at && session.started_at
				? `${((new Date(session.completed_at).getTime() - new Date(session.started_at).getTime()) / 1000).toFixed(1)}s`
				: '-';

		// Calculate success and similarity score (same logic as session detail page)
		let success = session.success || false;
		let similarityScore = 0;
		if (sessionMessages && session.id) {
			const messages = sessionMessages.get(session.id);
			if (messages && messages.length > 0) {
				const assistantMessages = messages.filter((m) => m.role === 'assistant');
				if (assistantMessages.length > 0) {
					const scoredMessage = assistantMessages.find(
						(m) => m.similarity_scoring_status === 'completed' && typeof m.similarity_score === 'number'
					);
					if (scoredMessage) {
						similarityScore = scoredMessage.similarity_score!;
						success = similarityScore >= 70; // Default threshold TODO: Make this configurable
					}
				}
			}
		}

		// Format conversation name with ID for reference
		const conversationName = conversation
			? `${conversation.name} (#${conversation.id})`
			: `Conversation #${session.conversation_id}`;

		return {
			id: session.id?.toString() || '',
			status: success,
			conversation: {
				name: conversationName,
				id: session.conversation_id
			},
			agent: {
				name: agent?.name || `Agent ${session.agent_id}`,
				id: session.agent_id
			},
			duration,
			similarity_score: similarityScore > 0 ? similarityScore : null,
			started: session.started_at ? new Date(session.started_at).toLocaleString() : '-',
			actions: (
				<Button
					kind="ghost"
					size="sm"
					renderIcon={ViewFilled}
					iconDescription="View session details"
					hasIconOnly
					onClick={() => handleViewSession(session.id!)}
				/>
			)
		};
	});

	const headers = [
		{ key: 'status', header: 'Status' },
		{ key: 'conversation', header: 'Conversation' },
		{ key: 'agent', header: 'Agent' },
		{ key: 'duration', header: 'Duration' },
		{ key: 'similarity_score', header: 'Similarity score' },
		{ key: 'started', header: 'Started' },
		{ key: 'actions', header: 'Actions' }
	].filter((header) => !hiddenColumns.includes(header.key));

	return (
		<DataTable rows={sessionRows} headers={headers}>
			{({ rows, headers, getTableProps, getHeaderProps, getRowProps }) => (
				<Table {...getTableProps()}>
					<TableHead>
						<TableRow>
							{headers.map((header, index) => (
								<TableHeader {...getHeaderProps({ header })} key={`header-${header.key}-${index}`}>
									{header.header}
								</TableHeader>
							))}
						</TableRow>
					</TableHead>
					<TableBody>
						{rows.map((row) => (
							<TableRow {...getRowProps({ row })} key={row.id}>
								{row.cells.map((cell) => {
									if (cell.info.header === 'status') {
										return (
											<TableCell key={cell.id}>
												<Tag type={cell.value ? 'green' : 'red'} size="sm">
													{cell.value ? 'Success' : 'Failed'}
												</Tag>
											</TableCell>
										);
									}
									if (cell.info.header === 'conversation') {
										const conversationData = cell.value as { name: string; id?: number };
										return (
											<TableCell key={cell.id}>
												{conversationData.id ? (
													<Link href={`/conversations/${conversationData.id}`}>
														{conversationData.name}
													</Link>
												) : (
													conversationData.name
												)}
											</TableCell>
										);
									}
									if (cell.info.header === 'agent') {
										const agentData = cell.value as { name: string; id?: number };
										return (
											<TableCell key={cell.id}>
												{agentData.id ? (
													<Link href={`/agents/${agentData.id}`}>{agentData.name}</Link>
												) : (
													agentData.name
												)}
											</TableCell>
										);
									}
									if (cell.info.header === 'similarity_score') {
										const score = cell.value as number | null;
										return (
											<TableCell key={cell.id}>
												<SimilarityScoreDisplay score={score || undefined} size="sm" />
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
	);
}
