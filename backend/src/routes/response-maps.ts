/**
 * Routes for global response maps.
 */
import { Router } from 'express';
import type { Request, Response } from 'express';
import * as templateRepo from '../db/repositories/templateRepo';
import { asyncHandler } from '../lib/asyncHandler';
import { logError } from '../lib/logger';
import { parseIdParam } from '../lib/routeHelpers';

const router = Router();

/**
 * GET /api/response-maps
 * List all response maps, optionally filtered by capability.
 */
router.get(
	'/',
	asyncHandler(async (req: Request, res: Response) => {
		try {
			const capability = req.query.capability as string | undefined;
			const maps = templateRepo.listResponseMaps(capability ? { capability } : undefined);
			return res.json(maps);
		} catch (error) {
			logError('Error fetching response maps:', error);
			return res.status(500).json({ error: 'Failed to fetch response maps' });
		}
	})
);

/**
 * GET /api/response-maps/capability-names
 * List all distinct capability names from response maps.
 */
router.get(
	'/capability-names',
	asyncHandler(async (_req: Request, res: Response) => {
		try {
			const names = templateRepo.listResponseMapCapabilityNames();
			return res.json(names);
		} catch (error) {
			logError('Error fetching capability names:', error);
			return res.status(500).json({ error: 'Failed to fetch capability names' });
		}
	})
);

/**
 * GET /api/response-maps/:id
 * Get a response map by ID.
 */
router.get(
	'/:id',
	asyncHandler(async (req: Request, res: Response) => {
		try {
			const id = parseIdParam(res, req.params.id, 'Invalid response map ID');
			if (id === null) {
				return;
			}

			const map = templateRepo.getResponseMapById(id);
			if (!map) {
				return res.status(404).json({ error: 'Response map not found' });
			}

			return res.json(map);
		} catch (error) {
			logError('Error fetching response map:', error);
			return res.status(500).json({ error: 'Failed to fetch response map' });
		}
	})
);

/**
 * POST /api/response-maps
 * Create a new response map.
 */
router.post(
	'/',
	asyncHandler(async (req: Request, res: Response) => {
		try {
			const { name, description, capability, spec } = req.body;

			if (!name || !spec) {
				return res.status(400).json({
					error: 'Name and spec are required fields'
				});
			}

			const map = templateRepo.createResponseMap({
				name,
				description,
				capability,
				spec
			});

			return res.status(201).json(map);
		} catch (error: any) {
			logError('Error creating response map:', error);

			if (error.message?.includes('UNIQUE constraint failed')) {
				return res.status(409).json({
					error: 'A response map with this name already exists'
				});
			}

			return res.status(500).json({ error: 'Failed to create response map' });
		}
	})
);

/**
 * PUT /api/response-maps/:id
 * Update a response map.
 */
router.put(
	'/:id',
	asyncHandler(async (req: Request, res: Response) => {
		try {
			const id = parseIdParam(res, req.params.id, 'Invalid response map ID');
			if (id === null) {
				return;
			}

			const { name, description, capability, spec } = req.body;
			const updates: any = {};

			if (name !== undefined) {
				updates.name = name;
			}
			if (description !== undefined) {
				updates.description = description;
			}
			if (capability !== undefined) {
				updates.capability = capability;
			}
			if (spec !== undefined) {
				updates.spec = spec;
			}

			const map = templateRepo.updateResponseMap(id, updates);
			if (!map) {
				return res.status(404).json({ error: 'Response map not found' });
			}

			return res.json(map);
		} catch (error: any) {
			logError('Error updating response map:', error);

			if (error.message?.includes('UNIQUE constraint failed')) {
				return res.status(409).json({
					error: 'A response map with this name already exists'
				});
			}

			return res.status(500).json({ error: 'Failed to update response map' });
		}
	})
);

/**
 * DELETE /api/response-maps/:id
 * Delete a response map.
 */
router.delete(
	'/:id',
	asyncHandler(async (req: Request, res: Response) => {
		try {
			const id = parseIdParam(res, req.params.id, 'Invalid response map ID');
			if (id === null) {
				return;
			}

			const existing = templateRepo.getResponseMapById(id);
			if (!existing) {
				return res.status(404).json({ error: 'Response map not found' });
			}

			templateRepo.deleteResponseMap(id);
			return res.status(204).send();
		} catch (error) {
			logError('Error deleting response map:', error);
			return res.status(500).json({ error: 'Failed to delete response map' });
		}
	})
);

export default router;
