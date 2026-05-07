import { Router } from 'express';
import type { Request, Response } from 'express';
import {
	getTestSuiteById,
	getEntriesInSuite,
	addSuiteEntry,
	reorderSuiteEntries,
	deleteSuiteEntry,
	getConversationById,
	getConversationMessages
} from '../../db/queries';
import { conversationToLegacyTest, isSingleTurnConversation } from '../../adapters/legacy-adapter';
import { logError, logWarn } from '../../lib/logger';
import { parseIdParam } from '../../lib/routeHelpers';
import { asyncHandler } from '../../lib/asyncHandler';

const router = Router();

router.get(
	'/:id/tests',
	asyncHandler(async (req: Request<{ id: string }>, res: Response) => {
		try {
			const id = parseIdParam(res, req.params.id, 'Invalid test suite ID');
			if (id === null) {
				return;
			}

			const existingTestSuite = await getTestSuiteById(id);
			if (!existingTestSuite) {
				return res.status(404).json({ error: 'Test suite not found' });
			}

			const entries = getEntriesInSuite(id);
			const tests = await Promise.all(
				entries
					.filter((entry) => entry.conversation_id)
					.map(async (entry) => {
						try {
							const conversation = await getConversationById(entry.conversation_id!);
							if (!conversation) return null;

							const messages = await getConversationMessages(entry.conversation_id!);
							if (isSingleTurnConversation(conversation, messages)) {
								const legacyTest = conversationToLegacyTest(conversation, messages);
								return {
									...legacyTest,
									sequence: entry.sequence
								};
							}
							return null;
						} catch (error) {
							logWarn(`Error processing entry ${entry.id}:`, error);
							return null;
						}
					})
			);

			const validTests = tests
				.filter((test) => test !== null)
				.sort((a, b) => (a?.sequence || 0) - (b?.sequence || 0));

			return res.json(validTests);
		} catch (error) {
			logError(`Error fetching tests for suite ${req.params.id}:`, error);
			return res.status(500).json({ error: 'Failed to fetch tests for suite' });
		}
	})
);

router.post(
	'/:id/tests',
	asyncHandler(async (req: Request<{ id: string }>, res: Response) => {
		try {
			const suiteId = parseIdParam(res, req.params.id, 'Invalid test suite ID');
			if (suiteId === null) {
				return;
			}

			const { test_id, sequence } = req.body;
			if (!test_id) {
				return res.status(400).json({ error: 'Valid test ID is required' });
			}
			const conversationId = parseIdParam(res, String(test_id), 'Valid test ID is required');
			if (conversationId === null) {
				return;
			}

			const existingTestSuite = await getTestSuiteById(suiteId);
			if (!existingTestSuite) {
				return res.status(404).json({ error: 'Test suite not found' });
			}

			const conversation = await getConversationById(conversationId);
			if (!conversation) {
				return res.status(404).json({ error: 'Test not found' });
			}

			const messages = await getConversationMessages(conversationId);
			if (!isSingleTurnConversation(conversation, messages)) {
				return res.status(400).json({ error: 'Cannot add multi-turn conversation as test to suite' });
			}

			const result = addSuiteEntry({
				parent_suite_id: suiteId,
				conversation_id: conversationId,
				sequence: sequence || null
			});

			return res.status(201).json(result);
		} catch (error) {
			logError(`Error adding test to suite ${req.params.id}:`, error);
			return res.status(500).json({ error: 'Failed to add test to suite' });
		}
	})
);

router.delete(
	'/:id/tests/:testId',
	asyncHandler(async (req: Request<{ id: string; testId: string }>, res: Response) => {
		try {
			const suiteId = parseIdParam(res, req.params.id, 'Invalid suite ID or test ID');
			const conversationId = parseIdParam(res, req.params.testId, 'Invalid suite ID or test ID');
			if (suiteId === null || conversationId === null) {
				return;
			}

			const existingTestSuite = await getTestSuiteById(suiteId);
			if (!existingTestSuite) {
				return res.status(404).json({ error: 'Test suite not found' });
			}

			const entries = getEntriesInSuite(suiteId);
			const entryToDelete = entries.find((entry) => entry.conversation_id === conversationId);

			if (!entryToDelete) {
				return res.status(404).json({ error: 'Test not found in suite' });
			}

			deleteSuiteEntry(entryToDelete.id);
			return res.status(204).send();
		} catch (error) {
			logError(`Error removing test ${req.params.testId} from suite ${req.params.id}:`, error);
			return res.status(500).json({ error: 'Failed to remove test from suite' });
		}
	})
);

router.put(
	'/:id/tests/reorder',
	asyncHandler(async (req: Request<{ id: string }>, res: Response) => {
		try {
			const suiteId = parseIdParam(res, req.params.id, 'Invalid test suite ID');
			if (suiteId === null) {
				return;
			}

			const { test_orders } = req.body;
			if (!Array.isArray(test_orders) || test_orders.length === 0) {
				return res.status(400).json({ error: 'Valid test orders array is required' });
			}

			const existingTestSuite = await getTestSuiteById(suiteId);
			if (!existingTestSuite) {
				return res.status(404).json({ error: 'Test suite not found' });
			}

			const entries = getEntriesInSuite(suiteId);
			const entryOrders = test_orders.map((order) => {
				const conversationId = order.test_id;
				const entry = entries.find((e) => e.conversation_id === conversationId);

				if (!entry) {
					throw new Error(`Test ${conversationId} not found in suite ${suiteId}`);
				}

				return {
					entry_id: entry.id,
					sequence: order.sequence
				};
			});

			reorderSuiteEntries(suiteId, entryOrders);
			return res.status(200).json({ success: true });
		} catch (error) {
			logError(`Error reordering tests in suite ${req.params.id}:`, error);
			return res.status(500).json({ error: 'Failed to reorder tests in suite' });
		}
	})
);

export default router;
