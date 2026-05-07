'use client';

import { useParams, useRouter } from 'next/navigation';
import { useAppData } from '@/lib/AppDataContext';
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
	Tag,
	Button,
	ProgressBar,
	Tile,
	OverflowMenu,
	OverflowMenuItem
} from '@carbon/react';
import Link from 'next/link';
import { ViewFilled, ChartLine, CheckmarkFilled, Warning, ArrowLeft } from '@carbon/icons-react';
import styles from './page.module.scss';
import SimilarityScoreDisplay from '../../components/SimilarityScoreDisplay';
import TokenUsageTile from '../../components/TokenUsageTile';
import { getJobId, getStatusTagType, formatTokenUsage } from '../../../lib/utils';
import { useSuiteRunDetailData } from './useSuiteRunDetailData';

export default function SuiteRunDetailPage() {
	const params = useParams();
	const router = useRouter();
	const rawId = Array.isArray(params.id) ? params.id[0] : (params.id ?? '');
	const runId = parseInt(rawId, 10);
	const { suiteRun, jobs, conversations, loading, error, freshResults, metrics } = useSuiteRunDetailData(runId);
	const { getTestById, getResultById: getResultByIdFromCache, getAgentById } = useAppData();

	const handleViewSession = (sessionId: number) => {
		router.push(`/sessions/${sessionId}`);
	};

	const handleViewConversation = (conversationId: number) => {
		router.push(`/conversations/${conversationId}`);
	};

	if (loading) {
		return <InlineLoading description="Loading suite run details..." />;
	}
	if (error) {
		return <InlineNotification kind="error" title="Error" subtitle={error} hideCloseButton />;
	}
	if (!suiteRun) {
		return <InlineNotification kind="error" title="Error" subtitle="Suite run not found." hideCloseButton />;
	}

	const headers = [
		{ key: 'test', header: 'Conversation' },
		{ key: 'agent', header: 'Agent' },
		{ key: 'status', header: 'Status' },
		{ key: 'progress', header: 'Progress' },
		{ key: 'token_usage', header: 'Tokens' },
		{ key: 'similarity_score', header: 'Similarity score' },
		{ key: 'actions', header: 'Actions' }
	];

	const rows = jobs.map((job) => {
		let testName = job.test_id ? getTestById(job.test_id)?.name : undefined;
		if (!testName) {
			if (job.conversation_id) {
				const conversation = conversations.get(job.conversation_id);
				testName = conversation
					? `${conversation.name} (#${conversation.id})`
					: `Conversation #${job.conversation_id}`;
			} else {
				testName = `Test #${job.test_id}`;
			}
		}
		const agent = getAgentById(job.agent_id);
		const agentName = agent ? `${agent.name} (v${agent.version})` : `Agent #${job.agent_id}`;
		// Use fresh results if available, otherwise fall back to cache
		// Check both session_id and result_id for backwards compatibility
		const resultId = getJobId(job);
		const result = resultId ? freshResults.get(resultId) || getResultByIdFromCache(resultId) : null;

		// Calculate token usage display
		const tokenDisplay = formatTokenUsage(result || null);

		return {
			id: String(job.id),
			test: testName,
			agent: { name: agentName, id: job.agent_id },
			status: { value: job.status, error: job.error },
			progress: job.progress,
			token_usage: tokenDisplay,
			similarity_score: result,
			actions: job.session_id ? (
				<Button
					kind="ghost"
					size="sm"
					renderIcon={ViewFilled}
					iconDescription="View session details"
					hasIconOnly
					onClick={() => handleViewSession(job.session_id!)}
				/>
			) : job.conversation_id ? (
				<Button
					kind="ghost"
					size="sm"
					renderIcon={ViewFilled}
					iconDescription="View conversation details"
					hasIconOnly
					onClick={() => handleViewConversation(job.conversation_id!)}
				/>
			) : job.result_id ? (
				<Button
					kind="ghost"
					size="sm"
					renderIcon={ViewFilled}
					iconDescription="View session details"
					hasIconOnly
					onClick={() => handleViewSession(job.result_id!)}
				/>
			) : null
		};
	});

	return (
		<div className={styles.container}>
			{/* Enhanced Header */}
			<div className={styles.headerRow}>
				<div className={styles.headerLeft}>
					<h2 className={styles.title}>Suite run #{suiteRun.id}</h2>
					<div className={styles.suiteInfo}>
						<Tag type={getStatusTagType(suiteRun.status)} size="sm">
							{suiteRun.status}
						</Tag>
						<Tag type="blue" size="sm">
							{metrics.totalJobs} jobs
						</Tag>
						<Tag
							type={metrics.successRate >= 80 ? 'green' : metrics.successRate >= 60 ? 'cool-gray' : 'red'}
							size="sm"
						>
							{metrics.successRate.toFixed(0)}% success
						</Tag>
						{metrics.avgSimilarityScore > 0 && (
							<Tag type="purple" size="sm">
								{metrics.avgSimilarityScore.toFixed(1)}% avg score
							</Tag>
						)}
					</div>
					<div className={styles.metadata}>
						<span className={styles.metaItem}>
							<strong>Started:</strong>{' '}
							{suiteRun.started_at ? new Date(suiteRun.started_at).toLocaleString() : 'Unknown'}
						</span>
						{suiteRun.completed_at && (
							<span className={styles.metaItem}>
								<strong>Completed:</strong> {new Date(suiteRun.completed_at).toLocaleString()}
							</span>
						)}
						{metrics.totalDuration > 0 && (
							<span className={styles.metaItem}>
								<strong>Duration:</strong> {(metrics.totalDuration / 1000).toFixed(1)}s
							</span>
						)}
					</div>
				</div>
				<div className={styles.headerRight}>
					<OverflowMenu flipped>
						<OverflowMenuItem itemText="Export results" disabled />
						<OverflowMenuItem itemText="Download logs" disabled />
						<OverflowMenuItem itemText="Compare with others" disabled />
					</OverflowMenu>
					<Button kind="tertiary" onClick={() => router.push('/suite-runs')} renderIcon={ArrowLeft}>
						Back
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
						<div className={styles.statValue}>{metrics.totalJobs}</div>
						<div className={styles.statLabel}>Total jobs</div>
					</div>
				</Tile>
				<Tile className={styles.statCard}>
					<div className={styles.statIcon}>
						<CheckmarkFilled />
					</div>
					<div className={styles.statContent}>
						<div className={styles.statValue}>{metrics.completedJobs}</div>
						<div className={styles.statLabel}>Completed</div>
					</div>
				</Tile>
				<Tile className={styles.statCard}>
					<div className={styles.statIcon}>
						<Warning />
					</div>
					<div className={styles.statContent}>
						<div className={styles.statValue}>{metrics.successRate.toFixed(0)}%</div>
						<div className={styles.statLabel}>Success rate</div>
					</div>
				</Tile>
				{metrics.avgSimilarityScore > 0 && (
					<Tile className={styles.statCard}>
						<div className={styles.statIcon}>
							<ChartLine />
						</div>
						<div className={styles.statContent}>
							<div className={styles.statValue}>{metrics.avgSimilarityScore.toFixed(1)}%</div>
							<div className={styles.statLabel}>Avg similarity</div>
						</div>
					</Tile>
				)}
			</div>

			{/* Progress Section */}
			{suiteRun.status === 'running' && (
				<div className={styles.progressSection}>
					<Tile className={styles.progressTile}>
						<div className={styles.progressHeader}>
							<h4 className={styles.progressTitle}>Execution progress</h4>
							<span className={styles.progressText}>
								{suiteRun.completed_tests}/{suiteRun.total_tests} tests completed
							</span>
						</div>
						<ProgressBar
							value={suiteRun.progress}
							max={100}
							label="Progress"
							helperText={`${suiteRun.progress.toFixed(1)}% complete`}
						/>
					</Tile>
				</div>
			)}

			{/* Token Usage Breakdown */}
			{metrics.totalTokens > 0 && (
				<TokenUsageTile
					inputTokens={suiteRun.total_input_tokens || 0}
					outputTokens={suiteRun.total_output_tokens || 0}
					totalTokens={metrics.totalTokens}
				/>
			)}

			{/* Jobs Table */}
			<div className={styles.jobsSection}>
				<div className={styles.sectionHeader}>
					<h4 className={styles.sectionTitle}>Execution jobs</h4>
				</div>

				{/* If no jobs are present after a completed run, show warning */}
				{jobs.length === 0 ? (
					<InlineNotification
						kind="warning"
						title="No test results"
						subtitle={
							suiteRun.status === 'completed'
								? 'All test jobs timed out; no results available.'
								: 'No test jobs available.'
						}
						hideCloseButton
					/>
				) : (
					<div className={styles.tableContainer}>
						<DataTable rows={rows} headers={headers}>
							{({ rows, headers, getHeaderProps, getTableProps }) => (
								<Table {...getTableProps()}>
									<TableHead>
										<TableRow>
											{headers.map((header) => {
												const headerProps = getHeaderProps({ header });
												// eslint-disable-next-line @typescript-eslint/no-unused-vars
												const { key: _key, ...otherProps } = headerProps;
												return (
													<TableHeader key={header.key} {...otherProps}>
														{header.header}
													</TableHeader>
												);
											})}
										</TableRow>
									</TableHead>
									<TableBody>
										{rows.map((row) => (
											<TableRow key={row.id}>
												{row.cells.map((cell) => {
													// Handle status cell with Tag component and error message
													if (cell.info.header === 'status') {
														const tagType = getStatusTagType(cell.value.value);
														return (
															<TableCell key={cell.id}>
																<Tag type={tagType}>{cell.value.value}</Tag>
																{cell.value.error && cell.value.error}
															</TableCell>
														);
													}
													// Handle agent cell with link
													if (cell.info.header === 'agent') {
														return (
															<TableCell key={cell.id}>
																{cell.value && cell.value.id ? (
																	<Link href={`/agents/${cell.value.id}`}>
																		{cell.value.name}
																	</Link>
																) : (
																	cell.value?.name || cell.value
																)}
															</TableCell>
														);
													}
													// Handle progress cell with ProgressBar component
													if (cell.info.header === 'progress') {
														return (
															<TableCell key={cell.id}>
																<div style={{ width: '100%' }}>
																	<ProgressBar
																		value={cell.value}
																		max={100}
																		label=""
																		hideLabel
																	/>
																</div>
																{cell.value}%
															</TableCell>
														);
													}
													// Handle similarity score cell
													if (cell.info.header === 'similarity_score') {
														return (
															<TableCell key={cell.id}>
																<SimilarityScoreDisplay result={cell.value} />
															</TableCell>
														);
													}
													// For the actions cell, render the cell value directly
													if (cell.info.header === 'actions') {
														return (
															<TableCell key={cell.id}>{cell.value || '--'}</TableCell>
														);
													}
													// Default cell rendering
													return <TableCell key={cell.id}>{cell.value}</TableCell>;
												})}
											</TableRow>
										))}
									</TableBody>
								</Table>
							)}
						</DataTable>
					</div>
				)}
			</div>
		</div>
	);
}
