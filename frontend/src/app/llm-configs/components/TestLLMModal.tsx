import { useState } from 'react';
import { Modal, TextArea, Loading, InlineNotification, FormLabel } from '@carbon/react';
import { useLLMConfigs } from '../../../lib/AppDataContext';
import type { LLMRequestOptions, LLMResponse } from '@ibm-vibe/types';
import styles from '../page.module.scss';

interface TestLLMModalProps {
	isOpen: boolean;
	configId: number;
	onClose: () => void;
}

export default function TestLLMModal({ isOpen, configId, onClose }: TestLLMModalProps) {
	const { callLLM } = useLLMConfigs();
	const [prompt, setPrompt] = useState('');
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState('');
	const [response, setResponse] = useState<LLMResponse | null>(null);

	return (
		<Modal
			open={isOpen}
			modalHeading="Test LLM Configuration"
			primaryButtonText="Run Test"
			secondaryButtonText="Close"
			onRequestSubmit={async () => {
				if (!prompt.trim()) return;
				setLoading(true);
				setError('');
				setResponse(null);
				try {
					const options: LLMRequestOptions = { prompt, temperature: 0.7, max_tokens: 1000 };
					const res = await callLLM(configId, options);
					setResponse(res);
				} catch (err) {
					setError(err instanceof Error ? err.message : 'Error calling LLM');
				} finally {
					setLoading(false);
				}
			}}
			onRequestClose={() => {
				setPrompt('');
				setError('');
				setResponse(null);
				setLoading(false);
				onClose();
			}}
			size="lg"
		>
			<div className={styles.testModalContent}>
				<TextArea
					labelText="Prompt"
					id="test-prompt"
					value={prompt}
					onChange={(e) => setPrompt(e.target.value)}
					rows={4}
					placeholder="Enter your prompt here..."
				/>

				{loading && <Loading description="Calling LLM..." withOverlay={false} small />}

				{error && (
					<InlineNotification kind="error" title="Error" subtitle={error} className={styles.notification} />
				)}

				{response && (
					<div className={styles.responseBox}>
						<FormLabel>Response:</FormLabel>
						<pre className={styles.responseText}>{response.text}</pre>
						<div className={styles.metaInfo}>
							<small>Provider: {response.provider}</small>
							<small>Model: {response.model}</small>
						</div>
					</div>
				)}
			</div>
		</Modal>
	);
}
