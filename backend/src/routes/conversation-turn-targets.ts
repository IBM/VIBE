import { Router } from 'express';
import type { Request, Response } from 'express';
import * as conversationTurnTargetsRepo from '../db/repositories/conversationTurnTargetsRepo';
import { asyncHandler } from '../lib/asyncHandler';
import { logError } from '../lib/logger';
import { parseIdParam } from '../lib/routeHelpers';

const router = Router();

// Get all turn targets for a conversation
router.get(
	'/conversation/:conversationId',
	asyncHandler(async (req: Request, res: Response) => {
		try {
			const conversationId = parseIdParam(res, req.params.conversationId, 'Invalid conversation ID');
			if (conversationId === null) {
				return;
			}
			const targets = conversationTurnTargetsRepo.listByConversationId(conversationId);

			return res.json(targets);
		} catch (error) {
			logError('Error fetching turn targets:', error);
			return res.status(500).json({ error: 'Failed to fetch turn targets' });
		}
	})
);

// Create or update turn target
router.put(
	'/',
	asyncHandler(async (req: Request, res: Response) => {
		try {
			const { conversation_id, user_sequence, target_reply, threshold, weight } = req.body;

			if (!conversation_id || user_sequence === undefined || !target_reply) {
				return res.status(400).json({ error: 'conversation_id, user_sequence, and target_reply are required' });
			}

			// Check if target already exists
			const exists = conversationTurnTargetsRepo.findByConversationAndSequence(conversation_id, user_sequence);

			if (exists) {
				// Update
				const updated = conversationTurnTargetsRepo.updateByConversationAndSequence(
					target_reply,
					threshold,
					weight,
					conversation_id,
					user_sequence
				);

				return res.json(updated);
			} else {
				// Insert
				const inserted = conversationTurnTargetsRepo.create(
					conversation_id,
					user_sequence,
					target_reply,
					threshold,
					weight
				);

				return res.status(201).json(inserted);
			}
		} catch (error) {
			logError('Error saving turn target:', error);
			return res.status(500).json({ error: 'Failed to save turn target' });
		}
	})
);

// Delete turn target
router.delete(
	'/:id',
	asyncHandler(async (req: Request, res: Response) => {
		try {
			const id = parseIdParam(res, req.params.id, 'Invalid turn target ID');
			if (id === null) {
				return;
			}
			conversationTurnTargetsRepo.deleteById(id);

			return res.status(204).send();
		} catch (error) {
			logError('Error deleting turn target:', error);

			return res.status(500).json({ error: 'Failed to delete turn target' });
		}
	})
);

export default router;
