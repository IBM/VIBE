import { Modal, Stack, CodeSnippet, Tag, Button, InlineNotification } from '@carbon/react';
import { Restart, Edit } from '@carbon/icons-react';
import { TestResult, api, Test } from '@/lib/api';
import { useState, useEffect } from 'react';
import SimilarityScoreDisplay from './SimilarityScoreDisplay';
import TestFormModal from './TestFormModal';
import { useTests } from '@/lib/AppDataContext';
import { formatTokenUsageDetailed } from '@/lib/utils';
import './ResultViewModal.scss';

interface ResultViewModalProps {
	isOpen: boolean;
	result: TestResult | null;
	error: string | null;
	onClose: () => void;
}

export default function ResultViewModal({ isOpen, result, error, onClose }: ResultViewModalProps) {
	const [rescoring, setRescoring] = useState(false);
	const [rescoreError, setRescoreError] = useState<string | null>(null);
	const [rescoreSuccess, setRescoreSuccess] = useState(false);
	const [isEditTestModalOpen, setIsEditTestModalOpen] = useState(false);
	const [testData, setTestData] = useState<Test | null>(null);
	const [loadingTest, setLoadingTest] = useState(false);
	const [testError, setTestError] = useState<string | null>(null);
	const { fetchTests } = useTests();

	// Fetch test data when result changes
	useEffect(() => {
		const fetchTestData = async () => {
			if (!result?.test_id) {
				setTestData(null);
				return;
			}

			setLoadingTest(true);
			setTestError(null);
			try {
				const test = await api.getTestById(result.test_id);
				setTestData(test);
			} catch (err) {
				setTestError(err instanceof Error ? err.message : 'Failed to load test data');
			} finally {
				setLoadingTest(false);
			}
		};

		if (isOpen && result?.test_id) {
			fetchTestData();
		}
	}, [isOpen, result?.test_id]);

	const handleRescore = async () => {
		if (!result?.id) return;

		setRescoring(true);
		setRescoreError(null);
		setRescoreSuccess(false);

		try {
			// Regenerate score for the assistant message within this session (legacy result id == session id)
			// Fetch the transcript, then trigger per-message rescoring for assistant messages
			const transcript = await api.getSessionTranscriptWithSession(result.id);
			const assistantMessages = (transcript.messages || []).filter((m) => m.role === 'assistant' && m.id);
			for (const m of assistantMessages) {
				await api.regenerateSimilarityScore(m.id!);
			}
			setRescoreSuccess(true);

			setTimeout(() => setRescoreSuccess(false), 3000);
		} catch (err) {
			setRescoreError(err instanceof Error ? err.message : 'Failed to initiate scoring');
		} finally {
			setRescoring(false);
		}
	};

	const handleEditTest = () => {
		if (!testData || loadingTest) return;
		setIsEditTestModalOpen(true);
	};

	const handleEditTestSuccess = () => {
		setIsEditTestModalOpen(false);
		// Refresh the test data after successful edit
		if (result?.test_id) {
			api.getTestById(result.test_id)
				.then(setTestData)
				.catch(() => setTestError('Failed to load test data'));
		}
		// Refresh the tests in the context for other components
		fetchTests();
	};

	// Prepare initial form data for TestFormModal
	const initialFormData: Record<string, string> = testData
		? {
				'test-name': testData.name || '',
				'test-description': testData.description || '',
				'test-input': testData.input || '',
				'test-expected-output': testData.expected_output || ''
			}
		: {};

	const canScore = result && result.similarity_scoring_status !== undefined;

	return (
		<>
			<Modal
				open={isOpen}
				modalHeading="Test Result Details"
				primaryButtonText="Close"
				onRequestClose={onClose}
				onRequestSubmit={onClose}
				size="lg"
				className="result-view-modal"
			>
				<Stack gap={5}>
					{error && <div className="error-message">{error}</div>}

					{rescoreSuccess && (
						<InlineNotification
							kind="success"
							title="Scoring initiated"
							subtitle="The similarity score will be updated shortly."
							hideCloseButton
						/>
					)}

					{rescoreError && (
						<InlineNotification
							kind="error"
							title="Failed to initiate scoring"
							subtitle={rescoreError}
							hideCloseButton
						/>
					)}

					{testError && (
						<InlineNotification
							kind="error"
							title="Failed to load test data"
							subtitle={testError}
							hideCloseButton
						/>
					)}

					{result && (
						<>
							{/* Edit Test Button */}
							<div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
								<Button
									kind="tertiary"
									size="sm"
									renderIcon={Edit}
									onClick={handleEditTest}
									disabled={loadingTest || !testData}
								>
									{loadingTest ? 'Loading...' : 'Edit Test'}
								</Button>
							</div>

							<div>
								<h4 className="section-heading">Output</h4>
								<CodeSnippet type="multi" feedback="Copied to clipboard" wrapText>
									{result.output}
								</CodeSnippet>
							</div>
							{result.intermediate_steps && (
								<div>
									<h4 className="section-heading section-heading--with-top-margin">
										Intermediate steps
									</h4>
									<CodeSnippet
										type="multi"
										feedback="Copied to clipboard"
										wrapText
										maxCollapsedNumberOfRows={20}
									>
										{result.intermediate_steps}
									</CodeSnippet>
								</div>
							)}
							<div className="metadata-section">
								<div className="metadata-item">
									<strong>Success:</strong>{' '}
									<Tag type={result.success ? 'green' : 'red'}>
										{result.success ? 'Success' : 'Failed'}
									</Tag>
								</div>
								{result.execution_time && (
									<div className="metadata-item">
										<strong>Execution Time:</strong>{' '}
										<span className="execution-time">{result.execution_time.toFixed(3)}s</span>
									</div>
								)}
								{/* Token usage section */}
								{formatTokenUsageDetailed(result) && (
									<div className="metadata-item">
										<strong>Token usage:</strong>{' '}
										<span className="token-details">{formatTokenUsageDetailed(result)}</span>
									</div>
								)}
							</div>

							{/* Similarity score section */}
							{canScore && (
								<div className="similarity-score-section">
									<div className="similarity-score-header">
										<h4>Similarity score</h4>
										<Button
											kind="ghost"
											size="sm"
											renderIcon={Restart}
											onClick={handleRescore}
											disabled={rescoring}
										>
											{rescoring ? 'Scoring...' : 'Re-score'}
										</Button>
									</div>
									<SimilarityScoreDisplay result={result} size="md" />
									{result.similarity_scoring_error && (
										<div className="similarity-error">
											<strong>Error:</strong> {result.similarity_scoring_error}
										</div>
									)}
								</div>
							)}
						</>
					)}
				</Stack>
			</Modal>

			{/* Edit Test Modal */}
			<TestFormModal
				isOpen={isEditTestModalOpen}
				editingId={testData?.id || null}
				initialData={initialFormData}
				onClose={() => setIsEditTestModalOpen(false)}
				onSuccess={handleEditTestSuccess}
			/>
		</>
	);
}
