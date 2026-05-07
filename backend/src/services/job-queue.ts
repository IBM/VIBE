import { v4 as uuidv4 } from 'uuid';
import {
	createJob as dbCreateJob,
	getJobById,
	updateJob as dbUpdateJob,
	listJobs as dbListJobs,
	deleteOldJobs,
	deleteJob as dbDeleteJob,
	getAgentById
} from '../db/queries';
import { computeSessionDurationMs } from '../lib/sessionMetadata';
import { SuiteRun, JobStatus, Job, JobFilters } from '@ibm-vibe/types';
// Import functions directly from db/queries to avoid TypeScript errors
import * as dbQueries from '../db/queries';
import { suiteProcessingService } from './suite-processing-service';
import { getAgentJobType } from '../utils/agent-utils';

// Export types from the main types file
export { Job, JobStatus, JobFilters } from '@ibm-vibe/types';

const shouldLog = process.env.NODE_ENV !== 'test';

/**
 * Generate a unique job ID
 */
function generateJobId(): string {
	return uuidv4();
}

/**
 * Job Queue Service for managing asynchronous test execution
 */
export class JobQueueService {
	private jobs: Map<string, Job>;
	private runningJobs: Set<string>;
	// private _maxConcurrentJobs: number; // Currently unused, reserved for future concurrency control
	private isProcessing: boolean;
	private processingInterval?: NodeJS.Timeout;

	/**
	 * Create a new JobQueueService
	 * @param maxConcurrentJobs Maximum number of jobs to run concurrently
	 */
	constructor(_maxConcurrentJobs = 3) {
		this.jobs = new Map();
		this.runningJobs = new Set();
		// this._maxConcurrentJobs = maxConcurrentJobs;
		this.isProcessing = false;

		// Initialize jobs from database
		this.loadJobsFromDatabase();

		// Start processing queue
		this.processingInterval = setInterval(() => this.processQueue(), 1000);
		// Don't keep the Node event loop alive just for this interval (helps tests exit cleanly).
		this.processingInterval.unref();
	}

	/**
	 * Cleanup resources (stop interval timer and wait for pending operations)
	 */
	async cleanup(): Promise<void> {
		if (this.processingInterval) {
			clearInterval(this.processingInterval);
			this.processingInterval = undefined;
		}

		// Wait for any in-flight processQueue to complete
		while (this.isProcessing) {
			await new Promise((resolve) => setTimeout(resolve, 10));
		}
	}

	/**
	 * Load jobs from database into memory
	 */
	private async loadJobsFromDatabase() {
		try {
			const jobs = await dbListJobs({});
			for (const job of jobs) {
				if (job.status === JobStatus.RUNNING) {
					// Reset running jobs to pending on restart
					job.status = JobStatus.PENDING;
					await dbUpdateJob(job.id, { status: JobStatus.PENDING });
				}
				this.jobs.set(job.id, job);
			}
			console.log(`Loaded ${jobs.length} jobs from database`);
		} catch (error) {
			/* istanbul ignore next */
			if (shouldLog) {
				console.error('Error loading jobs from database:', error);
			}
		}
	}

	/**
	 * Create a new job and add it to the queue
	 * @param agent_id Agent ID to use for the test
	 * @param test_id Test ID to run
	 * @param suite_run_id Optional suite run ID if this job is part of a suite run
	 * @returns The job ID
	 */
	async createJob(agent_id: number, test_id: number, suite_run_id?: number): Promise<string> {
		const id = uuidv4();

		// Get agent to determine job type
		const agent = await getAgentById(agent_id);
		if (!agent) {
			throw new Error(`Agent ${agent_id} not found`);
		}

		const jobType = getAgentJobType(agent.settings);

		const job: Job = {
			id,
			agent_id,
			test_id,
			status: JobStatus.PENDING,
			progress: 0,
			job_type: jobType
		};

		// Add suite_run_id if provided
		if (suite_run_id) {
			job.suite_run_id = suite_run_id;
		}

		// Save to database
		await dbCreateJob(job);

		// Add to in-memory queue
		this.jobs.set(id, job);

		return id;
	}

