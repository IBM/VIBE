import { Router } from 'express';
import type { Request, Response } from 'express';
import { getAgentById } from '../../db/queries';
import * as templateRepo from '../../db/repositories/templateRepo';
import type { AgentResponseMap } from '@ibm-vibe/types';
import { asyncHandler } from '../../lib/asyncHandler';
import { logError } from '../../lib/logger';
import { parseIdParam } from '../../lib/routeHelpers';
import { getCapabilityUpdate, toLegacyResponseMap } from './shared';

const router = Router();

router.get(
	'/capability-names/response-maps',
	asyncHandler((_req: Request, res: Response) => {
		try {
			const names = templateRepo.listResponseMapCapabilityNames();
			return res.json(names);
		} catch (error) {
			logError('Error listing response map capability names:', error);
			return res.status(500).json({ error: 'Failed to list capability names' });
		}
	})
);

router.get<{ id: string }>(
	'/:id/response-maps',
	asyncHandler((req: Request<{ id: string }>, res: Response) => {
		try {
			const agentId = parseIdParam(res, req.params.id, 'Invalid agent ID');
			if (agentId === null) {
				return;
			}
			const maps = templateRepo.getAgentResponseMaps(agentId);
			return res.json(maps.map((map) => toLegacyResponseMap(agentId, map, map.is_default)));
		} catch (error) {
			logError('Error listing response maps:', error);
			return res.status(500).json({ error: 'Failed to list response maps' });
		}
	})
);

router.post<{ id: string }, unknown, Omit<AgentResponseMap, 'id' | 'agent_id' | 'created_at'>>(
	'/:id/response-maps',
	asyncHandler(
		(
			req: Request<{ id: string }, unknown, Omit<AgentResponseMap, 'id' | 'agent_id' | 'created_at'>>,
			res: Response
		) => {
			try {
				const agentId = parseIdParam(res, req.params.id, 'Invalid agent ID');
				if (agentId === null) {
					return;
				}
				const agent = getAgentById(agentId);
				if (!agent) {
					return res.status(404).json({ error: 'Agent not found' });
				}

				const { response_map_id, is_default, ...mapData } = req.body as Record<string, unknown> & {
					response_map_id?: number;
				};
				let mapToLink: templateRepo.ResponseMap;

				if (response_map_id) {
					const existing = templateRepo.getResponseMapById(Number(response_map_id));
					if (!existing) {
						return res.status(404).json({ error: 'Response map not found' });
					}
					mapToLink = existing;
				} else {
					if (!mapData.name || !mapData.spec) {
						return res.status(400).json({ error: 'Name and spec are required for new response maps' });
					}
					const capability = getCapabilityUpdate(mapData);
					const uniqueName = templateRepo.getUniqueResponseMapName(String(mapData.name), agent.name);
					mapToLink = templateRepo.createResponseMap({
						name: uniqueName,
						description: mapData.description as string | undefined,
						capability: capability ?? undefined,
						spec: String(mapData.spec)
					});
				}

				templateRepo.linkResponseMapToAgent(agentId, mapToLink.id!, Boolean(is_default));
				const link = templateRepo.getAgentResponseMapLink(agentId, mapToLink.id!);
				const response = toLegacyResponseMap(agentId, mapToLink, link?.is_default);

				return res.status(201).json(response);
			} catch (error) {
				logError('Error creating response map:', error);
				return res.status(500).json({ error: 'Failed to create response map' });
			}
		}
	)
);

