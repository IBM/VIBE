import { InlineLoading, Pagination } from '@carbon/react';
import { Report } from '@carbon/icons-react';
import styles from '../page.module.scss';
import EmptyState from './EmptyState';
import TableRenderer from './TableRenderer';
import { useAgents, useTests, useResultOperations } from '@/lib/AppDataContext';
import { TestResult } from '@/lib/api';
import { useState, useEffect, useMemo } from 'react';

interface ResultsProps {
	onViewResult: (id: number) => void;
	onAddTestClick: () => void;
}

export default function Results({ onViewResult, onAddTestClick }: ResultsProps) {
	const [results, setResults] = useState<TestResult[]>([]);
	const [currentPage, setCurrentPage] = useState(0);
	const [pageSize, setPageSize] = useState(50);
	const [totalItems, setTotalItems] = useState(0);

	const { agents, fetchAgents } = useAgents();
	const { tests, fetchTests } = useTests();
	const { loading, getResults } = useResultOperations();

	useEffect(() => {
		fetchAgents();
		fetchTests();
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, []);

	const fetchResults = async () => {
		try {
			const response = await getResults({
				limit: pageSize,
				offset: currentPage * pageSize
			});
			setResults(response.data);
			setTotalItems(response.total);
		} catch {
			setResults([]);
			setTotalItems(0);
		}
	};

	useEffect(() => {
		fetchResults();
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [currentPage, pageSize]);

	const resultRows = useMemo(() => {
		const agentMap = new Map(agents.map((agent) => [agent.id, agent]));
		const testMap = new Map(tests.map((test) => [test.id, test]));

		return results.map((result) => {
			const inputTokens = result.input_tokens || 0;
			const outputTokens = result.output_tokens || 0;
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
				id: result.id?.toString() || `result-${Date.now()}`,
				agent_name: agentMap.get(result.agent_id)?.name || 'Unknown',
				test_name: testMap.get(result.test_id)?.name || 'Unknown',
				success: result.success,
				execution_time: result.execution_time ? (result.execution_time / 1000).toFixed(3) : '0.000',
				token_usage: tokenDisplay,
				similarity_score: result,
				created_at: new Date(result.created_at!).toLocaleString()
			};
		});
	}, [results, agents, tests]);

	const resultHeaders = [
		{ key: 'agent_name', header: 'Agent' },
		{ key: 'test_name', header: 'Test' },
		{ key: 'success', header: 'Success' },
		{ key: 'execution_time', header: 'Time (s)' },
		{ key: 'token_usage', header: 'Tokens' },
		{ key: 'similarity_score', header: 'Similarity score' },
		{ key: 'created_at', header: 'Created at' },
		{ key: 'actions', header: 'Actions' }
	];

	return (
		<>
			<div className={styles.panelHeader}>
				<h2>Results</h2>
			</div>
			{resultRows.length > 0 ? (
				<>
					<TableRenderer headers={resultHeaders} rows={resultRows} type="result" onView={onViewResult} />

					{/* Pagination */}
					{totalItems > 0 && (
						<Pagination
							totalItems={totalItems}
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
			) : (
				<EmptyState
					title="Test Results"
					description="Run tests against your agents to see results here."
					icon={Report}
					onAddClick={onAddTestClick}
				/>
			)}
		</>
	);
}
