import { Router } from 'express';
import type { Request, Response } from 'express';
import { getAgentById } from '../../db/queries';
import * as templateRepo from '../../db/repositories/templateRepo';
import type { AgentRequestTemplate } from '@ibm-vibe/types';
import { asyncHandler } from '../../lib/asyncHandler';
import { logError } from '../../lib/logger';
import { parseIdParam } from '../../lib/routeHelpers';
import { getCapabilityUpdate, toLegacyRequestTemplate } from './shared';

const router = Router();

router.get(
	'/capability-names/request-templates',
	asyncHandler((_req: Request, res: Response) => {
		try {
			const names = templateRepo.listRequestTemplateCapabilityNames();
			return res.json(names);
		} catch (error) {
			logError('Error listing request template capability names:', error);
			return res.status(500).json({ error: 'Failed to list capability names' });
		}
	})
);

router.get<{ id: string }>(
	'/:id/request-templates',
	asyncHandler((req: Request<{ id: string }>, res: Response) => {
		try {
			const agentId = parseIdParam(res, req.params.id, 'Invalid agent ID');
			if (agentId === null) {
				return;
			}
			const templates = templateRepo.getAgentTemplates(agentId);
			return res.json(
				templates.map((template) => toLegacyRequestTemplate(agentId, template, template.is_default))
			);
		} catch (error) {
			logError('Error listing request templates:', error);
			return res.status(500).json({ error: 'Failed to list request templates' });
		}
	})
);

router.post<{ id: string }, unknown, Omit<AgentRequestTemplate, 'id' | 'agent_id' | 'created_at'>>(
	'/:id/request-templates',
	asyncHandler(
		(
			req: Request<{ id: string }, unknown, Omit<AgentRequestTemplate, 'id' | 'agent_id' | 'created_at'>>,
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

				const { template_id, is_default, ...templateData } = req.body as Record<string, unknown> & {
					template_id?: number;
				};
				let templateToLink: templateRepo.RequestTemplate;

				if (template_id) {
					const existing = templateRepo.getRequestTemplateById(Number(template_id));
					if (!existing) {
						return res.status(404).json({ error: 'Template not found' });
					}
					templateToLink = existing;
				} else {
					if (!templateData.name || !templateData.body) {
						return res.status(400).json({ error: 'Name and body are required for new templates' });
					}
					const capability = getCapabilityUpdate(templateData);
					const uniqueName = templateRepo.getUniqueRequestTemplateName(String(templateData.name), agent.name);
					templateToLink = templateRepo.createRequestTemplate({
						name: uniqueName,
						description: templateData.description as string | undefined,
						capability: capability ?? undefined,
						body: String(templateData.body)
					});
				}

				templateRepo.linkTemplateToAgent(agentId, templateToLink.id!, Boolean(is_default));
				const link = templateRepo.getAgentTemplateLink(agentId, templateToLink.id!);
				const response = toLegacyRequestTemplate(agentId, templateToLink, link?.is_default);

				return res.status(201).json(response);
			} catch (error) {
				logError('Error creating request template:', error);
				return res.status(500).json({ error: 'Failed to create request template' });
			}
		}
	)
);

router.patch<
	{ id: string; templateId: string },
	unknown,
	Partial<Omit<AgentRequestTemplate, 'id' | 'agent_id' | 'created_at'>>
>(
	'/:id/request-templates/:templateId',
	asyncHandler(
		(
			req: Request<
				{ id: string; templateId: string },
				unknown,
				Partial<Omit<AgentRequestTemplate, 'id' | 'agent_id' | 'created_at'>>
			>,
			res: Response
		) => {
			try {
				const agentId = parseIdParam(res, req.params.id, 'Invalid agent ID');
				const tplId = parseIdParam(res, req.params.templateId, 'Invalid template ID');
				if (agentId === null || tplId === null) {
					return;
				}
				const agent = getAgentById(agentId);
				if (!agent) {
					return res.status(404).json({ error: 'Agent not found' });
				}

				const link = templateRepo.getAgentTemplateLink(agentId, tplId);
				if (!link) {
					return res.status(404).json({ error: 'Template not found' });
				}
				const existing = templateRepo.getRequestTemplateById(tplId);
				if (!existing) {
					return res.status(404).json({ error: 'Template not found' });
				}

				const capabilityUpdate = getCapabilityUpdate(req.body as Record<string, unknown>);
				const updates: Partial<templateRepo.RequestTemplate> = {};
				if (Object.prototype.hasOwnProperty.call(req.body, 'name')) {
					updates.name = (req.body as any).name;
				}
				if (Object.prototype.hasOwnProperty.call(req.body, 'description')) {
					updates.description = (req.body as any).description;
				}
				if (Object.prototype.hasOwnProperty.call(req.body, 'body')) {
					updates.body = (req.body as any).body;
				}
				if (capabilityUpdate !== undefined) {
					updates.capability = capabilityUpdate ?? undefined;
				}

				const wantsDefault = Boolean((req.body as any).is_default);
				const hasContentUpdates = Object.keys(updates).length > 0;
				const linkCount = templateRepo.getTemplateLinkCount(tplId);

				if (hasContentUpdates && linkCount > 1) {
					const baseName = updates.name ?? existing.name;
					const uniqueName = templateRepo.getUniqueRequestTemplateName(baseName, agent.name);
					const created = templateRepo.createRequestTemplate({
						name: uniqueName,
						description: updates.description ?? existing.description ?? undefined,
						capability: updates.capability ?? existing.capability ?? undefined,
						body: updates.body ?? existing.body
					});

					const shouldDefault = wantsDefault || Boolean(link.is_default);
					templateRepo.linkTemplateToAgent(agentId, created.id!, shouldDefault);
					const newLink = templateRepo.getAgentTemplateLink(agentId, created.id!);
					return res.json(
						toLegacyRequestTemplate(agentId, created, newLink?.is_default ?? (shouldDefault ? 1 : 0))
					);
				}

				const updated = templateRepo.updateRequestTemplate(tplId, updates);
				if (!updated) {
					return res.status(404).json({ error: 'Template not found' });
				}
				if (wantsDefault) {
					templateRepo.setAgentDefaultTemplate(agentId, tplId);
				}
				const updatedLink = templateRepo.getAgentTemplateLink(agentId, tplId);
				return res.json(toLegacyRequestTemplate(agentId, updated, updatedLink?.is_default));
			} catch (error) {
				logError('Error updating request template:', error);
				return res.status(500).json({ error: 'Failed to update request template' });
			}
		}
	)
);

