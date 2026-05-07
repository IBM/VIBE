import { render, screen, within } from '@testing-library/react';
import ImportReviewTable from '../ImportReviewTable';

const planItem = (item: any) => ({
	allowed_decisions:
		item.status === 'new'
			? ['skip', 'create_new']
			: item.status === 'conflict'
				? ['skip', 'overwrite', 'create_new']
				: ['skip'],
	selected_decision: item.status === 'new' ? 'create_new' : 'skip',
	executable: true,
	action: item.status === 'new' ? 'created' : 'skipped',
	...item
});

describe('ImportReviewTable', () => {
	it('shows allowed actions by analysis status', () => {
		render(
			<ImportReviewTable
				items={
					[
						planItem({
							item_key: 'agents:New',
							entity_type: 'agents',
							entity_name: 'New',
							status: 'new'
						}),
						planItem({
							item_key: 'agents:Conflict',
							entity_type: 'agents',
							entity_name: 'Conflict',
							status: 'conflict',
							existing_id: 4
						}),
						planItem({
							item_key: 'agents:Broken',
							entity_type: 'agents',
							entity_name: 'Broken',
							status: 'dependency_missing',
							issues: ['Missing request template dependency: missing-template']
						})
					] as any
				}
				resolutions={{}}
				onResolutionChange={() => undefined}
			/>
		);

		const newSelect = screen.getByLabelText('Resolution for agents New');
		expect(
			within(newSelect)
				.getAllByRole('option')
				.map((option) => option.getAttribute('value'))
		).toEqual(['skip', 'create_new']);

		const conflictSelect = screen.getByLabelText('Resolution for agents Conflict');
		expect(
			within(conflictSelect)
				.getAllByRole('option')
				.map((option) => option.getAttribute('value'))
		).toEqual(['skip', 'overwrite', 'create_new']);

		const dependencySelect = screen.getByLabelText('Resolution for agents Broken');
		expect(dependencySelect).toBeDisabled();
		expect(
			within(dependencySelect)
				.getAllByRole('option')
				.map((option) => option.getAttribute('value'))
		).toEqual(['skip']);
		expect(screen.getByText(/missing request template dependency: missing-template/i)).toBeInTheDocument();
	});

	it('honors per-item allowed decisions overrides', () => {
		render(
			<ImportReviewTable
				items={
					[
						planItem({
							item_key: 'conversations:duplicate',
							entity_type: 'conversations',
							entity_name: 'Duplicate flow [abc123]',
							status: 'conflict',
							existing_id: 4,
							allowed_decisions: ['skip', 'create_new']
						})
					] as any
				}
				resolutions={{}}
				onResolutionChange={() => undefined}
			/>
		);

		const select = screen.getByLabelText('Resolution for conversations Duplicate flow [abc123]');
		expect(
			within(select)
				.getAllByRole('option')
				.map((option) => option.getAttribute('value'))
		).toEqual(['skip', 'create_new']);
	});
});
