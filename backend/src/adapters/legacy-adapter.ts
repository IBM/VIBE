/**
 * Legacy API Adapter
 *
 * Provides transformation functions between legacy API formats and the new
 * conversation-based data structures. This allows legacy endpoints to work with
 * the new table structure while maintaining API compatibility.
 */

import type {
	Test,
	TestResult,
	Conversation,
	ConversationMessage,
	ExecutionSession,
	SessionMessage
} from '@ibm-vibe/types';
import db from '../db/database';

export function conversationToLegacyTest(conversation: Conversation, messages?: ConversationMessage[]): Test {
	// Get the first user message as the test input
	const firstUserMessage = messages?.find((m) => m.role === 'user');
	// Derive expected_output from turn target 1 if present
	let expectedOutput: string | undefined = undefined;
	try {
		if (conversation.id) {
			const row = db
				.prepare(
					`
				SELECT target_reply FROM conversation_turn_targets
				WHERE conversation_id = ? AND user_sequence = 1
			`
				)
				.get(conversation.id) as { target_reply?: string } | undefined;
			expectedOutput = row?.target_reply;
		}
	} catch {}

	return {
		id: conversation.id,
		name: conversation.name,
		description: conversation.description,
		input: firstUserMessage?.content || '',
		expected_output: expectedOutput,
		created_at: conversation.created_at,
		updated_at: conversation.updated_at
	};
}

export function legacyTestToConversation(test: Omit<Test, 'id' | 'created_at' | 'updated_at'>): {
	conversation: Omit<Conversation, 'id' | 'created_at' | 'updated_at'>;
	messages: Omit<ConversationMessage, 'id' | 'conversation_id' | 'created_at'>[];
} {
	return {
		conversation: {
			name: test.name,
			description: test.description
		},
		messages: [
			{
				sequence: 1,
				role: 'user',
				content: test.input
			}
		]
	};
}

/**
 * Transform ExecutionSession + SessionMessages back to legacy TestResult format
 */
export function sessionToLegacyResult(session: ExecutionSession, sessionMessages?: SessionMessage[]): TestResult {
	// Find the assistant's response (output)
	const assistantMessage = sessionMessages?.find((m) => m.role === 'assistant');

	// Parse metadata from session for legacy fields
	let sessionMetadata: any = {};
	try {
		sessionMetadata = session.metadata ? JSON.parse(session.metadata) : {};
	} catch {
		// If metadata parsing fails, use empty object
	}

	// Extract intermediate steps from metadata
	const intermediateSteps = sessionMetadata.intermediate_steps || '';

	// Prefer per-turn similarity scoring stored on the assistant session_message
	const similarityFromAssistant =
		assistantMessage && typeof (assistantMessage as any).similarity_scoring_status === 'string'
			? {
					similarity_score: (assistantMessage as any).similarity_score as number | undefined,
					similarity_scoring_status: (assistantMessage as any).similarity_scoring_status as any,
					similarity_scoring_error: (assistantMessage as any).similarity_scoring_error as string | undefined,
					similarity_scoring_metadata: (assistantMessage as any).similarity_scoring_metadata as
						| string
						| undefined
				}
			: undefined;

	return {
		id: session.id,
		agent_id: session.agent_id,
		test_id: session.conversation_id!, // Map conversation_id to test_id for legacy compatibility
		output: assistantMessage?.content || '',
		intermediate_steps:
			typeof intermediateSteps === 'string' ? intermediateSteps : JSON.stringify(intermediateSteps),
		success: session.success ?? false,
		execution_time:
			session.started_at && session.completed_at
				? Math.round(new Date(session.completed_at).getTime() - new Date(session.started_at).getTime())
				: undefined,
		created_at: session.started_at,

		// Similarity: source of truth is per-turn assistant message only
		similarity_score: similarityFromAssistant?.similarity_score,
		similarity_scoring_status: similarityFromAssistant?.similarity_scoring_status,
		similarity_scoring_error: similarityFromAssistant?.similarity_scoring_error,
		similarity_scoring_metadata: similarityFromAssistant?.similarity_scoring_metadata,
		input_tokens: sessionMetadata.input_tokens,
		output_tokens: sessionMetadata.output_tokens,
		token_mapping_metadata: sessionMetadata.token_mapping_metadata
	};
}

/**
 * Transform legacy TestResult data to ExecutionSession + SessionMessages format
 */
export function legacyResultToSession(
	result: Omit<TestResult, 'id' | 'created_at'>,
	testInput: string
): {
	session: Omit<ExecutionSession, 'id' | 'started_at' | 'completed_at'>;
	messages: Omit<SessionMessage, 'id' | 'session_id' | 'timestamp'>[];
} {
	// Create metadata object from legacy result fields
	const metadata = {
		similarity_score: result.similarity_score,
		similarity_scoring_status: result.similarity_scoring_status,
		similarity_scoring_error: result.similarity_scoring_error,
		similarity_scoring_metadata: result.similarity_scoring_metadata,
		input_tokens: result.input_tokens,
		output_tokens: result.output_tokens,
		token_mapping_metadata: result.token_mapping_metadata,
		intermediate_steps: result.intermediate_steps
	};

	return {
		session: {
			conversation_id: result.test_id,
			agent_id: result.agent_id,
			status: 'completed',
			success: result.success,
			metadata: JSON.stringify(metadata)
		},
		messages: [
			{
				sequence: 1,
				role: 'user',
				content: testInput
			},
			{
				sequence: 2,
				role: 'assistant',
				content: result.output
			}
		]
	};
}

/**
 * Check if a conversation represents a single-turn "test" (legacy equivalent)
 */
export function isSingleTurnConversation(_conversation: Conversation, messages?: ConversationMessage[]): boolean {
	if (!messages) return false;

	// A single-turn conversation should have exactly one user message
	const userMessages = messages.filter((m) => m.role === 'user');

	// Allow 1 user message and optionally system messages
	// Note: ConversationMessage role is 'user' | 'system', assistant messages are in SessionMessage
	return userMessages.length === 1;
}

export function getLegacyTestId(conversation: Conversation): number {
	// In the adapter pattern, we use conversation.id as the legacy test_id
	return conversation.id!;
}

export function getLegacyResultId(session: ExecutionSession): number {
	// In the adapter pattern, we use session.id as the legacy result_id
	return session.id!;
}
