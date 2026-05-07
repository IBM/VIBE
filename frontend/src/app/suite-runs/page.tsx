'use client';

import { useEffect, useState } from 'react';
import { api, SuiteRun } from '@/lib/api';
import { useRouter } from 'next/navigation';
import {
	DataTable,
	Table,
	TableHead,
	TableRow,
	TableHeader,
	TableBody,
	TableCell,
	InlineLoading,
	InlineNotification,
	Grid,
	Column,
	Tag,
	Button,
	Modal,
	Pagination
} from '@carbon/react';
import Link from 'next/link';
import { ViewFilled, PlayFilled, TrashCan } from '@carbon/icons-react';
import SimilarityScoreDisplay from '../components/SimilarityScoreDisplay';
import DeleteConfirmationModal from '../components/DeleteConfirmationModal';

export default function SuiteRunsPage() {
	const [runs, setRuns] = useState<SuiteRun[]>([]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);
	const [successMessage, setSuccessMessage] = useState<string | null>(null);
	const [rerunningId, setRerunningId] = useState<number | null>(null);
	const [currentPage, setCurrentPage] = useState(0);
	const [pageSize, setPageSize] = useState(50);
	const [totalItems, setTotalItems] = useState(0);

	// Modal state
	const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
	const [deleteRunId, setDeleteRunId] = useState<number | null>(null);
	const [isRerunModalOpen, setIsRerunModalOpen] = useState(false);
	const [rerunRunId, setRerunRunId] = useState<number | null>(null);

	const router = useRouter();

	const fetchRuns = async () => {
		try {
			const response = await api.getSuiteRunsWithCount({
				limit: pageSize,
				offset: currentPage * pageSize
			});
			setRuns(response.data);
			setTotalItems(response.total);
		} catch (err: unknown) {
			if (err instanceof Error) setError(err.message);
			else setError(String(err));
		} finally {
			setLoading(false);
		}
	};

	useEffect(() => {
		fetchRuns();
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [currentPage, pageSize]);

	// Periodically refresh runs until all are completed and have similarity scores
	useEffect(() => {
		const interval = setInterval(() => {
			// Only refetch while there is at least one run in running state
			// or a completed run that is missing avg_similarity_score
			if (
				runs.some(
					(r) =>
						r.status === 'running' ||
						(r.status === 'completed' &&
							(r.avg_similarity_score === null || r.avg_similarity_score === undefined))
				)
			) {
				fetchRuns();
			}
		}, 5000);

		return () => clearInterval(interval);
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [runs]);

	const handleViewRun = (id: number) => {
		router.push(`/suite-runs/${id}`);
	};

	const handleRerunSuiteOpen = (id: number) => {
		setRerunRunId(id);
		setIsRerunModalOpen(true);
	};

	const handleRerunSuiteConfirm = async () => {
		if (!rerunRunId) return;

		setRerunningId(rerunRunId);
		setError(null);
		setSuccessMessage(null);

		try {
			const result = await api.rerunSuiteRun(rerunRunId);
			setSuccessMessage(`Suite run started successfully with ID ${result.suite_run_id}`);
			fetchRuns();
		} catch (err) {
			if (err instanceof Error) setError(err.message);
			else setError(String(err));
		} finally {
			setRerunningId(null);
			setIsRerunModalOpen(false);
		}
	};

	const handleDeleteSuiteRunOpen = (id: number) => {
		setDeleteRunId(id);
		setIsDeleteModalOpen(true);
	};

	if (loading) {
		return <InlineLoading description="Loading suite runs..." />;
	}
	if (error) {
		return <InlineNotification kind="error" title="Error" subtitle={error} hideCloseButton />;
	}

	const headers = [
		{ key: 'id', header: 'ID' },
		{ key: 'agent_name', header: 'Agent' },
		{ key: 'status', header: 'Status' },
		{ key: 'progress', header: 'Progress' },
		{ key: 'total_execution_time', header: 'Total execution time' },
		{ key: 'success_rate', header: 'Success rate' },
		{ key: 'avg_similarity_score', header: 'Avg similarity score' },
		{ key: 'token_usage', header: 'Token usage' },
		{ key: 'actions', header: 'Actions' }
	];

	const getRowActions = (rowId: string) => {
		const run = runs.find((run) => String(run.id) === rowId);
		if (!run) return null;

		return (
			<div style={{ display: 'flex', gap: '0.5rem' }}>
				<Button
					kind="ghost"
					size="sm"
					renderIcon={ViewFilled}
					onClick={() => handleViewRun(run.id)}
					iconDescription="View suite run details"
					hasIconOnly
				/>
				<Button
					kind="ghost"
					size="sm"
					renderIcon={PlayFilled}
					onClick={() => handleRerunSuiteOpen(run.id)}
					iconDescription="Re-run this suite"
					disabled={rerunningId === run.id}
					hasIconOnly
				/>
				<Button
					kind="danger--ghost"
					size="sm"
					renderIcon={TrashCan}
					onClick={() => handleDeleteSuiteRunOpen(run.id)}
					iconDescription="Delete this suite run"
					hasIconOnly
				/>
			</div>
		);
	};

	const rows = runs.map((run) => {
		// Calculate Total Execution Time from suite clock time
		// Note: Backend computes this dynamically from individual test execution times
		const totalMs =
			run.started_at && run.completed_at
				? new Date(run.completed_at).getTime() - new Date(run.started_at).getTime()
				: 0;
		const totalExecutionTimeSec = totalMs / 1000;

		// Calculate Success Rate
		const successfulTests = typeof run.successful_tests === 'number' ? run.successful_tests : 0;
		const successRate = run.total_tests > 0 ? (successfulTests / run.total_tests) * 100 : null;

		// Calculate Token Usage
		const inputTokens = run.total_input_tokens || 0;
		const outputTokens = run.total_output_tokens || 0;
		const totalTokens = inputTokens + outputTokens;

		let tokenUsageDisplay = '';
		if (totalTokens > 0) {
			if (inputTokens > 0 && outputTokens > 0) {
				tokenUsageDisplay = `${inputTokens.toLocaleString()} + ${outputTokens.toLocaleString()} = ${totalTokens.toLocaleString()}`;
			} else if (inputTokens > 0) {
				tokenUsageDisplay = `${inputTokens.toLocaleString()} input`;
			} else if (outputTokens > 0) {
				tokenUsageDisplay = `${outputTokens.toLocaleString()} output`;
			}
		} else {
			tokenUsageDisplay = '-';
		}

		return {
			id: String(run.id),
			agent_name: run.agent_name, // Add agent_name to the row data
			status: run.status,
			progress: `${run.progress}% (${run.completed_tests}/${run.total_tests})`,
			total_execution_time: totalExecutionTimeSec > 0 ? `${totalExecutionTimeSec.toFixed(2)}s` : 'N/A',
			success_rate: successRate !== null ? `${successRate.toFixed(1)}%` : 'N/A',
			avg_similarity_score: run.avg_similarity_score,
			token_usage: tokenUsageDisplay,
			actions: getRowActions(String(run.id))
		};
	});

	return (
		<>
			<Grid>
				<Column sm={4} md={8} lg={16}>
					<h1>Suite runs</h1>
					{successMessage && (
						<InlineNotification
							kind="success"
							title="Success"
							subtitle={successMessage}
							hideCloseButton={false}
							onCloseButtonClick={() => setSuccessMessage(null)}
							style={{ marginBottom: '1rem' }}
						/>
					)}
					{error && (
						<InlineNotification
							kind="error"
							title="Error"
							subtitle={error}
							hideCloseButton={false}
							onCloseButtonClick={() => setError(null)}
							style={{ marginBottom: '1rem' }}
						/>
					)}
					{runs.length === 0 ? (
						<p>No suite runs available.</p>
					) : (
						<DataTable rows={rows} headers={headers}>
							{({ rows, headers, getHeaderProps, getTableProps }) => (
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
											<TableRow key={row.id}>
												{row.cells.map((cell) => {
													if (cell.info.header === 'status') {
														const tagType =
															cell.value === 'completed'
																? 'green'
																: cell.value === 'running'
																	? 'blue'
																	: 'gray';
														return (
															<TableCell key={`${row.id}-${cell.id}`}>
																<Tag type={tagType}>{cell.value}</Tag>
															</TableCell>
														);
													}
													if (cell.info.header === 'agent_name') {
														const run = runs.find((r) => String(r.id) === row.id);
														return (
															<TableCell key={`${row.id}-${cell.id}`}>
																{run && run.agent_id ? (
																	<Link href={`/agents/${run.agent_id}`}>
																		{cell.value}
																	</Link>
																) : (
																	cell.value
																)}
															</TableCell>
														);
													}
													if (cell.info.header === 'avg_similarity_score') {
														return (
															<TableCell key={`${row.id}-${cell.id}`}>
																<SimilarityScoreDisplay score={cell.value} size="sm" />
															</TableCell>
														);
													}
													if (cell.info.header === 'actions') {
														return (
															<TableCell key={`${row.id}-actions`}>
																{getRowActions(row.id)}
															</TableCell>
														);
													}
													return (
														<TableCell key={`${row.id}-${cell.id}`}>{cell.value}</TableCell>
													);
												})}
											</TableRow>
										))}
									</TableBody>
								</Table>
							)}
						</DataTable>
					)}

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
				</Column>
			</Grid>

			<DeleteConfirmationModal
				isOpen={isDeleteModalOpen}
				deleteType="suite-run"
				deleteName={deleteRunId ? `Run #${deleteRunId}` : ''}
				deleteId={deleteRunId}
				onClose={() => setIsDeleteModalOpen(false)}
				onSuccess={() => {
					setSuccessMessage('Suite run deleted successfully');
					fetchRuns();
					setIsDeleteModalOpen(false);
				}}
			/>

			{/* Re-run Confirmation Modal */}
			<Modal
				open={isRerunModalOpen}
				modalHeading="Re-run Suite"
				primaryButtonText={rerunningId !== null ? 'Starting...' : 'Run'}
				secondaryButtonText="Cancel"
				onRequestClose={() => setIsRerunModalOpen(false)}
				onRequestSubmit={handleRerunSuiteConfirm}
				primaryButtonDisabled={rerunningId !== null}
			>
				<p>
					Are you sure you want to re-run this test suite? This will create a new suite run with the same
					agent and tests.
				</p>
			</Modal>
		</>
	);
}
