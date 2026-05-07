import { getAgentById, getConversationById, getConversationMessages } from '../db/queries';
import { isSingleTurnConversation } from '../adapters/legacy-adapter';
import { testIdToConversationId } from '../lib/legacyIdResolver';
import { jobQueue } from './job-queue';

export class LegacyExecutionError extends Error {
	statusCode: number;

	constructor(statusCode: number, message: string) {
		super(message);
		this.name = 'LegacyExecutionError';
		this.statusCode = statusCode;
	}
}

export interface LegacyExecutionJobResult {
	jobId: string;
	conversationId: number;
}

/**
 * Resolve a legacy test id to a conversation and enqueue execution.
 */
export const createLegacyTestExecutionJob = async (
	agentId: number,
	testId: number
): Promise<LegacyExecutionJobResult> => {
	const conversationId = testIdToConversationId(testId) ?? testId;

	const [agent, conversation] = await Promise.all([getAgentById(agentId), getConversationById(conversationId)]);

	if (!agent) {
		throw new LegacyExecutionError(404, 'Agent not found');
	}
	if (!conversation) {
		throw new LegacyExecutionError(404, 'Test not found');
	}

	const messages = await getConversationMessages(conversationId);
	if (!isSingleTurnConversation(conversation, messages)) {
		throw new LegacyExecutionError(400, 'Cannot execute multi-turn conversation as legacy test');
	}

	const jobId = await jobQueue.createConversationJob(agentId, conversationId);
	return { jobId, conversationId };
};
