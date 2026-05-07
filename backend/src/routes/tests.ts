import { Router } from 'express';
import type { Request, Response } from 'express';
import {
	createConversation,
	getConversations,
	getConversationById,
	updateConversation,
	deleteConversation,
	getConversationsWithCount,
	addMessageToConversation,
	getConversationMessages,
	updateConversationMessage
} from '../db/queries';
import type { Test } from '@ibm-vibe/types';
import { hasPaginationParams, validatePaginationOrError } from '../utils/pagination';
import {
	conversationToLegacyTest,
	legacyTestToConversation,
	isSingleTurnConversation
} from '../adapters/legacy-adapter';
import db from '../db/database';
import { asyncHandler } from '../lib/asyncHandler';
import { logError, logWarn } from '../lib/logger';
import { parseIdParam } from '../lib/routeHelpers';

const router = Router();

// Get all tests (from conversations)
router.get(
	'/',
	asyncHandler(async (req: Request, res: Response) => {
		try {
			if (hasPaginationParams(req)) {
				const queryParams = validatePaginationOrError(req, res);
				if (!queryParams) {
					return;
				}

				const { data } = getConversationsWithCount(queryParams);

				// Filter to single-turn conversations and transform to legacy test format
				const legacyTests = await Promise.all(
					data.map(async (conversation) => {
						const messages = await getConversationMessages(conversation.id!);
						// Only include single-turn conversations as "tests"
						if (isSingleTurnConversation(conversation, messages)) {
							return conversationToLegacyTest(conversation, messages);
						}
						return null;
					})
				);

				// Filter out null values (multi-turn conversations)
				const filteredTests = legacyTests.filter((test) => test !== null) as Test[];

				return res.json({
					data: filteredTests,
					total: filteredTests.length, // Note: this changes the total count from conversations to single-turn only
					limit: queryParams.limit,
					offset: queryParams.offset
				});
			}

			const conversations = await getConversations();

			// Transform conversations to legacy tests format
			const legacyTests = await Promise.all(
				conversations.map(async (conversation) => {
					const messages = await getConversationMessages(conversation.id!);
					// Only include single-turn conversations as "tests"
					if (isSingleTurnConversation(conversation, messages)) {
						return conversationToLegacyTest(conversation, messages);
					}
					return null;
				})
			);

			// Filter out null values (multi-turn conversations)
			const filteredTests = legacyTests.filter((test) => test !== null) as Test[];

			return res.json(filteredTests);
		} catch (error) {
			logError('Error fetching tests:', error);
			return res.status(500).json({ error: 'Failed to fetch tests' });
		}
	})
);

// Get test by ID (from conversation)
router.get(
	'/:id',
	asyncHandler(async (req: Request<{ id: string }>, res: Response) => {
		try {
			const conversationId = parseIdParam(res, req.params.id, 'Invalid test ID');
			if (conversationId === null) {
				return;
			}
			const conversation = await getConversationById(conversationId);

			if (!conversation) {
				return res.status(404).json({ error: 'Test not found' });
			}

			const messages = await getConversationMessages(conversationId);

			// Ensure this is a single-turn conversation (valid as a "test")
			if (!isSingleTurnConversation(conversation, messages)) {
				return res.status(404).json({ error: 'Test not found (multi-turn conversation)' });
			}

			const legacyTest = conversationToLegacyTest(conversation, messages);
			return res.json(legacyTest);
		} catch (error) {
			logError('Error fetching test:', error);
			return res.status(500).json({ error: 'Failed to fetch test' });
		}
	})
);

