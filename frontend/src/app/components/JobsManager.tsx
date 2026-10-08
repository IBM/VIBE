'use client';

import { useState, useEffect, useMemo, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
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
	InlineLoading,
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
	const router = useRouter();
	const { agents, fetchAgents } = useAgents();
	const { tests, fetchTests } = useTests();
	const { getResultById, fetchResults } = useAppData();

	const [jobs, setJobs] = useState<Job[]>([]);
	const [isLoading, setIsLoading] = useState(false);
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

	// Refresh job list
	const handleRefresh = () => {
		fetchJobs();
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
							onClick={() => router.push(`/jobs/${job.id}`)}
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