router.patch<{ id: string; mapId: string }, unknown, Partial<Omit<AgentResponseMap, 'id' | 'agent_id' | 'created_at'>>>(
	'/:id/response-maps/:mapId',
	asyncHandler(
		(
			req: Request<
				{ id: string; mapId: string },
				unknown,
				Partial<Omit<AgentResponseMap, 'id' | 'agent_id' | 'created_at'>>
			>,
			res: Response
		) => {
			try {
				const agentId = parseIdParam(res, req.params.id, 'Invalid agent ID');
				const mapId = parseIdParam(res, req.params.mapId, 'Invalid response map ID');
				if (agentId === null || mapId === null) {
					return;
				}
				const agent = getAgentById(agentId);
				if (!agent) {
					return res.status(404).json({ error: 'Agent not found' });
				}

				const link = templateRepo.getAgentResponseMapLink(agentId, mapId);
				if (!link) {
					return res.status(404).json({ error: 'Response map not found' });
				}
				const existing = templateRepo.getResponseMapById(mapId);
				if (!existing) {
					return res.status(404).json({ error: 'Response map not found' });
				}

				const capabilityUpdate = getCapabilityUpdate(req.body as Record<string, unknown>);
				const updates: Partial<templateRepo.ResponseMap> = {};
				if (Object.prototype.hasOwnProperty.call(req.body, 'name')) {
					updates.name = (req.body as any).name;
				}
				if (Object.prototype.hasOwnProperty.call(req.body, 'description')) {
					updates.description = (req.body as any).description;
				}
				if (Object.prototype.hasOwnProperty.call(req.body, 'spec')) {
					updates.spec = (req.body as any).spec;
				}
				if (capabilityUpdate !== undefined) {
					updates.capability = capabilityUpdate ?? undefined;
				}

				const wantsDefault = Boolean((req.body as any).is_default);
				const hasContentUpdates = Object.keys(updates).length > 0;
				const linkCount = templateRepo.getResponseMapLinkCount(mapId);

				if (hasContentUpdates && linkCount > 1) {
					const baseName = updates.name ?? existing.name;
					const uniqueName = templateRepo.getUniqueResponseMapName(baseName, agent.name);
					const created = templateRepo.createResponseMap({
						name: uniqueName,
						description: updates.description ?? existing.description ?? undefined,
						capability: updates.capability ?? existing.capability ?? undefined,
						spec: updates.spec ?? existing.spec
					});

					const shouldDefault = wantsDefault || Boolean(link.is_default);
					templateRepo.linkResponseMapToAgent(agentId, created.id!, shouldDefault);
					const newLink = templateRepo.getAgentResponseMapLink(agentId, created.id!);
					return res.json(
						toLegacyResponseMap(agentId, created, newLink?.is_default ?? (shouldDefault ? 1 : 0))
					);
				}

				const updated = templateRepo.updateResponseMap(mapId, updates);
				if (!updated) {
					return res.status(404).json({ error: 'Response map not found' });
				}
				if (wantsDefault) {
					templateRepo.setAgentDefaultResponseMap(agentId, mapId);
				}
				const updatedLink = templateRepo.getAgentResponseMapLink(agentId, mapId);
				return res.json(toLegacyResponseMap(agentId, updated, updatedLink?.is_default));
			} catch (error) {
				logError('Error updating response map:', error);
				return res.status(500).json({ error: 'Failed to update response map' });
			}
		}
	)
);

router.delete<{ id: string; mapId: string }>(
	'/:id/response-maps/:mapId',
	asyncHandler((req: Request<{ id: string; mapId: string }>, res: Response) => {
		try {
			const agentId = parseIdParam(res, req.params.id, 'Invalid agent ID');
			const mapId = parseIdParam(res, req.params.mapId, 'Invalid response map ID');
			if (agentId === null || mapId === null) {
				return;
			}
			const link = templateRepo.getAgentResponseMapLink(agentId, mapId);
			if (!link) {
				return res.status(404).json({ error: 'Response map not found' });
			}
			templateRepo.unlinkResponseMapFromAgent(agentId, mapId);

			return res.status(204).send();
		} catch (error) {
			logError('Error deleting response map:', error);
			return res.status(500).json({ error: 'Failed to delete response map' });
		}
	})
);

