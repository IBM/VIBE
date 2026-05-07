'use client';

import { useState, useEffect, useMemo, type ReactNode } from 'react';
import {
	Table,
	TableHead,
	TableRow,
	TableHeader,
	TableBody,
	TableCell,
	Button,
	Tag,
	Modal,
	ModalBody,
	InlineLoading,
	CodeSnippet,
	InlineNotification,
	Pagination
} from '@carbon/react';
import { ViewFilled, Renew, PlayFilled, TrashCan, StopFilled } from '@carbon/icons-react';
import { api } from '@/lib/api';
import type { Job, TestResult } from '@/lib/api';
import styles from './JobsManager.module.scss';
import { useAgents, useTests, useAppData } from '@/lib/AppDataContext';
import SimilarityScoreDisplay from './SimilarityScoreDisplay';
import { getJobId, getStatusTagType } from '@/lib/utils';

interface JobsManagerProps {
	onViewSession: (sessionId: number) => void;
	onViewConversation: (conversationId: number) => void;
}

type JobTableRow = {
	id: string;
	agent: string;
	test: string;
	status: ReactNode;
	similarity_score: TestResult | undefined;
	created_at: string;
	actions: ReactNode;
};

type JobTableHeaderKey = keyof JobTableRow;

export default function JobsManager({ onViewSession, onViewConversation }: JobsManagerProps) {
	const { agents, fetchAgents } = useAgents();
	const { tests, fetchTests } = useTests();
	const { getResultById, fetchResults } = useAppData();

	const [jobs, setJobs] = useState<Job[]>([]);
	const [isLoading, setIsLoading] = useState(false);
	const [selectedJob, setSelectedJob] = useState<Job | null>(null);
	const [jobModalOpen, setJobModalOpen] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [rerunningJob, setRerunningJob] = useState(false);
	const [successMessage, setSuccessMessage] = useState<string | null>(null);
	const [deletingJob, setDeletingJob] = useState(false);
	const [cancelingJob, setCancelingJob] = useState(false);

	// Confirmation modal states
	const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
	const [jobToDelete, setJobToDelete] = useState<string | null>(null);
	const [isCancelModalOpen, setIsCancelModalOpen] = useState(false);
	const [jobToCancel, setJobToCancel] = useState<string | null>(null);

	const [currentPage, setCurrentPage] = useState(0);
	const [pageSize, setPageSize] = useState(50);
	const [totalItems, setTotalItems] = useState(0);

	useEffect(() => {
		fetchAgents();
		fetchTests();
		fetchResults();
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, []);

	const fetchJobs = async (force = false) => {
		if (isLoading && !force) {
			return;
		}

		try {
			setIsLoading(true);
			const response = await api.getJobsWithCount({
				limit: pageSize,
				offset: currentPage * pageSize
			});
			setJobs(response.data);
			setTotalItems(response.total);
		} catch (err) {
			setError(err instanceof Error ? err.message : 'Failed to fetch jobs');
		} finally {
			setIsLoading(false);
		}
	};

	useEffect(() => {
		fetchJobs(true);
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [currentPage]);

	// Handle job selection for viewing details
	const handleViewJob = (jobId: string) => {
		const job = jobs.find((j) => j.id === jobId);
		if (job) {
			setSelectedJob(job);
			setJobModalOpen(true);
		}
	};

	// View session or conversation when available
	const handleViewResult = () => {
		if (!selectedJob) return;

		if (selectedJob.session_id) {
			onViewSession(selectedJob.session_id);
		} else if (selectedJob.conversation_id) {
			onViewConversation(selectedJob.conversation_id);
		} else if (selectedJob.result_id) {
			// Legacy fallback - navigate to sessions page
			onViewSession(selectedJob.result_id);
		}
		setJobModalOpen(false);
	};

	// Refresh job list
	const handleRefresh = () => {
		fetchJobs();
	};

	// Re-run a job with the same agent and test
	const handleRerunJob = async () => {
		if (!selectedJob) return;

		setRerunningJob(true);
		setError(null);
		setSuccessMessage(null);

		try {
			if (selectedJob.test_id) {
				// Legacy test job
				const newJob = await api.createJob(selectedJob.agent_id, selectedJob.test_id);
				setSuccessMessage(`New job #${newJob.id} created successfully and is now queued for execution`);
			} else if (selectedJob.conversation_id) {
				// Conversation job
				const result = await api.executeConversation(selectedJob.agent_id, selectedJob.conversation_id);
				setSuccessMessage(
					`Conversation job ${result.job_id} created successfully and is now queued for execution`
				);
			} else {
				throw new Error('Job has neither test_id nor conversation_id');
			}
			fetchJobs();
		} catch (error) {
			setError(error instanceof Error ? error.message : 'Failed to re-run job');
		} finally {
			setRerunningJob(false);
		}
	};

	// Open delete confirmation modal
	const handleDeleteJobOpen = (jobId: string) => {
		setJobToDelete(jobId);
		setIsDeleteModalOpen(true);
	};

	// Delete a job after confirmation
	const handleDeleteJobConfirm = async () => {
		if (jobToDelete === null) return;

		setDeletingJob(true);
		setError(null);
		setSuccessMessage(null);

		try {
			await api.deleteJob(jobToDelete);
			fetchJobs();
			setSuccessMessage('Job deleted successfully');
		} catch (error) {
			setError(error instanceof Error ? error.message : 'Failed to delete job');
		} finally {
			setDeletingJob(false);
			setIsDeleteModalOpen(false);
			setJobToDelete(null);
		}
	};

	// Open cancel confirmation modal
	const handleCancelJobOpen = (jobId: string) => {
		setJobToCancel(jobId);
		setIsCancelModalOpen(true);
	};

	// Cancel a job after confirmation
	const handleCancelJobConfirm = async () => {
		if (jobToCancel === null) return;

		setCancelingJob(true);
		setError(null);
		setSuccessMessage(null);

		try {
			await api.cancelJob(jobToCancel);
			fetchJobs();
			setSuccessMessage('Job canceled successfully');
		} catch (error) {
			setError(error instanceof Error ? error.message : 'Failed to cancel job');
		} finally {
			setCancelingJob(false);
			setIsCancelModalOpen(false);
			setJobToCancel(null);
		}
	};

	// Define table headers
	const headers: Array<{ key: JobTableHeaderKey; header: string }> = [
		{ key: 'id', header: 'ID' },
		{ key: 'agent', header: 'Agent' },
		{ key: 'test', header: 'Test/Conversation' },
		{ key: 'status', header: 'Status' },
		{ key: 'similarity_score', header: 'Similarity score' },
		{ key: 'created_at', header: 'Created' },
		{ key: 'actions', header: 'Actions' }
	];

	// Memoize expensive row mapping with O(1) lookups
	const rows = useMemo((): JobTableRow[] => {
		const agentMap = new Map(agents.map((agent) => [agent.id, agent]));
		const testMap = new Map(tests.map((test) => [test.id, test]));

		return jobs.map((job) => {
			const agent = agentMap.get(job.agent_id);
			const test = testMap.get(job.test_id);
			const preferredId = getJobId(job);
			const result = preferredId !== null ? getResultById(preferredId) : undefined;

			const isPendingOrRunning = job.status === 'pending' || job.status === 'running';

			return {
				id: job.id.toString(),
				agent: agent ? `${agent.name} (v${agent.version})` : `Agent ${job.agent_id}`,
				test: job.conversation_id
					? `Conversation ${job.conversation_id}`
					: test
						? test.name
						: `Test ${job.test_id}`,
				status: (
					<Tag type={getStatusTagType(job.status)}>
						{job.status.charAt(0).toUpperCase() + job.status.slice(1)}
					</Tag>
				),
				similarity_score: result,
				created_at: new Date(job.created_at).toLocaleString(),
				actions: (
					<div style={{ display: 'flex', gap: '0.5rem' }}>
						<Button
							kind="ghost"
							size="sm"
							renderIcon={ViewFilled}
							onClick={() => handleViewJob(job.id)}
							iconDescription="View job details"
							hasIconOnly
						/>
						<Button
							kind="ghost"
							size="sm"
							renderIcon={PlayFilled}
							onClick={async () => {
								setRerunningJob(true);
								try {
									if (job.test_id) {
										// Legacy test job
										await api.createJob(job.agent_id, job.test_id);
									} else if (job.conversation_id) {
										// Conversation job
										await api.executeConversation(job.agent_id, job.conversation_id);
									} else {
										throw new Error('Job has neither test_id nor conversation_id');
									}
									fetchJobs();
								} catch (err) {
									setError(err instanceof Error ? err.message : 'Failed to re-run job');
								} finally {
									setRerunningJob(false);
								}
							}}
							iconDescription="Re-run this job"
							disabled={rerunningJob}
							hasIconOnly
						/>
						{isPendingOrRunning && (
							<Button
								kind="ghost"
								size="sm"
								renderIcon={StopFilled}
								onClick={() => handleCancelJobOpen(job.id)}
								iconDescription="Cancel this job"
								disabled={cancelingJob}
								hasIconOnly
							/>
						)}
						<Button
							kind="ghost"
							size="sm"
							renderIcon={TrashCan}
							onClick={() => handleDeleteJobOpen(job.id)}
							iconDescription="Delete this job"
							disabled={deletingJob}
							hasIconOnly
						/>
					</div>
				)
			};
		});
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [jobs, agents, tests, getResultById, rerunningJob, cancelingJob, deletingJob]);

	return (
		<div>
			<div
				style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}
			>
				<h3>Test Jobs</h3>
				<Button kind="ghost" size="sm" renderIcon={Renew} onClick={handleRefresh} disabled={isLoading}>
					{isLoading ? <InlineLoading description="Refreshing..." /> : 'Refresh'}
				</Button>
			</div>

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

			{jobs.length === 0 ? (
				<p>No jobs found. Start a new test execution to create a job.</p>
			) : (
				<Table size="md">
					<TableHead>
						<TableRow>
							{headers.map((header) => (
								<TableHeader key={header.key}>{header.header}</TableHeader>
							))}
						</TableRow>
					</TableHead>
					<TableBody>
						{rows.map((row) => (
							<TableRow key={row.id}>
								{headers.map((header) => {
									if (header.key === 'similarity_score') {
										return (
											<TableCell key={`${row.id}-${header.key}`}>
												<SimilarityScoreDisplay result={row.similarity_score} />
											</TableCell>
										);
									}
									return <TableCell key={`${row.id}-${header.key}`}>{row[header.key]}</TableCell>;
								})}
							</TableRow>
						))}
					</TableBody>
				</Table>
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

			{/* Job Details Modal */}
			{selectedJob && (
				<Modal
					open={jobModalOpen}
					onRequestClose={() => setJobModalOpen(false)}
					modalHeading={`Job #${selectedJob.id} Details`}
					primaryButtonText={
						getJobId(selectedJob)
							? 'View session'
							: selectedJob.conversation_id
								? 'View conversation'
								: 'View'
					}
					primaryButtonDisabled={!Boolean(getJobId(selectedJob) || selectedJob.conversation_id)}
					onRequestSubmit={handleViewResult}
					secondaryButtonText="Close"
					onSecondarySubmit={() => setJobModalOpen(false)}
				>
					<ModalBody>
						<div>
							<h5 className={styles.jobDetailsHeading}>Job Information</h5>
							<Table size="sm" useZebraStyles={false}>
								<TableHead>
									<TableRow>
										<TableHeader>Field</TableHeader>
										<TableHeader>Value</TableHeader>
									</TableRow>
								</TableHead>
								<TableBody>
									<TableRow>
										<TableCell>Agent</TableCell>
										<TableCell>
											{agents.find((a) => a.id === selectedJob.agent_id)?.name ||
												`Agent ${selectedJob.agent_id}`}
										</TableCell>
									</TableRow>
									<TableRow>
										<TableCell>Test/Conversation</TableCell>
										<TableCell>
											{selectedJob.conversation_id
												? `Conversation ${selectedJob.conversation_id}`
												: tests.find((t) => t.id === selectedJob.test_id)?.name ||
													`Test ${selectedJob.test_id}`}
										</TableCell>
									</TableRow>
									<TableRow>
										<TableCell>Status</TableCell>
										<TableCell>
											<Tag type={getStatusTagType(selectedJob.status)}>
												{selectedJob.status.charAt(0).toUpperCase() +
													selectedJob.status.slice(1)}
											</Tag>
										</TableCell>
									</TableRow>
									<TableRow>
										<TableCell>Created</TableCell>
										<TableCell>{new Date(selectedJob.created_at).toLocaleString()}</TableCell>
									</TableRow>
									<TableRow>
										<TableCell>Last Updated</TableCell>
										<TableCell>{new Date(selectedJob.updated_at).toLocaleString()}</TableCell>
									</TableRow>
									{getJobId(selectedJob) && (
										<TableRow>
											<TableCell>Result ID</TableCell>
											<TableCell>{getJobId(selectedJob)}</TableCell>
										</TableRow>
									)}
								</TableBody>
							</Table>

							{/* Re-run button */}
							<div
								style={{
									marginTop: '1rem',
									display: 'flex',
									justifyContent: 'flex-start',
									gap: '1rem'
								}}
							>
								<Button
									kind="primary"
									size="sm"
									renderIcon={PlayFilled}
									onClick={handleRerunJob}
									disabled={rerunningJob}
								>
									{rerunningJob ? <InlineLoading description="Creating job..." /> : 'Re-run Job'}
								</Button>

								{(selectedJob.status === 'pending' || selectedJob.status === 'running') && (
									<Button
										kind="danger"
										size="sm"
										renderIcon={StopFilled}
										onClick={() => {
											if (selectedJob) {
												handleCancelJobOpen(selectedJob.id);
												setJobModalOpen(false);
											}
										}}
										disabled={cancelingJob}
									>
										{cancelingJob ? <InlineLoading description="Canceling..." /> : 'Cancel Job'}
									</Button>
								)}

								<Button
									kind="danger"
									size="sm"
									renderIcon={TrashCan}
									onClick={() => {
										if (selectedJob) {
											handleDeleteJobOpen(selectedJob.id);
											setJobModalOpen(false);
										}
									}}
									disabled={deletingJob}
								>
									{deletingJob ? <InlineLoading description="Deleting..." /> : 'Delete Job'}
								</Button>
							</div>

							{/* Success or error message */}
							{successMessage && (
								<InlineNotification
									kind="success"
									title="Success"
									subtitle={successMessage}
									hideCloseButton={true}
									style={{ marginTop: '1rem' }}
								/>
							)}

							{error && (
								<InlineNotification
									kind="error"
									title="Error"
									subtitle={error}
									hideCloseButton={true}
									style={{ marginTop: '1rem' }}
								/>
							)}

							{selectedJob.error && (
								<div className={styles.errorSection}>
									<h5>Error</h5>
									<CodeSnippet type="inline" className="error-snippet">
										{selectedJob.error}
									</CodeSnippet>
								</div>
							)}
						</div>
					</ModalBody>
				</Modal>
			)}

			{/* Delete Job Confirmation Modal */}
			<Modal
				open={isDeleteModalOpen}
				modalHeading="Delete Job"
				primaryButtonText={deletingJob ? 'Deleting...' : 'Delete'}
				secondaryButtonText="Cancel"
				onRequestClose={() => setIsDeleteModalOpen(false)}
				onRequestSubmit={handleDeleteJobConfirm}
				primaryButtonDisabled={deletingJob}
				danger
			>
				<p>Are you sure you want to delete this job? This will permanently remove it from the system.</p>
			</Modal>

			{/* Cancel Job Confirmation Modal */}
			<Modal
				open={isCancelModalOpen}
				modalHeading="Cancel Job"
				primaryButtonText={cancelingJob ? 'Canceling...' : 'Cancel Job'}
				secondaryButtonText="Go Back"
				onRequestClose={() => setIsCancelModalOpen(false)}
				onRequestSubmit={handleCancelJobConfirm}
				primaryButtonDisabled={cancelingJob}
				danger
			>
				<p>Are you sure you want to cancel this job? This will stop the job execution.</p>
			</Modal>
		</div>
	);
}
