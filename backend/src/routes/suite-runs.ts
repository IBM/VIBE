import { Router } from 'express';
import type { Request, Response } from 'express';
import {
	getSuiteRunById,
	getJobsBySuiteRunId,
	deleteSuiteRun,
	listSuiteRunsWithCount,
	getExecutionSessionsByIds,
	getSessionMessages
} from '../db/queries';
import { computeSessionDurationMs } from '../lib/sessionMetadata';
import { paginationConfig } from '../config';
import { hasPaginationParams, validatePaginationOrError } from '../utils/pagination';
import { JobStatus } from '@ibm-vibe/types';
import { asyncHandler } from '../lib/asyncHandler';
import { logError } from '../lib/logger';
import { parseIdParam } from '../lib/routeHelpers';

const router = Router();

/**
 * Utility function to recalculate and enrich suite run data with accurate progress and execution time
 * This handles cases where older data wasn't stored properly in the database
 */
async function enrichSuiteRunWithCalculatedFields(suiteRun: any) {
	const jobs = await getJobsBySuiteRunId(suiteRun.id!);

	// Calculate actual job states
	const completedJobs = jobs.filter(
		(job) => job.status === 'completed' || job.status === 'failed' || job.status === 'timeout'
	);
	const successfulJobs = jobs.filter((job) => job.status === 'completed');

	// If the database values don't match the actual job states, use calculated values
	// this is a fallback to ensure the UI is always up to date
	if (suiteRun.completed_tests !== completedJobs.length || suiteRun.successful_tests !== successfulJobs.length) {
		suiteRun.completed_tests = completedJobs.length;
		suiteRun.successful_tests = successfulJobs.length;
		suiteRun.failed_tests = completedJobs.length - successfulJobs.length;
		suiteRun.progress = Math.floor((completedJobs.length / Math.max(jobs.length, 1)) * 100);

		// Update status if all jobs are completed
		if (completedJobs.length === jobs.length && jobs.length > 0) {
			suiteRun.status = 'completed' as any;
		} else if (jobs.some((job) => job.status === 'running')) {
			suiteRun.status = 'running' as any;
		}
	}

	// Always compute total_execution_time as sum of individual test execution times
	if (suiteRun.completed_tests > 0) {
		const sessionIds = jobs.map((j) => j.session_id).filter((id): id is number => id !== undefined && id !== null);
		const sessions = getExecutionSessionsByIds(sessionIds);
		const sumMs = sessions.map((s) => computeSessionDurationMs(s)).reduce((a, b) => a + b, 0);
		suiteRun.total_execution_time = sumMs;
	} else {
		suiteRun.total_execution_time = 0;
	}

	// Calculate average similarity score from per-turn assistant messages (source of truth)
	try {
		const sessionIds = jobs.map((j) => j.session_id).filter((id): id is number => id !== undefined && id !== null);

		const allScores: number[] = [];
		for (const sid of sessionIds) {
			const messages = await getSessionMessages(sid);
			for (const m of messages) {
				if (
					m.role === 'assistant' &&
					m.similarity_scoring_status === 'completed' &&
					typeof m.similarity_score === 'number'
				) {
					allScores.push(m.similarity_score);
				}
			}
		}

		if (allScores.length > 0) {
			suiteRun.avg_similarity_score = allScores.reduce((a, b) => a + b, 0) / allScores.length;
		} else {
			suiteRun.avg_similarity_score = undefined;
		}
	} catch (err) {
		logError('Failed to compute average similarity score for suite run', suiteRun.id, err);
	}

	return suiteRun;
}

/**
 * GET /api/suite-runs
 * List all suite runs with optional filtering
 */
