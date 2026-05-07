import type { Conversation, ConversationMessage, ConversationTurnTarget, PaginatedResponse } from './types';
import { API_URL, fetchJson } from './fetchJson';

export const conversationsApi = {
	async getConversations(filters?: { limit?: number; offset?: number }): Promise<PaginatedResponse<Conversation>> {
		const params = new URLSearchParams();
		if (filters?.limit !== undefined) {
			params.append('limit', filters.limit.toString());
		}
		if (filters?.offset !== undefined) {
			params.append('offset', filters.offset.toString());
		}

		return fetchJson<PaginatedResponse<Conversation>>(
			`${API_URL}/api/conversations?${params}`,
			undefined,
			'Failed to fetch conversations'
		);
	},

	async getConversationById(id: number): Promise<Conversation> {
		return fetchJson<Conversation>(`${API_URL}/api/conversations/${id}`, undefined, 'Failed to fetch conversation');
	},

	async createConversation(
		conversation: Omit<Conversation, 'id' | 'created_at' | 'updated_at'>
	): Promise<Conversation> {
		return fetchJson<Conversation>(
			`${API_URL}/api/conversations`,
			{
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(conversation)
			},
			'Failed to create conversation'
		);
	},

	async updateConversation(id: number, conversation: Partial<Conversation>): Promise<Conversation> {
		return fetchJson<Conversation>(
			`${API_URL}/api/conversations/${id}`,
			{
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(conversation)
			},
			'Failed to update conversation'
		);
	},

	async deleteConversation(id: number): Promise<void> {
		await fetchJson<void>(
			`${API_URL}/api/conversations/${id}`,
			{ method: 'DELETE' },
			'Failed to delete conversation'
		);
	},

	async addMessageToConversation(
		conversationId: number,
		message: Omit<ConversationMessage, 'id' | 'conversation_id' | 'created_at'>
	): Promise<ConversationMessage> {
		return fetchJson<ConversationMessage>(
			`${API_URL}/api/conversations/${conversationId}/messages`,
			{
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(message)
			},
			'Failed to add message to conversation'
		);
	},

	async updateConversationMessage(
		conversationId: number,
		messageId: number,
		updates: Partial<ConversationMessage>
	): Promise<ConversationMessage> {
		return fetchJson<ConversationMessage>(
			`${API_URL}/api/conversations/${conversationId}/messages/${messageId}`,
			{
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(updates)
			},
			'Failed to update conversation message'
		);
	},

	async deleteConversationMessage(conversationId: number, sequence: number): Promise<void> {
		await fetchJson<void>(
			`${API_URL}/api/conversations/${conversationId}/messages/${sequence}`,
			{ method: 'DELETE' },
			'Failed to delete conversation message'
		);
	},

	async reorderConversationMessages(
		conversationId: number,
		messages: { id: number; sequence: number }[]
	): Promise<void> {
		await fetchJson<void>(
			`${API_URL}/api/conversations/${conversationId}/messages/reorder`,
			{
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ messages })
			},
			'Failed to reorder conversation messages'
		);
	},

	// Execute a conversation with a specific agent
	async executeConversation(agent_id: number, conversation_id: number): Promise<{ job_id: string; message: string }> {
		const response = await fetch(`${API_URL}/api/execute/conversation`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ agent_id, conversation_id })
		});
		if (!response.ok) {
			let errorPayload: unknown = null;
			try {
				errorPayload = await response.json();
			} catch {
				errorPayload = null;
			}
			const errorObj =
				errorPayload && typeof errorPayload === 'object' ? (errorPayload as Record<string, unknown>) : null;
			const rawDetails = errorObj?.details;
			const rawError = errorObj?.error;
			const details = Array.isArray(rawDetails)
				? rawDetails.filter((d): d is string => typeof d === 'string').join('\n')
				: typeof rawDetails === 'string'
					? rawDetails
					: '';
			const message = typeof rawError === 'string' && rawError ? rawError : 'Failed to execute conversation';
			throw new Error(details ? `${message}\n${details}` : message);
		}
		return response.json();
	},

	// Conversation turn targets
	async getConversationTurnTargets(conversationId: number): Promise<ConversationTurnTarget[]> {
		return fetchJson<ConversationTurnTarget[]>(
			`${API_URL}/api/conversation-turn-targets/conversation/${conversationId}`,
			undefined,
			'Failed to fetch turn targets'
		);
	},

	async saveConversationTurnTarget(
		target: Omit<ConversationTurnTarget, 'id' | 'created_at' | 'updated_at'>
	): Promise<ConversationTurnTarget> {
		return fetchJson<ConversationTurnTarget>(
			`${API_URL}/api/conversation-turn-targets`,
			{
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(target)
			},
			'Failed to save turn target'
		);
	},

	async deleteConversationTurnTarget(id: number): Promise<void> {
		await fetchJson<void>(
			`${API_URL}/api/conversation-turn-targets/${id}`,
			{ method: 'DELETE' },
			'Failed to delete turn target'
		);
	}
};
