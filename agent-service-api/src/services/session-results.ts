import axios from 'axios';
import type { ConversationExecutionResponse } from '@ibm-vibe/types';

export const saveSessionResults = async (
	backendUrl: string,
	conversationId: number,
	agentId: number,
	startTime: string,
	completionTime: string,
	result: ConversationExecutionResponse
): Promise<number> => {
	const sessionResponse = await axios.post(`${backendUrl}/api/sessions`, {
		conversation_id: conversationId,
		agent_id: agentId,
		status: 'completed',
		started_at: startTime,
		completed_at: completionTime,
		success: result.success,
		variables: JSON.stringify(result.variables || {}),
		metadata: JSON.stringify({
			input_tokens: result.metrics?.input_tokens,
			output_tokens: result.metrics?.output_tokens,
			token_mapping_metadata: JSON.stringify({
				extraction_method:
					result.metrics?.input_tokens || result.metrics?.output_tokens ? 'external_api' : 'none',
				agent_type: 'external_api'
			}),
			intermediate_steps: JSON.stringify(result.intermediate_steps)
		})
	});

	const savedSession = sessionResponse.data;

	for (const message of result.transcript) {
		await axios.post(`${backendUrl}/api/session-messages`, {
			session_id: savedSession.id,
			sequence: message.sequence,
			role: message.role,
			content: message.content,
			timestamp: message.timestamp,
			metadata: JSON.stringify(message.metadata || {})
		});
	}

	return savedSession.id;
};
