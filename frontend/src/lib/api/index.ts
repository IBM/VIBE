import { agentsApi } from './agents';
import { conversationsApi } from './conversations';
import { dataTransferApi } from './data-transfer';
import { jobsApi } from './jobs';
import { llmApi } from './llm';
import { resultsApi } from './results';
import { sessionsApi } from './sessions';
import { statsApi } from './stats';
import { suitesApi } from './suites';
import { templatesApi } from './templates';
import { testsApi } from './tests';

export type {
	Agent,
	Test,
	TestResult,
	RequestTemplate,
	ResponseMap,
	AgentLinkedTemplate,
	AgentLinkedResponseMap,
	Conversation,
	ConversationMessage,
	ExecutionSession,
	SessionMessage,
	ConversationTurnTarget,
	LLMConfig,
	AgentRequestTemplate,
	AgentResponseMap,
	JobStatus,
	Job,
	TestSuite,
	SuiteRun,
	SuiteEntry,
	PaginatedResponse,
	StatsResponse,
	LLMRequestOptions,
	LLMResponse
} from './types';

export const api = {
	...statsApi,
	...templatesApi,
	...agentsApi,
	...testsApi,
	...resultsApi,
	...jobsApi,
	...suitesApi,
	...llmApi,
	...conversationsApi,
	...sessionsApi,
	...dataTransferApi
};
