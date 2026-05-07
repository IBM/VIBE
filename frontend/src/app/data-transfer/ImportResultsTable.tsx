'use client';

import type { ImportResultSummary } from '@ibm-vibe/types';
import styles from './page.module.scss';

type ImportResultsTableProps = {
	summary: ImportResultSummary;
};

export default function ImportResultsTable({ summary }: ImportResultsTableProps) {
	if (summary.items.length === 0) {
		return null;
	}

	return (
		<div className={styles.reviewTableContainer}>
			<table className={styles.reviewTable}>
				<caption className={styles.tableCaption}>Import results</caption>
				<thead>
					<tr>
						<th scope="col">Type</th>
						<th scope="col">Name</th>
						<th scope="col">Result</th>
						<th scope="col">Details</th>
					</tr>
				</thead>
				<tbody>
					{summary.items.map((item) => (
						<tr key={item.item_key}>
							<td>{item.entity_type}</td>
							<td>{item.entity_name}</td>
							<td>{item.action}</td>
							<td>{item.message || 'Completed'}</td>
						</tr>
					))}
				</tbody>
			</table>
		</div>
	);
}
