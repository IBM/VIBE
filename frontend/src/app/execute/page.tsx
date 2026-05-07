'use client';

import ConversationExecutor from '../components/ConversationExecutor';

export default function QuickExecutePage() {
	return (
		<div style={{ padding: '2rem' }}>
			<h1>Quick execute</h1>
			<p style={{ marginBottom: '2rem', color: 'var(--cds-text-secondary)' }}>
				Execute conversations with agents quickly. This is the conversation-based replacement for the legacy
				&quot;Run test&quot; functionality.
			</p>
			<ConversationExecutor />
		</div>
	);
}
