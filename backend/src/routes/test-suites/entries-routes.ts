import { Router } from 'express';
import type { Request, Response } from 'express';
import {
	getTestSuiteById,
	getEntriesInSuite,
	addSuiteEntry,
	updateSuiteEntryOrder,
	deleteSuiteEntry,
	reorderSuiteEntries
} from '../../db/queries';
import { logError } from '../../lib/logger';
import { parseIdParam } from '../../lib/routeHelpers';
import { asyncHandler } from '../../lib/asyncHandler';

const router = Router();

router.get(
	'/:id/entries',
	asyncHandler(async (req: Request<{ id: string }>, res: Response) => {
		try {
			const suiteId = parseIdParam(res, req.params.id, 'Invalid test suite ID');
			if (suiteId === null) {
				return;
			}

			const existingTestSuite = await getTestSuiteById(suiteId);
			if (!existingTestSuite) {
				return res.status(404).json({ error: 'Test suite not found' });
			}

			const entries = getEntriesInSuite(suiteId);
			return res.json(entries);
		} catch (error) {
			logError(`Error fetching entries for suite ${req.params.id}:`, error);
			return res.status(500).json({ error: 'Failed to fetch entries for suite' });
		}
	})
);

router.post(
	'/:id/entries',
	asyncHandler(async (req: Request<{ id: string }>, res: Response) => {
		try {
			const suiteId = parseIdParam(res, req.params.id, 'Invalid test suite ID');
			if (suiteId === null) {
				return;
			}

			const { sequence, test_id, child_suite_id, agent_id_override } = req.body;

			if (!test_id && !child_suite_id) {
				return res.status(400).json({ error: 'Either test_id or child_suite_id must be provided' });
			}

			if (test_id && child_suite_id) {
				return res.status(400).json({ error: 'Cannot specify both test_id and child_suite_id' });
			}

			const existingTestSuite = await getTestSuiteById(suiteId);
			if (!existingTestSuite) {
				return res.status(404).json({ error: 'Test suite not found' });
			}

			const entry = addSuiteEntry({
				parent_suite_id: suiteId,
				sequence,
				test_id: test_id ? Number(test_id) : undefined,
				child_suite_id: child_suite_id ? Number(child_suite_id) : undefined,
				agent_id_override: agent_id_override ? Number(agent_id_override) : undefined
			});

			return res.status(201).json(entry);
		} catch (error) {
			logError(`Error adding entry to suite ${req.params.id}:`, error);
			return res.status(500).json({ error: 'Failed to add entry to suite' });
		}
	})
);

router.put(
	'/:id/entries/:entryId',
	asyncHandler(async (req: Request<{ id: string; entryId: string }>, res: Response) => {
		try {
			const entryId = parseIdParam(res, req.params.entryId, 'Invalid entry ID');
			if (entryId === null) {
				return;
			}

			const { sequence, agent_id_override } = req.body;

			updateSuiteEntryOrder(entryId, sequence, agent_id_override);
			return res.json({ message: 'Entry updated successfully' });
		} catch (error) {
			logError(`Error updating entry ${req.params.entryId}:`, error);
			return res.status(500).json({ error: 'Failed to update entry' });
		}
	})
);

router.delete(
	'/:id/entries/:entryId',
	asyncHandler(async (req: Request<{ id: string; entryId: string }>, res: Response) => {
		try {
			const entryId = parseIdParam(res, req.params.entryId, 'Invalid entry ID');
			if (entryId === null) {
				return;
			}

			deleteSuiteEntry(entryId);
			return res.status(204).send();
		} catch (error) {
			logError(`Error deleting entry ${req.params.entryId}:`, error);
			return res.status(500).json({ error: 'Failed to delete entry' });
		}
	})
);

router.put(
	'/:id/entries/reorder',
	asyncHandler(async (req: Request<{ id: string }>, res: Response) => {
		try {
			const suiteId = parseIdParam(res, req.params.id, 'Invalid test suite ID');
			if (suiteId === null) {
				return;
			}

			const { entry_orders } = req.body;
			if (!Array.isArray(entry_orders)) {
				return res.status(400).json({ error: 'entry_orders must be an array' });
			}

			for (const order of entry_orders) {
				if (
					!order.entry_id ||
					!order.sequence ||
					Number.isNaN(Number(order.entry_id)) ||
					Number.isNaN(Number(order.sequence))
				) {
					return res.status(400).json({ error: 'Each entry order must have valid entry_id and sequence' });
				}
			}

			const existingTestSuite = await getTestSuiteById(suiteId);
			if (!existingTestSuite) {
				return res.status(404).json({ error: 'Test suite not found' });
			}

			reorderSuiteEntries(suiteId, entry_orders);
			return res.json({ message: 'Entries reordered successfully' });
		} catch (error) {
			logError(`Error reordering entries in suite ${req.params.id}:`, error);
			return res.status(500).json({ error: 'Failed to reorder entries' });
		}
	})
);

export default router;
