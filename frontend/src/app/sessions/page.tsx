'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { InlineLoading, Pagination } from '@carbon/react';
import { Report } from '@carbon/icons-react';
import styles from '../page.module.scss';
import noticeStyles from '../components/Notice.module.scss';
import EmptyState from '../components/EmptyState';
import TableRenderer from '../components/TableRenderer';
import { api, Agent, Conversation, TestResult } from '../../lib/api';

type ResultRow = TestResult;

export default function SessionsPage() {
	const router = useRouter();
	const [results, setResults] = useState<ResultRow[]>([]);
	const [agents, setAgents] = useState<Agent[]>([]);
	const [conversations, setConversations] = useState<Conversation[]>([]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);
	const [currentPage, setCurrentPage] = useState(0);
	const [pageSize, setPageSize] = useState(50);
	const [totalCount, setTotalCount] = useState(0);

	const loadData = async () => {
		try {
			setLoading(true);
			const [resultsResponse, agentsResponse, conversationsResponse] = await Promise.all([
				api.getResultsWithCount({ limit: pageSize, offset: currentPage * pageSize }),
				api.getAgents(),
				api.getConversations({ limit: 1000, offset: 0 })
			]);

			setResults(resultsResponse.data);
			setTotalCount(resultsResponse.total);
			setAgents(agentsResponse);
			setConversations(conversationsResponse.data);
		} catch (err) {
			setError(err instanceof Error ? err.message : 'Failed to load sessions');
		} finally {
			setLoading(false);
		}
	};

	useEffect(() => {
		loadData();
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [currentPage, pageSize]);

	const sessionRows = useMemo(() => {
		const agentMap = new Map(agents.map((agent) => [agent.id, agent]));
		const conversationMap = new Map(conversations.map((conv) => [conv.id, conv]));

		return results.map((result) => {
			const agent = agentMap.get(result.agent_id);
			const conversation = conversationMap.get(result.test_id);

			// Token usage from result fields
			const inputTokens = typeof result.input_tokens === 'number' ? result.input_tokens : 0;
			const outputTokens = typeof result.output_tokens === 'number' ? result.output_tokens : 0;

			const totalTokens = inputTokens + outputTokens;
			let tokenDisplay = '';
			if (totalTokens > 0) {
				if (inputTokens > 0 && outputTokens > 0) {
					tokenDisplay = `${inputTokens.toLocaleString()} + ${outputTokens.toLocaleString()} = ${totalTokens.toLocaleString()}`;
				} else if (inputTokens > 0) {
					tokenDisplay = `${inputTokens.toLocaleString()} input`;
				} else if (outputTokens > 0) {
					tokenDisplay = `${outputTokens.toLocaleString()} output`;
				} else {
					tokenDisplay = totalTokens.toLocaleString();
				}
			} else {
				tokenDisplay = '-';
			}

			return {
				id: (result.id ?? Date.now()).toString(),
				agent_name: agent?.name || 'Unknown',
				conversation_name: conversation?.name || 'Unknown',
				success: result.success,
				execution_time:
					typeof result.execution_time === 'number' ? (result.execution_time / 1000).toFixed(3) : '0.000',
				token_usage: tokenDisplay,
				similarity_score: result as unknown as TestResult,
				created_at: result.created_at ? new Date(result.created_at).toLocaleString() : '-'
			};
		});
	}, [results, agents, conversations]);

	// Create maps for linking agent and conversation IDs
	const agentIdMap = useMemo(() => {
		const map = new Map<number, number>();
		results.forEach((result) => {
			if (result.id && result.agent_id) {
				map.set(result.id, result.agent_id);
			}
		});
		return map;
	}, [results]);

	const conversationIdMap = useMemo(() => {
		const map = new Map<number, number>();
		results.forEach((result) => {
			if (result.id && result.test_id) {
				map.set(result.id, result.test_id);
			}
		});
		return map;
	}, [results]);

	const sessionHeaders = [
		{ key: 'agent_name', header: 'Agent' },
		{ key: 'conversation_name', header: 'Conversation' },
		{ key: 'success', header: 'Success' },
		{ key: 'execution_time', header: 'Time (s)' },
		{ key: 'token_usage', header: 'Tokens' },
		{ key: 'similarity_score', header: 'Similarity score' },
		{ key: 'created_at', header: 'Started at' },
		{ key: 'actions', header: 'Actions' }
	];

	const handleViewSession = (id: number) => {
		const result = results.find((r) => r.id === id);
		if (result) {
			router.push(`/sessions/${result.id}`);
		}
	};

	return (
		<>
			<div className={styles.panelHeader}>
				<h2>Sessions</h2>
			</div>
			{sessionRows.length > 0 ? (
				<>
					<TableRenderer
						headers={sessionHeaders}
						rows={sessionRows}
						type="result"
						onView={handleViewSession}
						agentIdMap={agentIdMap}
						conversationIdMap={conversationIdMap}
					/>

					{/* Pagination */}
					{totalCount > 0 && (
						<Pagination
							totalItems={totalCount}
							pageSize={pageSize}
							pageSizes={[10, 25, 50, 100]}
							page={currentPage + 1} // Carbon uses 1-based indexing
							onChange={({ page, pageSize: newPageSize }) => {
								if (newPageSize !== pageSize) {
									setPageSize(newPageSize);
									setCurrentPage(0);
								} else {
									setCurrentPage(page - 1); // Convert back to 0-based indexing
								}
							}}
							backwardText="Previous page"
							forwardText="Next page"
							itemsPerPageText="Items per page:"
						/>
					)}
				</>
			) : loading ? (
				<InlineLoading description="Loading data..." />
			) : error ? (
				<div className={noticeStyles.errorBox}>{error}</div>
			) : (
				<EmptyState
					title="Sessions"
					description="Execute conversations to see session transcripts here."
					icon={Report}
					onAddClick={() => router.push('/conversations')}
				/>
			)}
		</>
	);
}
