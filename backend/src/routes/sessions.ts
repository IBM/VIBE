import { Router } from 'express';
import type { Request, Response } from 'express';
import {
	getExecutionSessions,
	getExecutionSessionsWithCount,
	getExecutionSessionById,
	updateExecutionSession,
	getSessionMessages,
	getFullSessionTranscript,
	createExecutionSession
} from '../db/queries';
import type { ExecutionSession } from '@ibm-vibe/types';
import { hasPaginationParams, validatePaginationOrError } from '../utils/pagination';
import { asyncHandler } from '../lib/asyncHandler';
import { logError } from '../lib/logger';
import { parseIdParam } from '../lib/routeHelpers';
import { normalizeExecutionSessionPayload } from '../services/session-payload-normalizer';

const router = Router();

// Get all execution sessions
router.get(
	'/',
	asyncHandler(async (req: Request, res: Response) => {
		try {
			const { conversation_id, agent_id } = req.query as { conversation_id?: string; agent_id?: string };

			// Base filters without pagination applied yet
			const baseFilters: { conversation_id?: number; agent_id?: number } = {
				...(conversation_id ? { conversation_id: Number(conversation_id) } : {}),
				...(agent_id ? { agent_id: Number(agent_id) } : {})
			};

			// If client supplied pagination, honor it
			if (hasPaginationParams(req)) {
				const paginationParams = validatePaginationOrError(req, res);
				if (!paginationParams) {
					return;
				}

				const { data, total } = getExecutionSessionsWithCount({ ...baseFilters, ...paginationParams });
				return res.json({
					data,
					total,
					limit: paginationParams.limit,
					offset: paginationParams.offset || 0
				});
			}

			// Otherwise get all sessions (with base filters)
			const sessions = await getExecutionSessions(baseFilters);
			return res.json(sessions);
		} catch (error) {
			logError('Error fetching execution sessions:', error);
			return res.status(500).json({ error: 'Failed to fetch execution sessions' });
		}
	})
);

// Get execution session by id
router.get(
	'/:id',
	asyncHandler(async (req: Request<{ id: string }>, res: Response) => {
		try {
			const sessionId = parseIdParam(res, req.params.id, 'Invalid execution session ID');
			if (sessionId === null) {
				return;
			}
			const session = await getExecutionSessionById(sessionId);

			if (!session) {
				return res.status(404).json({ error: 'Execution session not found' });
			}

			return res.json(session);
		} catch (error) {
			logError('Error fetching execution session:', error);
			return res.status(500).json({ error: 'Failed to fetch execution session' });
		}
	})
);

// Get session messages (transcript)
router.get(
	'/:id/messages',
	asyncHandler(async (req: Request<{ id: string }>, res: Response) => {
		try {
			const sessionId = parseIdParam(res, req.params.id, 'Invalid execution session ID');
			if (sessionId === null) {
				return;
			}

			// Check if session exists
			const session = await getExecutionSessionById(sessionId);
			if (!session) {
				return res.status(404).json({ error: 'Execution session not found' });
			}

			const messages = await getSessionMessages(sessionId);
			return res.json(messages);
		} catch (error) {
			logError('Error fetching session messages:', error);
			return res.status(500).json({ error: 'Failed to fetch session messages' });
		}
	})
);

// Get full session transcript (session details + messages)
router.get(
	'/:id/transcript',
	asyncHandler(async (req: Request<{ id: string }>, res: Response) => {
		try {
			const sessionId = parseIdParam(res, req.params.id, 'Invalid execution session ID');
			if (sessionId === null) {
				return;
			}

			const transcript = await getFullSessionTranscript(sessionId);

			if (!transcript.session) {
				return res.status(404).json({ error: 'Execution session not found' });
			}

			return res.json(transcript);
		} catch (error) {
			logError('Error fetching session transcript:', error);
			return res.status(500).json({ error: 'Failed to fetch session transcript' });
		}
	})
);

// Update execution session (for status updates, completion, etc.)
router.put(
	'/:id',
	asyncHandler(async (req: Request<{ id: string }, unknown, Partial<ExecutionSession>>, res: Response) => {
		try {
			const sessionId = parseIdParam(res, req.params.id, 'Invalid execution session ID');
			if (sessionId === null) {
				return;
			}

			// Check if session exists
			const existingSession = await getExecutionSessionById(sessionId);
			if (!existingSession) {
				return res.status(404).json({ error: 'Execution session not found' });
			}

			const updatedSession = await updateExecutionSession(sessionId, req.body);
			return res.json(updatedSession);
		} catch (error) {
			logError('Error updating execution session:', error);
			return res.status(500).json({ error: 'Failed to update execution session' });
		}
	})
);

// Create execution session (for agent services)
router.post(
	'/',
	asyncHandler(async (req: Request<Record<string, never>, unknown, Partial<ExecutionSession>>, res: Response) => {
		try {
			const payload = normalizeExecutionSessionPayload(req.body);
			const session = await createExecutionSession(payload as ExecutionSession);
			return res.status(201).json(session);
		} catch (error) {
			logError('Error creating execution session:', error);
			return res.status(500).json({ error: 'Failed to create execution session' });
		}
	})
);

// Cancel/delete execution session
router.delete(
	'/:id',
	asyncHandler(async (req: Request<{ id: string }>, res: Response) => {
		try {
			const sessionId = parseIdParam(res, req.params.id, 'Invalid execution session ID');
			if (sessionId === null) {
				return;
			}

			// Check if session exists
			const existingSession = await getExecutionSessionById(sessionId);
			if (!existingSession) {
				return res.status(404).json({ error: 'Execution session not found' });
			}

			// We'll just mark as failed rather than actually deleting
			// This preserves the execution history
			await updateExecutionSession(sessionId, {
				status: 'failed',
				error_message: 'Session cancelled by user',
				completed_at: new Date().toISOString()
			});

			return res.status(204).send();
		} catch (error) {
			logError('Error cancelling execution session:', error);
			return res.status(500).json({
				error: 'Failed to cancel execution session',
				details: error instanceof Error ? error.message : 'Unknown error'
			});
		}
	})
);

export default router;