router.delete<{ id: string; templateId: string }>(
	'/:id/request-templates/:templateId',
	asyncHandler((req: Request<{ id: string; templateId: string }>, res: Response) => {
		try {
			const agentId = parseIdParam(res, req.params.id, 'Invalid agent ID');
			const tplId = parseIdParam(res, req.params.templateId, 'Invalid template ID');
			if (agentId === null || tplId === null) {
				return;
			}
			const link = templateRepo.getAgentTemplateLink(agentId, tplId);
			if (!link) {
				return res.status(404).json({ error: 'Template not found' });
			}
			templateRepo.unlinkTemplateFromAgent(agentId, tplId);

			return res.status(204).send();
		} catch (error) {
			logError('Error deleting request template:', error);
			return res.status(500).json({ error: 'Failed to delete request template' });
		}
	})
);

router.post<{ id: string; templateId: string }>(
	'/:id/request-templates/:templateId/default',
	asyncHandler((req: Request<{ id: string; templateId: string }>, res: Response) => {
		try {
			const agentId = parseIdParam(res, req.params.id, 'Invalid agent ID');
			const tplId = parseIdParam(res, req.params.templateId, 'Invalid template ID');
			if (agentId === null || tplId === null) {
				return;
			}
			const link = templateRepo.getAgentTemplateLink(agentId, tplId);
			if (!link) {
				return res.status(404).json({ error: 'Template not found' });
			}
			templateRepo.setAgentDefaultTemplate(agentId, tplId);

			return res.status(204).send();
		} catch (error) {
			logError('Error setting default request template:', error);
			return res.status(500).json({ error: 'Failed to set default request template' });
		}
	})
);

router.get<{ id: string }>(
	'/:id/linked-templates',
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
			return res.json(templateRepo.getAgentTemplates(agentId));
		} catch (error) {
			logError('Error listing linked templates:', error);
			return res.status(500).json({ error: 'Failed to list linked templates' });
		}
	})
);

router.post<{ id: string }>(
	'/:id/linked-templates',
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

			const { template_id, is_default, ...templateData } = req.body;
			let templateToLink: templateRepo.RequestTemplate;

			if (template_id) {
				const existing = templateRepo.getRequestTemplateById(template_id);
				if (!existing) {
					return res.status(404).json({ error: 'Template not found' });
				}
				templateToLink = existing;
			} else {
				if (!templateData.name || !templateData.body) {
					return res.status(400).json({ error: 'Name and body are required for new templates' });
				}
				templateToLink = templateRepo.createRequestTemplate(templateData);
			}

			templateRepo.linkTemplateToAgent(agentId, templateToLink.id!, is_default);

			return res.status(201).json(templateToLink);
		} catch (error: any) {
			logError('Error linking template:', error);
			if (error.message?.includes('UNIQUE constraint failed')) {
				return res.status(409).json({ error: 'A template with this name already exists' });
			}
			return res.status(500).json({ error: 'Failed to link template' });
		}
	})
);

router.delete<{ id: string; templateId: string }>(
	'/:id/linked-templates/:templateId',
	asyncHandler((req: Request<{ id: string; templateId: string }>, res: Response) => {
		try {
			const agentId = parseIdParam(res, req.params.id, 'Invalid agent ID');
			const templateId = parseIdParam(res, req.params.templateId, 'Invalid template ID');
			if (agentId === null || templateId === null) {
				return;
			}

			templateRepo.unlinkTemplateFromAgent(agentId, templateId);
			return res.status(204).send();
		} catch (error) {
			logError('Error unlinking template:', error);
			return res.status(500).json({ error: 'Failed to unlink template' });
		}
	})
);

router.post<{ id: string; templateId: string }>(
	'/:id/linked-templates/:templateId/default',
	asyncHandler((req: Request<{ id: string; templateId: string }>, res: Response) => {
		try {
			const agentId = parseIdParam(res, req.params.id, 'Invalid agent ID');
			const templateId = parseIdParam(res, req.params.templateId, 'Invalid template ID');
			if (agentId === null || templateId === null) {
				return;
			}

			templateRepo.setAgentDefaultTemplate(agentId, templateId);
			return res.status(204).send();
		} catch (error) {
			logError('Error setting default template:', error);
			return res.status(500).json({ error: 'Failed to set default template' });
		}
	})
);

export default router;
