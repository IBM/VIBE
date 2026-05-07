import React from 'react';
import {
	Dropdown,
	DatePicker,
	DatePickerInput,
	Tag,
	Accordion,
	AccordionItem,
	Checkbox,
	NumberInput,
	ContentSwitcher,
	Switch,
	Search,
	Column,
	Grid,
	Button
} from '@carbon/react';
import type { Conversation } from '../../../lib/api';
import styles from '../AgentAnalytics.module.scss';

export type DateRangeFilter = 'all' | '7d' | '30d' | '90d' | 'custom';
export type ViewMode = 'time' | 'experiments';

export interface FilterState {
	dateRange: DateRangeFilter;
	startDate?: Date;
	endDate?: Date;
	conversationIds: number[];
	viewMode: ViewMode;
	experimentCount: number;
}

const dateRangeItems = [
	{ id: 'all', text: 'All time' },
	{ id: '7d', text: 'Last 7 days' },
	{ id: '30d', text: 'Last 30 days' },
	{ id: '90d', text: 'Last 90 days' },
	{ id: 'custom', text: 'Custom range' }
];

interface AnalyticsFiltersProps {
	filterState: FilterState;
	onFilterChange: (updates: Partial<FilterState>) => void;
	availableConversations: Conversation[];
	conversationSearch: string;
	onConversationSearchChange: (search: string) => void;
}

export default function AnalyticsFilters({
	filterState,
	onFilterChange,
	availableConversations,
	conversationSearch,
	onConversationSearchChange
}: AnalyticsFiltersProps) {
	const selectedDateRangeItem = dateRangeItems.find((item) => item.id === filterState.dateRange) || dateRangeItems[0];
	const hasConversationFilters = filterState.conversationIds.length > 0;

	const filteredConversations = React.useMemo(() => {
		if (!conversationSearch.trim()) return availableConversations;
		const search = conversationSearch.toLowerCase();
		return availableConversations.filter(
			(c) => c.name.toLowerCase().includes(search) || c.id?.toString().includes(search)
		);
	}, [availableConversations, conversationSearch]);

	const handleConversationToggle = (convId: number) => {
		const isSelected = filterState.conversationIds.includes(convId);
		onFilterChange({
			conversationIds: isSelected
				? filterState.conversationIds.filter((id) => id !== convId)
				: [...filterState.conversationIds, convId]
		});
	};

	const clearConversationFilters = () => {
		onFilterChange({ conversationIds: [] });
	};

	return (
		<div className={styles.controlsSection}>
			<Grid condensed>
				<Column sm={4} md={8} lg={16}>
					<div className={styles.filtersRow}>
						<div className={styles.viewModeGroup}>
							<label className={styles.viewModeLabel}>View by</label>
							<ContentSwitcher
								selectedIndex={filterState.viewMode === 'time' ? 0 : 1}
								onChange={(data) => {
									const newMode: ViewMode = data.index === 0 ? 'time' : 'experiments';
									onFilterChange({ viewMode: newMode });
								}}
								size="md"
								className={styles.viewModeSwitcher}
							>
								<Switch name="time" text="Time" />
								<Switch name="experiments" text="Experiments" />
							</ContentSwitcher>
						</div>

						{filterState.viewMode === 'time' && (
							<Dropdown
								id="date-range-filter"
								titleText="Date range"
								label={selectedDateRangeItem.text}
								items={dateRangeItems}
								itemToString={(item) => item?.text || ''}
								selectedItem={selectedDateRangeItem}
								onChange={({ selectedItem }) => {
									if (selectedItem) {
										onFilterChange({ dateRange: selectedItem.id as DateRangeFilter });
									}
								}}
								size="md"
							/>
						)}

						{filterState.viewMode === 'experiments' && (
							<div className={styles.experimentCountWrapper}>
								<NumberInput
									id="experiment-count"
									label="Number of experiments"
									min={5}
									max={100}
									value={filterState.experimentCount}
									onChange={(_event, state) => {
										const value =
											typeof state.value === 'number'
												? state.value
												: parseInt(String(state.value)) || 20;
										onFilterChange({ experimentCount: Math.min(100, Math.max(5, value)) });
									}}
									size="md"
								/>
							</div>
						)}

						{filterState.dateRange === 'custom' && (
							<>
								<DatePicker
									datePickerType="single"
									value={filterState.startDate}
									onChange={(dates) => {
										if (dates[0]) {
											onFilterChange({ startDate: dates[0] });
										}
									}}
								>
									<DatePickerInput
										id="start-date"
										placeholder="mm/dd/yyyy"
										labelText="Start date"
										size="md"
									/>
								</DatePicker>
								<DatePicker
									datePickerType="single"
									value={filterState.endDate}
									onChange={(dates) => {
										if (dates[0]) {
											onFilterChange({ endDate: dates[0] });
										}
									}}
								>
									<DatePickerInput
										id="end-date"
										placeholder="mm/dd/yyyy"
										labelText="End date"
										size="md"
									/>
								</DatePicker>
							</>
						)}
					</div>
				</Column>
			</Grid>

			{availableConversations.length > 0 && (
				<Accordion className={styles.conversationAccordion} align="start">
					<AccordionItem
						title={
							<div className={styles.accordionTitle}>
								<span>Filter by conversation</span>
								{hasConversationFilters && (
									<Tag type="blue" size="sm">
										{filterState.conversationIds.length} selected
									</Tag>
								)}
							</div>
						}
					>
						<div className={styles.conversationFilters}>
							<div className={styles.conversationFilterHeader}>
								{availableConversations.length > 5 && (
									<Search
										id="conversation-search"
										placeholder="Search by name or #ID..."
										labelText="Search conversations"
										closeButtonLabelText="Clear search"
										size="sm"
										value={conversationSearch}
										onChange={(e) => onConversationSearchChange(e.target.value)}
									/>
								)}
								{hasConversationFilters && (
									<Button kind="ghost" size="sm" onClick={clearConversationFilters}>
										Clear all
									</Button>
								)}
							</div>
							<div className={styles.conversationList}>
								{filteredConversations.length > 0 ? (
									filteredConversations.map((conv) => (
										<Checkbox
											key={conv.id}
											id={`conv-${conv.id}`}
											labelText={
												<span className={styles.conversationLabel}>
													<span className={styles.conversationName}>{conv.name}</span>
													<span className={styles.conversationId}>#{conv.id}</span>
												</span>
											}
											checked={filterState.conversationIds.includes(conv.id!)}
											onChange={() => handleConversationToggle(conv.id!)}
										/>
									))
								) : (
									<p className={styles.noResults}>No conversations match your search</p>
								)}
							</div>
							<div className={styles.conversationCount}>
								{filteredConversations.length} of {availableConversations.length} conversations
							</div>
						</div>
					</AccordionItem>
				</Accordion>
			)}

			{hasConversationFilters && (
				<div className={styles.selectedConversations}>
					{filterState.conversationIds.map((convId) => {
						const conv = availableConversations.find((c) => c.id === convId);
						return conv ? (
							<Tag
								key={convId}
								type="blue"
								size="md"
								filter
								onClose={() => handleConversationToggle(convId)}
							>
								{conv.name}
							</Tag>
						) : null;
					})}
				</div>
			)}
		</div>
	);
}