	/**
	 * Create a new conversation job and add it to the queue
	 * @param agent_id Agent ID to use for the conversation
	 * @param conversation_id Conversation ID to run
	 * @param suite_run_id Optional suite run ID if this job is part of a suite run
	 * @returns The job ID
	 */
	async createConversationJob(agent_id: number, conversation_id: number, suite_run_id?: number): Promise<string> {
		const id = uuidv4();

		const agent = await getAgentById(agent_id);
		if (!agent) {
			throw new Error(`Agent ${agent_id} not found`);
		}

		const jobType = getAgentJobType(agent.settings);

		const job: Job = {
			id,
			agent_id,
			conversation_id,
			status: JobStatus.PENDING,
			progress: 0,
			job_type: jobType
		};

		// Add suite_run_id if provided
		if (suite_run_id) {
			job.suite_run_id = suite_run_id;
		}

		// Save to database
		await dbCreateJob(job);

		// Add to in-memory queue
		this.jobs.set(id, job);

		return id;
	}

	/**
	 * Get a job by ID
	 * @param id Job ID
	 * @returns The job or undefined if not found
	 */
	async getJob(id: string): Promise<Job | undefined> {
		// Try memory first
		if (this.jobs.has(id)) {
			return this.jobs.get(id);
		}

		// Then try database
		try {
			const job = await getJobById(id);
			if (job) {
				this.jobs.set(id, job);
			}
			return job || undefined;
		} catch (error) {
			/* istanbul ignore next */
			if (shouldLog) {
				console.error(`Error getting job ${id}:`, error);
			}
			return undefined;
		}
	}

	/**
	 * Update a job's status and metadata
	 * @param id Job ID
	 * @param updates Fields to update
	 */
	async updateJob(id: string, updates: Partial<Job>): Promise<void> {
		const job = await this.getJob(id);
		if (!job) {
			throw new Error(`Job ${id} not found`);
		}

		// Update in-memory job
		Object.assign(job, updates);
		this.jobs.set(id, job);

		// Update in database
		await dbUpdateJob(id, updates);

		// If job completed or failed, remove from running jobs
		if (
			updates.status === JobStatus.COMPLETED ||
			updates.status === JobStatus.FAILED ||
			updates.status === JobStatus.TIMEOUT
		) {
			this.runningJobs.delete(id);
		}

		// If job is part of a suite run and status changed to completed/failed, update suite run progress
		if (job.suite_run_id && (updates.status === JobStatus.COMPLETED || updates.status === JobStatus.FAILED)) {
			await this.updateSuiteRunProgress(job.suite_run_id);
		}
	}

	/**
	 * Process the job queue - only handles cleanup, actual execution is done by external services
	 */
	async processQueue(): Promise<void> {
		// Prevent concurrent processing
		if (this.isProcessing) return;
		this.isProcessing = true;

		try {
			// Clean up any orphaned running jobs (running too long without updates)
			const staleThreshold = Date.now() - 10 * 60 * 1000; // 10 minutes
			for (const job of this.jobs.values()) {
				if (job.status === JobStatus.RUNNING && job.updated_at) {
					const updatedAt = new Date(job.updated_at).getTime();
					if (updatedAt < staleThreshold) {
						/* istanbul ignore next */
						if (shouldLog) {
							console.warn(`Job ${job.id} appears stale, resetting to pending`);
						}
						await this.updateJob(job.id, {
							status: JobStatus.PENDING,
							error: 'Job was reset due to inactivity'
						});
					}
				}
			}
		} finally {
			this.isProcessing = false;
		}
	}

	/**
	 * Get jobs available for polling by services
	 * @param jobType Optional job type filter ('crewai', 'external_api')
	 * @param limit Maximum number of jobs to return
	 * @returns Array of available jobs
	 */
	async getAvailableJobs(jobType?: string, limit: number = 10): Promise<Job[]> {
		try {
			const filters: JobFilters = {
				status: JobStatus.PENDING
			};

			if (jobType) {
				filters.job_type = jobType;
			}

			const jobs = await dbListJobs(filters);
			return jobs.slice(0, limit);
		} catch (error) {
			/* istanbul ignore next */
			if (shouldLog) {
				console.error('Error getting available jobs:', error);
			}
			return [];
		}
	}

	/**
	 * Claim a job for execution (atomic operation)
	 * @param jobId Job ID to claim
	 * @param serviceId Identifier for the service claiming the job
	 * @returns True if job was successfully claimed, false otherwise
	 */
	async claimJob(jobId: string, serviceId: string): Promise<boolean> {
		try {
			const job = await this.getJob(jobId);
			if (!job || job.status !== JobStatus.PENDING) {
				return false;
			}

			await this.updateJob(jobId, {
				status: JobStatus.RUNNING,
				progress: 10,
				claimed_by: serviceId,
				claimed_at: new Date().toISOString()
			});

			this.runningJobs.add(jobId);
			return true;
		} catch (error) {
			/* istanbul ignore next */
			if (shouldLog) {
				console.error(`Error claiming job ${jobId}:`, error);
			}
			return false;
		}
	}

