import { Router } from 'express';
import type { Request, Response } from 'express';
import { jobQueue, JobStatus, JobFilters } from '../services/job-queue';
import { listJobsWithCount, getExecutionSessionById, getSessionMessages } from '../db/queries';
import { paginationConfig } from '../config';
import { hasPaginationParams, validatePaginationOrError } from '../utils/pagination';
import { sessionToLegacyResult } from '../adapters/legacy-adapter';
import { createLegacyTestExecutionJob, LegacyExecutionError } from '../services/legacy-execution';
import { asyncHandler } from '../lib/asyncHandler';
import { logError, logWarn } from '../lib/logger';

const router = Router();

// Define fields that can be updated by users/services
const UPDATABLE_JOB_FIELDS = ['status', 'progress', 'partial_result', 'result_id', 'session_id', 'error'] as const;

// List all jobs with optional filtering
router.get(
	'/',
	asyncHandler(async (req: Request, res: Response) => {
		try {
			const filters: JobFilters = {};

			// Apply filters from query parameters
			if (req.query.status) {
				// Convert string to JobStatus enum
				filters.status = req.query.status as JobStatus;
			}

			if (req.query.agent_id) {
				filters.agent_id = parseInt(req.query.agent_id as string, 10);
			}

			if (req.query.test_id) {
				filters.test_id = parseInt(req.query.test_id as string, 10);
			}

			if (req.query.before) {
				filters.before = new Date(req.query.before as string);
			}

			if (req.query.after) {
				filters.after = new Date(req.query.after as string);
			}

			// If pagination parameters are provided, return with count
			if (hasPaginationParams(req)) {
				const paginationParams = validatePaginationOrError(req, res);
				if (!paginationParams) {
					return;
				}

				const { data, total } = await listJobsWithCount({ ...filters, ...paginationParams });
				return res.json({
					data,
					total,
					limit: paginationParams.limit,
					offset: paginationParams.offset || 0
				});
			}

			// Otherwise use default pagination limit for large tables
			const defaultLimit = paginationConfig.defaultLargeLimit;
			const { data, total } = await listJobsWithCount({ ...filters, limit: defaultLimit, offset: 0 });
			return res.json({
				data,
				total,
				limit: defaultLimit,
				offset: 0
			});
		} catch (error) {
			logError('Error listing jobs:', error);
			return res.status(500).json({
				error: 'Failed to list jobs',
				details: error instanceof Error ? error.message : 'Unknown error'
			});
		}
	})
);

// Get available jobs for polling (used by services)
router.get(
	'/available/:job_type?',
	asyncHandler(async (req: Request, res: Response) => {
		try {
			const jobType = req.params.job_type;
			const limit = parseInt((req.query.limit as string) || '10', 10);

			const jobs = await jobQueue.getAvailableJobs(jobType, limit);
			return res.json(jobs);
		} catch (error) {
			logError('Error getting available jobs:', error);
			return res.status(500).json({
				error: 'Failed to get available jobs',
				details: error instanceof Error ? error.message : 'Unknown error'
			});
		}
	})
);

// Get a job by ID
router.get(
	'/:id',
	asyncHandler(async (req: Request, res: Response) => {
		try {
			const job = await jobQueue.getJob(req.params.id);

			if (!job) {
				return res.status(404).json({ error: 'Job not found' });
			}

			// Enrich job with related data if needed
			const enrichedJob: any = { ...job };

			// If job has a session result, include it (new system)
			if (job.session_id) {
				try {
					const session = await getExecutionSessionById(job.session_id);
					if (session) {
						const sessionMessages = await getSessionMessages(job.session_id);
						enrichedJob.result = sessionToLegacyResult(session, sessionMessages);
					}
				} catch (error) {
					logWarn(`Failed to enrich job ${job.id} with session ${job.session_id}:`, error);
				}
			}
			// Fallback to legacy result_id if session_id not available (legacy compatibility) TODO deprecate this
			else if (job.result_id) {
				try {
					// This is for backwards compatibility with old jobs that still have result_id
					const session = await getExecutionSessionById(job.result_id); // Assuming result_id maps to session_id
					if (session) {
						const sessionMessages = await getSessionMessages(job.result_id);
						enrichedJob.result = sessionToLegacyResult(session, sessionMessages);
					}
				} catch (error) {
					logWarn(`Failed to enrich job ${job.id} with legacy result ${job.result_id}:`, error);
				}
			}

			return res.json(enrichedJob);
		} catch (error) {
			logError(`Error getting job ${req.params.id}:`, error);
			return res.status(500).json({
				error: 'Failed to get job',
				details: error instanceof Error ? error.message : 'Unknown error'
			});
		}
	})
);

