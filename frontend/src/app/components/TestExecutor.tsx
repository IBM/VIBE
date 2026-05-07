'use client';

import { useState, useEffect } from 'react';
import { Form, Select, SelectItem, Button, InlineLoading, Tile } from '@carbon/react';
import { PlayFilled } from '@carbon/icons-react';
import { api } from '@/lib/api';
import { useAgents, useTests } from '@/lib/AppDataContext';
import styles from './TestExecutor.module.scss';

interface TestExecutorProps {
	onJobCreated: () => void;
}

export default function TestExecutor({ onJobCreated }: TestExecutorProps) {
	// Get data from context
	const { agents, fetchAgents } = useAgents();
	const { tests, fetchTests } = useTests();

	const [selectedAgentId, setSelectedAgentId] = useState<number | undefined>();
	const [selectedTestId, setSelectedTestId] = useState<number | undefined>();
	const [isSubmitting, setIsSubmitting] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [successMessage, setSuccessMessage] = useState<string | null>(null);

	useEffect(() => {
		if (agents.length === 0) {
			fetchAgents();
		}
		if (tests.length === 0) {
			fetchTests();
		}
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, []);

	const handleAgentChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
		setSelectedAgentId(Number(event.target.value));
		// Clear previous messages when selection changes
		setError(null);
		setSuccessMessage(null);
	};

	const handleTestChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
		setSelectedTestId(Number(event.target.value));
		// Clear previous messages when selection changes
		setError(null);
		setSuccessMessage(null);
	};

	const createTestJob = async () => {
		if (!selectedAgentId || !selectedTestId) {
			setError('Please select both an agent and a test');
			return;
		}

		setIsSubmitting(true);
		setError(null);
		setSuccessMessage(null);

		try {
			const job = await api.createJob(selectedAgentId, selectedTestId);
			setSuccessMessage(`Job #${job.id} created successfully and is now queued for execution`);
			onJobCreated(); // Notify parent component about the job creation
		} catch (error) {
			setError(error instanceof Error ? error.message : 'Failed to create job');
		} finally {
			setIsSubmitting(false);
		}
	};

	return (
		<div>
			<Form>
				<div className={styles.fieldGroup}>
					<Select
						id="agent-select"
						labelText="Select Agent"
						helperText="Choose an agent to execute the test"
						value={selectedAgentId || ''}
						onChange={handleAgentChange}
					>
						<SelectItem value="" text="Choose an agent" disabled />
						{agents.map((agent) => (
							<SelectItem key={agent.id} value={agent.id} text={`${agent.name} (v${agent.version})`} />
						))}
					</Select>
				</div>

				<div className={styles.fieldGroup}>
					<Select
						id="test-select"
						labelText="Select Test"
						helperText="Choose a test to execute"
						value={selectedTestId || ''}
						onChange={handleTestChange}
					>
						<SelectItem value="" text="Choose a test" disabled />
						{tests.map((test) => (
							<SelectItem key={test.id} value={test.id} text={test.name} />
						))}
					</Select>
				</div>

				<Button
					kind="primary"
					onClick={createTestJob}
					disabled={isSubmitting || !selectedAgentId || !selectedTestId}
					renderIcon={PlayFilled}
				>
					{isSubmitting ? <InlineLoading description="Creating job..." /> : 'Run Test'}
				</Button>
			</Form>

			{error && <Tile className={styles.errorTile}>{error}</Tile>}

			{successMessage && <Tile className={styles.successTile}>{successMessage}</Tile>}
		</div>
	);
}
