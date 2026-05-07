'use client';

import { Accordion, AccordionItem, UnorderedList, ListItem } from '@carbon/react';

/**
 * Info panel explaining how templates and capabilities work.
 * Can be included in AgentFormModal and ConversationFormModal.
 */
export function TemplateInfoPanel() {
	return (
		<Accordion>
			<AccordionItem title="How do templates work?">
				<div style={{ padding: '1rem 0' }}>
					<p style={{ marginBottom: '1rem' }}>Templates define how VIBE talks to AI services:</p>

					<UnorderedList style={{ marginBottom: '1rem' }}>
						<ListItem>
							<strong>Request templates</strong> format your messages into API-compatible JSON
						</ListItem>
						<ListItem>
							<strong>Response maps</strong> extract the AI&apos;s reply from the API response
						</ListItem>
						<ListItem>
							<strong>Capabilities</strong> are tags that match templates to conversations. If a
							conversation requires &quot;openai-chat&quot;, only agents with that capability can run it.
						</ListItem>
					</UnorderedList>

					<p style={{ marginBottom: '1rem', fontStyle: 'italic' }}>
						Templates are shared - create once, use in many agents!
					</p>

					<h6 style={{ marginTop: '1.5rem', marginBottom: '0.5rem' }}>Request template placeholders</h6>
					<UnorderedList>
						<ListItem>
							<code>{'{{input}}'}</code> - the user&apos;s message for this turn
						</ListItem>
						<ListItem>
							<code>{'{{conversation_history}}'}</code> - full chat history so far
						</ListItem>
					</UnorderedList>

					<h6 style={{ marginTop: '1.5rem', marginBottom: '0.5rem' }}>Response map spec</h6>
					<p>Use dot notation to extract data from API responses:</p>
					<pre
						style={{
							background: '#f4f4f4',
							padding: '0.75rem',
							borderRadius: '4px',
							fontSize: '12px',
							marginTop: '0.5rem'
						}}
					>
						{`{
  "output": "choices.0.message.content"
}`}
					</pre>
				</div>
			</AccordionItem>
		</Accordion>
	);
}

/**
 * Compact version for conversations - focuses on capability matching.
 */
export function CapabilityInfoPanel() {
	return (
		<Accordion>
			<AccordionItem title="How do capability requirements work?">
				<div style={{ padding: '1rem 0' }}>
					<p style={{ marginBottom: '1rem' }}>
						Capability requirements ensure your conversation runs correctly:
					</p>

					<UnorderedList style={{ marginBottom: '1rem' }}>
						<ListItem>
							When you set a <strong>required capability</strong>, the conversation will only execute on
							agents that have templates with matching capabilities.
						</ListItem>
						<ListItem>
							This ensures the API request format matches what your target AI service expects.
						</ListItem>
						<ListItem>Leave empty to allow any agent to run this conversation.</ListItem>
					</UnorderedList>

					<h6 style={{ marginTop: '1rem', marginBottom: '0.5rem' }}>Example capabilities</h6>
					<UnorderedList>
						<ListItem>
							<code>openai-chat</code> - OpenAI ChatGPT format
						</ListItem>
						<ListItem>
							<code>ollama-generate</code> - Ollama format
						</ListItem>
						<ListItem>
							<code>anthropic-messages</code> - Claude format
						</ListItem>
					</UnorderedList>
				</div>
			</AccordionItem>
		</Accordion>
	);
}
