import { Button, InlineLoading } from '@carbon/react';
import { Add, DataTable as DataTableIcon } from '@carbon/icons-react';
import styles from '../page.module.scss';
import EmptyState from './EmptyState';
import TableRenderer from './TableRenderer';
import { useAgents } from '@/lib/AppDataContext';
import { useEffect, useState } from 'react';

interface AgentsProps {
	onAddClick: () => void;
	onEditAgent: (id: number) => void;
	onDeleteAgent: (id: number) => void;
}

export default function Agents({ onAddClick, onEditAgent, onDeleteAgent }: AgentsProps) {
	// Get data from context
	const { agents, isLoading, fetchAgents } = useAgents();
	const [hasLoadedOnce, setHasLoadedOnce] = useState(false);

	useEffect(() => {
		const loadAgents = async () => {
			try {
				await fetchAgents();
			} finally {
				setHasLoadedOnce(true);
			}
		};
		loadAgents();
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, []);

	const agentRows = agents.map((agent) => ({
		id: agent.id?.toString() || `agent-${Date.now()}`,
		name: agent.name,
		version: agent.version,
		created_at: new Date(agent.created_at!).toLocaleString()
	}));

	const agentHeaders = [
		{ key: 'name', header: 'Name' },
		{ key: 'version', header: 'Version' },
		{ key: 'created_at', header: 'Created At' },
		{ key: 'actions', header: 'Actions' }
	];

	return (
		<>
			<div className={styles.panelHeader}>
				<h2>Agents</h2>
				{agentRows.length > 0 && (
					<Button renderIcon={Add} onClick={onAddClick}>
						Add Agent
					</Button>
				)}
			</div>
			{isLoading || !hasLoadedOnce ? (
				<InlineLoading description="Loading data..." />
			) : agentRows.length > 0 ? (
				<TableRenderer
					headers={agentHeaders}
					rows={agentRows}
					type="agent"
					onEdit={onEditAgent}
					onDelete={onDeleteAgent}
				/>
			) : (
				<EmptyState
					title="Agent configurations"
					description="Create your first AI agent configuration with custom prompts and settings."
					icon={DataTableIcon}
					onAddClick={onAddClick}
				/>
			)}
		</>
	);
}