	/**
	 * List all jobs with optional filtering
	 * @param filters Filters to apply
	 * @returns List of jobs
	 */
	async listJobs(filters: JobFilters = {}): Promise<Job[]> {
		try {
			const jobs = await dbListJobs(filters);
			// Update in-memory queue
			for (const job of jobs) {
				this.jobs.set(job.id, job);
			}
			return jobs;
		} catch (error) {
			/* istanbul ignore next */
			if (shouldLog) {
				console.error('Error listing jobs:', error);
			}
			return [];
		}
	}

	/**
	 * Clean up old completed jobs
	 * @param olderThan Delete jobs older than this date
	 */
	async cleanupOldJobs(olderThan: Date): Promise<void> {
		try {
			const deletedCount = await deleteOldJobs(olderThan);

			// Remove from in-memory queue
			for (const [id, job] of this.jobs.entries()) {
				if (job.status === JobStatus.COMPLETED || job.status === JobStatus.FAILED) {
					const createdAt = job.created_at ? new Date(job.created_at) : new Date();
					if (createdAt < olderThan) {
						this.jobs.delete(id);
					}
				}
			}

			console.log(`Deleted ${deletedCount} old jobs`);
		} catch (error) {
			/* istanbul ignore next */
			if (shouldLog) {
				console.error('Error cleaning up old jobs:', error);
			}
		}
	}

	/**
	 * Delete a job completely
	 * @param id Job ID
	 * @returns True if job was deleted, false if not found
	 */
	async deleteJob(id: string): Promise<boolean> {
		// Remove from in-memory queue
		const job = await this.getJob(id);
		if (!job) {
			return false;
		}

		// Delete from database
		const deleted = await dbDeleteJob(id);

		if (deleted) {
			// Remove from in-memory maps
			this.jobs.delete(id);
			this.runningJobs.delete(id);
			return true;
		}

		return false;
	}

	/**
	 * Create a new suite run and add jobs for all tests in the suite
	 * @param suite_id Suite ID to run
	 * @param agent_id Agent ID to use for the tests
	 * @returns The suite run ID
	 */
	async createSuiteRun(suite_id: number, agent_id: number): Promise<number> {
		// Get suite entries and flatten to leaf tests with agent overrides
		const leaves = suiteProcessingService.getFlattenedLeaves(suite_id, agent_id);
		if (!leaves || leaves.length === 0) {
			// Instead of throwing an error, create a suite run with 0 tests that completes immediately
			/* istanbul ignore next */
			if (shouldLog) {
				console.warn(`Suite ${suite_id} contains no executable tests. Creating empty suite run.`);
			}

			const suiteRun: SuiteRun = {
				suite_id,
				agent_id,
				status: JobStatus.COMPLETED, // Mark as completed since there's nothing to run
				progress: 100, // 100% complete since there are no tests
				total_tests: 0,
				completed_tests: 0,
				successful_tests: 0,
				failed_tests: 0
			};

			const createdSuiteRun = await dbQueries.createSuiteRun(suiteRun);
			if (!createdSuiteRun.id) {
				throw new Error('Failed to create empty suite run');
			}

			return createdSuiteRun.id;
		}

		// Create suite run record
		const suiteRun: SuiteRun = {
			suite_id,
			agent_id,
			status: JobStatus.PENDING,
			progress: 0,
			total_tests: leaves.length,
			completed_tests: 0,
			successful_tests: 0,
			failed_tests: 0
		};
		const createdSuiteRun = await dbQueries.createSuiteRun(suiteRun);
		if (!createdSuiteRun.id) {
			throw new Error('Failed to create suite run');
		}
		// Create jobs for each leaf test in the suite
		const jobPromises = leaves.map(
			async (leaf: { agent_id: number; conversation_id?: number; test_id?: number }) => {
				const jobAgentId = leaf.agent_id;

				// Determine agent job type to decide which job creator to use
				const agent = await dbQueries.getAgentById(jobAgentId);
				if (!agent) {
					throw new Error(`Agent ${jobAgentId} not found`);
				}
				const jobType = getAgentJobType(agent.settings);

				if (jobType === 'external_api') {
					// Prefer conversation-first jobs
					const conversationId = leaf.conversation_id ?? leaf.test_id;
					if (!conversationId) {
						throw new Error('Missing conversation identifier for external_api job');
					}
					return this.createConversationJob(jobAgentId, conversationId, createdSuiteRun.id!);
				}

				// CrewAI path (legacy tests still supported)
				if (leaf.test_id) {
					return this.createJobForSuiteRun(jobAgentId, leaf.test_id, createdSuiteRun.id!);
				}
				// If only conversation_id is present, fallback to conversation job
				if (leaf.conversation_id) {
					return this.createConversationJob(jobAgentId, leaf.conversation_id, createdSuiteRun.id!);
				}
				throw new Error('Leaf has neither test_id nor conversation_id');
			}
		);
		await Promise.all(jobPromises);
		// Immediately mark suite run as RUNNING
		await dbQueries.updateSuiteRun(createdSuiteRun.id, { status: JobStatus.RUNNING });

		return createdSuiteRun.id;
	}

