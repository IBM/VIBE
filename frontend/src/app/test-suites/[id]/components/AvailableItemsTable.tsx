import {
	IconButton,
	Select,
	SelectItem,
	Table,
	TableBody,
	TableCell,
	TableContainer,
	TableHead,
	TableHeader,
	TableRow
} from '@carbon/react';
import { ArrowRight } from '@carbon/icons-react';
import styles from '../../TestSuites.module.scss';

export interface AvailableSuiteItem {
	id: number;
	name: string;
	type: 'test' | 'suite';
	description?: string;
}

interface AgentSelectOption {
	id: string;
	label: string;
}

interface AvailableItemsTableProps {
	items: AvailableSuiteItem[];
	activeTab: number;
	availableItemAgents: Record<string, number | null>;
	agentSelectOptions: AgentSelectOption[];
	onAgentChange: (itemKey: string, agentId: number | null) => void;
	onAddEntry: (item: AvailableSuiteItem) => void;
}

export function AvailableItemsTable({
	items,
	activeTab,
	availableItemAgents,
	agentSelectOptions,
	onAgentChange,
	onAddEntry
}: AvailableItemsTableProps) {
	return (
		<div className={styles.scrollableTable}>
			<TableContainer>
				<Table size="sm">
					<TableHead>
						<TableRow>
							<TableHeader>Name</TableHeader>
							<TableHeader>Agent override</TableHeader>
							<TableHeader>Actions</TableHeader>
						</TableRow>
					</TableHead>
					<TableBody>
						{items.map((item) => {
							const itemKey = `${item.type}-${item.id}`;
							return (
								<TableRow key={itemKey}>
									<TableCell>
										<div>
											<div className={styles.entryName}>{item.name}</div>
											{item.description && (
												<div className={styles.itemDescription}>{item.description}</div>
											)}
										</div>
									</TableCell>
									<TableCell>
										<Select
											id={`agent-${itemKey}`}
											labelText=""
											size="sm"
											className={styles.agentOverrideSelect}
											value={
												availableItemAgents[itemKey]
													? String(availableItemAgents[itemKey])
													: 'default'
											}
											onChange={(e) => {
												const value =
													e.target.value === 'default' ? null : parseInt(e.target.value, 10);
												onAgentChange(itemKey, value);
											}}
										>
											{agentSelectOptions.map((option) => (
												<SelectItem key={option.id} value={option.id} text={option.label} />
											))}
										</Select>
									</TableCell>
									<TableCell>
										<IconButton
											kind="ghost"
											size="sm"
											onClick={() => onAddEntry(item)}
											label="Add to suite"
											align="left"
										>
											<ArrowRight size={16} />
										</IconButton>
									</TableCell>
								</TableRow>
							);
						})}
					</TableBody>
				</Table>
			</TableContainer>
			{items.length === 0 && (
				<div className={styles.emptyState}>
					<p>No {activeTab === 0 ? 'tests' : 'suites'} available to add.</p>
				</div>
			)}
		</div>
	);
}
