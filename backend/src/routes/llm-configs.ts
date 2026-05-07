import express from 'express';
import type { Request, Response } from 'express';
import { LLMConfig } from '@ibm-vibe/types';
import { llmConfigService, LLMRequestOptions } from '../services/llm-config-service';
import { createLLMConfig, updateLLMConfig, deleteLLMConfig, getLLMConfigsWithCount } from '../db/queries';
import { hasPaginationParams, validatePaginationOrError } from '../utils/pagination';
import { asyncHandler } from '../lib/asyncHandler';
import { logError } from '../lib/logger';
import { parseIdParam } from '../lib/routeHelpers';

const router = express.Router();

/**
 * Get all LLM configs ordered by priority
 */
router.get(
	'/',
	asyncHandler(async (req: Request, res: Response) => {
		try {
			if (hasPaginationParams(req)) {
				const queryParams = validatePaginationOrError(req, res);
				if (!queryParams) {
					return;
				}

				const { data, total } = getLLMConfigsWithCount(queryParams);
				return res.json({
					data,
					total,
					limit: queryParams.limit,
					offset: queryParams.offset
				});
			}

			const configs = llmConfigService.getConfigs();
			return res.json(configs);
		} catch (error: any) {
			logError('Error fetching LLM configs:', error);
			return res.status(500).json({ error: error.message });
		}
	})
);

/**
 * Get a single LLM config by ID
 */
router.get(
	'/:id',
	asyncHandler(async (req: Request, res: Response) => {
		try {
			const id = parseIdParam(res, req.params.id, 'Invalid ID format');
			if (id === null) {
				return;
			}

			const config = llmConfigService.getConfigById(id);
			if (!config) {
				return res.status(404).json({ error: 'LLM config not found' });
			}

			return res.json(config);
		} catch (error: any) {
			logError('Error fetching LLM config:', error);
			return res.status(500).json({ error: error.message });
		}
	})
);

/**
 * Create a new LLM config
 */
router.post(
	'/',
	asyncHandler(async (req: Request, res: Response) => {
		try {
			const { name, provider, config, priority } = req.body;

			// Validate required fields
			if (!name || !provider || !config) {
				return res
					.status(400)
					.json({ error: 'Missing required fields: name, provider, and config are required' });
			}

			// Convert config to string if it's an object
			const configStr = typeof config === 'string' ? config : JSON.stringify(config);

			// Create the new LLM config
			const newConfig: LLMConfig = {
				name,
				provider,
				config: configStr,
				priority: priority || 100
			};

			const createdConfig = createLLMConfig(newConfig);
			return res.status(201).json(createdConfig);
		} catch (error: any) {
			logError('Error creating LLM config:', error);
			return res.status(500).json({ error: error.message });
		}
	})
);

/**
 * Update an existing LLM config
 */
router.put(
	'/:id',
	asyncHandler(async (req: Request, res: Response) => {
		try {
			const id = parseIdParam(res, req.params.id, 'Invalid ID format');
			if (id === null) {
				return;
			}

			const { name, provider, config, priority } = req.body;

			// Convert config to string if it's an object
			let configStr = config;
			if (config && typeof config !== 'string') {
				configStr = JSON.stringify(config);
			}

			// Create the update object
			const updates: Partial<LLMConfig> = {};
			updates.name = name ? name : updates.name;
			updates.provider = provider ? provider : updates.provider;
			updates.config = configStr ? configStr : updates.config;
			updates.priority = priority ? priority : updates.priority;

			// Update the LLM config
			const updatedConfig = updateLLMConfig(id, updates);
			if (!updatedConfig) {
				return res.status(404).json({ error: 'LLM config not found' });
			}

			return res.json(updatedConfig);
		} catch (error: any) {
			logError('Error updating LLM config:', error);
			return res.status(500).json({ error: error.message });
		}
	})
);

/**
 * Delete an LLM config
 */
router.delete(
	'/:id',
	asyncHandler(async (req: Request, res: Response) => {
		try {
			const id = parseIdParam(res, req.params.id, 'Invalid ID format');
			if (id === null) {
				return;
			}

			const result = deleteLLMConfig(id);
			if (result.changes === 0) {
				return res.status(404).json({ error: 'LLM config not found' });
			}

			return res.status(204).send();
		} catch (error: any) {
			logError('Error deleting LLM config:', error);
			return res.status(500).json({ error: error.message });
		}
	})
);

/**
 * Call a specific LLM config
 */
router.post(
	'/:id/call',
	asyncHandler(async (req: Request, res: Response) => {
		try {
			const id = parseIdParam(res, req.params.id, 'Invalid ID format');
			if (id === null) {
				return;
			}

			const { prompt, max_tokens, temperature, stop } = req.body;
			if (!prompt) {
				return res.status(400).json({ error: 'Prompt is required' });
			}

			const options: LLMRequestOptions = {
				prompt,
				max_tokens,
				temperature,
				stop
			};

			const response = await llmConfigService.callLLM(id, options);
			if (response.error) {
				return res.status(500).json({ error: response.error });
			}

			return res.json(response);
		} catch (error: any) {
			logError('Error calling LLM config:', error);
			return res.status(500).json({ error: error.message });
		}
	})
);

/**
 * Call LLMs in priority order until one succeeds
 */
router.post(
	'/call',
	asyncHandler(async (req: Request, res: Response) => {
		try {
			const { prompt, max_tokens, temperature, stop } = req.body;
			if (!prompt) {
				return res.status(400).json({ error: 'Prompt is required' });
			}

			const options: LLMRequestOptions = {
				prompt,
				max_tokens,
				temperature,
				stop
			};

			const response = await llmConfigService.callLLMWithFallback(options);
			return res.json(response);
		} catch (error: any) {
			logError('Error calling LLM fallback chain:', error);
			return res.status(500).json({ error: error.message });
		}
	})
);

export default router;
