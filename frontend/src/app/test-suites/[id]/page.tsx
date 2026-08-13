'use client';

import { useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { api, type SuiteEntry } from '../../../lib/api';
import {
	Button,
	Column,
	FormLabel,
	Grid,
	IconButton,
	InlineLoading,
	InlineNotification,
	Search,
	Select,
	SelectItem,
	Stack,
	Tab,
	Table,
	TableBody,
	TableCell,
	TableContainer,
	TableHead,
	TableHeader,
	TableRow,
	TabList,
	TabPanel,
	TabPanels,
	Tabs,
	Tile,
	ContentSwitcher,
	Switch
} from '@carbon/react';
import { ComboChart } from '@carbon/charts-react';
import '@carbon/charts/styles.css';
import type { ComboChartOptions } from '@carbon/charts';
import { CHART_COLORS } from '../../components/AgentAnalytics/chartOptions';
import { ChevronLeft, Rocket, Add, ArrowLeft, Edit, TrashCan } from '@carbon/icons-react';
import TestSuiteFormModal from '../../components/TestSuiteFormModal';
import DeleteConfirmationModal from '../../components/DeleteConfirmationModal';
import { AvailableItemsTable, type AvailableSuiteItem } from './components/AvailableItemsTable';
import { useTestSuiteDetailData } from './useTestSuiteDetailData';
import styles from '../TestSuites.module.scss';

type SuitePerformancePoint = {
	group: string;
	key: string | Date;
	value?: number;
	tokens?: number;
};

export default function TestSuiteDetailPage() {
	const params = useParams<{ id: string }>();
	const { id } = params;
	const suiteId = parseInt(id, 10);

	const {
		suite,
		agents,
		selectedAgentId,
		loading,
		error,
		allTests,
		allConversations,
		allSuites,
		entries,
		suiteRuns,
		setSelectedAgentId,
		setError,
		setEntries,
		reloadSuiteMeta
	} = useTestSuiteDetailData(suiteId);
	const [isRunning, setIsRunning] = useState(false);
	const [searchTerm, setSearchTerm] = useState('');
	const [activeTab, setActiveTab] = useState(0);

	// Track agent selections for available items
	const [availableItemAgents, setAvailableItemAgents] = useState<Record<string, number | null>>({});

	const [isEditModalOpen, setIsEditModalOpen] = useState(false);
	const [editFormData, setEditFormData] = useState({ name: '', description: '', tags: '' });

	const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);

	const [runsAgentFilter, setRunsAgentFilter] = useState<'all' | number>('all');
	const [runsViewMode, setRunsViewMode] = useState<'runs' | 'time'>('runs');

	const router = useRouter();

	const openEditModal = () => {
		if (!suite) {
			return;
		}

		setEditFormData({
			name: suite.name,
			description: suite.description || '',
			tags: suite.tags || ''
		});
		setIsEditModalOpen(true);
	};

	const handleEditSuccess = async () => {
		try {
			await reloadSuiteMeta();
		} catch (err) {
			setError(err instanceof Error ? err.message : 'Failed to refresh suite data');
		}
	};

	const openDeleteModal = () => {
		setIsDeleteModalOpen(true);
	};

	const handleDeleteSuccess = async () => {
		router.push('/test-suites');
	};

	// Derived run agents for filter
	const runAgents = useMemo(() => {
		const map = new Map<number, string>();
		suiteRuns.forEach((r) => map.set(r.agent_id, r.agent_name || `Agent #${r.agent_id}`));
		return Array.from(map.entries());
	}, [suiteRuns]);

	const filteredRuns = useMemo(() => {
		return suiteRuns.filter((r) => runsAgentFilter === 'all' || r.agent_id === runsAgentFilter);
	}, [suiteRuns, runsAgentFilter]);

	// Chart data: success rate, avg similarity, and token usage across runs
	const suitePerformanceData = useMemo(() => {
		if (!filteredRuns || filteredRuns.length === 0) {
			return [] as Array<SuitePerformancePoint>;
		}
		const runs = [...filteredRuns].sort(
			(a, b) => new Date(a.started_at).getTime() - new Date(b.started_at).getTime()
		);

		// Limit to most recent runs to match what the chart actually displays
		// This ensures the scale is calculated from visible data only
		const displayedRuns = runs.slice(-50);
		const points: Array<SuitePerformancePoint> = [];
		displayedRuns.forEach((run, idx) => {
			const key = runsViewMode === 'time' ? new Date(run.started_at) : `#${idx + 1}`;
			const successRate = run.total_tests > 0 ? (run.successful_tests / run.total_tests) * 100 : 0;
			if (!Number.isNaN(successRate)) {
				points.push({ group: 'Success rate', key, value: Math.round(successRate) });
			}
			if (typeof run.avg_similarity_score === 'number') {
				points.push({ group: 'Avg similarity', key, value: Math.round(run.avg_similarity_score) });
			}
			const totalTokens = (run.total_input_tokens || 0) + (run.total_output_tokens || 0);
			if (totalTokens > 0) {
				points.push({ group: 'Token usage', key, tokens: totalTokens });
			}
		});
		return points;
	}, [filteredRuns, runsViewMode]);

	if (loading) {
		return <InlineLoading description="Loading suite details..." />;
	}
	if (error) {
		return <InlineNotification kind="error" title="Error" subtitle={error} hideCloseButton />;
	}
	if (!suite) {
		return <InlineNotification kind="error" title="Error" subtitle="Suite not found." hideCloseButton />;
	}

	const handleRunSuite = async () => {
		if (!selectedAgentId) {
			setError('Please select an agent');
			return;
		}
		if (entries.length === 0) {
			setError('Cannot run an empty suite. Please add entries.');
			return;
		}
		try {
			setIsRunning(true);
			const { suite_run_id } = await api.executeSuite(suite.id, selectedAgentId);
			router.push(`/suite-runs/${suite_run_id}`);
		} catch (err: unknown) {
			if (err instanceof Error) {
				setError(err.message);
			} else {
				setError(String(err));
			}
			setIsRunning(false);
		}
	};

	const handleAddEntry = async (item: AvailableSuiteItem) => {
		const itemKey = `${item.type}-${item.id}`;
		const agentOverride = availableItemAgents[itemKey];

		const entryPayload: {
			sequence: number;
			test_id?: number;
			child_suite_id?: number;
			agent_id_override?: number;
		} = {
			sequence: entries.length
		};

		if (item.type === 'test') {
			entryPayload.test_id = item.id;
		} else {
			entryPayload.child_suite_id = item.id;
		}

		if (agentOverride) {
			entryPayload.agent_id_override = agentOverride;
		}

		try {
			const newEntry = await api.addSuiteEntry(suiteId, entryPayload);
			setEntries((prev) => [...prev, newEntry]);
			// Reset the agent selection for this item
			setAvailableItemAgents((prev) => ({ ...prev, [itemKey]: null }));
			setError(null);
		} catch (e: unknown) {
			if (e instanceof Error) {
				setError(e.message);
			}
		}
	};

	const handleDeleteEntry = async (entryId: number) => {
		try {
			await api.deleteSuiteEntry(suiteId, entryId);
			setEntries((prev) => prev.filter((e) => e.id !== entryId));
			setError(null);
		} catch (e: unknown) {
			if (e instanceof Error) {
				setError(e.message);
			}
		}
	};

	const handleUpdateEntryAgent = async (entryId: number, agentId: number | null) => {
		try {
			await api.updateSuiteEntry(suiteId, entryId, { agent_id_override: agentId || undefined });
			setEntries((prev) =>
				prev.map((e) => (e.id === entryId ? { ...e, agent_id_override: agentId || undefined } : e))
			);
			setError(null);
		} catch (e: unknown) {
			let message = 'An unknown error occurred';
			if (e instanceof Error) {
				message = e.message;
			} else if (typeof e === 'string') {
				message = e;
			}
			setError(`Failed to update entry agent: ${message}`);
		}
	};

	const getEntryName = (entry: SuiteEntry): string => {
		if (entry.test_id) {
			const test = allTests.find((t) => t.id === entry.test_id);
			return test ? test.name : `Test #${entry.test_id}`;
		} else if (entry.conversation_id) {
			const conversation = allConversations.find((c) => c.id === entry.conversation_id);
			return conversation ? conversation.name : `Conversation #${entry.conversation_id}`;
		} else if (entry.child_suite_id) {
			const childSuite = allSuites.find((s) => s.id === entry.child_suite_id);
			return childSuite ? childSuite.name : `Suite #${entry.child_suite_id}`;
		}
		return 'Unknown Entry';
	};

	// Filter available tests and suites
	const usedTestIds = new Set(entries.filter((e) => e.test_id).map((e) => e.test_id!));
	const usedSuiteIds = new Set(entries.filter((e) => e.child_suite_id).map((e) => e.child_suite_id!));

	const availableTests: AvailableSuiteItem[] = allTests
		.filter((t) => t.id != null && !usedTestIds.has(t.id))
		.map((t) => ({ id: t.id!, name: t.name, type: 'test', description: t.description }));

	const availableSuites: AvailableSuiteItem[] = allSuites
		.filter((s) => !usedSuiteIds.has(s.id!))
		.map((s) => ({ id: s.id!, name: s.name, type: 'suite', description: s.description }));

	// Filter items based on search and active tab
	const getFilteredItems = () => {
		const allItems = activeTab === 0 ? availableTests : availableSuites;
		if (!searchTerm) {
			return allItems;
		}
		return allItems.filter(
			(item) =>
				item.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
				(item.description && item.description.toLowerCase().includes(searchTerm.toLowerCase()))
		);
	};

	const filteredItems = getFilteredItems();

	const handleAvailableItemAgentChange = (itemKey: string, value: number | null) => {
		setAvailableItemAgents((prev) => ({
			...prev,
			[itemKey]: value
		}));
	};

	// Create agent select options
	const agentSelectOptions = [
		{ id: 'default', label: 'Use suite default' },
		...agents.map((agent) => ({
			id: String(agent.id),
			label: `${agent.name} v${agent.version}`
		}))
	];

	// Chart options
	const xTitle = runsViewMode === 'time' ? 'Date' : 'Run';
	const bottomAxis =
		runsViewMode === 'time'
			? { title: xTitle, mapsTo: 'key', scaleType: 'time' as const }
			: { title: xTitle, mapsTo: 'key', scaleType: 'labels' as const };

	// Calculate max token usage for proper scaling
	const tokenDataPoints = suitePerformanceData.filter((d) => d.group === 'Token usage') as SuitePerformancePoint[];
	const getTokenValue = (p: SuitePerformancePoint): number =>
		typeof p.tokens === 'number' ? p.tokens : (p.value ?? 0);
	const tokenValues = tokenDataPoints.map(getTokenValue);
	const hasTokenBars = tokenValues.length > 0;
	const maxTokens = hasTokenBars ? Math.max(...tokenValues) : 0;

	const suitePerformanceOptions = {
		title: '',
		axes: {
			bottom: bottomAxis,
			left: {
				title: 'Percentage / score',
				mapsTo: 'value',
				domain: [0, 100],
				includeZero: true,
				correspondingDatasets: ['Success rate', 'Avg similarity']
			},
			...(hasTokenBars
				? {
						right: {
							title: 'Token usage',
							mapsTo: 'tokens',
							domain: [0, Math.ceil(maxTokens * 1.1)],
							includeZero: true,
							correspondingDatasets: ['Token usage']
						}
					}
				: {})
		},
		comboChartTypes: hasTokenBars
			? [
					{ type: 'line', options: {}, correspondingDatasets: ['Success rate', 'Avg similarity'] },
					{ type: 'simple-bar', options: {}, correspondingDatasets: ['Token usage'] }
				]
			: [{ type: 'line', options: {}, correspondingDatasets: ['Success rate', 'Avg similarity'] }],
		height: '400px',
		legend: { enabled: true, alignment: 'center' },
		curve: 'curveMonotoneX',
		toolbar: { enabled: false },
		color: {
			scale: {
				'Success rate': CHART_COLORS.SUCCESS_RATE,
				'Avg similarity': CHART_COLORS.SIMILARITY_SCORE,
				'Token usage': CHART_COLORS.EXECUTION_TIME
			}
		},
		theme: 'g100'
	} as ComboChartOptions;

	return (
		<Grid>
			<Column sm={4} md={8} lg={16}>
				<Stack gap={7}>
					<div className={styles.header}>
						<h1>{suite.name}</h1>
						<div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
							<IconButton kind="ghost" size="md" label="Edit suite" onClick={openEditModal}>
								<Edit size={20} />
							</IconButton>
							<IconButton kind="ghost" size="md" label="Delete suite" onClick={openDeleteModal}>
								<TrashCan size={20} />
							</IconButton>
							<Button
								kind="primary"
								onClick={handleRunSuite}
								disabled={!selectedAgentId || isRunning || entries.length === 0}
								renderIcon={Rocket}
							>
								{isRunning ? 'Running...' : 'Run Suite'}
							</Button>
						</div>
					</div>

					<div className={styles.backButton}>
						<Link href="/test-suites" passHref>
							<Button kind="ghost" renderIcon={ChevronLeft}>
								Back to Test Suites
							</Button>
						</Link>
					</div>

					{suite.description && <p>{suite.description}</p>}

					{/* Suite performance over runs */}
					{suitePerformanceData.length > 0 && (
						<Tile>
							<h3 className={styles.sectionTitle}>Suite performance over runs</h3>
							<div
								style={{
									display: 'flex',
									gap: '1rem',
									alignItems: 'flex-end',
									margin: '0.5rem 0 1rem'
								}}
							>
								<div>
									<FormLabel>Agent</FormLabel>
									<Select
										id="suite-run-agent-filter"
										size="sm"
										value={String(runsAgentFilter)}
										onChange={(e) => {
											const val = e.currentTarget.value;
											setRunsAgentFilter(val === 'all' ? 'all' : Number(val));
										}}
									>
										<SelectItem value="all" text="All agents" />
										{runAgents.map(([id, name]) => (
											<SelectItem key={id} value={String(id)} text={name} />
										))}
									</Select>
								</div>
								<div>
									<FormLabel>View by</FormLabel>
									<ContentSwitcher
										size="sm"
										selectedIndex={runsViewMode === 'runs' ? 0 : 1}
										onChange={(d) => setRunsViewMode(d.index === 0 ? 'runs' : 'time')}
									>
										<Switch name="runs" text="Runs" />
										<Switch name="time" text="Time" />
									</ContentSwitcher>
								</div>
							</div>
							<ComboChart
								key={`suite-perf-${runsViewMode}-${runsAgentFilter}-${hasTokenBars ? 'tokens' : 'no-tokens'}-${Math.ceil(maxTokens)}`}
								data={suitePerformanceData}
								options={suitePerformanceOptions}
							/>
						</Tile>
					)}

					<Tile className={styles.runConfigTile}>
						<h3>Run Configuration</h3>
						<div className={styles.agentSelect}>
							<FormLabel>Default agent:</FormLabel>
							<Select
								id="agent-select"
								labelText=""
								value={selectedAgentId ? String(selectedAgentId) : ''}
								onChange={(e) => setSelectedAgentId(parseInt(e.target.value, 10))}
							>
								{agents.map((agent) => (
									<SelectItem
										key={agent.id}
										value={String(agent.id)}
										text={`${agent.name} v${agent.version}`}
									/>
								))}
							</Select>
						</div>
					</Tile>

					{error && (
						<InlineNotification
							kind="error"
							title="Error"
							subtitle={error}
							onCloseButtonClick={() => setError(null)}
						/>
					)}

					{/* Dual Panel Interface */}
					<Grid className={styles.dualPanelGrid}>
						{/* Available Items Panel */}
						<Column sm={2} md={4} lg={8}>
							<Tile className={styles.panelTile}>
								<div className={styles.panelHeader}>
									<h3>Available Items</h3>
								</div>

								<Search
									id="search-available"
									labelText="Search available items"
									placeholder="Search available items..."
									value={searchTerm}
									onChange={(e) => setSearchTerm(e.target.value)}
									size="sm"
									className={styles.searchContainer}
								/>

								<Tabs
									selectedIndex={activeTab}
									onChange={({ selectedIndex }) => setActiveTab(selectedIndex)}
								>
									<TabList>
										<Tab>Tests ({availableTests.length})</Tab>
										<Tab>Suites ({availableSuites.length})</Tab>
									</TabList>
									<TabPanels>
										<TabPanel>
											<AvailableItemsTable
												items={filteredItems}
												activeTab={activeTab}
												availableItemAgents={availableItemAgents}
												agentSelectOptions={agentSelectOptions}
												onAgentChange={handleAvailableItemAgentChange}
												onAddEntry={handleAddEntry}
											/>
										</TabPanel>
										<TabPanel>
											<AvailableItemsTable
												items={filteredItems}
												activeTab={activeTab}
												availableItemAgents={availableItemAgents}
												agentSelectOptions={agentSelectOptions}
												onAgentChange={handleAvailableItemAgentChange}
												onAddEntry={handleAddEntry}
											/>
										</TabPanel>
									</TabPanels>
								</Tabs>
							</Tile>
						</Column>

						{/* Suite Entries Panel */}
						<Column sm={2} md={4} lg={8}>
							<Tile className={styles.panelTile}>
								<div className={styles.panelHeader}>
									<h3>Suite Entries ({entries.length})</h3>
								</div>

								{entries.length === 0 ? (
									<div className={styles.emptyStateWithIcon}>
										<Add size={32} />
										<p>No entries in this suite yet.</p>
										<p>Use the arrow buttons to add tests or suites from the left panel.</p>
									</div>
								) : (
									<div className={styles.scrollableEntries}>
										<TableContainer>
											<Table size="sm">
												<TableHead>
													<TableRow>
														<TableHeader>Actions</TableHeader>
														<TableHeader>Type</TableHeader>
														<TableHeader>Name</TableHeader>
														<TableHeader>Agent Override</TableHeader>
													</TableRow>
												</TableHead>
												<TableBody>
													{entries.map((entry) => (
														<TableRow key={entry.id}>
															<TableCell>
																<IconButton
																	kind="ghost"
																	size="sm"
																	onClick={() => handleDeleteEntry(entry.id)}
																	label="Remove from suite"
																	align="right"
																>
																	<ArrowLeft size={16} />
																</IconButton>
															</TableCell>
															<TableCell>
																{entry.test_id
																	? 'Test'
																	: entry.conversation_id
																		? 'Conversation'
																		: 'Suite'}
															</TableCell>
															<TableCell>
																<div className={styles.entryName}>
																	{getEntryName(entry)}
																</div>
															</TableCell>
															<TableCell>
																<Select
																	id={`entry-agent-${entry.id}`}
																	labelText=""
																	size="sm"
																	className={styles.entryAgentSelect}
																	value={
																		entry.agent_id_override
																			? String(entry.agent_id_override)
																			: 'default'
																	}
																	onChange={(e) => {
																		const value =
																			e.target.value === 'default'
																				? null
																				: parseInt(e.target.value);
																		handleUpdateEntryAgent(entry.id, value);
																	}}
																>
																	{agentSelectOptions.map((option) => (
																		<SelectItem
																			key={option.id}
																			value={option.id}
																			text={option.label}
																		/>
																	))}
																</Select>
															</TableCell>
														</TableRow>
													))}
												</TableBody>
											</Table>
										</TableContainer>
									</div>
								)}
							</Tile>
						</Column>
					</Grid>
				</Stack>
			</Column>

			{/* Edit Modal */}
			<TestSuiteFormModal
				isOpen={isEditModalOpen}
				editingId={suite.id}
				formData={editFormData}
				onClose={() => setIsEditModalOpen(false)}
				onSuccess={handleEditSuccess}
			/>

			{/* Delete Confirmation Modal */}
			<DeleteConfirmationModal
				isOpen={isDeleteModalOpen}
				deleteType="test-suite"
				deleteName={suite.name}
				deleteId={suite.id}
				onClose={() => setIsDeleteModalOpen(false)}
				onSuccess={handleDeleteSuccess}
			/>
		</Grid>
	);
}
