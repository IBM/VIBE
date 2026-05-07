import { useCallback, useEffect, useState } from 'react';
import { api, type Conversation, type Job, type SuiteRun, type TestResult } from '../../../lib/api';
import { useAppData, useResultOperations } from '@/lib/AppDataContext';
import { getJobId, isScoringActive } from '../../../lib/utils';

type SuiteRunMetrics = {
	totalJobs: number;
	completedJobs: number;
	failedJobs: number;
	successRate: number;
	avgSimilarityScore: number;
	totalTokens: number;
	totalDuration: number;
};

const EMPTY_METRICS: SuiteRunMetrics = {
	totalJobs: 0,
	completedJobs: 0,
	failedJobs: 0,
	successRate: 0,
	avgSimilarityScore: 0,
	totalTokens: 0,
	totalDuration: 0
};

export function useSuiteRunDetailData(runId: number) {
	const [suiteRun, setSuiteRun] = useState<SuiteRun | null>(null);
	const [jobs, setJobs] = useState<Job[]>([]);
	const [conversations, setConversations] = useState<Map<number, Conversation>>(new Map());
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);
	const [previousStatus, setPreviousStatus] = useState<string | null>(null);
	const [freshResults, setFreshResults] = useState<Map<number, TestResult>>(new Map());
	// Per-id skip counter to avoid hammering failing result ids across polling cycles.
	const [skipCounts, setSkipCounts] = useState<Map<number, number>>(new Map());
	const [metrics, setMetrics] = useState<SuiteRunMetrics>(EMPTY_METRICS);

	const { fetchAllData } = useAppData();
	const { getResultById } = useResultOperations();

	const shouldPollData = useCallback(
		(suiteRunData?: SuiteRun, jobsData?: Job[]) => {
			if (!suiteRunData || !jobsData) {
				return true;
			}

			if (suiteRunData.status === 'running') {
				return true;
			}

			if (suiteRunData.status === 'completed') {
				const activeScoringJobs = jobsData.filter((job) => {
					const jobId = getJobId(job);
					if (!jobId) {
						return false;
					}
					const result = freshResults.get(jobId);
					if (!result) {
						return true;
					}

					const scoringStatus = result.similarity_scoring_status;
					// Only poll if scoring is actively in progress, not if it was never started (null).
					return isScoringActive(scoringStatus);
				});

				return activeScoringJobs.length > 0;
			}

			return false;
		},
		[freshResults]
	);

	// Smart conditional fetching for individual results.
	const shouldFetchFreshResults = useCallback(
		(suiteRunData: SuiteRun, jobsData: Job[]) => {
			if (freshResults.size === 0) {
				return true;
			}

			if (suiteRunData.status === 'running') {
				const newlyCompletedJobs = jobsData.filter((job) => {
					const id = getJobId(job);
					return !!id && !freshResults.has(id);
				});
				return newlyCompletedJobs.length > 0;
			}

			if (suiteRunData.status === 'completed') {
				const jobsWithActiveSimilarityScoring = jobsData.filter((job) => {
					const id = getJobId(job);
					if (!id) return false;
					const result = freshResults.get(id);
					if (!result) return true;
					const scoringStatus = result.similarity_scoring_status;
					// Only fetch if scoring is actively in progress, not if it was never started (null).
					return isScoringActive(scoringStatus);
				});

				return jobsWithActiveSimilarityScoring.length > 0;
			}

			return false;
		},
		[freshResults]
	);

	const fetchFreshResultsConditionally = useCallback(
		async (suiteRunData: SuiteRun, jobsData: Job[]) => {
			// Determine which jobs to fetch this cycle and decrement skip counts for skipped ids.
			const toDecrement: number[] = [];
			const jobsToFetch = jobsData.filter((job) => {
				const id = getJobId(job);
				if (!id) {
					return false;
				}
				const count = skipCounts.get(id) || 0;
				if (count > 0) {
					toDecrement.push(id);
					return false;
				}

				const existingResult = freshResults.get(id);
				if (!existingResult) {
					return true;
				}

				if (suiteRunData.status === 'running') {
					return !freshResults.has(id);
				}

				const scoringStatus = existingResult.similarity_scoring_status;
				return isScoringActive(scoringStatus);
			});

			if (toDecrement.length > 0) {
				setSkipCounts((prev) => {
					const next = new Map(prev);
					for (const id of toDecrement) {
						const c = next.get(id) || 0;
						if (c > 0) next.set(id, c - 1);
					}
					return next;
				});
			}

			if (jobsToFetch.length === 0) {
				return;
			}

			const resultPromises = jobsToFetch.map(async (job) => {
				const id = getJobId(job)!;
				try {
					let result: TestResult;
					if (job.session_id) {
						// For session-based jobs, fetch session data and convert to legacy result format.
						const sessionData = await api.getExecutionSessionById(id);
						const sessionMessages = await api.getSessionTranscript(id);
						// Convert session to legacy result format for compatibility.
						result = {
							id: sessionData.id!,
							test_id: sessionData.conversation_id,
							agent_id: sessionData.agent_id,
							output: '',
							success: sessionData.success || false,
							similarity_score: 0,
							similarity_scoring_status: 'completed',
							input_tokens: 0,
							output_tokens: 0,
							created_at: sessionData.started_at || new Date().toISOString()
						};

						// Calculate tokens and similarity from messages.
						const assistantMessages = sessionMessages.filter((m) => m.role === 'assistant');
						if (assistantMessages.length > 0) {
							const scoredMessage = assistantMessages.find(
								(m) =>
									m.similarity_scoring_status === 'completed' &&
									typeof m.similarity_score === 'number'
							);
							if (scoredMessage) {
								result.similarity_score = scoredMessage.similarity_score!;
							}

							const totalInputTokens = sessionMessages.reduce((sum, m) => {
								const metadata = m.metadata ? JSON.parse(m.metadata) : {};
								return sum + (metadata.input_tokens || 0);
							}, 0);
							const totalOutputTokens = sessionMessages.reduce((sum, m) => {
								const metadata = m.metadata ? JSON.parse(m.metadata) : {};
								return sum + (metadata.output_tokens || 0);
							}, 0);

							result.input_tokens = totalInputTokens;
							result.output_tokens = totalOutputTokens;
						}
					} else {
						// For legacy result-based jobs.
						result = await getResultById(id);
					}
					return [id, result] as [number, TestResult];
				} catch {
					// On failure, skip next N polling cycles for this id (about 10s at 2s interval).
					const SKIP_POLLS = 5;
					setSkipCounts((prev) => new Map(prev).set(id, SKIP_POLLS));
					return null;
				}
			});

			const results = await Promise.all(resultPromises);
			const newResults = results.filter(Boolean) as [number, TestResult][];

			if (newResults.length > 0) {
				setFreshResults((prev) => new Map([...prev, ...newResults]));
				// Clear skip counters for successfully fetched ids.
				setSkipCounts((prev) => {
					const next = new Map(prev);
					for (const [id] of newResults) {
						next.delete(id);
					}
					return next;
				});
			}
		},
		[freshResults, getResultById, skipCounts]
	);

	// Fetch conversations referenced by jobs.
	const fetchConversationsForJobs = useCallback(async (jobsData: Job[]) => {
		const conversationIds = jobsData
			.filter((job) => job.conversation_id)
			.map((job) => job.conversation_id!)
			.filter((id, index, arr) => arr.indexOf(id) === index);

		if (conversationIds.length === 0) return;

		try {
			const conversationPromises = conversationIds.map(async (id) => {
				try {
					const conversation = await api.getConversationById(id);
					return [id, conversation] as [number, Conversation];
				} catch {
					return null;
				}
			});

			const conversationResults = await Promise.all(conversationPromises);
			const validConversations = conversationResults.filter(Boolean) as [number, Conversation][];
			setConversations(new Map(validConversations));
		} catch {
			setConversations(new Map());
		}
	}, []);

	useEffect(() => {
		if (Number.isNaN(runId)) {
			setError('Invalid suite run ID');
			setLoading(false);
			return;
		}

		let mounted = true;
		let interval: NodeJS.Timeout | null = null;

		async function fetchData() {
			try {
				const [runData, jobsData] = await Promise.all([api.getSuiteRun(runId), api.getSuiteRunJobs(runId)]);

				await fetchConversationsForJobs(jobsData);

				if (shouldFetchFreshResults(runData, jobsData)) {
					await fetchFreshResultsConditionally(runData, jobsData);
				}

				if (!mounted) return;

				if (previousStatus !== runData.status && runData.status === 'completed') {
					await fetchAllData();
				}

				const newlyCompletedJobs = jobsData.filter((job) => {
					const id = getJobId(job);
					const prev = jobs.find((prevJob) => prevJob.id === job.id);
					const prevId = prev ? getJobId(prev) : null;
					return !!id && id !== prevId;
				});

				if (newlyCompletedJobs.length > 0) {
					await fetchAllData();
				}

				setPreviousStatus(runData.status);
				setSuiteRun(runData);
				setJobs(jobsData);

				const completedJobs = jobsData.filter((job) => job.status === 'completed').length;
				const failedJobs = jobsData.filter((job) => job.status === 'failed').length;
				const totalJobs = jobsData.length;
				const successRate = totalJobs > 0 ? (completedJobs / totalJobs) * 100 : 0;

				const scoredResults = Array.from(freshResults.values()).filter(
					(result) =>
						result.similarity_scoring_status === 'completed' && typeof result.similarity_score === 'number'
				);
				const avgSimilarityScore =
					scoredResults.length > 0
						? scoredResults.reduce((sum, result) => sum + (result.similarity_score || 0), 0) /
							scoredResults.length
						: 0;

				const totalTokens = Array.from(freshResults.values()).reduce((sum, result) => {
					return sum + (result.input_tokens || 0) + (result.output_tokens || 0);
				}, 0);

				const totalDuration = runData.average_execution_time || 0;

				setMetrics({
					totalJobs,
					completedJobs,
					failedJobs,
					successRate,
					avgSimilarityScore,
					totalTokens,
					totalDuration
				});

				if (mounted && shouldPollData(runData, jobsData)) {
					interval = setTimeout(fetchData, 2000);
				}
			} catch (err: unknown) {
				if (err instanceof Error) setError(err.message);
				else setError(String(err));

				// On error, continue polling to retry.
				if (mounted) {
					interval = setTimeout(fetchData, 2000);
				}
			} finally {
				if (mounted) setLoading(false);
			}
		}

		void fetchData();

		return () => {
			mounted = false;
			if (interval) clearTimeout(interval);
		};
	}, [
		runId,
		previousStatus,
		fetchAllData,
		jobs,
		shouldPollData,
		shouldFetchFreshResults,
		fetchFreshResultsConditionally,
		fetchConversationsForJobs,
		freshResults
	]);

	return {
		suiteRun,
		jobs,
		conversations,
		loading,
		error,
		freshResults,
		metrics
	};
}
