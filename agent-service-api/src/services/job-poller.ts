import axios from 'axios';
import { apiService } from './api-service';
import {
	ConversationExecutionRequest,
	ConversationExecutionResponse,
	ConversationMessageDraft,
	Job,
	Agent,
	Conversation,
	AgentSettings,
	JobStatus
} from '@ibm-vibe/types';
import { BACKEND_CONFIG, POLLER_CONFIG } from '../config';
import { getErrorMessage, parseJson } from './job-poller-utils';
import {
	AgentConfig,
	ConversationScriptMessage,
	validateConversationRequirements,
	resolveConversationScript
} from './conversation-script-resolver';
import { saveSessionResults } from './session-results';
import { fetchAgentConfig } from './job-poller-agent-config';
import { executeConversationJobWithApi } from './job-poller-conversation-executor';
import { executeLegacyTestJobWithApi } from './job-poller-legacy-executor';

const shouldLog = process.env.NODE_ENV !== 'test';
const logWarn = (...args: unknown[]) => {
	/* istanbul ignore next */
	if (shouldLog) console.warn(...args);
};
const logError = (...args: unknown[]) => {
	/* istanbul ignore next */
	if (shouldLog) console.error(...args);
};

/**
 * Job Poller Service - Polls backend for jobs and executes them using ApiService
 */
export class JobPollerService {
	private backendUrl: string;
	private serviceId: string;
	private isPolling: boolean = false;
	private pollingInterval: NodeJS.Timeout | null = null;
	private isCurrentlyPolling: boolean = false;
	private baseIntervalMs: number;
	private maxIntervalMs: number;
	private backoffMultiplier: number;
	private maxConcurrentJobs: number;
	private consecutiveEmptyPolls: number = 0;
	private runningJobs: Set<string> = new Set();

	constructor(backendUrl: string = BACKEND_CONFIG.url, serviceId: string = 'agent-service-api') {
		this.backendUrl = backendUrl;
		this.serviceId = serviceId;
		this.baseIntervalMs = POLLER_CONFIG.baseIntervalMs;
		this.maxIntervalMs = POLLER_CONFIG.maxIntervalMs;
		this.backoffMultiplier = POLLER_CONFIG.backoffMultiplier;
		this.maxConcurrentJobs = POLLER_CONFIG.maxConcurrentJobs;
	}

	/**
	 * Start polling for jobs
	 */
	startPolling(intervalMs: number = this.baseIntervalMs): void {
		if (this.isPolling) {
			return;
		}

		this.isPolling = true;
		this.baseIntervalMs = intervalMs;
		this.consecutiveEmptyPolls = 0;

		void this.pollTick();
		// Seed the timer immediately so fake timers and long-running polls still get periodic ticks.
		this.scheduleNextPoll(this.baseIntervalMs);
	}

	/**
	 * Stop polling for jobs
	 */
	stopPolling(): void {
		if (this.pollingInterval) {
			clearTimeout(this.pollingInterval);
			this.pollingInterval = null;
		}
		this.isPolling = false;
	}

	private scheduleNextPoll(delayMs: number): void {
		if (!this.isPolling) {
			return;
		}

		if (this.pollingInterval) {
			clearTimeout(this.pollingInterval);
		}

		this.pollingInterval = setTimeout(() => {
			void this.pollTick();
		}, delayMs);
	}

	private getNextDelayMs(hasWork: boolean): number {
		// If we still have running jobs, keep polling at the base interval.
		if (hasWork || this.runningJobs.size > 0) {
			this.consecutiveEmptyPolls = 0;
			return this.baseIntervalMs;
		}

		this.consecutiveEmptyPolls += 1;
		// First empty poll keeps base interval, then exponentially back off.
		const exponent = Math.max(0, this.consecutiveEmptyPolls - 1);
		const delay = this.baseIntervalMs * this.backoffMultiplier ** exponent;
		return Math.min(delay, this.maxIntervalMs);
	}

	private async pollTick(): Promise<void> {
		if (!this.isPolling) {
			return;
		}

		if (this.isCurrentlyPolling) {
			this.scheduleNextPoll(this.baseIntervalMs);
			return;
		}

		const hasWorkRaw = await this.pollAndExecuteJobs();
		// If poll is mocked and returns undefined, default to base interval behavior.
		const hasWork = hasWorkRaw !== false;
		this.scheduleNextPoll(this.getNextDelayMs(hasWork));
	}

	/**
	 * Poll for available jobs and execute them
	 */
	private async pollAndExecuteJobs(): Promise<boolean> {
		if (this.isCurrentlyPolling) {
			return this.runningJobs.size > 0;
		}

		this.isCurrentlyPolling = true;

		try {
			// If we're already at capacity, don't poll the backend.
			if (this.runningJobs.size >= this.maxConcurrentJobs) {
				return true;
			}

			// Get available jobs for external API type
			const response = await axios.get<Job[]>(`${this.backendUrl}/api/jobs/available/external_api?limit=5`);
			const jobs: Job[] = response.data || [];

			if (jobs.length === 0) {
				return this.runningJobs.size > 0; // No jobs available
			}

			const availableSlots = Math.max(0, this.maxConcurrentJobs - this.runningJobs.size);
			const jobsToStart = jobs.filter((job) => !this.runningJobs.has(job.id)).slice(0, availableSlots);

			for (const job of jobsToStart) {
				void this.executeJob(job);
			}
			return true;
		} catch (error: unknown) {
			logError('Error polling for jobs:', getErrorMessage(error));
			return this.runningJobs.size > 0;
		} finally {
			this.isCurrentlyPolling = false;
		}
	}

