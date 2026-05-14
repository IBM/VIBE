'use client';

import { Grid, Column } from '@carbon/react';
import { Tag, ProgressIndicator, Table, TableHead, TableRow, TableHeader, TableBody, TableCell } from '@carbon/react';
import { useAppData } from '../lib/AppDataContext';
import { useResultOperations } from '../lib/AppDataContext';
import { api, SuiteRun, Job, TestResult } from '../lib/api';
import type { StatsResponse } from '@ibm-vibe/types';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import styles from './page.module.scss';
import TileWrapper from './components/TileWrapper';
import { calculateOverallAverageSimilarityScore, filterScoredResults } from '@/lib/similarityScoreUtils';

interface ResultWithStatus extends TestResult {
	status?: string;
}

interface AgentPerformanceMetrics {
	agentId: number;
	agentName: string;
	totalTests: number;
	successfulTests: number;
	successRate: string;
	avgExecutionTime: string;
	tokenUsage?: number;
	modelCalls?: number;
	toolCalls?: number;
}

export default function Home() {
	const { agents, tests, fetchAgents } = useAppData();
	const { getResults } = useResultOperations();
	const [results, setResults] = useState<ResultWithStatus[]>([]);
	const [suiteRuns, setSuiteRuns] = useState<SuiteRun[]>([]);
	const [jobs, setJobs] = useState<Job[]>([]);
	const [loading, setLoading] = useState(true);
	const [agentMetrics, setAgentMetrics] = useState<AgentPerformanceMetrics[]>([]);
	const [stats, setStats] = useState<StatsResponse | null>(null);

	useEffect(() => {
		const fetchDashboardData = async () => {
			try {
				const [suiteRunsData, jobsData, resultsData, statsData] = await Promise.all([
					api.getSuiteRuns(),
					api.getJobs(),
					getResults(),
					api.getStats(),
					fetchAgents()
				]);
				setSuiteRuns(suiteRunsData);
				setJobs(jobsData);
				setResults(resultsData.data as ResultWithStatus[]);
				setStats(statsData);
			} catch {
				setSuiteRuns([]);
				setJobs([]);
				setResults([]);
				setStats(null);
			} finally {
				setLoading(false);
			}
		};

		fetchDashboardData();
	}, [fetchAgents, getResults]);

	// Calculate agent performance metrics whenever results or agents change
	useEffect(() => {
		calculateAgentMetrics();
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [results, agents]);

	const calculateAgentMetrics = () => {
		if (!results.length || !agents.length) return;

		// Group results by agent
		const agentResultMap = new Map<number, ResultWithStatus[]>();

		results.forEach((result: ResultWithStatus) => {
			const typedResult = result as ResultWithStatus;
			const agentId = typedResult.agent_id;
			if (agentId) {
				if (!agentResultMap.has(agentId)) {
					agentResultMap.set(agentId, []);
				}
				agentResultMap.get(agentId)?.push(typedResult);
			}
		});

		// Calculate metrics for each agent
		const metrics: AgentPerformanceMetrics[] = [];

		agentResultMap.forEach((agentResults, agentId) => {
			const agent = agents.find((a) => a.id === agentId);
			if (!agent) return;

			const totalTests = agentResults.length;
			const successfulTests = agentResults.filter((r) => r.success).length;
			const successRate = totalTests > 0 ? ((successfulTests / totalTests) * 100).toFixed(1) : '0.0';

			// Calculate average execution time
			const executionTimes = agentResults
				.filter((r) => r.execution_time !== undefined)
				.map((r) => r.execution_time as number);

			const avgExecutionTime =
				executionTimes.length > 0
					? (executionTimes.reduce((sum, time) => sum + time, 0) / executionTimes.length / 1000).toFixed(3)
					: 'N/A';

			// Extract token usage metrics
			let tokenUsage: number | undefined;
			let modelCalls: number | undefined;
			let toolCalls: number | undefined;

			// Aggregate token usage from database fields
			agentResults.forEach((result) => {
				if (result.input_tokens || result.output_tokens) {
					const inputTokens = result.input_tokens || 0;
					const outputTokens = result.output_tokens || 0;

					tokenUsage = (tokenUsage || 0) + inputTokens + outputTokens;
				}

				// Still try to extract model and tool calls from intermediate steps for now
				if (result.intermediate_steps) {
					try {
						const stepsData = JSON.parse(result.intermediate_steps);
						// This is a simplification - actual format would need to be checked
						if (stepsData.metrics) {
							modelCalls = (modelCalls || 0) + (stepsData.metrics.model_calls || 0);
							toolCalls = (toolCalls || 0) + (stepsData.metrics.tool_calls || 0);
						}
					} catch {
						// Silently fail if we can't parse the JSON
					}
				}
			});

			metrics.push({
				agentId,
				agentName: `${agent.name} (v${agent.version})`,
				totalTests,
				successfulTests,
				successRate,
				avgExecutionTime: avgExecutionTime !== 'N/A' ? `${avgExecutionTime}s` : avgExecutionTime,
				tokenUsage,
				modelCalls,
				toolCalls
			});
		});

		// Sort by success rate (descending)
		metrics.sort((a, b) => parseFloat(b.successRate) - parseFloat(a.successRate));

		setAgentMetrics(metrics);
	};

	// Calculate metrics
	const activeJobs = jobs.filter((job) => job.status === 'running').length;
	const pendingJobs = jobs.filter((job) => job.status === 'pending').length;
	const completedJobs = jobs.filter((job) => job.status === 'completed').length;
	const failedJobs = jobs.filter((job) => job.status === 'failed').length;

	const recentSuiteRuns = suiteRuns.slice(0, 5);

	// Success rate calculation
	const testSuccessRate =
		results.length > 0
			? ((results.filter((r: ResultWithStatus) => r.success).length / results.length) * 100).toFixed(1)
			: '0.0';

	// Average similarity score calculation
	const avgSimilarityScore = calculateOverallAverageSimilarityScore(results as TestResult[]);
	const scoredResults = filterScoredResults(results as TestResult[]);

	// Recent activity calculation
	const lastWeekResults = results.filter((r: ResultWithStatus) => {
		const resultDate = new Date(r.created_at || '');
		const oneWeekAgo = new Date();
		oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
		return resultDate >= oneWeekAgo;
	});

	// Total token usage calculation
	const totalTokenUsage = results.reduce((total, result) => {
		const inputTokens = result.input_tokens || 0;
		const outputTokens = result.output_tokens || 0;

		return total + inputTokens + outputTokens;
	}, 0);

	const firstRunSteps = [
		{
			title: 'Configure an LLM',
			description: 'Add the model or API settings your agents will use for execution.',
			href: '/llm-configs',
			action: 'Open LLM configs'
		},
		{
			title: 'Choose an agent',
			description: 'Select or create the agent version that should handle the conversation.',
			href: '/agents',
			action: 'Manage agents'
		},
		{
			title: 'Create a conversation',
			description: 'Script the realistic multi-turn exchange you want to evaluate repeatedly.',
			href: '/conversations',
			action: 'Create conversation'
		},
		{
			title: 'Execute and inspect',
			description: 'Run the conversation, follow the job, then review the session transcript.',
			href: '/execute',
			action: 'Quick execute'
		}
	];

	return (
		<div>
			<h1>Dashboard</h1>

			<section className={styles.heroPanel}>
				<div>
					<p className={styles.eyebrow}>Conversation-first agent evaluation</p>
					<h2>Run repeatable conversations and inspect every session.</h2>
					<p className={styles.heroText}>
						Start with an LLM config, choose an agent, create a conversation script, then use Quick execute
						to create a job and review the resulting transcript.
					</p>
				</div>
				<div className={styles.heroActions}>
					<Link href="/conversations" className={styles.primaryAction}>
						Create a conversation
					</Link>
					<Link href="/execute" className={styles.secondaryAction}>
						Quick execute
					</Link>
				</div>
			</section>

			<Grid fullWidth narrow className={styles.content}>
				<Column sm={4} md={8} lg={16}>
					<TileWrapper title="First run checklist">
						<div className={styles.checklistGrid}>
							{firstRunSteps.map((step, index) => (
								<div key={step.href} className={styles.checklistItem}>
									<div className={styles.stepNumber}>{index + 1}</div>
									<h4>{step.title}</h4>
									<p>{step.description}</p>
									<Link href={step.href}>{step.action}</Link>
								</div>
							))}
						</div>
					</TileWrapper>
				</Column>

				{/* Summary Metrics */}
				<Column sm={4} md={4} lg={4}>
					<TileWrapper title="Agents">
						<div className={styles.metricValue}>{stats ? stats.agents_total : agents.length}</div>
					</TileWrapper>
				</Column>
				<Column sm={4} md={4} lg={4}>
					<TileWrapper title="Tests">
						<div className={styles.metricValue}>{stats ? stats.tests_total : tests.length}</div>
					</TileWrapper>
				</Column>
				<Column sm={4} md={4} lg={4}>
					<TileWrapper title="Test results">
						<div className={styles.metricValue}>{results.length}</div>
					</TileWrapper>
				</Column>
				<Column sm={4} md={4} lg={4}>
					<TileWrapper title="Success rate">
						<div className={styles.metricValue}>{testSuccessRate}%</div>
					</TileWrapper>
				</Column>
				<Column sm={4} md={4} lg={4}>
					<TileWrapper title="Avg similarity score">
						<div className={styles.metricValue}>
							{avgSimilarityScore !== 'N/A' ? `${avgSimilarityScore}%` : avgSimilarityScore}
						</div>
						{scoredResults.length > 0 && (
							<div className={styles.metricSubtext}>Based on {scoredResults.length} scored results</div>
						)}
					</TileWrapper>
				</Column>
				<Column sm={4} md={4} lg={4}>
					<TileWrapper title="Total tokens used">
						<div className={styles.metricValue}>
							{totalTokenUsage > 0 ? totalTokenUsage.toLocaleString() : '0'}
						</div>
					</TileWrapper>
				</Column>

				{/* Job Status Overview */}
				<Column sm={4} md={8} lg={8}>
					<TileWrapper title="Active Jobs">
						<div>
							<Tag type="green">Running: {activeJobs}</Tag> <Tag type="blue">Pending: {pendingJobs}</Tag>{' '}
							<Tag type="purple">Completed: {completedJobs}</Tag>{' '}
							<Tag type="red">Failed: {failedJobs}</Tag>
						</div>
					</TileWrapper>
				</Column>

				{/* Recent Test Runs */}
				<Column sm={4} md={8} lg={8}>
					<TileWrapper title="Recent suite runs">
						{loading ? (
							<ProgressIndicator />
						) : recentSuiteRuns.length > 0 ? (
							<div>
								{recentSuiteRuns.map((run) => (
									<div key={run.id} className={styles.runRow}>
										<Tag
											type={
												run.status === 'completed'
													? 'green'
													: run.status === 'running'
														? 'blue'
														: run.status === 'failed'
															? 'red'
															: 'gray'
											}
										>
											{run.status}
										</Tag>
										<span className={styles.runLabel}>
											<Link href={`/suite-runs/${run.id}`}>Run #{run.id}</Link>:{' '}
											<Link href={`/test-suites/${run.suite_id}`}>Suite #{run.suite_id}</Link>{' '}
											with <Link href={`/agents/${run.agent_id}`}>Agent #{run.agent_id}</Link> -{' '}
											{run.successful_tests}/{run.total_tests} tests passed
										</span>
									</div>
								))}
							</div>
						) : (
							<p>No recent suite runs</p>
						)}
					</TileWrapper>
				</Column>

				{/* Recent Activity */}
				<Column sm={4} md={8} lg={8}>
					<TileWrapper title="Recent Activity">
						<p>Tests run in the last 7 days: {lastWeekResults.length}</p>
					</TileWrapper>
				</Column>

				{/* Agent Performance */}
				<Column sm={4} md={8} lg={16}>
					<TileWrapper title="Agent Performance">
						{loading ? (
							<ProgressIndicator />
						) : agentMetrics.length > 0 ? (
							<Table>
								<TableHead>
									<TableRow>
										<TableHeader>Agent</TableHeader>
										<TableHeader>Success rate</TableHeader>
										<TableHeader>Tests</TableHeader>
										<TableHeader>Avg. time</TableHeader>
										{agentMetrics.some((m) => m.tokenUsage !== undefined) && (
											<TableHeader>Token usage</TableHeader>
										)}
										{agentMetrics.some((m) => m.modelCalls !== undefined) && (
											<TableHeader>Model calls</TableHeader>
										)}
										{agentMetrics.some((m) => m.toolCalls !== undefined) && (
											<TableHeader>Tool calls</TableHeader>
										)}
									</TableRow>
								</TableHead>
								<TableBody>
									{agentMetrics.map((metric) => (
										<TableRow key={metric.agentId}>
											<TableCell>{metric.agentName}</TableCell>
											<TableCell>
												<Tag
													type={
														parseFloat(metric.successRate) > 75
															? 'green'
															: parseFloat(metric.successRate) > 50
																? 'blue'
																: parseFloat(metric.successRate) > 25
																	? 'purple'
																	: 'red'
													}
												>
													{metric.successRate}%
												</Tag>
											</TableCell>
											<TableCell>
												{metric.successfulTests}/{metric.totalTests}
											</TableCell>
											<TableCell>{metric.avgExecutionTime}</TableCell>
											{agentMetrics.some((m) => m.tokenUsage !== undefined) && (
												<TableCell>
													{metric.tokenUsage ? metric.tokenUsage.toLocaleString() : 'N/A'}
												</TableCell>
											)}
											{agentMetrics.some((m) => m.modelCalls !== undefined) && (
												<TableCell>{metric.modelCalls || 'N/A'}</TableCell>
											)}
											{agentMetrics.some((m) => m.toolCalls !== undefined) && (
												<TableCell>{metric.toolCalls || 'N/A'}</TableCell>
											)}
										</TableRow>
									))}
								</TableBody>
							</Table>
						) : results.length > 0 ? (
							<p>Calculating agent metrics...</p>
						) : (
							<p>No test results available to display agent performance</p>
						)}
					</TileWrapper>
				</Column>
			</Grid>
		</div>
	);
}
