'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
	Button,
	InlineLoading,
	InlineNotification,
	Tag,
	Tile,
	CodeSnippet,
	Modal
} from '@carbon/react';
import { ArrowLeft, PlayFilled, StopFilled, TrashCan, Renew } from '@carbon/icons-react';
import { api } from '@/lib/api';
import type { Job } from '@/lib/api';
import { getStatusTagType } from '@/lib/utils';
import { useAgents, useTests } from '@/lib/AppDataContext';
import styles from './page.module.scss';

const POLL_INTERVAL_MS = 3000;

export default function JobDetailPage() {
	const params = useParams<{ id: string }>();
	const router = useRouter();
	const { agents } = useAgents();
	const { tests } = useTests();

	const [job, setJob] = useState<Job | null>(null);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);
	const [actionError, setActionError] = useState<string | null>(null);
	const [actionSuccess, setActionSuccess] = useState<string | null>(null);
	const [rerunning, setRerunning] = useState(false);
	const [canceling, setCanceling] = useState(false);
	const [deleting, setDeleting] = useState(false);
	const [isCancelModalOpen, setIsCancelModalOpen] = useState(false);
	const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);

	const loadJob = useCallback(
		async (silent = false) => {
			if (!silent) setLoading(true);
			try {
				const data = await api.getJobStatus(params.id);
				setJob(data);
				setError(null);
			} catch (err) {
				setError(err instanceof Error ? err.message : 'Failed to load job');
			} finally {
				if (!silent) setLoading(false);
			}
		},
		[params.id]
	);

	// Initial load
	useEffect(() => {
		loadJob();
	}, [loadJob]);

	// Poll while job is active
	useEffect(() => {
		if (!job) return;
		if (job.status !== 'pending' && job.status !== 'running') return;

		const timer = setInterval(() => loadJob(true), POLL_INTERVAL_MS);
		return () => clearInterval(timer);
	}, [job, loadJob]);

	const handleRerun = async () => {
		if (!job) return;
		setRerunning(true);
		setActionError(null);
		setActionSuccess(null);
		try {
			if (job.test_id) {
				const newJob = await api.createJob(job.agent_id, job.test_id);
				setActionSuccess(`New job created: ${newJob.id}`);
			} else if (job.conversation_id) {
				const result = await api.executeConversation(job.agent_id, job.conversation_id);
				router.push(`/jobs/${result.job_id}`);
				return;
			}
		} catch (err) {
			setActionError(err instanceof Error ? err.message : 'Failed to re-run job');
		} finally {
			setRerunning(false);
		}
	};

	const handleCancelConfirm = async () => {
		if (!job) return;
		setCanceling(true);
		setActionError(null);
		try {
			await api.cancelJob(job.id);
			setActionSuccess('Job canceled');
			setIsCancelModalOpen(false);
			loadJob(true);
		} catch (err) {
			setActionError(err instanceof Error ? err.message : 'Failed to cancel job');
		} finally {
			setCanceling(false);
		}
	};

	const handleDeleteConfirm = async () => {
		if (!job) return;
		setDeleting(true);
		setActionError(null);
		try {
			await api.deleteJob(job.id);
			router.push('/jobs');
		} catch (err) {
			setActionError(err instanceof Error ? err.message : 'Failed to delete job');
			setDeleting(false);
			setIsDeleteModalOpen(false);
		}
	};

	const agentName = job
		? (agents.find((a) => a.id === job.agent_id)?.name ?? `Agent ${job.agent_id}`)
		: '';

	const agentVersion = job ? agents.find((a) => a.id === job.agent_id)?.version : undefined;

	const testName = job?.test_id
		? (tests.find((t) => t.id === job.test_id)?.name ?? `Test ${job.test_id}`)
		: null;

	const isActive = job?.status === 'pending' || job?.status === 'running';

	if (loading) {
		return <InlineLoading description="Loading job..." />;
	}
	if (error) {
		return <InlineNotification kind="error" title="Error" subtitle={error} hideCloseButton />;
	}
	if (!job) {
		return <InlineNotification kind="error" title="Not found" subtitle="Job not found" hideCloseButton />;
	}

	return (
		<div className={styles.container}>
			{/* Header */}
			<div className={styles.headerRow}>
				<div className={styles.headerLeft}>
					<h2 className={styles.title}>Job #{job.id.split('-')[0]}…</h2>
					<div className={styles.headerMeta}>
						<Tag type={getStatusTagType(job.status)}>
							{job.status.charAt(0).toUpperCase() + job.status.slice(1)}
						</Tag>
						{isActive && <InlineLoading description="Running…" />}
					</div>
				</div>
				<div className={styles.headerRight}>
					<Button kind="tertiary" renderIcon={ArrowLeft} onClick={() => router.push('/jobs')}>
						Back to jobs
					</Button>
					{(job.session_id || job.result_id) && (
						<Button
							kind="primary"
							onClick={() => router.push(`/sessions/${job.session_id ?? job.result_id}`)}
						>
							View session
						</Button>
					)}
					{!job.session_id && !job.result_id && job.conversation_id && (
						<Button kind="primary" onClick={() => router.push(`/conversations/${job.conversation_id}`)}>
							View conversation
						</Button>
					)}
				</div>
			</div>

			{/* Action feedback */}
			{actionError && (
				<InlineNotification
					kind="error"
					title="Error"
					subtitle={actionError}
					hideCloseButton={false}
					onCloseButtonClick={() => setActionError(null)}
					style={{ marginBottom: '1rem' }}
				/>
			)}
			{actionSuccess && (
				<InlineNotification
					kind="success"
					title="Success"
					subtitle={actionSuccess}
					hideCloseButton={false}
					onCloseButtonClick={() => setActionSuccess(null)}
					style={{ marginBottom: '1rem' }}
				/>
			)}

			{/* Actions */}
			<div className={styles.actionsRow}>
				<Button
					kind="secondary"
					size="sm"
					renderIcon={PlayFilled}
					onClick={handleRerun}
					disabled={rerunning}
				>
					{rerunning ? <InlineLoading description="Creating job…" /> : 'Re-run'}
				</Button>
				{isActive && (
					<Button
						kind="danger--tertiary"
						size="sm"
						renderIcon={StopFilled}
						onClick={() => setIsCancelModalOpen(true)}
						disabled={canceling}
					>
						Cancel
					</Button>
				)}
				<Button
					kind="danger--ghost"
					size="sm"
					renderIcon={TrashCan}
					onClick={() => setIsDeleteModalOpen(true)}
					disabled={deleting}
				>
					Delete
				</Button>
				<Button
					kind="ghost"
					size="sm"
					renderIcon={Renew}
					onClick={() => loadJob()}
					disabled={loading}
				>
					Refresh
				</Button>
			</div>

			{/* Details */}
			<div className={styles.detailsGrid}>
				<Tile className={styles.detailTile}>
					<p className={styles.tileHeading}>Job details</p>

					<div className={styles.fieldRow}>
						<span className={styles.fieldLabel}>ID</span>
						<span className={styles.fieldValue}>{job.id}</span>
					</div>
					<div className={styles.fieldRow}>
						<span className={styles.fieldLabel}>Status</span>
						<span className={styles.fieldValue}>
							<Tag type={getStatusTagType(job.status)}>
								{job.status.charAt(0).toUpperCase() + job.status.slice(1)}
							</Tag>
						</span>
					</div>
					{job.progress !== undefined && (
						<div className={styles.fieldRow}>
							<span className={styles.fieldLabel}>Progress</span>
							<span className={styles.fieldValue}>{job.progress}%</span>
						</div>
					)}
					<div className={styles.fieldRow}>
						<span className={styles.fieldLabel}>Created</span>
						<span className={styles.fieldValue}>{new Date(job.created_at).toLocaleString()}</span>
					</div>
					<div className={styles.fieldRow}>
						<span className={styles.fieldLabel}>Last updated</span>
						<span className={styles.fieldValue}>{new Date(job.updated_at).toLocaleString()}</span>
					</div>
					{job.job_type && (
						<div className={styles.fieldRow}>
							<span className={styles.fieldLabel}>Type</span>
							<span className={styles.fieldValue}>{job.job_type}</span>
						</div>
					)}
				</Tile>

				<Tile className={styles.detailTile}>
					<p className={styles.tileHeading}>Execution context</p>

					<div className={styles.fieldRow}>
						<span className={styles.fieldLabel}>Agent</span>
						<span className={styles.fieldValue}>
							{agentVersion ? `${agentName} (v${agentVersion})` : agentName}
						</span>
					</div>
					{job.conversation_id && (
						<div className={styles.fieldRow}>
							<span className={styles.fieldLabel}>Conversation</span>
							<span className={styles.fieldValue}>
								<Button
									kind="ghost"
									size="sm"
									onClick={() => router.push(`/conversations/${job.conversation_id}`)}
								>
									Conversation #{job.conversation_id}
								</Button>
							</span>
						</div>
					)}
					{testName && (
						<div className={styles.fieldRow}>
							<span className={styles.fieldLabel}>Test</span>
							<span className={styles.fieldValue}>{testName}</span>
						</div>
					)}
					{job.session_id && (
						<div className={styles.fieldRow}>
							<span className={styles.fieldLabel}>Session</span>
							<span className={styles.fieldValue}>
								<Button
									kind="ghost"
									size="sm"
									onClick={() => router.push(`/sessions/${job.session_id}`)}
								>
									Session #{job.session_id}
								</Button>
							</span>
						</div>
					)}
					{job.suite_run_id && (
						<div className={styles.fieldRow}>
							<span className={styles.fieldLabel}>Suite run</span>
							<span className={styles.fieldValue}>
								<Button
									kind="ghost"
									size="sm"
									onClick={() => router.push(`/suite-runs/${job.suite_run_id}`)}
								>
									Run #{job.suite_run_id}
								</Button>
							</span>
						</div>
					)}
				</Tile>
			</div>

			{/* Error details */}
			{job.error && (
				<Tile className={styles.errorTile}>
					<p className={styles.errorHeading}>Error details</p>
					<CodeSnippet type="multi" feedback="Copied to clipboard">
						{job.error}
					</CodeSnippet>
				</Tile>
			)}

			{/* Cancel confirmation */}
			<Modal
				open={isCancelModalOpen}
				modalHeading="Cancel job"
				primaryButtonText={canceling ? 'Canceling…' : 'Cancel job'}
				primaryButtonDisabled={canceling}
				secondaryButtonText="Go back"
				onRequestClose={() => setIsCancelModalOpen(false)}
				onRequestSubmit={handleCancelConfirm}
				danger
			>
				<p>Are you sure you want to cancel this job? This will stop the job execution.</p>
			</Modal>

			{/* Delete confirmation */}
			<Modal
				open={isDeleteModalOpen}
				modalHeading="Delete job"
				primaryButtonText={deleting ? 'Deleting…' : 'Delete'}
				primaryButtonDisabled={deleting}
				secondaryButtonText="Cancel"
				onRequestClose={() => setIsDeleteModalOpen(false)}
				onRequestSubmit={handleDeleteConfirm}
				danger
			>
				<p>Are you sure you want to delete this job? This will permanently remove it from the system.</p>
			</Modal>
		</div>
	);
}