router.get(
	'/',
	asyncHandler(async (req: Request, res: Response) => {
		try {
			const filters: any = {};

			// Apply filters from query parameters
			if (req.query.status) {
				filters.status = req.query.status as JobStatus;
			}

			if (req.query.suite_id) {
				filters.suite_id = parseInt(req.query.suite_id as string, 10);
			}

			if (req.query.agent_id) {
				filters.agent_id = parseInt(req.query.agent_id as string, 10);
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
				if (!paginationParams) return; // Error response already sent

				const { data, total } = listSuiteRunsWithCount({ ...filters, ...paginationParams });

				// Enrich each suite run with calculated fields
				const enrichedData = await Promise.all(
					data.map((suiteRun) => enrichSuiteRunWithCalculatedFields(suiteRun))
				);

				return res.json({
					data: enrichedData,
					total,
					limit: paginationParams.limit,
					offset: paginationParams.offset || 0
				});
			}

			// Otherwise apply default pagination limit
			const defaultLimit = paginationConfig.defaultLargeLimit;
			const { data, total } = listSuiteRunsWithCount({ ...filters, limit: defaultLimit, offset: 0 });

			// Enrich each suite run with calculated fields
			const enrichedData = await Promise.all(
				data.map((suiteRun) => enrichSuiteRunWithCalculatedFields(suiteRun))
			);

			return res.json({
				data: enrichedData,
				total,
				limit: defaultLimit,
				offset: 0
			});
		} catch (error) {
			logError('Error fetching suite runs:', error);
			return res.status(500).json({ error: 'Failed to fetch suite runs' });
		}
	})
);

/**
 * GET /api/suite-runs/:id
 * Get details of a specific suite run
 */
router.get(
	'/:id',
	asyncHandler(async (req: Request<{ id: string }>, res: Response) => {
		try {
			const id = parseIdParam(res, req.params.id, 'Invalid suite run ID');
			if (id === null) {
				return;
			}

			const suiteRun = await getSuiteRunById(id);
			if (!suiteRun) {
				return res.status(404).json({ error: 'Suite run not found' });
			}

			// Apply recalculation logic
			const enrichedSuiteRun = await enrichSuiteRunWithCalculatedFields(suiteRun);

			return res.json(enrichedSuiteRun);
		} catch (error) {
			logError(`Error getting suite run ${req.params.id}:`, error);
			return res.status(500).json({
				error: 'Failed to get suite run',
				details: error instanceof Error ? error.message : 'Unknown error'
			});
		}
	})
);

/**
 * GET /api/suite-runs/:id/jobs
 * Get jobs associated with a suite run
 */
router.get(
	'/:id/jobs',
	asyncHandler(async (req: Request<{ id: string }>, res: Response) => {
		try {
			const id = parseIdParam(res, req.params.id, 'Invalid suite run ID');
			if (id === null) {
				return;
			}

			// First check if the suite run exists
			const suiteRun = await getSuiteRunById(id);
			if (!suiteRun) {
				return res.status(404).json({ error: 'Suite run not found' });
			}

			const jobs = await getJobsBySuiteRunId(id);
			return res.json(jobs);
		} catch (error) {
			logError(`Error getting jobs for suite run ${req.params.id}:`, error);
			return res.status(500).json({
				error: 'Failed to get jobs for suite run',
				details: error instanceof Error ? error.message : 'Unknown error'
			});
		}
	})
);

/**
 * DELETE /api/suite-runs/:id
 * Delete a suite run and its associated jobs
 */
router.delete(
	'/:id',
	asyncHandler(async (req: Request<{ id: string }>, res: Response) => {
		try {
			const id = parseIdParam(res, req.params.id, 'Invalid suite run ID');
			if (id === null) {
				return;
			}

			// Check if the suite run exists
			const suiteRun = await getSuiteRunById(id);
			if (!suiteRun) {
				return res.status(404).json({ error: 'Suite run not found' });
			}

			// Delete the suite run and associated jobs
			await deleteSuiteRun(id);

			return res.status(204).send();
		} catch (error) {
			logError(`Error deleting suite run ${req.params.id}:`, error);
			return res.status(500).json({
				error: 'Failed to delete suite run',
				details: error instanceof Error ? error.message : 'Unknown error'
			});
		}
	})
);

export default router;
