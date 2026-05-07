'use client';

import React from 'react';
import { Tag } from '@carbon/react';
import type { ImportPlanItem, ImportResolution, ImportResolutionDecision } from '@ibm-vibe/types';
import { formatResolutionDecision, getDefaultResolutionDecision } from './resolutionOptions';
import styles from './page.module.scss';

type ImportReviewTableProps = {
	items: ImportPlanItem[];
	resolutions: Record<string, ImportResolution>;
	onResolutionChange: (itemKey: string, decision: ImportResolutionDecision) => void;
};

const getStatusTagType = (status: ImportPlanItem['status']): 'green' | 'red' | 'warm-gray' => {
	if (status === 'new') return 'green';
	if (status === 'conflict') return 'warm-gray';
	return 'red';
};

export default function ImportReviewTable({ items, resolutions, onResolutionChange }: ImportReviewTableProps) {
	if (items.length === 0) {
		return <p className={styles.helpText}>No items found in bundle.</p>;
	}

	return (
		<div className={styles.reviewTableContainer}>
			<table className={styles.reviewTable}>
				<caption className={styles.tableCaption}>Import review</caption>
				<thead>
					<tr>
						<th scope="col">Type</th>
						<th scope="col">Name</th>
						<th scope="col">Status</th>
						<th scope="col">Details</th>
						<th scope="col">Action</th>
					</tr>
				</thead>
				<tbody>
					{items.map((item) => {
						const allowedDecisions = item.allowed_decisions;
						const resolvedValue =
							resolutions[item.item_key]?.decision ||
							item.selected_decision ||
							getDefaultResolutionDecision(item.status);
						const value = allowedDecisions.includes(resolvedValue)
							? resolvedValue
							: getDefaultResolutionDecision(item.status);
						return (
							<tr key={item.item_key}>
								<td>{item.entity_type}</td>
								<td>{item.entity_name}</td>
								<td>
									<Tag type={getStatusTagType(item.status)} size="sm">
										{item.status.replace(/_/g, ' ')}
									</Tag>
								</td>
								<td>
									{item.issues && item.issues.length > 0
										? item.issues.join('; ')
										: item.existing_id
											? `Existing ID: ${item.existing_id}`
											: item.final_entity_name
												? `Will import as: ${item.final_entity_name}`
												: 'No issues detected'}
								</td>
								<td>
									<select
										aria-label={`Resolution for ${item.entity_type} ${item.entity_name}`}
										value={value}
										disabled={allowedDecisions.length === 1}
										onChange={(event) =>
											onResolutionChange(
												item.item_key,
												event.target.value as ImportResolutionDecision
											)
										}
									>
										{allowedDecisions.map((decision) => (
											<option key={decision} value={decision}>
												{formatResolutionDecision(decision)}
											</option>
										))}
									</select>
								</td>
							</tr>
						);
					})}
				</tbody>
			</table>
		</div>
	);
}
