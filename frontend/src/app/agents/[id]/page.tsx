'use client';

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
	Button,
	InlineLoading,
	InlineNotification,
	Tile,
	Tag,
	CodeSnippet,
	Accordion,
	AccordionItem,
	TextInput,
	TextArea,
	Checkbox
} from '@carbon/react';
import { Edit, ArrowLeft } from '@carbon/icons-react';
import { api } from '../../../lib/api';
import { getRequestTemplateCapabilitySummary, getResponseMapCapabilitySummary } from '../../../lib/capabilities';
import { agentToFormData, extractByPath } from '../../../lib/utils';
import AgentFormModal from '../../components/AgentFormModal';
import DeleteConfirmationModal from '../../components/DeleteConfirmationModal';
import SessionsTable from '../../components/SessionsTable';
import AgentAnalytics from '../../components/AgentAnalytics';
import { useAgentDetailData } from './useAgentDetailData';
import styles from './page.module.scss';

export default function AgentDetailPage() {
	const params = useParams<{ id: string }>();
	const router = useRouter();
	const agentId = Number(params.id);
	const {
		agent,
		loading,
		error,
		recentSessions,
		allSessions,
		conversations,
		sessionMessages,
		stats,
		requestTemplates,
		responseMaps,
		reload
	} = useAgentDetailData(Number.isNaN(agentId) ? null : agentId);
	const [editModalOpen, setEditModalOpen] = useState(false);
	const [deleteModalOpen, setDeleteModalOpen] = useState(false);
	const [newTemplate, setNewTemplate] = useState<{
		name: string;
		body: string;
		capabilities: string;
		is_default: boolean;
	}>({ name: '', body: '', capabilities: '', is_default: false });
	const [newResponseMap, setNewResponseMap] = useState<{
		name: string;
		spec: string;
		capabilities: string;
		is_default: boolean;
	}>({ name: '', spec: '', capabilities: '', is_default: false });
	const [editingTemplateId, setEditingTemplateId] = useState<number | null>(null);
	const [editingMapId, setEditingMapId] = useState<number | null>(null);
	const [editTemplateData, setEditTemplateData] = useState<{
		name: string;
		body: string;
		capabilities: string;
		is_default: boolean;
	}>({ name: '', body: '', capabilities: '', is_default: false });
	const [editMapData, setEditMapData] = useState<{
		name: string;
		spec: string;
		capabilities: string;
		is_default: boolean;
	}>({ name: '', spec: '', capabilities: '', is_default: false });
	const [commError, setCommError] = useState<string | null>(null);
	const [previewTemplateId, setPreviewTemplateId] = useState<number | null>(null);
	const [previewInput, setPreviewInput] = useState<string>('');
	const [previewHistory, setPreviewHistory] = useState<string>('');
	const [previewVars, setPreviewVars] = useState<string>('{}');
	const renderTemplate = (tpl: string, input: string, history: string, vars: Record<string, unknown>) => {
		try {
			const escapedInput = JSON.stringify(input).slice(1, -1);
			const escapedHistory = JSON.stringify(history).slice(1, -1);
			let formatted = tpl
				.replace(/\{\{\s*input\s*\}\}/g, escapedInput)
				.replace(/\{\{\s*conversation_history\s*\}\}/g, escapedHistory);
			formatted = formatted.replace(/\{\{\s*([a-zA-Z0-9_\.\[\]'"]+)\s*\}\}/g, (_m, p1: string) => {
				if (p1 === 'input' || p1 === 'conversation_history') {
					return _m;
				}
				const value = extractByPath(vars, p1);
				if (value === undefined || value === null) {
					return '';
				}
				if (typeof value === 'string') {
					return JSON.stringify(value).slice(1, -1);
				}
				try {
					return JSON.stringify(value);
				} catch {
					return String(value);
				}
			});
			return JSON.stringify(JSON.parse(formatted), null, 2);
		} catch {
			return '(invalid template or variables)';
		}
	};

	const handleEditClick = () => {
		setEditModalOpen(true);
	};

	const handleDeleteClick = () => {
		setDeleteModalOpen(true);
	};

	const handleBackClick = () => {
		router.push('/agents');
	};

	const initialFormData = agentToFormData(agent);

	if (loading) {
		return (
			<div className={styles.container}>
				<InlineLoading description="Loading agent..." />
			</div>
		);
	}

	if (error || !agent) {
		return (
			<div className={styles.container}>
				<InlineNotification kind="error" title="Error" subtitle={error || 'Agent not found'} hideCloseButton />
				<Button onClick={handleBackClick} renderIcon={ArrowLeft}>
					Back to agents
				</Button>
			</div>
		);
	}

	const settings = agent.settings ? JSON.parse(agent.settings) : {};
	const agentType = settings.type || 'crew_ai';

	const renderCapabilityChips = (items: string[]) => {
		if (!items.length) return null;
		return (
			<div className={styles.capabilityChips}>
				{items.map((item) => (
					<Tag key={item} type="cool-gray" size="sm">
						{item}
					</Tag>
				))}
			</div>
		);
	};

	return (
		<div className={styles.container}>
			<div className={styles.header}>
				<Button kind="ghost" renderIcon={ArrowLeft} onClick={handleBackClick} className={styles.backButton}>
					Back to agents
				</Button>
				<div className={styles.headerActions}>
					<Button kind="ghost" renderIcon={Edit} onClick={handleEditClick}>
						Edit
					</Button>
					<Button kind="danger--ghost" onClick={handleDeleteClick}>
						Delete
					</Button>
				</div>
			</div>

			<div className={styles.content}>
				<div className={styles.mainInfo}>
					<h1 className={styles.title}>{agent.name}</h1>
					<div className={styles.meta}>
						<Tag type="blue" size="sm">
							Version {agent.version}
						</Tag>
						<Tag type={agentType === 'external_api' ? 'teal' : 'purple'} size="sm">
							{agentType === 'external_api' ? 'External API' : 'CrewAI'}
						</Tag>
						<span className={styles.createdAt}>
							Created {agent.created_at ? new Date(agent.created_at).toLocaleDateString() : 'Unknown'}
						</span>
					</div>
				</div>

				<div className={styles.contentRow}>
					{/* Stats Section */}
					<div className={styles.statsSection}>
						<div className={styles.statsGrid}>
							<Tile className={styles.statTile}>
								<div className={styles.statHeader}>
									<span className={styles.statLabel}>Success rate</span>
									{stats.trends.successRate !== 0 && (
										<span
											className={stats.trends.successRate > 0 ? styles.trendUp : styles.trendDown}
										>
											{stats.trends.successRate > 0 ? '↑' : '↓'}
											{Math.abs(stats.trends.successRate).toFixed(1)}%
										</span>
									)}
								</div>
								<div className={styles.statValue}>{stats.successRate.toFixed(1)}%</div>
								<div className={styles.statInfo}>Comparing first vs second half of sessions</div>
							</Tile>

							{stats.avgSimilarity !== null && (
								<Tile className={styles.statTile}>
									<div className={styles.statHeader}>
										<span className={styles.statLabel}>Avg similarity</span>
										{stats.trends.similarity !== null && stats.trends.similarity !== 0 && (
											<span
												className={
													stats.trends.similarity > 0 ? styles.trendUp : styles.trendDown
												}
											>
												{stats.trends.similarity > 0 ? '↑' : '↓'}
												{Math.abs(stats.trends.similarity).toFixed(1)}
											</span>
										)}
									</div>
									<div className={styles.statValue}>{stats.avgSimilarity.toFixed(1)}</div>
									<div className={styles.statInfo}>Maximum score per session</div>
								</Tile>
							)}

							<Tile className={styles.statTile}>
								<div className={styles.statHeader}>
									<span className={styles.statLabel}>Avg exec time</span>
									{stats.trends.executionTime !== null && stats.trends.executionTime !== 0 && (
										<span
											className={
												stats.trends.executionTime < 0 ? styles.trendUp : styles.trendDown
											}
										>
											{stats.trends.executionTime < 0 ? '↓' : '↑'}
											{Math.abs(stats.trends.executionTime).toFixed(1)}s
										</span>
									)}
								</div>
								<div className={styles.statValue}>
									{stats.avgExecutionTime > 0 ? (stats.avgExecutionTime / 1000).toFixed(2) : '0.00'}s
								</div>
								<div className={styles.statInfo}>Time from start to completion</div>
							</Tile>

							<Tile className={styles.statTile}>
								<div className={styles.statHeader}>
									<span className={styles.statLabel}>Total sessions</span>
								</div>
								<div className={styles.statValue}>{stats.totalRuns}</div>
								<div className={styles.statInfo}>
									Last run: {stats.lastRun ? new Date(stats.lastRun).toLocaleDateString() : 'Never'}
								</div>
							</Tile>
						</div>
					</div>

					{/* Configuration Section */}
					<div className={styles.configSection}>
						<div className={styles.section}>
							<h2 className={styles.sectionTitle}>Configuration</h2>

							<Accordion>
								<AccordionItem title="Prompt">
									<div className={styles.configContent}>
										<CodeSnippet type="multi" feedback="Copied to clipboard">
											{agent.prompt || '(empty)'}
										</CodeSnippet>
									</div>
								</AccordionItem>

								{agentType === 'crew_ai' && (
									<>
										{settings.role && (
											<AccordionItem title="Role">
												<div className={styles.configContent}>
													<p>{settings.role}</p>
												</div>
											</AccordionItem>
										)}
										{settings.goal && (
											<AccordionItem title="Goal">
												<div className={styles.configContent}>
													<p>{settings.goal}</p>
												</div>
											</AccordionItem>
										)}
										{settings.backstory && (
											<AccordionItem title="Backstory">
												<div className={styles.configContent}>
													<p>{settings.backstory}</p>
												</div>
											</AccordionItem>
										)}
										{(settings.model ||
											settings.base_url ||
											settings.temperature !== undefined) && (
											<AccordionItem title="Model settings">
												<div className={styles.configContent}>
													{settings.model && (
														<p>
															<strong>Model:</strong> {settings.model}
														</p>
													)}
													{settings.base_url && (
														<p>
															<strong>Base URL:</strong> {settings.base_url}
														</p>
													)}
													{settings.temperature !== undefined && (
														<p>
															<strong>Temperature:</strong> {settings.temperature}
														</p>
													)}
													{settings.max_tokens !== undefined && (
														<p>
															<strong>Max tokens:</strong> {settings.max_tokens}
														</p>
													)}
												</div>
											</AccordionItem>
										)}
									</>
								)}

								{agentType === 'external_api' && (
									<>
										{settings.api_endpoint && (
											<AccordionItem title="API endpoint">
												<div className={styles.configContent}>
													<p>
														<strong>URL:</strong> {settings.api_endpoint}
													</p>
													{settings.http_method && (
														<p>
															<strong>Method:</strong> {settings.http_method}
														</p>
													)}
												</div>
											</AccordionItem>
										)}
										{settings.token_mapping && (
											<AccordionItem title="Token mapping">
												<div className={styles.configContent}>
													<CodeSnippet type="multi" feedback="Copied to clipboard">
														{typeof settings.token_mapping === 'string'
															? settings.token_mapping
															: JSON.stringify(settings.token_mapping, null, 2)}
													</CodeSnippet>
												</div>
											</AccordionItem>
										)}
										{settings.headers && (
											<AccordionItem title="Headers">
												<div className={styles.configContent}>
													<CodeSnippet type="multi" feedback="Copied to clipboard">
														{typeof settings.headers === 'string'
															? settings.headers
															: JSON.stringify(settings.headers, null, 2)}
													</CodeSnippet>
												</div>
											</AccordionItem>
										)}
										<AccordionItem title="Communication (templates & response maps)">
											<div className={styles.configContent}>
												{commError && (
													<InlineNotification
														kind="error"
														title="Error"
														subtitle={commError}
														hideCloseButton
													/>
												)}
												<div className={styles.section}>
													<h4>Request templates</h4>
													<div className={styles.list}>
														{requestTemplates.map((t) => (
															<div key={t.id} className={styles.listItem}>
																<div className={styles.listHeader}>
																	<strong>{t.name}</strong>
																	{Number(t.is_default) === 1 && (
																		<Tag type="green" size="sm">
																			default
																		</Tag>
																	)}
																</div>
																{editingTemplateId === t.id ? (
																	<div style={{ marginTop: '0.5rem' }}>
																		<TextInput
																			id={`edit-tpl-name-${t.id}`}
																			labelText="Name"
																			value={editTemplateData.name}
																			onChange={(e) =>
																				setEditTemplateData((prev) => ({
																					...prev,
																					name: e.target.value
																				}))
																			}
																			style={{ marginBottom: '0.5rem' }}
																		/>
																		<TextArea
																			id={`edit-tpl-body-${t.id}`}
																			labelText="Body (JSON template)"
																			rows={4}
																			value={editTemplateData.body}
																			onChange={(e) =>
																				setEditTemplateData((prev) => ({
																					...prev,
																					body: e.target.value
																				}))
																			}
																			style={{ marginBottom: '0.5rem' }}
																		/>
																		<TextArea
																			id={`edit-tpl-capabilities-${t.id}`}
																			labelText="Capabilities (JSON)"
																			rows={3}
																			value={editTemplateData.capabilities}
																			onChange={(e) =>
																				setEditTemplateData((prev) => ({
																					...prev,
																					capabilities: e.target.value
																				}))
																			}
																			style={{ marginBottom: '0.5rem' }}
																		/>
																		<div
																			style={{
																				marginTop: '0.5rem',
																				marginBottom: '0.5rem'
																			}}
																		>
																			<Checkbox
																				id={`edit-tpl-default-${t.id}`}
																				labelText="Set as default"
																				checked={editTemplateData.is_default}
																				onChange={(_evt, data) =>
																					setEditTemplateData((prev) => ({
																						...prev,
																						is_default: data.checked
																					}))
																				}
																			/>
																		</div>
																		<div style={{ display: 'flex', gap: '0.5rem' }}>
																			<Button
																				size="sm"
																				onClick={async () => {
																					setCommError(null);
																					try {
																						JSON.parse(
																							editTemplateData.body
																						);
																						const capabilitiesPayload =
																							editTemplateData.capabilities &&
																							editTemplateData.capabilities.trim()
																								? JSON.parse(
																										editTemplateData.capabilities
																									)
																								: {};
																						await api.updateAgentRequestTemplate(
																							agent.id!,
																							t.id,
																							{
																								name: editTemplateData.name,
																								body: editTemplateData.body,
																								capabilities:
																									JSON.stringify(
																										capabilitiesPayload
																									),
																								is_default:
																									editTemplateData.is_default
																							}
																						);
																						setEditingTemplateId(null);
																						await reload();
																					} catch (e) {
																						setCommError(
																							e instanceof Error
																								? e.message
																								: 'failed to update template'
																						);
																					}
																				}}
																			>
																				Save
																			</Button>
																			<Button
																				size="sm"
																				kind="secondary"
																				onClick={() => {
																					setEditingTemplateId(null);
																				}}
																			>
																				Cancel
																			</Button>
																		</div>
																	</div>
																) : (
																	<>
																		<CodeSnippet
																			type="multi"
																			feedback="Copied to clipboard"
																		>
																			{t.body}
																		</CodeSnippet>
																		{renderCapabilityChips(
																			getRequestTemplateCapabilitySummary(
																				t.capabilities
																			)
																		)}
																		<div className={styles.actionsRow}>
																			<Button
																				size="sm"
																				kind="ghost"
																				onClick={() => {
																					setEditingTemplateId(t.id);
																					setEditTemplateData({
																						name: t.name,
																						body: t.body,
																						capabilities:
																							typeof t.capabilities ===
																							'string'
																								? t.capabilities
																								: t.capabilities
																									? JSON.stringify(
																											t.capabilities
																										)
																									: '',
																						is_default:
																							Number(t.is_default) === 1
																					});
																				}}
																			>
																				Edit
																			</Button>
																			<Button
																				size="sm"
																				kind="ghost"
																				onClick={async () => {
																					try {
																						await api.setDefaultAgentRequestTemplate(
																							agent.id!,
																							t.id
																						);
																						await reload();
																					} catch (e) {
																						setCommError(
																							e instanceof Error
																								? e.message
																								: 'failed to set default'
																						);
																					}
																				}}
																			>
																				Set default
																			</Button>
																			<Button
																				size="sm"
																				kind="danger--ghost"
																				onClick={async () => {
																					try {
																						await api.deleteAgentRequestTemplate(
																							agent.id!,
																							t.id
																						);
																						await reload();
																					} catch (e) {
																						setCommError(
																							e instanceof Error
																								? e.message
																								: 'failed to delete'
																						);
																					}
																				}}
																			>
																				Delete
																			</Button>
																		</div>
																	</>
																)}
															</div>
														))}
													</div>
													<div className={styles.form}>
														<h5>Create new template</h5>
														<TextInput
															id="new-tpl-name"
															labelText="Name"
															value={newTemplate.name}
															onChange={(e) =>
																setNewTemplate((prev) => ({
																	...prev,
																	name: e.target.value
																}))
															}
														/>
														<TextArea
															id="new-tpl-body"
															labelText="Body (JSON template)"
															rows={4}
															value={newTemplate.body}
															onChange={(e) =>
																setNewTemplate((prev) => ({
																	...prev,
																	body: e.target.value
																}))
															}
														/>
														<TextArea
															id="new-tpl-capabilities"
															labelText="Capabilities (JSON)"
															rows={3}
															value={newTemplate.capabilities}
															onChange={(e) =>
																setNewTemplate((prev) => ({
																	...prev,
																	capabilities: e.target.value
																}))
															}
														/>
														<div style={{ marginTop: '0.5rem' }}>
															<Checkbox
																id="new-tpl-default"
																labelText="Set as default"
																checked={newTemplate.is_default}
																onChange={(_evt, data) =>
																	setNewTemplate((prev) => ({
																		...prev,
																		is_default: data.checked
																	}))
																}
															/>
														</div>
														<Button
															size="sm"
															onClick={async () => {
																setCommError(null);
																try {
																	const caps =
																		newTemplate.capabilities &&
																		newTemplate.capabilities.trim()
																			? JSON.parse(newTemplate.capabilities)
																			: {};
																	await api.createAgentRequestTemplate(agent.id!, {
																		name: newTemplate.name,
																		body: newTemplate.body,
																		capabilities: JSON.stringify(caps),
																		is_default: newTemplate.is_default
																	});
																	setNewTemplate({
																		name: '',
																		body: '',
																		capabilities: '',
																		is_default: false
																	});
																	await reload();
																} catch (e) {
																	setCommError(
																		e instanceof Error
																			? e.message
																			: 'failed to create template'
																	);
																}
															}}
														>
															Create
														</Button>
													</div>
												</div>

												<div className={styles.section}>
													<h4>Response maps</h4>
													<div className={styles.list}>
														{responseMaps.map((m) => (
															<div key={m.id} className={styles.listItem}>
																<div className={styles.listHeader}>
																	<strong>{m.name}</strong>
																	{Number(m.is_default) === 1 && (
																		<Tag type="green" size="sm">
																			default
																		</Tag>
																	)}
																</div>
																{editingMapId === m.id ? (
																	<div style={{ marginTop: '0.5rem' }}>
																		<TextInput
																			id={`edit-map-name-${m.id}`}
																			labelText="Name"
																			value={editMapData.name}
																			onChange={(e) =>
																				setEditMapData((prev) => ({
																					...prev,
																					name: e.target.value
																				}))
																			}
																			style={{ marginBottom: '0.5rem' }}
																		/>
																		<TextArea
																			id={`edit-map-spec-${m.id}`}
																			labelText="Spec (JSON mapping)"
																			rows={4}
																			value={editMapData.spec}
																			onChange={(e) =>
																				setEditMapData((prev) => ({
																					...prev,
																					spec: e.target.value
																				}))
																			}
																			style={{ marginBottom: '0.5rem' }}
																		/>
																		<TextArea
																			id={`edit-map-capabilities-${m.id}`}
																			labelText="Capabilities (JSON)"
																			rows={3}
																			value={editMapData.capabilities}
																			onChange={(e) =>
																				setEditMapData((prev) => ({
																					...prev,
																					capabilities: e.target.value
																				}))
																			}
																			style={{ marginBottom: '0.5rem' }}
																		/>
																		<div
																			style={{
																				marginTop: '0.5rem',
																				marginBottom: '0.5rem'
																			}}
																		>
																			<Checkbox
																				id={`edit-map-default-${m.id}`}
																				labelText="Set as default"
																				checked={editMapData.is_default}
																				onChange={(_evt, data) =>
																					setEditMapData((prev) => ({
																						...prev,
																						is_default: data.checked
																					}))
																				}
																			/>
																		</div>
																		<div style={{ display: 'flex', gap: '0.5rem' }}>
																			<Button
																				size="sm"
																				onClick={async () => {
																					setCommError(null);
																					try {
																						// Validate JSON
																						JSON.parse(editMapData.spec);
																						const capabilitiesPayload =
																							editMapData.capabilities &&
																							editMapData.capabilities.trim()
																								? JSON.parse(
																										editMapData.capabilities
																									)
																								: {};
																						await api.updateAgentResponseMap(
																							agent.id!,
																							m.id,
																							{
																								name: editMapData.name,
																								spec: editMapData.spec,
																								capabilities:
																									JSON.stringify(
																										capabilitiesPayload
																									),
																								is_default:
																									editMapData.is_default
																							}
																						);
																						setEditingMapId(null);
																						await reload();
																					} catch (e) {
																						setCommError(
																							e instanceof Error
																								? e.message
																								: 'failed to update response map'
																						);
																					}
																				}}
																			>
																				Save
																			</Button>
																			<Button
																				size="sm"
																				kind="secondary"
																				onClick={() => {
																					setEditingMapId(null);
																				}}
																			>
																				Cancel
																			</Button>
																		</div>
																	</div>
																) : (
																	<>
																		<CodeSnippet
																			type="multi"
																			feedback="Copied to clipboard"
																		>
																			{m.spec}
																		</CodeSnippet>
																		{renderCapabilityChips(
																			getResponseMapCapabilitySummary(
																				m.capabilities
																			)
																		)}
																		<div className={styles.actionsRow}>
																			<Button
																				size="sm"
																				kind="ghost"
																				onClick={() => {
																					setEditingMapId(m.id);
																					setEditMapData({
																						name: m.name,
																						spec: m.spec,
																						capabilities:
																							typeof m.capabilities ===
																							'string'
																								? m.capabilities
																								: m.capabilities
																									? JSON.stringify(
																											m.capabilities
																										)
																									: '',
																						is_default:
																							Number(m.is_default) === 1
																					});
																				}}
																			>
																				Edit
																			</Button>
																			<Button
																				size="sm"
																				kind="ghost"
																				onClick={async () => {
																					try {
																						await api.setDefaultAgentResponseMap(
																							agent.id!,
																							m.id
																						);
																						await reload();
																					} catch (e) {
																						setCommError(
																							e instanceof Error
																								? e.message
																								: 'failed to set default'
																						);
																					}
																				}}
																			>
																				Set default
																			</Button>
																			<Button
																				size="sm"
																				kind="danger--ghost"
																				onClick={async () => {
																					try {
																						await api.deleteAgentResponseMap(
																							agent.id!,
																							m.id
																						);
																						await reload();
																					} catch (e) {
																						setCommError(
																							e instanceof Error
																								? e.message
																								: 'failed to delete'
																						);
																					}
																				}}
																			>
																				Delete
																			</Button>
																		</div>
																	</>
																)}
															</div>
														))}
													</div>
													<div className={styles.form}>
														<h5>Create new response map</h5>
														<TextInput
															id="new-map-name"
															labelText="Name"
															value={newResponseMap.name}
															onChange={(e) =>
																setNewResponseMap((prev) => ({
																	...prev,
																	name: e.target.value
																}))
															}
														/>
														<TextArea
															id="new-map-spec"
															labelText="Spec (JSON mapping)"
															rows={4}
															value={newResponseMap.spec}
															onChange={(e) =>
																setNewResponseMap((prev) => ({
																	...prev,
																	spec: e.target.value
																}))
															}
														/>
														<TextArea
															id="new-map-capabilities"
															labelText="Capabilities (JSON)"
															rows={3}
															value={newResponseMap.capabilities}
															onChange={(e) =>
																setNewResponseMap((prev) => ({
																	...prev,
																	capabilities: e.target.value
																}))
															}
														/>
														<div style={{ marginTop: '0.5rem' }}>
															<Checkbox
																id="new-map-default"
																labelText="Set as default"
																checked={newResponseMap.is_default}
																onChange={(_evt, data) =>
																	setNewResponseMap((prev) => ({
																		...prev,
																		is_default: data.checked
																	}))
																}
															/>
														</div>
														<Button
															size="sm"
															onClick={async () => {
																setCommError(null);
																try {
																	const caps =
																		newResponseMap.capabilities &&
																		newResponseMap.capabilities.trim()
																			? JSON.parse(newResponseMap.capabilities)
																			: {};
																	await api.createAgentResponseMap(agent.id!, {
																		name: newResponseMap.name,
																		spec: newResponseMap.spec,
																		capabilities: JSON.stringify(caps),
																		is_default: newResponseMap.is_default
																	});
																	setNewResponseMap({
																		name: '',
																		spec: '',
																		capabilities: '',
																		is_default: false
																	});
																	await reload();
																} catch (e) {
																	setCommError(
																		e instanceof Error
																			? e.message
																			: 'failed to create response map'
																	);
																}
															}}
														>
															Create
														</Button>
													</div>
												</div>
												<div className={styles.section}>
													<h4>Preview</h4>
													<div className={styles.form}>
														<TextInput
															id="preview-input"
															labelText="Current user message"
															value={previewInput}
															onChange={(e) => setPreviewInput(e.target.value)}
														/>
														<TextArea
															id="preview-history"
															labelText="Conversation history"
															rows={3}
															value={previewHistory}
															onChange={(e) => setPreviewHistory(e.target.value)}
														/>
														<TextArea
															id="preview-vars"
															labelText="Variables (JSON)"
															rows={3}
															value={previewVars}
															onChange={(e) => setPreviewVars(e.target.value)}
														/>
														<div className={styles.list}>
															{requestTemplates.map((t) => (
																<div
																	key={t.id}
																	className={styles.listItem}
																	onClick={() => setPreviewTemplateId(t.id)}
																	style={{
																		cursor: 'pointer',
																		border:
																			previewTemplateId === t.id
																				? '1px solid var(--cds-border-strong-01)'
																				: undefined
																	}}
																>
																	<strong>{t.name}</strong>{' '}
																	{previewTemplateId === t.id && (
																		<Tag type="blue" size="sm">
																			selected
																		</Tag>
																	)}
																</div>
															))}
														</div>
														{previewTemplateId && (
															<CodeSnippet type="multi" feedback="Copied to clipboard">
																{(() => {
																	const tpl =
																		requestTemplates.find(
																			(t) => t.id === previewTemplateId
																		)?.body || '';
																	let vars: Record<string, unknown> = {};
																	try {
																		vars = JSON.parse(previewVars || '{}');
																	} catch {
																		vars = {};
																	}
																	return renderTemplate(
																		tpl,
																		previewInput,
																		previewHistory,
																		vars
																	);
																})()}
															</CodeSnippet>
														)}
													</div>
												</div>
											</div>
										</AccordionItem>
									</>
								)}

								{Object.keys(settings).length > 0 && (
									<AccordionItem title="Raw settings">
										<div className={styles.configContent}>
											<CodeSnippet type="multi" feedback="Copied to clipboard">
												{JSON.stringify(settings, null, 2)}
											</CodeSnippet>
										</div>
									</AccordionItem>
								)}
							</Accordion>
						</div>
					</div>
				</div>

				{/* Analytics */}
				{allSessions.length > 0 && (
					<div className={styles.section}>
						<h2 className={styles.sectionTitle}>Analytics</h2>
						<AgentAnalytics sessions={allSessions} />
					</div>
				)}

				{/* Recent sessions */}
				{recentSessions.length > 0 && (
					<div className={styles.section}>
						<h2 className={styles.sectionTitle}>Recent sessions</h2>
						<SessionsTable
							sessions={recentSessions}
							agents={agent ? [agent] : []}
							conversations={Array.from(conversations.values())}
							sessionMessages={sessionMessages}
							limit={10}
							hiddenColumns={['agent']}
						/>
					</div>
				)}
			</div>

			{/* Modals */}
			<AgentFormModal
				isOpen={editModalOpen}
				editingId={agent.id || null}
				formData={initialFormData}
				onClose={() => setEditModalOpen(false)}
				onSuccess={() => {
					reload();
					setEditModalOpen(false);
				}}
			/>

			<DeleteConfirmationModal
				isOpen={deleteModalOpen}
				deleteType="agent"
				deleteName={agent.name}
				deleteId={agent.id || null}
				onClose={() => setDeleteModalOpen(false)}
				onSuccess={() => {
					router.push('/agents');
				}}
			/>
		</div>
	);
}
