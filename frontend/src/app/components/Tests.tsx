import { Button, InlineLoading } from '@carbon/react';
import { Add, AiGenerate, TestTool } from '@carbon/icons-react';
import styles from '../page.module.scss';
import EmptyState from './EmptyState';
import TableRenderer from './TableRenderer';
import { useTests } from '@/lib/AppDataContext';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

interface TestsProps {
	onAddClick: () => void;
	onEditTest: (id: number) => void;
	onDeleteTest: (id: number) => void;
}

export default function Tests({ onAddClick, onEditTest, onDeleteTest }: TestsProps) {
	const router = useRouter();
	const { tests, isLoading, fetchTests } = useTests();

	useEffect(() => {
		fetchTests();
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, []);

	const testRows = tests.map((test) => ({
		id: test.id?.toString() || `test-${Date.now()}`,
		name: test.name,
		description: test.description || '',
		created_at: new Date(test.created_at!).toLocaleString()
	}));

	const testHeaders = [
		{ key: 'name', header: 'Name' },
		{ key: 'description', header: 'Description' },
		{ key: 'created_at', header: 'Created At' },
		{ key: 'actions', header: 'Actions' }
	];

	return (
		<>
			<div className={styles.panelHeader}>
				<h2>Tests</h2>
				{testRows.length > 0 && (
					<div style={{ display: 'flex', gap: '0.5rem' }}>
						<Button kind="secondary" renderIcon={AiGenerate} onClick={() => router.push('/tests/generate')}>
							Generate Tests
						</Button>
						<Button renderIcon={Add} onClick={onAddClick}>
							Add Test
						</Button>
					</div>
				)}
			</div>
			{isLoading ? (
				<InlineLoading description="Loading data..." />
			) : testRows.length > 0 ? (
				<TableRenderer
					headers={testHeaders}
					rows={testRows}
					type="test"
					onEdit={onEditTest}
					onDelete={onDeleteTest}
					onGenerate={(id) => {
						const test = tests.find((t) => t.id === id);
						if (test) {
							const params = new URLSearchParams({
								seed: test.input,
								description: test.description || '',
								expectedOutput: test.expected_output || ''
							});
							router.push(`/tests/generate?${params.toString()}`);
						}
					}}
				/>
			) : (
				<EmptyState
					title="Test Cases"
					description="Add your first test case with input data and expected outputs."
					icon={TestTool}
					onAddClick={onAddClick}
				/>
			)}
		</>
	);
}
