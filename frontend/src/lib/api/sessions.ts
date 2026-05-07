import type { ExecutionSession, PaginatedResponse, SessionMessage } from './types';
import { API_URL, fetchJson } from './fetchJson';

export const sessionsApi = {
	// Execution sessions
	async getExecutionSessions(filters?: {
		conversation_id?: number;
		agent_id?: number;
		limit?: number;
		offset?: number;
	}): Promise<PaginatedResponse<ExecutionSession>> {
		const params = new URLSearchParams();
		if (filters?.conversation_id) {
			params.append('conversation_id', filters.conversation_id.toString());
		}
		if (filters?.agent_id) {
			params.append('agent_id', filters.agent_id.toString());
		}
		if (filters?.limit !== undefined) {
			params.append('limit', filters.limit.toString());
		}
		if (filters?.offset !== undefined) {
			params.append('offset', filters.offset.toString());
		}

		return fetchJson<PaginatedResponse<ExecutionSession>>(
			`${API_URL}/api/sessions?${params}`,
			undefined,
			'Failed to fetch execution sessions'
		);
	},

	async getExecutionSessionById(id: number): Promise<ExecutionSession> {
		return fetchJson<ExecutionSession>(
			`${API_URL}/api/sessions/${id}`,
			undefined,
			'Failed to fetch execution session'
		);
	},

	async getSessionTranscript(sessionId: number): Promise<SessionMessage[]> {
		const data = await fetchJson<{ session: ExecutionSession; messages: SessionMessage[] }>(
			`${API_URL}/api/sessions/${sessionId}/transcript`,
			undefined,
			'Failed to fetch session transcript'
		);
		return data.messages;
	},

	async getSessionTranscriptWithSession(
		sessionId: number
	): Promise<{ session: ExecutionSession; messages: SessionMessage[] }> {
		const data = await fetchJson<{ session: ExecutionSession; messages?: SessionMessage[] }>(
			`${API_URL}/api/sessions/${sessionId}/transcript`,
			undefined,
			'Failed to fetch session transcript'
		);
		return {
			session: data.session,
			messages: data.messages || []
		};
	},

	async regenerateSimilarityScore(messageId: number): Promise<void> {
		await fetchJson<void>(
			`${API_URL}/api/session-messages/${messageId}/regenerate-score`,
			{ method: 'POST' },
			'Failed to regenerate similarity score'
		);
	}
};