	/**
	 * Execute a single job
	 */
	private async executeJob(job: Job): Promise<void> {
		if (this.runningJobs.has(job.id)) {
			return;
		}
		if (this.runningJobs.size >= this.maxConcurrentJobs) {
			return;
		}

		this.runningJobs.add(job.id);
		try {
			// Claim the job
			const claimResponse = await axios.post(`${this.backendUrl}/api/jobs/${job.id}/claim`, {
				service_id: this.serviceId
			});

			if (claimResponse.status !== 200) {
				return;
			}

			// Get agent details
			const agentResponse = await axios.get<Agent>(`${this.backendUrl}/api/agents/${job.agent_id}`);
			const agent: Agent = agentResponse.data;
			const settings = parseJson<AgentSettings>(agent.settings, {} as AgentSettings);
			const agentType = settings.type;

			if (agentType !== 'external_api') {
				const errorMsg = `Job ${job.id} is not for external API agent (type: ${agentType})`;
				logWarn(errorMsg);
				await this.updateJobStatus(job.id, JobStatus.FAILED, 0, undefined, errorMsg);
				return;
			}

			await this.updateJobStatus(job.id, JobStatus.RUNNING, 10);

			// Determine if this is a conversation or legacy test job
			if (job.conversation_id) {
				await this.executeConversationJob(job, agent, settings);
			} else if (job.test_id) {
				await this.executeLegacyTestJob(job, agent, settings);
			} else {
				const errorMsg = `Job ${job.id} has neither conversation_id nor test_id`;
				logError(errorMsg);
				await this.updateJobStatus(job.id, JobStatus.FAILED, 0, undefined, errorMsg);
			}
		} catch (error: unknown) {
			const errorMessage = getErrorMessage(error);
			logError(`Error executing job ${job.id}:`, errorMessage);
			await this.updateJobStatus(job.id, JobStatus.FAILED, 0, undefined, errorMessage);
		} finally {
			this.runningJobs.delete(job.id);
		}
	}

	private async getAgentConfig(agentId: number): Promise<AgentConfig> {
		return fetchAgentConfig(this.backendUrl, agentId);
	}

	/**
	 * Execute a conversation job
	 */
	private async executeConversationJob(job: Job, agent: Agent, settings: AgentSettings): Promise<void> {
		await executeConversationJobWithApi({
			backendUrl: this.backendUrl,
			job,
			agent,
			settings,
			getAgentConfig: (agentId: number) => this.getAgentConfig(agentId),
			resolveConversationScript: this.resolveConversationScript.bind(this),
			executeConversation: apiService.executeConversation.bind(apiService),
			saveSessionResults: this.saveSessionResults.bind(this),
			updateJobStatus: this.updateJobStatus.bind(this),
			logError,
			getErrorMessage
		});
	}

	private resolveConversationScript(
		conversation: Conversation & { id: number; messages?: ConversationMessageDraft[] },
		agentConfig: AgentConfig
	): ConversationExecutionRequest['conversation_script'] {
		return resolveConversationScript(conversation, agentConfig);
	}

	public validateConversationRequirements(
		conversation: Conversation,
		resolvedMessages: ConversationScriptMessage[]
	): void {
		validateConversationRequirements(conversation, resolvedMessages);
	}

	private async saveSessionResults(
		conversationId: number,
		agentId: number,
		startTime: string,
		completionTime: string,
		result: ConversationExecutionResponse
	): Promise<number> {
		return saveSessionResults(this.backendUrl, conversationId, agentId, startTime, completionTime, result);
	}

	/**
	 * Execute a legacy test job
	 */
	private async executeLegacyTestJob(job: Job, agent: Agent, settings: AgentSettings): Promise<void> {
		await executeLegacyTestJobWithApi({
			backendUrl: this.backendUrl,
			job,
			agent,
			settings,
			getAgentConfig: (agentId: number) => this.getAgentConfig(agentId),
			executeTest: apiService.executeTest.bind(apiService),
			updateJobStatus: this.updateJobStatus.bind(this),
			logWarn,
			logError,
			getErrorMessage
		});
	}

	/**
	 * Update job status in the backend
	 */
	private async updateJobStatus(
		jobId: string,
		status: JobStatus,
		progress: number,
		resultId?: number,
		error?: string,
		sessionId?: number
	): Promise<void> {
		try {
			const updateData: Pick<Job, 'status' | 'progress'> &
				Partial<Pick<Job, 'result_id' | 'session_id' | 'error'>> = {
				status,
				progress
			};

			if (resultId) {
				updateData.result_id = resultId;
			}

			if (sessionId) {
				updateData.session_id = sessionId;
			}

			if (error) {
				updateData.error = error;
			}

			await axios.put(`${this.backendUrl}/api/jobs/${jobId}`, updateData);
		} catch (error: unknown) {
			logError(`Error updating job ${jobId} status:`, getErrorMessage(error));
		}
	}

	/**
	 * Health check
	 */
	async healthCheck(): Promise<boolean> {
		try {
			const response = await axios.get(`${this.backendUrl}/api/health`);
			return response.status === 200;
		} catch (_error) {
			return false;
		}
	}
}

// Export singleton instance
export const jobPoller = new JobPollerService();