// Create new test (as conversation)
router.post(
	'/',
	asyncHandler(
		async (
			req: Request<Record<string, never>, unknown, Omit<Test, 'id' | 'created_at' | 'updated_at'>>,
			res: Response
		) => {
			try {
				const { name, input } = req.body;

				// Validate required fields
				if (!name || !input) {
					return res.status(400).json({
						error: 'Failed to create test',
						details: 'Name and input are required fields'
					});
				}

				// Transform legacy test to conversation format
				const { conversation, messages } = legacyTestToConversation(req.body);
				const createdConversation = await createConversation(conversation);

				// Add the user message
				const createdMessage = await addMessageToConversation({
					conversation_id: createdConversation.id!,
					...messages[0]
				});

				// If expected_output provided, upsert as turn target for user turn 1
				try {
					if (createdConversation.id && req.body.expected_output && String(req.body.expected_output).trim()) {
						db.exec(`
					INSERT INTO conversation_turn_targets (conversation_id, user_sequence, target_reply)
					VALUES (${createdConversation.id}, 1, ${db.prepare('?').bind(String(req.body.expected_output).trim()).source})
					ON CONFLICT (conversation_id, user_sequence)
					DO UPDATE SET target_reply = excluded.target_reply, updated_at = CURRENT_TIMESTAMP;
				`);
					}
				} catch (e) {
					logWarn('Failed to set turn target from legacy expected_output on create', e);
				}

				// Transform back to legacy test format for response
				const legacyTest = conversationToLegacyTest(createdConversation, [createdMessage]);

				return res.status(201).json(legacyTest);
			} catch (error) {
				logError('Error creating test:', error);
				return res.status(500).json({
					error: 'Failed to create test',
					details: error instanceof Error ? error.message : 'Unknown error'
				});
			}
		}
	)
);

// Update test (conversation)
router.put(
	'/:id',
	asyncHandler(async (req: Request<{ id: string }, unknown, Partial<Test>>, res: Response) => {
		try {
			const conversationId = parseIdParam(res, req.params.id, 'Invalid test ID');
			if (conversationId === null) {
				return;
			}

			// Check if conversation exists and is single-turn
			const conversation = await getConversationById(conversationId);
			if (!conversation) {
				return res.status(404).json({ error: 'Test not found' });
			}

			const messages = await getConversationMessages(conversationId);
			if (!isSingleTurnConversation(conversation, messages)) {
				return res.status(400).json({ error: 'Cannot update multi-turn conversation as test' });
			}

			// Update conversation metadata
			const conversationUpdates: any = {};
			if (req.body.name) conversationUpdates.name = req.body.name;
			if (req.body.description !== undefined) conversationUpdates.description = req.body.description;

			const updatedConversation = await updateConversation(conversationId, conversationUpdates);
			if (!updatedConversation) {
				return res.status(404).json({ error: 'Test not found' });
			}

			// Update user message if input changed
			if (req.body.input !== undefined) {
				const userMessage = messages.find((m) => m.role === 'user');
				if (userMessage) {
					await updateConversationMessage(userMessage.id!, { content: req.body.input });
				}
			}

			// If expected_output provided, upsert as turn target for user turn 1
			try {
				if (req.body.expected_output && String(req.body.expected_output).trim()) {
					db.exec(`
					INSERT INTO conversation_turn_targets (conversation_id, user_sequence, target_reply)
					VALUES (${conversationId}, 1, ${db.prepare('?').bind(String(req.body.expected_output).trim()).source})
					ON CONFLICT (conversation_id, user_sequence)
					DO UPDATE SET target_reply = excluded.target_reply, updated_at = CURRENT_TIMESTAMP;
				`);
				}
			} catch (e) {
				logWarn('Failed to set turn target from legacy expected_output on update', e);
			}

			// Get updated messages and return as legacy test
			const updatedMessages = await getConversationMessages(conversationId);
			const legacyTest = conversationToLegacyTest(updatedConversation, updatedMessages);

			return res.json(legacyTest);
		} catch (error) {
			logError('Error updating test:', error);
			return res.status(500).json({ error: 'Failed to update test' });
		}
	})
);

// Delete test (conversation)
router.delete(
	'/:id',
	asyncHandler(async (req: Request<{ id: string }>, res: Response) => {
		try {
			const conversationId = parseIdParam(res, req.params.id, 'Invalid test ID');
			if (conversationId === null) {
				return;
			}

			// Check if conversation exists and is single-turn
			const conversation = await getConversationById(conversationId);
			if (!conversation) {
				return res.status(404).json({ error: 'Test not found' });
			}

			const messages = await getConversationMessages(conversationId);
			if (!isSingleTurnConversation(conversation, messages)) {
				return res.status(400).json({ error: 'Cannot delete multi-turn conversation as test' });
			}

			await deleteConversation(conversationId);
			return res.status(204).send();
		} catch (error) {
			logError('Error deleting test:', error);
			return res.status(500).json({
				error: 'Failed to delete test',
				details: error instanceof Error ? error.message : 'Unknown error'
			});
		}
	})
);

export default router;