// Legacy endpoint: Create a new job using test_id compatibility.
// Prefer /api/execute/conversation for new clients.
router.post(
	'/',
	asyncHandler(async (req: Request, res: Response) => {
		try {
			const { agent_id, test_id } = req.body;

			// Validate input
			if (!agent_id || !test_id) {
				return res.status(400).json({ error: 'agent_id and test_id are required' });
			}

			const { jobId } = await createLegacyTestExecutionJob(agent_id, test_id);

			// Return the job ID with 202 Accepted status
			return res.status(202).json({
				job_id: jobId,
				message: 'Job created and queued for execution'
			});
		} catch (error) {
			if (error instanceof LegacyExecutionError) {
				return res.status(error.statusCode).json({ error: error.message });
			}
			logError('Error creating job:', error);
			return res.status(500).json({
				error: 'Failed to create job',
				details: error instanceof Error ? error.message : 'Unknown error'
			});
		}
	})
);

// Cancel a job
router.post(
	'/:id/cancel',
	asyncHandler(async (req: Request, res: Response) => {
		try {
			const job = await jobQueue.getJob(req.params.id);

			if (!job) {
				return res.status(404).json({ error: 'Job not found' });
			}

			// Only pending or running jobs can be canceled
			if (job.status !== JobStatus.PENDING && job.status !== JobStatus.RUNNING) {
				return res.status(400).json({
					error: 'Cannot cancel job',
					details: `Job status is ${job.status}`
				});
			}

			// Update job status to canceled
			await jobQueue.updateJob(req.params.id, {
				status: JobStatus.FAILED,
				error: 'Job canceled by user'
			});

			return res.status(200).json({ message: 'Job canceled successfully' });
		} catch (error) {
			logError(`Error canceling job ${req.params.id}:`, error);
			return res.status(500).json({
				error: 'Failed to cancel job',
				details: error instanceof Error ? error.message : 'Unknown error'
			});
		}
	})
);

// Delete a job completely
router.delete(
	'/:id',
	asyncHandler(async (req: Request, res: Response) => {
		try {
			const deleted = await jobQueue.deleteJob(req.params.id);

			if (!deleted) {
				return res.status(404).json({ error: 'Job not found' });
			}

			return res.status(200).json({ message: 'Job deleted successfully' });
		} catch (error) {
			logError(`Error deleting job ${req.params.id}:`, error);
			return res.status(500).json({
				error: 'Failed to delete job',
				details: error instanceof Error ? error.message : 'Unknown error'
			});
		}
	})
);

// Claim a job for execution (used by services)
router.post(
	'/:id/claim',
	asyncHandler(async (req: Request, res: Response) => {
		try {
			const { service_id } = req.body;

			if (!service_id) {
				return res.status(400).json({ error: 'service_id is required' });
			}

			const claimed = await jobQueue.claimJob(req.params.id, service_id);

			if (!claimed) {
				return res
					.status(409)
					.json({ error: 'Job could not be claimed (may be already running or completed)' });
			}

			return res.status(200).json({
				message: 'Job claimed successfully',
				job_id: req.params.id
			});
		} catch (error) {
			logError(`Error claiming job ${req.params.id}:`, error);
			return res.status(500).json({
				error: 'Failed to claim job',
				details: error instanceof Error ? error.message : 'Unknown error'
			});
		}
	})
);

// Update job status and progress (used by services during execution)
router.put(
	'/:id',
	asyncHandler(async (req: Request, res: Response) => {
		try {
			const updates = req.body;

			// Only allow whitelisted fields to be updated
			const updateFields: any = {};

			for (const field of UPDATABLE_JOB_FIELDS) {
				if (updates[field] !== undefined) {
					updateFields[field] = updates[field];
				}
			}

			if (Object.keys(updateFields).length === 0) {
				return res.status(400).json({ error: 'No valid fields to update' });
			}

			await jobQueue.updateJob(req.params.id, updateFields);

			return res.status(200).json({ message: 'Job updated successfully' });
		} catch (error) {
			logError(`Error updating job ${req.params.id}:`, error);
			return res.status(500).json({
				error: 'Failed to update job',
				details: error instanceof Error ? error.message : 'Unknown error'
			});
		}
	})
);

export default router;