router.post<{ id: string; mapId: string }>(
	'/:id/response-maps/:mapId/default',
	asyncHandler((req: Request<{ id: string; mapId: string }>, res: Response) => {
		try {
			const agentId = parseIdParam(res, req.params.id, 'Invalid agent ID');
			const mapId = parseIdParam(res, req.params.mapId, 'Invalid response map ID');
			if (agentId === null || mapId === null) {
				return;
			}
			const link = templateRepo.getAgentResponseMapLink(agentId, mapId);
			if (!link) {
				return res.status(404).json({ error: 'Response map not found' });
			}
			templateRepo.setAgentDefaultResponseMap(agentId, mapId);

			return res.status(204).send();
		} catch (error) {
			logError('Error setting default response map:', error);
			return res.status(500).json({ error: 'Failed to set default response map' });
		}
	})
);

router.get<{ id: string }>(
	'/:id/linked-response-maps',
	asyncHandler((req: Request<{ id: string }>, res: Response) => {
		try {
			const agentId = parseIdParam(res, req.params.id, 'Invalid agent ID');
			if (agentId === null) {
				return;
			}
			const agent = getAgentById(agentId);
			if (!agent) {
				return res.status(404).json({ error: 'Agent not found' });
			}
			return res.json(templateRepo.getAgentResponseMaps(agentId));
		} catch (error) {
			logError('Error listing linked response maps:', error);
			return res.status(500).json({ error: 'Failed to list linked response maps' });
		}
	})
);

router.post<{ id: string }>(
	'/:id/linked-response-maps',
	asyncHandler((req: Request<{ id: string }>, res: Response) => {
		try {
			const agentId = parseIdParam(res, req.params.id, 'Invalid agent ID');
			if (agentId === null) {
				return;
			}
			const agent = getAgentById(agentId);
			if (!agent) {
				return res.status(404).json({ error: 'Agent not found' });
			}

			const { response_map_id, is_default, ...mapData } = req.body;
			let mapToLink: templateRepo.ResponseMap;

			if (response_map_id) {
				const existing = templateRepo.getResponseMapById(response_map_id);
				if (!existing) {
					return res.status(404).json({ error: 'Response map not found' });
				}
				mapToLink = existing;
			} else {
				if (!mapData.name || !mapData.spec) {
					return res.status(400).json({ error: 'Name and spec are required for new response maps' });
				}
				mapToLink = templateRepo.createResponseMap(mapData);
			}

			templateRepo.linkResponseMapToAgent(agentId, mapToLink.id!, is_default);

			return res.status(201).json(mapToLink);
		} catch (error: any) {
			logError('Error linking response map:', error);
			if (error.message?.includes('UNIQUE constraint failed')) {
				return res.status(409).json({ error: 'A response map with this name already exists' });
			}
			return res.status(500).json({ error: 'Failed to link response map' });
		}
	})
);

router.delete<{ id: string; mapId: string }>(
	'/:id/linked-response-maps/:mapId',
	asyncHandler((req: Request<{ id: string; mapId: string }>, res: Response) => {
		try {
			const agentId = parseIdParam(res, req.params.id, 'Invalid agent ID');
			const mapId = parseIdParam(res, req.params.mapId, 'Invalid response map ID');
			if (agentId === null || mapId === null) {
				return;
			}

			templateRepo.unlinkResponseMapFromAgent(agentId, mapId);
			return res.status(204).send();
		} catch (error) {
			logError('Error unlinking response map:', error);
			return res.status(500).json({ error: 'Failed to unlink response map' });
		}
	})
);

router.post<{ id: string; mapId: string }>(
	'/:id/linked-response-maps/:mapId/default',
	asyncHandler((req: Request<{ id: string; mapId: string }>, res: Response) => {
		try {
			const agentId = parseIdParam(res, req.params.id, 'Invalid agent ID');
			const mapId = parseIdParam(res, req.params.mapId, 'Invalid response map ID');
			if (agentId === null || mapId === null) {
				return;
			}

			templateRepo.setAgentDefaultResponseMap(agentId, mapId);
			return res.status(204).send();
		} catch (error) {
			logError('Error setting default response map:', error);
			return res.status(500).json({ error: 'Failed to set default response map' });
		}
	})
);

export default router;
