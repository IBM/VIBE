import { Router } from 'express';
import type { Request, Response } from 'express';
import {
	addSessionMessage,
	countUserTurnsUpTo,
	getExecutionSessionById,
	getConversationTurnTarget,
	updateSessionMessage,
	getSessionMessageById
} from '../db/queries';
import type { SessionMessage } from '@ibm-vibe/types';
import { scoreSimilarityText } from '../services/scoring-service';
import { asyncHandler } from '../lib/asyncHandler';
import { logError, logWarn } from '../lib/logger';
import { parseIdParam } from '../lib/routeHelpers';

/**
 * Score similarity for a session message against its conversation target
 * Runs asynchronously and updates the message with scoring results
 */
async function scoreSessionMessageSimilarity(
	messageId: number,
	targetReply: string,
	actualReply: string,
	turnIndex: number,
	targetId: number
): Promise<void> {
	try {
		updateSessionMessage(messageId, { similarity_scoring_status: 'running' });
		const { score, metadata } = await scoreSimilarityText(targetReply, actualReply);
		updateSessionMessage(messageId, {
			similarity_score: score,
			similarity_scoring_status: 'completed',
			similarity_scoring_metadata: JSON.stringify({
				expectation_id: targetId,
				turn_index: turnIndex,
				...metadata
			})
		});
	} catch (err: any) {
		updateSessionMessage(messageId, {
			similarity_scoring_status: 'failed',
			similarity_scoring_error: err?.message || 'scoring failed'
		});
	}
}

const router = Router();

// Create session message
router.post(
	'/',
	asyncHandler(async (req: Request<Record<string, never>, unknown, Omit<SessionMessage, 'id'>>, res: Response) => {
		try {
			// Normalize payload for SQLite bindings
			const payload: any = { ...(req.body || {}) };

			// Required fields
			if (payload.session_id !== undefined) {
				payload.session_id = Number(payload.session_id);
			}
			if (payload.sequence !== undefined) {
				payload.sequence = Number(payload.sequence);
			}

			// Ensure role and content are strings (content default to empty string to satisfy named param)
			if (payload.role === undefined || payload.role === null) {
				payload.role = 'assistant';
			}
			if (typeof payload.role !== 'string') {
				payload.role = String(payload.role);
			}
			if (payload.content === undefined || payload.content === null) {
				payload.content = '';
			}
			if (typeof payload.content !== 'string') {
				payload.content = String(payload.content);
			}

			// Ensure timestamp is a string if provided
			if (payload.timestamp && typeof payload.timestamp !== 'string') {
				payload.timestamp = new Date(payload.timestamp).toISOString();
			}

			// Ensure metadata is a string or null
			if (payload.metadata === undefined || payload.metadata === null) {
				payload.metadata = null;
			} else if (typeof payload.metadata !== 'string') {
				try {
					payload.metadata = JSON.stringify(payload.metadata);
				} catch (_e) {
					payload.metadata = null;
				}
			}

			const message = await addSessionMessage(payload as SessionMessage);

			// If this is an assistant message, kick off in-process similarity scoring
			if (message.role === 'assistant') {
				try {
					if (message.session_id == null) {
						logWarn('Session message missing session_id; skipping similarity scoring.', {
							message_id: message.id
						});
						return res.status(201).json(message);
					}

					const sessionId = message.session_id;
					const session = await getExecutionSessionById(sessionId);
					if (session?.conversation_id) {
						// Determine user turn index k up to this assistant message
						const k = countUserTurnsUpTo(sessionId, message.sequence);
						const target = getConversationTurnTarget(session.conversation_id, k);
						if (target && message.id && target.id) {
							// Mark pending immediately
							updateSessionMessage(message.id, { similarity_scoring_status: 'pending' });
							// Run in background (fire-and-forget)
							scoreSessionMessageSimilarity(
								message.id,
								target.target_reply,
								message.content,
								k,
								target.id
							);
						}
					}
				} catch (e) {
					logError('In-process scoring trigger failed:', e);
				}
			}

			return res.status(201).json(message);
		} catch (error) {
			logError('Error creating session message:', error);
			return res.status(500).json({ error: 'Failed to create session message' });
		}
	})
);

// Regenerate similarity score for a specific message
router.post(
	'/:id/regenerate-score',
	asyncHandler(async (req: Request<{ id: string }>, res: Response) => {
		try {
			const messageId = parseIdParam(res, req.params.id, 'Invalid message ID');
			if (messageId === null) {
				return;
			}

			// Get the message
			const message = await getSessionMessageById(messageId);
			if (!message) {
				return res.status(404).json({ error: 'Message not found' });
			}

			if (message.role !== 'assistant') {
				return res.status(400).json({ error: 'Only assistant messages can be scored' });
			}

			// Get the session and conversation
			if (message.session_id == null) {
				return res.status(400).json({ error: 'Session ID missing' });
			}

			const sessionId = message.session_id;
			const session = await getExecutionSessionById(sessionId);
			if (!session?.conversation_id) {
				return res.status(400).json({ error: 'Session or conversation not found' });
			}

			// Determine user turn index k up to this assistant message
			const k = countUserTurnsUpTo(sessionId, message.sequence);
			const target = getConversationTurnTarget(session.conversation_id, k);
			if (!target || !target.id) {
				return res.status(400).json({ error: 'No target found for this turn' });
			}

			// Mark as pending and start scoring
			updateSessionMessage(messageId, { similarity_scoring_status: 'pending' });

			// Run scoring in background
			scoreSessionMessageSimilarity(messageId, target.target_reply, message.content, k, target.id);

			return res.status(202).json({
				message: 'Similarity scoring initiated',
				message_id: messageId
			});
		} catch (error) {
			logError('Error regenerating similarity score:', error);
			return res.status(500).json({ error: 'Failed to regenerate similarity score' });
		}
	})
);

export default router;
