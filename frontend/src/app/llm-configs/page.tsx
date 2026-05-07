'use client';

import { useState, useEffect } from 'react';
import { Add, Edit, TrashCan, ArrowUp, ArrowDown, PlayOutline } from '@carbon/icons-react';
import {
	DataTable,
	Table,
	TableHead,
	TableRow,
	TableHeader,
	TableBody,
	TableCell,
	Button,
	Loading,
	InlineNotification
} from '@carbon/react';
import styles from './page.module.scss';
import { useLLMConfigs } from '../../lib/AppDataContext';
import { LLMConfig } from '../../lib/api';
import { sortBy } from 'lodash';
import LLMConfigFormModal from '../components/LLMConfigFormModal';
import TestLLMModal from './components/TestLLMModal';

export default function LLMConfigsPage() {
	const { llmConfigs, loading, error, updateLLMConfig, deleteLLMConfig, fetchLLMConfigs } = useLLMConfigs();

	const [isAddModalOpen, setIsAddModalOpen] = useState(false);
	const [isEditModalOpen, setIsEditModalOpen] = useState(false);
	const [selectedConfigId, setSelectedConfigId] = useState<number | null>(null);
	const [isTestModalOpen, setIsTestModalOpen] = useState(false);

	useEffect(() => {
		fetchLLMConfigs();
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, []);

	const sortedConfigs = sortBy(llmConfigs, 'priority');

	// Get current config for edit modal
	const getConfigById = (id: number | null) => {
		if (!id) return null;
		return llmConfigs.find((config) => config.id === id) || null;
	};

	const handleMovePriority = async (config: LLMConfig, direction: 'up' | 'down') => {
		const currentPriority = config.priority;
		const newPriority = direction === 'up' ? Math.max(1, currentPriority - 10) : currentPriority + 10;

		try {
			await updateLLMConfig(config.id!, { priority: newPriority });
		} catch {
			// Best-effort: priority updates are optional UX enhancement
		}
	};

	const handleDelete = async (id: number) => {
		if (window.confirm('Are you sure you want to delete this LLM configuration?')) {
			try {
				await deleteLLMConfig(id);
			} catch {
				// Best-effort: UI will reflect state after refresh
			}
		}
	};

	const headers = [
		{ key: 'priority', header: 'Priority' },
		{ key: 'name', header: 'Name' },
		{ key: 'provider', header: 'Provider' },
		{ key: 'actions', header: 'Actions' }
	];

	// Format rows for the data table
	const rows = sortedConfigs.map((config) => ({
		id: `${config.id}`,
		priority: config.priority,
		name: config.name,
		provider: config.provider,
		actions: (
			<div className={styles.actionButtons}>
				{/* Move up in priority */}
				<Button
					kind="ghost"
					size="sm"
					hasIconOnly
					renderIcon={ArrowUp}
					iconDescription="Move up in priority"
					onClick={() => handleMovePriority(config, 'up')}
				/>

				{/* Move down in priority */}
				<Button
					kind="ghost"
					size="sm"
					hasIconOnly
					renderIcon={ArrowDown}
					iconDescription="Move down in priority"
					onClick={() => handleMovePriority(config, 'down')}
				/>

				{/* Test LLM */}
				<Button
					kind="ghost"
					size="sm"
					hasIconOnly
					renderIcon={PlayOutline}
					iconDescription="Test LLM"
					onClick={() => {
						setSelectedConfigId(config.id!);
						setIsTestModalOpen(true);
					}}
				/>

				{/* Edit */}
				<Button
					kind="ghost"
					size="sm"
					hasIconOnly
					renderIcon={Edit}
					iconDescription="Edit"
					onClick={() => {
						setSelectedConfigId(config.id!);
						setIsEditModalOpen(true);
					}}
				/>

				{/* Delete */}
				<Button
					kind="ghost"
					size="sm"
					hasIconOnly
					renderIcon={TrashCan}
					iconDescription="Delete"
					onClick={() => handleDelete(config.id!)}
				/>
			</div>
		)
	}));

	return (
		<div className={styles.container}>
			<div className={styles.header}>
				<h1>LLM Configurations</h1>
				<Button renderIcon={Add} onClick={() => setIsAddModalOpen(true)}>
					Add LLM Config
				</Button>
			</div>

			{error && (
				<InlineNotification kind="error" title="Error" subtitle={error} className={styles.notification} />
			)}

			{loading ? (
				<Loading description="Loading LLM configurations..." withOverlay={false} />
			) : (
				<DataTable rows={rows} headers={headers}>
					{({ rows, headers, getHeaderProps, getTableProps }) => (
						<Table {...getTableProps()}>
							<TableHead>
								<TableRow>
									{headers.map((header) => (
										<TableHeader {...getHeaderProps({ header })} key={header.key}>
											{header.header}
										</TableHeader>
									))}
								</TableRow>
							</TableHead>
							<TableBody>
								{rows.map((row) => (
									<TableRow key={row.id}>
										{row.cells.map((cell) => (
											<TableCell key={cell.id}>{cell.value}</TableCell>
										))}
									</TableRow>
								))}
								{rows.length === 0 && (
									<TableRow>
										<TableCell colSpan={headers.length} style={{ textAlign: 'center' }}>
											No LLM configurations found
										</TableCell>
									</TableRow>
								)}
							</TableBody>
						</Table>
					)}
				</DataTable>
			)}

			{/* Add LLM Config Modal */}
			{isAddModalOpen && <LLMConfigFormModal isOpen={isAddModalOpen} onClose={() => setIsAddModalOpen(false)} />}

			{/* Edit LLM Config Modal */}
			{isEditModalOpen && selectedConfigId && (
				<LLMConfigFormModal
					isOpen={isEditModalOpen}
					onClose={() => setIsEditModalOpen(false)}
					config={getConfigById(selectedConfigId)}
				/>
			)}

			{/* Test LLM Modal */}
			{selectedConfigId && (
				<TestLLMModal
					isOpen={isTestModalOpen}
					configId={selectedConfigId}
					onClose={() => setIsTestModalOpen(false)}
				/>
			)}
		</div>
	);
}
