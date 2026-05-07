import { Accordion, AccordionItem, CodeSnippet } from '@carbon/react';
import styles from './AgentFormModal.module.scss';

export function AgentFormHelpPanel() {
	return (
		<Accordion>
			<AccordionItem title="Need help?">
				<div className={styles.helpSection}>
					<h5 className={styles.sectionHeading}>Request template</h5>
					<p className={styles.helpText}>
						The request template formats your test input for the external API. It should be a valid JSON
						string with placeholders for where the conversation content should go.
					</p>
					<ul className={styles.helpList}>
						<li className={styles.listItem}>
							Must include <code>{'{{input}}'}</code> (required)
						</li>
						<li className={styles.listItem}>
							<code>{'{{input}}'}</code> = current user message for this turn
						</li>
						<li className={styles.listItem}>
							<code>{'{{conversation_history}}'}</code> = full transcript so far including roles
							(System/User/Assistant) and the current user message
						</li>
						<li className={styles.listItem}>
							If <code>{'{{conversation_history}}'}</code> is omitted, then <code>{'{{input}}'}</code>{' '}
							will contain the entire conversation so far (history-first mode)
						</li>
						<li className={styles.listItem}>
							If <code>{'{{conversation_history}}'}</code> is present, then <code>{'{{input}}'}</code>{' '}
							will contain only the current user message (dual-placeholder mode)
						</li>
					</ul>
					<h6 className={styles.exampleHeading}>History-first mode (no {'{{conversation_history}}'})</h6>
					<CodeSnippet type="multi" feedback="Copied to clipboard">
						{JSON.stringify(
							{
								model: 'gpt-4',
								messages: [
									{ role: 'user', content: '{{input}}' } // {{input}} will be the entire conversation so far
								]
							},
							null,
							2
						)}
					</CodeSnippet>

					<h6 className={styles.exampleHeading}>Dual-placeholder mode (explicit history + current turn)</h6>
					<CodeSnippet type="multi" feedback="Copied to clipboard">
						{JSON.stringify(
							{
								model: 'gpt-4',
								messages: [
									{ role: 'system', content: 'Follow instructions carefully.' },
									{ role: 'user', content: '{{input}}' },
									{ role: 'system', content: 'Conversation so far:\n{{conversation_history}}' }
								]
							},
							null,
							2
						)}
					</CodeSnippet>

					<h6 className={styles.exampleHeading}>Example for OpenAI:</h6>
					<CodeSnippet type="multi" feedback="Copied to clipboard">
						{JSON.stringify(
							{
								model: 'gpt-5',
								messages: [{ role: 'user', content: '{{input}}' }]
							},
							null,
							2
						)}
					</CodeSnippet>

					<h6 className={styles.exampleHeading}>Example for Anthropic/Claude:</h6>
					<CodeSnippet type="multi" feedback="Copied to clipboard">
						{JSON.stringify(
							{
								model: 'claude-sonnet-4.5',
								messages: [{ role: 'user', content: '{{input}}' }],
								max_tokens: 1024
							},
							null,
							2
						)}
					</CodeSnippet>

					<h6 className={styles.exampleHeading}>Example for Google Gemini:</h6>
					<CodeSnippet type="multi" feedback="Copied to clipboard">
						{JSON.stringify(
							{
								contents: [{ role: 'user', parts: [{ text: '{{input}}' }] }],
								generationConfig: {
									temperature: 0.7,
									maxOutputTokens: 1024
								}
							},
							null,
							2
						)}
					</CodeSnippet>

					<h6 className={styles.exampleHeading}>Example for Mistral AI:</h6>
					<CodeSnippet type="multi" feedback="Copied to clipboard">
						{JSON.stringify(
							{
								model: 'mistral-large-latest',
								messages: [{ role: 'user', content: '{{input}}' }],
								temperature: 0.7,
								max_tokens: 1000
							},
							null,
							2
						)}
					</CodeSnippet>

					<h6 className={styles.exampleHeading}>Example for Cohere:</h6>
					<CodeSnippet type="multi" feedback="Copied to clipboard">
						{JSON.stringify(
							{
								message: '{{input}}',
								model: 'command',
								temperature: 0.7,
								max_tokens: 1000
							},
							null,
							2
						)}
					</CodeSnippet>

					<h6 className={styles.exampleHeading}>Example for Ollama:</h6>
					<CodeSnippet type="multi" feedback="Copied to clipboard">
						{JSON.stringify(
							{
								model: 'llama3',
								prompt: '{{input}}',
								options: {
									temperature: 0.7,
									num_predict: 1000
								}
							},
							null,
							2
						)}
					</CodeSnippet>

					<h5 className={styles.subSectionHeading}>Response mapping</h5>
					<p className={styles.helpText}>
						Response mapping is required when using External API Agent type. It tells the system how to
						extract information from the API response.
					</p>
					<ul className={styles.helpList}>
						<li className={styles.listItem}>
							The <strong>&quot;output&quot;</strong> field is mandatory and should point to where the
							main content is in the response
						</li>
						<li className={styles.listItem}>
							Use dot notation to access nested properties (e.g., &quot;choices.0.message.content&quot;)
						</li>
						<li className={styles.listItem}>
							You can include optional <strong>&quot;success_criteria&quot;</strong> to determine if the
							response was successful
						</li>
					</ul>
					<h6 className={styles.exampleHeading}>Example for OpenAI:</h6>
					<CodeSnippet type="multi" feedback="Copied to clipboard">
						{JSON.stringify({ output: 'choices.0.message.content' }, null, 2)}
					</CodeSnippet>
					<h6 className={styles.exampleHeading}>Example for Claude:</h6>
					<CodeSnippet type="multi" feedback="Copied to clipboard">
						{JSON.stringify({ output: 'content.0.text' }, null, 2)}
					</CodeSnippet>

					<h6 className={styles.exampleHeading}>Example for Google Gemini:</h6>
					<CodeSnippet type="multi" feedback="Copied to clipboard">
						{JSON.stringify({ output: 'candidates.0.content.parts.0.text' }, null, 2)}
					</CodeSnippet>

					<h6 className={styles.exampleHeading}>Example for Mistral AI:</h6>
					<CodeSnippet type="multi" feedback="Copied to clipboard">
						{JSON.stringify({ output: 'choices.0.message.content' }, null, 2)}
					</CodeSnippet>

					<h6 className={styles.exampleHeading}>Example for Cohere:</h6>
					<CodeSnippet type="multi" feedback="Copied to clipboard">
						{JSON.stringify({ output: 'text' }, null, 2)}
					</CodeSnippet>

					<h6 className={styles.exampleHeading}>Example for Ollama:</h6>
					<CodeSnippet type="multi" feedback="Copied to clipboard">
						{JSON.stringify({ output: 'response' }, null, 2)}
					</CodeSnippet>

					<h5 className={styles.subSectionHeading}>Token mapping</h5>
					<p className={styles.helpText}>
						Token mapping is <strong>optional</strong> for External API agents. If not provided, the system
						will automatically detect token usage for most popular platforms!
					</p>
					<ul className={styles.helpList}>
						<li className={styles.listItem}>
							<strong>Auto-detection works for:</strong> OpenAI, Anthropic/Claude, Google Gemini, Mistral
							AI, Cohere, Ollama, and LangChain
						</li>
						<li className={styles.listItem}>
							Only specify if using a custom API or if auto-detection fails
						</li>
						<li className={styles.listItem}>Use dot notation to access nested properties</li>
						<li className={styles.listItem}>
							Supports both separate input/output tokens and total tokens only
						</li>
					</ul>

					<h6 className={styles.exampleHeading}>Example for OpenAI (auto-detected):</h6>
					<CodeSnippet type="multi" feedback="Copied to clipboard">
						{JSON.stringify(
							{
								input_tokens: 'usage.prompt_tokens',
								output_tokens: 'usage.completion_tokens'
							},
							null,
							2
						)}
					</CodeSnippet>

					<h6 className={styles.exampleHeading}>Example for Anthropic/Claude (auto-detected):</h6>
					<CodeSnippet type="multi" feedback="Copied to clipboard">
						{JSON.stringify(
							{
								input_tokens: 'usage.input_tokens',
								output_tokens: 'usage.output_tokens'
							},
							null,
							2
						)}
					</CodeSnippet>

					<h6 className={styles.exampleHeading}>Example for Google Gemini (auto-detected):</h6>
					<CodeSnippet type="multi" feedback="Copied to clipboard">
						{JSON.stringify(
							{
								input_tokens: 'usageMetadata.promptTokenCount',
								output_tokens: 'usageMetadata.candidatesTokenCount'
							},
							null,
							2
						)}
					</CodeSnippet>

					<h6 className={styles.exampleHeading}>Example for Ollama (auto-detected):</h6>
					<CodeSnippet type="multi" feedback="Copied to clipboard">
						{JSON.stringify(
							{
								input_tokens: 'prompt_eval_count',
								output_tokens: 'eval_count'
							},
							null,
							2
						)}
					</CodeSnippet>

					<h6 className={styles.exampleHeading}>Example for custom API with total tokens only:</h6>
					<CodeSnippet type="multi" feedback="Copied to clipboard">
						{JSON.stringify(
							{
								total_tokens: 'metadata.tokens_used'
							},
							null,
							2
						)}
					</CodeSnippet>

					<h5 className={styles.subSectionHeading}>Headers</h5>
					<p className={styles.helpText}>Custom HTTP headers to send with the request to the API endpoint.</p>
					<ul className={styles.helpList}>
						<li className={styles.listItem}>Must be a valid JSON object with string values</li>
						<li className={styles.listItem}>
							Authentication headers will be automatically added if you provide an API Key
						</li>
					</ul>
					<h6 className={styles.exampleHeading}>Example:</h6>
					<CodeSnippet type="multi" feedback="Copied to clipboard">
						{JSON.stringify(
							{
								'Content-Type': 'application/json',
								'X-Custom-Header': 'custom-value'
							},
							null,
							2
						)}
					</CodeSnippet>
				</div>
			</AccordionItem>
		</Accordion>
	);
}
