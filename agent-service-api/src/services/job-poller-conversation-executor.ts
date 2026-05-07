import axios from 'axios';
import {
	Agent,
	AgentSettings,
	Conversation,
	ConversationExecutionRequest,
	ConversationExecutionResponse,
	ConversationMessageDraft,
	Job,
	JobStatus
} from '@ibm-vibe/types';
import type { AgentConfig } from './conversation-script-resolver';

export interface ConversationJobExecutorContext {
	backendUrl: string;
	job: Job;
	agent: Agent;
	settings: AgentSettings;
	getAgentConfig: (agentId: number) => Promise<AgentConfig>;
	resolveConversationScript: (
		conversation: Conversation & { id: number; messages?: ConversationMessageDraft[] },
		agentConfig: AgentConfig
	) => ConversationExecutionRequest['conversation_script'];
	executeConversation: (request: ConversationExecutionRequest) => Promise<ConversationExecutionResponse>;
	saveSessionResults: (
		conversationId: number,
		agentId: number,
		startTime: string,
		completionTime: string,
		result: ConversationExecutionResponse
	) => Promise<number>;
	updateJobStatus: (
		jobId: string,
		status: JobStatus,
		progress: number,
		resultId?: number,
		error?: string,
		sessionId?: number
	) => Promise<void>;
	logError: (...args: unknown[]) => void;
	getErrorMessage: (error: unknown) => string;
}

export async function executeConversationJobWithApi(context: ConversationJobExecutorContext): Promise<void> {
	const {
		backendUrl,
		job,
		agent,
		settings,
		getAgentConfig,
		resolveConversationScript,
		executeConversation,
		saveSessionResults,
		updateJobStatus,
		logError,
		getErrorMessage
	} = context;

	try {
		const startTime = new Date().toISOString();

		const conversationResponse = await axios.get<
			Conversation & { id: number; messages?: ConversationMessageDraft[] }
		>(`${backendUrl}/api/conversations/${job.conversation_id}`);
		const conversation = conversationResponse.data;

		const agentConfig = await getAgentConfig(job.agent_id);
		const resolvedScript = resolveConversationScript(conversation, agentConfig);

		const executionRequest: ConversationExecutionRequest = {
			conversation_id: conversation.id!,
			conversation_script: resolvedScript,
			api_endpoint: settings.api_endpoint,
			http_method: settings.http_method,
			headers: settings.headers,
			api_key: settings.api_key,
			token_mapping: settings.token_mapping,
			stop_on_failure: Boolean(conversation.stop_on_failure)
		};

		await updateJobStatus(job.id, JobStatus.RUNNING, 30);

		const result = await executeConversation(executionRequest);

		await updateJobStatus(job.id, JobStatus.RUNNING, 80);

		const completionTime = new Date().toISOString();
		const sessionId = await saveSessionResults(conversation.id!, agent.id!, startTime, completionTime, result);

		await updateJobStatus(job.id, JobStatus.COMPLETED, 100, undefined, undefined, sessionId);
	} catch (error: unknown) {
		const errorMessage = getErrorMessage(error);
		logError(`Error executing conversation job ${job.id}:`, errorMessage);
		await updateJobStatus(job.id, JobStatus.FAILED, 0, undefined, errorMessage);
	}
}
