/**
 * Routes for global request templates.
 *
 * These templates are global resources that can be linked to multiple agents.
 */

import { Router } from 'express';
import type { Request, Response } from 'express';
import * as templateRepo from '../db/repositories/templateRepo';
import { asyncHandler } from '../lib/asyncHandler';
import { logError } from '../lib/logger';
import { parseIdParam } from '../lib/routeHelpers';

const router = Router();

// =====================
// REQUEST TEMPLATES
// =====================

/**
 * GET /api/templates
 * List all request templates, optionally filtered by capability.
 */
router.get(
	'/',
	asyncHandler(async (req: Request, res: Response) => {
		try {
			const capability = req.query.capability as string | undefined;
			const templates = templateRepo.listRequestTemplates(capability ? { capability } : undefined);
			return res.json(templates);
		} catch (error) {
			logError('Error fetching templates:', error);
			return res.status(500).json({ error: 'Failed to fetch templates' });
		}
	})
);

/**
 * GET /api/templates/capability-names
 * List all distinct capability names from request templates.
 */
router.get(
	'/capability-names',
	asyncHandler(async (_req: Request, res: Response) => {
		try {
			const names = templateRepo.listRequestTemplateCapabilityNames();
			return res.json(names);
		} catch (error) {
			logError('Error fetching capability names:', error);
			return res.status(500).json({ error: 'Failed to fetch capability names' });
		}
	})
);

/**
 * GET /api/templates/:id
 * Get a request template by ID.
 */
router.get(
	'/:id',
	asyncHandler(async (req: Request, res: Response) => {
		try {
			const id = parseIdParam(res, req.params.id, 'Invalid template ID');
			if (id === null) {
				return;
			}

			const template = templateRepo.getRequestTemplateById(id);
			if (!template) {
				return res.status(404).json({ error: 'Template not found' });
			}

			return res.json(template);
		} catch (error) {
			logError('Error fetching template:', error);
			return res.status(500).json({ error: 'Failed to fetch template' });
		}
	})
);

/**
 * POST /api/templates
 * Create a new request template.
 */
router.post(
	'/',
	asyncHandler(async (req: Request, res: Response) => {
		try {
			const { name, description, capability, body } = req.body;

			if (!name || !body) {
				return res.status(400).json({
					error: 'Name and body are required fields'
				});
			}

			const template = templateRepo.createRequestTemplate({
				name,
				description,
				capability,
				body
			});

			return res.status(201).json(template);
		} catch (error: any) {
			logError('Error creating template:', error);

			if (error.message?.includes('UNIQUE constraint failed')) {
				return res.status(409).json({
					error: 'A template with this name already exists'
				});
			}

			return res.status(500).json({ error: 'Failed to create template' });
		}
	})
);

/**
 * PUT /api/templates/:id
 * Update a request template.
 */
router.put(
	'/:id',
	asyncHandler(async (req: Request, res: Response) => {
		try {
			const id = parseIdParam(res, req.params.id, 'Invalid template ID');
			if (id === null) {
				return;
			}

			const { name, description, capability, body } = req.body;
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
			if (body !== undefined) {
				updates.body = body;
			}

			const template = templateRepo.updateRequestTemplate(id, updates);
			if (!template) {
				return res.status(404).json({ error: 'Template not found' });
			}

			return res.json(template);
		} catch (error: any) {
			logError('Error updating template:', error);

			if (error.message?.includes('UNIQUE constraint failed')) {
				return res.status(409).json({
					error: 'A template with this name already exists'
				});
			}

			return res.status(500).json({ error: 'Failed to update template' });
		}
	})
);

/**
 * DELETE /api/templates/:id
 * Delete a request template.
 */
router.delete(
	'/:id',
	asyncHandler(async (req: Request, res: Response) => {
		try {
			const id = parseIdParam(res, req.params.id, 'Invalid template ID');
			if (id === null) {
				return;
			}

			const existing = templateRepo.getRequestTemplateById(id);
			if (!existing) {
				return res.status(404).json({ error: 'Template not found' });
			}

			templateRepo.deleteRequestTemplate(id);
			return res.status(204).send();
		} catch (error) {
			logError('Error deleting template:', error);
			return res.status(500).json({ error: 'Failed to delete template' });
		}
	})
);

export default router;
