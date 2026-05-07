import { Router } from 'express';
import type { Request, Response } from 'express';
import { createAgent, getAgents, getAgentById, updateAgent, deleteAgent, getAgentsWithCount } from '../../db/queries';
import type { Agent } from '@ibm-vibe/types';
import { hasPaginationParams, validatePaginationOrError } from '../../utils/pagination';
import { asyncHandler } from '../../lib/asyncHandler';
import { logError } from '../../lib/logger';
import { parseIdParam } from '../../lib/routeHelpers';

const router = Router();

router.get(
	'/',
	asyncHandler(async (req: Request, res: Response) => {
		try {
			if (hasPaginationParams(req)) {
				const queryParams = validatePaginationOrError(req, res);
				if (!queryParams) {
					return;
				}

				const { data, total } = getAgentsWithCount(queryParams);

				return res.json({
					data,
					total,
					limit: queryParams.limit,
					offset: queryParams.offset
				});
			}

			const agents = await getAgents();
			return res.json(agents);
		} catch (error) {
			logError('Error fetching agents:', error);
			return res.status(500).json({ error: 'Failed to fetch agents' });
		}
	})
);

router.get<{ id: string }>(
	'/:id',
	asyncHandler(async (req: Request<{ id: string }>, res: Response) => {
		try {
			const agentId = parseIdParam(res, req.params.id, 'Invalid agent ID');
			if (agentId === null) {
				return;
			}
			const agent = await getAgentById(agentId);
			if (!agent) {
				return res.status(404).json({ error: 'Agent not found' });
			}
			return res.json(agent);
		} catch (error) {
			logError('Error fetching agent:', error);
			return res.status(500).json({ error: 'Failed to fetch agent' });
		}
	})
);

router.post<Record<string, never>, unknown, Omit<Agent, 'id' | 'created_at'>>(
	'/',
	asyncHandler(
		async (req: Request<Record<string, never>, unknown, Omit<Agent, 'id' | 'created_at'>>, res: Response) => {
			try {
				const { name, version, prompt, settings } = req.body;

				if (!name || !version || !prompt || !settings) {
					return res.status(400).json({
						error: 'Failed to create agent',
						details: 'Name, version, prompt, and settings are required fields'
					});
				}

				try {
					if (typeof settings === 'string') {
						JSON.parse(settings);
					}
				} catch {
					return res.status(400).json({
						error: 'Failed to create agent',
						details: 'Settings must be valid JSON'
					});
				}

				const agent = await createAgent(req.body);
				return res.status(201).json(agent);
			} catch (error) {
				logError('Error creating agent:', error);
				return res.status(500).json({
					error: 'Failed to create agent',
					details: error instanceof Error ? error.message : 'Unknown error'
				});
			}
		}
	)
);

router.put<{ id: string }, unknown, Partial<Agent>>(
	'/:id',
	asyncHandler(async (req: Request<{ id: string }, unknown, Partial<Agent>>, res: Response) => {
		try {
			const id = parseIdParam(res, req.params.id, 'Invalid agent ID');
			if (id === null) {
				return;
			}

			const existingAgent = await getAgentById(id);
			if (!existingAgent) {
				return res.status(404).json({ error: 'Agent not found' });
			}

			if (req.body.settings) {
				try {
					if (typeof req.body.settings === 'string') {
						JSON.parse(req.body.settings);
					}
				} catch {
					return res.status(400).json({
						error: 'Failed to update agent',
						details: 'Settings must be valid JSON'
					});
				}
			}

			const updatedAgent = await updateAgent(id, req.body);
			return res.json(updatedAgent);
		} catch (error) {
			logError('Error updating agent:', error);
			return res.status(500).json({
				error: 'Failed to update agent',
				details: error instanceof Error ? error.message : 'Unknown error'
			});
		}
	})
);

router.delete<{ id: string }>(
	'/:id',
	asyncHandler(async (req: Request<{ id: string }>, res: Response) => {
		try {
			const id = parseIdParam(res, req.params.id, 'Invalid agent ID');
			if (id === null) {
				return;
			}

			const existingAgent = await getAgentById(id);
			if (!existingAgent) {
				return res.status(404).json({ error: 'Agent not found' });
			}

			await deleteAgent(id);
			return res.status(204).send();
		} catch (error) {
			logError('Error deleting agent:', error);
			return res.status(500).json({
				error: 'Failed to delete agent',
				details: error instanceof Error ? error.message : 'Unknown error'
			});
		}
	})
);

export default router;
