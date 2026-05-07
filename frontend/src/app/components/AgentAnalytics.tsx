'use client';

import { useEffect, useState, useMemo } from 'react';
import { ComboChart, SimpleBarChart, ScatterChart, LineChart } from '@carbon/charts-react';
import type { ComboChartOptions } from '@carbon/charts';
import { Tile } from '@carbon/react';
import type { ExecutionSession, SessionMessage, Conversation } from '../../lib/api';
import { api } from '../../lib/api';
import '@carbon/charts/styles.css';
import styles from './AgentAnalytics.module.scss';
import AnalyticsFilters, { type FilterState } from './AgentAnalytics/AnalyticsFilters';
import { filterSessionsByDateRange, sortSessionsByTime } from './AgentAnalytics/analyticsUtils';
import {
	prepareTimePerformanceData,
	prepareExperimentsPerformanceData,
	prepareFailureAnalysisData,
	prepareConversationDifficultyData,
	prepareSuccessSpeedScatterData,
	prepareExecutionTimeHistogramData,
	prepareRecentTrendsData
} from './AgentAnalytics/dataTransformations';
import {
	timeChartOptions,
	experimentsChartOptions,
	performanceColorScale,
	failureAnalysisChartOptions,
	conversationDifficultyChartOptions,
	successSpeedScatterOptions,
	histogramBarChartOptions,
	recentTrendsChartOptions
} from './AgentAnalytics/chartOptions';

interface AgentAnalyticsProps {
	sessions: ExecutionSession[];
}

const buildPerformanceChartOptions = (
	baseOptions: ComboChartOptions,
	data: Array<{ group: string }>
): ComboChartOptions => {
	const availableGroups = new Set(data.map((point) => point.group));
	const lineDatasets = ['Success rate', 'Similarity score'].filter((group) => availableGroups.has(group));
	const comboChartTypes = [
		...(lineDatasets.length > 0
			? [{ type: 'line' as const, options: {}, correspondingDatasets: lineDatasets }]
			: []),
		...(availableGroups.has('Execution time')
			? [{ type: 'line' as const, options: {}, correspondingDatasets: ['Execution time'] }]
			: [])
	];
	const colorScale = Object.fromEntries(
		Object.entries(performanceColorScale).filter(([group]) => availableGroups.has(group))
	);
	const axes = (baseOptions.axes || {}) as Record<string, unknown>;
	const rightAxis = (axes.right as Record<string, unknown> | undefined) || {};

	return {
		...baseOptions,
		comboChartTypes,
		axes: {
			...axes,
			right: {
				...rightAxis,
				correspondingDatasets: availableGroups.has('Execution time') ? ['Execution time'] : []
			}
		},
		color: {
			...(baseOptions.color || {}),
			scale: colorScale
		}
	};
};