	/**
	 * Create a job for a test within a suite run
	 * @param agent_id Agent ID to use
	 * @param test_id Test ID to run
	 * @param suite_run_id Suite run ID
	 * @returns The job ID
	 */
	private async createJobForSuiteRun(agent_id: number, test_id: number, suite_run_id: number): Promise<string> {
		// Get agent details to determine job type
		const agent = await dbQueries.getAgentById(agent_id);
		if (!agent) {
			throw new Error(`Agent ${agent_id} not found`);
		}

		const jobType = getAgentJobType(agent.settings);

		const jobId = generateJobId();
		const job: Job = {
			id: jobId,
			agent_id,
			test_id,
			status: JobStatus.PENDING,
			progress: 0,
			suite_run_id,
			job_type: jobType
		};

		await dbCreateJob(job);
		return jobId;
	}

	/**
	 * Update a suite run's progress based on completed jobs
	 * @param suite_run_id Suite run ID
	 */
	async updateSuiteRunProgress(suite_run_id: number): Promise<void> {
		// Get suite run
		const suiteRun = await dbQueries.getSuiteRunById(suite_run_id);
		if (!suiteRun) {
			throw new Error(`Suite run ${suite_run_id} not found`);
		}

		// Get all jobs for this suite run
		const jobs = await dbListJobs({ suite_run_id });

		// Calculate progress
		const totalJobs = jobs.length;
		const completedJobs = jobs.filter(
			(job) =>
				job.status === JobStatus.COMPLETED ||
				job.status === JobStatus.FAILED ||
				job.status === JobStatus.TIMEOUT
		);
		const successfulJobs = jobs.filter((job) => job.status === JobStatus.COMPLETED);

		// Compute execution time from execution sessions (batch fetch)
		const sessionIds = completedJobs
			.map((job) => job.session_id)
			.filter((id): id is number => id !== undefined && id !== null);
		const sessions = dbQueries.getExecutionSessionsByIds(sessionIds);
		const executionTimesMs = sessions.map((s) => computeSessionDurationMs(s));
		const averageExecutionTime =
			executionTimesMs.length > 0
				? executionTimesMs.reduce((sum, ms) => sum + ms, 0) / executionTimesMs.length
				: undefined;

		// Calculate overall progress percentage
		const progress = Math.floor((completedJobs.length / totalJobs) * 100);

		// Determine suite run status
		let status = suiteRun.status;
		if (completedJobs.length === totalJobs) {
			status = JobStatus.COMPLETED;
		} else if (jobs.some((job) => job.status === JobStatus.RUNNING)) {
			status = JobStatus.RUNNING;
		}

		// Get token usage for the suite run
		const tokenUsage = dbQueries.getSuiteRunTokenUsage(suite_run_id);

		// Update suite run
		await dbQueries.updateSuiteRun(suite_run_id, {
			status,
			progress,
			completed_tests: completedJobs.length,
			successful_tests: successfulJobs.length,
			failed_tests: completedJobs.length - successfulJobs.length,
			average_execution_time: averageExecutionTime,
			total_input_tokens: tokenUsage.total_input_tokens,
			total_output_tokens: tokenUsage.total_output_tokens
		});
	}
}

// Export a singleton instance
export const jobQueue = new JobQueueService();
