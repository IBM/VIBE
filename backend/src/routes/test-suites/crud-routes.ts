import { Router } from 'express';
import type { Request, Response } from 'express';
import {
	createTestSuite,
	getTestSuites,
	getTestSuiteById,
	updateTestSuite,
	deleteTestSuite,
	getTestSuitesWithCount
} from '../../db/queries';
import { suiteProcessingService } from '../../services/suite-processing-service';
import type { TestSuite } from '@ibm-vibe/types';
import { hasPaginationParams, validatePaginationOrError } from '../../utils/pagination';
import { logError, logWarn } from '../../lib/logger';
import { parseIdParam } from '../../lib/routeHelpers';
import { asyncHandler } from '../../lib/asyncHandler';

const router = Router();

router.get(
	'/',
	asyncHandler(async (req: Request, res: Response) => {
		try {
			if (hasPaginationParams(req)) {
				const paginationParams = validatePaginationOrError(req, res);
				if (!paginationParams) {
					return;
				}

				const { data, total } = getTestSuitesWithCount(paginationParams);
				const suitesWithCounts = data.map((suite: TestSuite) => {
					let testCount = 0;
					try {
						testCount = suiteProcessingService.countLeafTests(suite.id!);
					} catch (error) {
						logWarn(`Error calculating test count for suite ${suite.id}:`, error);
					}
					return { ...suite, test_count: testCount };
				});

				return res.json({ data: suitesWithCounts, total, ...paginationParams });
			}

			const suites = getTestSuites();
			const suitesWithCounts = suites.map((suite: TestSuite) => {
				let testCount = 0;
				try {
					testCount = suiteProcessingService.countLeafTests(suite.id!);
				} catch (error) {
					logWarn(`Error calculating test count for suite ${suite.id}:`, error);
				}
				return { ...suite, test_count: testCount };
			});

			return res.json(suitesWithCounts);
		} catch (error) {
			logError('Error fetching test suites:', error);
			return res.status(500).json({ error: 'Failed to fetch test suites' });
		}
	})
);

router.get(
	'/:id',
	asyncHandler(async (req: Request<{ id: string }>, res: Response) => {
		try {
			const id = parseIdParam(res, req.params.id, 'Invalid test suite ID');
			if (id === null) {
				return;
			}

			const testSuite = await getTestSuiteById(id);
			if (!testSuite) {
				return res.status(404).json({ error: 'Test suite not found' });
			}

			return res.json(testSuite);
		} catch (error) {
			logError(`Error fetching test suite ${req.params.id}:`, error);
			return res.status(500).json({ error: 'Failed to fetch test suite' });
		}
	})
);

router.post(
	'/',
	asyncHandler(async (req: Request, res: Response) => {
		try {
			const { name, description, tags } = req.body;

			if (!name) {
				return res.status(400).json({ error: 'Test suite name is required' });
			}

			const testSuite = createTestSuite({ name, description, tags });
			return res.status(201).json(testSuite);
		} catch (error) {
			logError('Error creating test suite:', error);
			return res.status(500).json({ error: 'Failed to create test suite' });
		}
	})
);

router.put(
	'/:id',
	asyncHandler(async (req: Request<{ id: string }>, res: Response) => {
		try {
			const id = parseIdParam(res, req.params.id, 'Invalid test suite ID');
			if (id === null) {
				return;
			}

			const { name, description, tags } = req.body;

			const existingTestSuite = await getTestSuiteById(id);
			if (!existingTestSuite) {
				return res.status(404).json({ error: 'Test suite not found' });
			}

			const updatedTestSuite = updateTestSuite(id, { name, description, tags });
			return res.json(updatedTestSuite);
		} catch (error) {
			logError(`Error updating test suite ${req.params.id}:`, error);
			return res.status(500).json({ error: 'Failed to update test suite' });
		}
	})
);

router.delete(
	'/:id',
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

			deleteTestSuite(id);
			return res.status(204).send();
		} catch (error) {
			logError(`Error deleting test suite ${req.params.id}:`, error);
			return res.status(500).json({ error: 'Failed to delete test suite' });
		}
	})
);

export default router;