export default function AgentAnalytics({ sessions }: AgentAnalyticsProps) {
	const [filterState, setFilterState] = useState<FilterState>({
		dateRange: 'all',
		conversationIds: [],
		viewMode: 'experiments',
		experimentCount: 20
	});
	const [conversations, setConversations] = useState<Conversation[]>([]);
	const [sessionMessages, setSessionMessages] = useState<Map<number, SessionMessage[]>>(new Map());
	const [loading, setLoading] = useState(false);
	const [conversationSearch, setConversationSearch] = useState('');

	// Get unique conversations from sessions
	const availableConversations = useMemo(() => {
		const conversationIds = new Set(sessions.map((s) => s.conversation_id));

		return conversations.filter((c) => c.id && conversationIds.has(c.id));
	}, [sessions, conversations]);

	// Load conversations for this agent
	useEffect(() => {
		const loadConversations = async () => {
			try {
				const allConversations = await api.getConversations({ limit: 1000, offset: 0 });
				setConversations(allConversations.data);
			} catch {
				setConversations([]);
			}
		};
		loadConversations();
	}, []);

	// Load session messages for metrics
	useEffect(() => {
		const loadMessages = async () => {
			if (sessions.length === 0) {
				return;
			}
			setLoading(true);
			try {
				const messagesMap = new Map<number, SessionMessage[]>();
				await Promise.all(
					sessions.map(async (session) => {
						if (session.id) {
							try {
								const messages = await api.getSessionTranscript(session.id);
								messagesMap.set(session.id, messages);
							} catch {
								// Best-effort: missing transcript data just omits some analytics
							}
						}
					})
				);
				setSessionMessages(messagesMap);
			} catch {
				setSessionMessages(new Map());
			} finally {
				setLoading(false);
			}
		};
		loadMessages();
	}, [sessions]);

	// Filter sessions based on current filters
	const filteredSessions = useMemo(() => {
		let filtered = [...sessions];

		// Filter by conversation
		if (filterState.conversationIds.length > 0) {
			filtered = filtered.filter((s) => filterState.conversationIds.includes(s.conversation_id));
		}

		// Filter by date range
		filtered = filterSessionsByDateRange(
			filtered,
			filterState.dateRange,
			filterState.startDate,
			filterState.endDate
		);

		return sortSessionsByTime(filtered);
	}, [sessions, filterState]);

	// Prepare chart data
	const timePerformanceData = useMemo(() => {
		return prepareTimePerformanceData(filteredSessions, sessionMessages, {
			showSuccessRate: true,
			showExecutionTime: true,
			showSimilarityScore: true
		});
	}, [filteredSessions, sessionMessages]);

	const experimentsPerformanceData = useMemo(() => {
		return prepareExperimentsPerformanceData(filteredSessions, sessionMessages, filterState.experimentCount, {
			showSuccessRate: true,
			showExecutionTime: true,
			showSimilarityScore: true
		});
	}, [filteredSessions, sessionMessages, filterState.experimentCount]);

	const resolvedTimeChartOptions = useMemo(
		() => buildPerformanceChartOptions(timeChartOptions, timePerformanceData),
		[timePerformanceData]
	);

	const resolvedExperimentsChartOptions = useMemo(
		() => buildPerformanceChartOptions(experimentsChartOptions, experimentsPerformanceData),
		[experimentsPerformanceData]
	);

	const failureAnalysisData = useMemo(() => {
		return prepareFailureAnalysisData(filteredSessions, conversations);
	}, [filteredSessions, conversations]);

	const conversationDifficultyData = useMemo(() => {
		return prepareConversationDifficultyData(filteredSessions, conversations);
	}, [filteredSessions, conversations]);

	const successSpeedScatterData = useMemo(() => {
		return prepareSuccessSpeedScatterData(filteredSessions, sessionMessages, conversations);
	}, [filteredSessions, sessionMessages, conversations]);

	const executionTimeHistogramData = useMemo(() => {
		return prepareExecutionTimeHistogramData(filteredSessions);
	}, [filteredSessions]);

	const recentTrendsData = useMemo(() => {
		return prepareRecentTrendsData(filteredSessions, sessionMessages, conversations);
	}, [filteredSessions, sessionMessages, conversations]);

	const handleFilterChange = (updates: Partial<FilterState>) => {
		setFilterState((prev) => ({ ...prev, ...updates }));
	};

	return (
		<div className={styles.analyticsContainer}>
			<AnalyticsFilters
				filterState={filterState}
				onFilterChange={handleFilterChange}
				availableConversations={availableConversations}
				conversationSearch={conversationSearch}
				onConversationSearchChange={setConversationSearch}
			/>

			{loading && (
				<Tile className={styles.emptyState}>
					<p>Loading analytics data...</p>
				</Tile>
			)}

			{!loading && filteredSessions.length === 0 && (
				<Tile className={styles.emptyState}>
					<p>No sessions found for the selected filters</p>
					<p className={styles.emptyStateSubtext}>Try adjusting your filters or run some tests first</p>
				</Tile>
			)}

			{!loading && filteredSessions.length > 0 && (
				<>
					<div className={styles.mainChartSection}>
						<Tile className={styles.chartTile}>
							<div className={styles.chartHeader}>
								<div>
									<h3 className={styles.chartTitle}>
										{filterState.viewMode === 'time'
											? 'Performance over time'
											: 'Performance by experiment'}
									</h3>
									<p className={styles.chartDescription}>
										Track agent performance metrics with dual Y-axis scaling. Click legend items to
										toggle series visibility.
									</p>
								</div>
							</div>
							{filterState.viewMode === 'time' ? (
								timePerformanceData.length > 0 ? (
									<ComboChart
										key="time-chart"
										data={timePerformanceData}
										options={resolvedTimeChartOptions}
									/>
								) : (
									<div className={styles.noData}>No data available</div>
								)
							) : experimentsPerformanceData.length > 0 ? (
								<ComboChart
									key={`experiments-chart-${filterState.experimentCount}`}
									data={experimentsPerformanceData}
									options={resolvedExperimentsChartOptions}
								/>
							) : (
								<div className={styles.noData}>No data available</div>
							)}
						</Tile>
					</div>

					<div className={styles.secondaryChartsGrid}>
						{failureAnalysisData.length > 0 && (
							<Tile className={styles.chartTile}>
								<h3 className={styles.chartTitle}>Failure analysis</h3>
								<p className={styles.chartDescription}>
									Top 10 conversations by failure count - prioritize fixes here
								</p>
								<SimpleBarChart data={failureAnalysisData} options={failureAnalysisChartOptions} />
							</Tile>
						)}

						{conversationDifficultyData.length > 0 && (
							<Tile className={styles.chartTile}>
								<h3 className={styles.chartTitle}>Conversation difficulty ranking</h3>
								<p className={styles.chartDescription}>
									Hardest conversations first (min. 3 runs) - shows which tests are challenging
								</p>
								<SimpleBarChart
									data={conversationDifficultyData}
									options={conversationDifficultyChartOptions}
								/>
							</Tile>
						)}

						{successSpeedScatterData.length > 0 && (
							<Tile className={styles.chartTile}>
								<h3 className={styles.chartTitle}>Similarity vs speed analysis</h3>
								<p className={styles.chartDescription}>
									Each point = one conversation. Shows average similarity score vs average execution
									time - are faster conversations less accurate?
								</p>
								<ScatterChart data={successSpeedScatterData} options={successSpeedScatterOptions} />
							</Tile>
						)}

						{executionTimeHistogramData.length > 0 && (
							<Tile className={styles.chartTile}>
								<h3 className={styles.chartTitle}>Execution time distribution</h3>
								<p className={styles.chartDescription}>Performance consistency and outlier detection</p>
								<SimpleBarChart data={executionTimeHistogramData} options={histogramBarChartOptions} />
							</Tile>
						)}

						{recentTrendsData.length > 0 && (
							<Tile className={styles.chartTile}>
								<h3 className={styles.chartTitle}>Recent performance trends</h3>
								<p className={styles.chartDescription}>
									Last 15 runs for top 5 most active conversations - spot improving or declining
									patterns
								</p>
								<LineChart data={recentTrendsData} options={recentTrendsChartOptions} />
							</Tile>
						)}
					</div>
				</>
			)}
		</div>
	);
}
