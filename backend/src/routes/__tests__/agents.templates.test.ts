import agentRoutes from '../agents';
import * as templateRepo from '../../db/repositories/templateRepo';
import * as queries from '../../db/queries';

jest.mock('../../db/repositories/templateRepo');
jest.mock('../../db/queries');

const mockedRepo = templateRepo as jest.Mocked<typeof templateRepo>;
const mockedQueries = queries as jest.Mocked<typeof queries>;

type MockResponse = {
	statusCode: number;
	body?: unknown;
	status: (code: number) => MockResponse;
	json: (data: unknown) => MockResponse;
	send: (data?: unknown) => MockResponse;
};

const createMockResponse = (): MockResponse => {
	const res = {
		statusCode: 200,
		body: undefined,
		status(code: number) {
			this.statusCode = code;
			return this;
		},
		json(data: unknown) {
			this.body = data;
			return this;
		},
		send(data?: unknown) {
			this.body = data;
			return this;
		}
	} as MockResponse;
	return res;
};

const getRouteHandler = (router: any, method: 'get' | 'post' | 'patch' | 'delete', path: string) => {
	const layer = router.stack.find((entry: any) => entry.route?.path === path && entry.route?.methods?.[method]);
	if (!layer) {
		throw new Error(`Route not found: ${method.toUpperCase()} ${path}`);
	}
	return layer.route.stack[0].handle;
};

const callRoute = async (
	router: any,
	method: 'get' | 'post' | 'patch' | 'delete',
	path: string,
	options?: { params?: Record<string, string>; query?: Record<string, string>; body?: Record<string, unknown> }
) => {
	const handler = getRouteHandler(router, method, path);
	const req = {
		params: options?.params ?? {},
		query: options?.query ?? {},
		body: options?.body ?? {}
	} as any;
	const res = createMockResponse();
	await handler(req, res);
	return res;
};

describe('agent legacy template routes (HTTP)', () => {
	beforeEach(() => {
		jest.clearAllMocks();
	});

	describe('request templates', () => {
		it('GET /api/agents/:id/request-templates maps capabilities and legacy fields', async () => {
			mockedRepo.getAgentTemplates.mockReturnValue([
				{
					id: 2,
					name: 'T1',
					description: 'desc',
					body: '{}',
					capability: '{"name":"openai-chat"}',
					is_default: 1,
					created_at: '2024-01-01'
				}
			] as any);

			const response = await callRoute(agentRoutes, 'get', '/:id/request-templates', {
				params: { id: '1' }
			});

			expect(response.statusCode).toBe(200);
			expect(response.body).toEqual([
				{
					id: 2,
					agent_id: 1,
					name: 'T1',
					description: 'desc',
					engine: null,
					content_type: null,
					body: '{}',
					tags: null,
					is_default: 1,
					capabilities: '{"name":"openai-chat"}',
					created_at: '2024-01-01'
				}
			]);
		});

		it('GET /api/agents/:id/request-templates defaults is_default to 0 when missing', async () => {
			mockedRepo.getAgentTemplates.mockReturnValue([
				{
					id: 3,
					name: 'T2',
					description: null,
					body: '{}',
					capability: null,
					created_at: '2024-01-02'
				}
			] as any);

			const response = await callRoute(agentRoutes, 'get', '/:id/request-templates', {
				params: { id: '1' }
			});

			expect(response.statusCode).toBe(200);
			expect(response.body).toEqual([
				{
					id: 3,
					agent_id: 1,
					name: 'T2',
					description: null,
					engine: null,
					content_type: null,
					body: '{}',
					tags: null,
					is_default: 0,
					capabilities: null,
					created_at: '2024-01-02'
				}
			]);
		});

		it('POST /api/agents/:id/request-templates creates and links a global template', async () => {
			mockedQueries.getAgentById.mockReturnValue({ id: 1, name: 'Agent A' } as any);
			mockedRepo.getUniqueRequestTemplateName.mockReturnValue('Default (Agent A)');
			mockedRepo.createRequestTemplate.mockReturnValue({
				id: 10,
				name: 'Default (Agent A)',
				description: null,
				capability: '{"name":"openai-chat"}',
				body: '{}'
			} as any);
			mockedRepo.getAgentTemplateLink.mockReturnValue({ is_default: 1 } as any);

			const response = await callRoute(agentRoutes, 'post', '/:id/request-templates', {
				params: { id: '1' },
				body: {
					name: 'Default',
					body: '{}',
					capabilities: '{"name":"openai-chat"}'
				}
			});

			expect(response.statusCode).toBe(201);
			expect(mockedRepo.linkTemplateToAgent).toHaveBeenCalledWith(1, 10, false);
			expect(response.body).toEqual({
				id: 10,
				agent_id: 1,
				name: 'Default (Agent A)',
				description: null,
				engine: null,
				content_type: null,
				body: '{}',
				tags: null,
				is_default: 1,
				capabilities: '{"name":"openai-chat"}'
			});
		});

		it('POST /api/agents/:id/request-templates links an existing template', async () => {
			mockedQueries.getAgentById.mockReturnValue({ id: 1, name: 'Agent A' } as any);
			mockedRepo.getRequestTemplateById.mockReturnValue({
				id: 7,
				name: 'Existing',
				description: null,
				body: '{}',
				capability: '{"name":"openai-chat"}',
				created_at: '2024-01-03'
			} as any);
			mockedRepo.getAgentTemplateLink.mockReturnValue({ is_default: 0 } as any);

			const response = await callRoute(agentRoutes, 'post', '/:id/request-templates', {
				params: { id: '1' },
				body: { template_id: 7 }
			});

			expect(response.statusCode).toBe(201);
			expect(mockedRepo.linkTemplateToAgent).toHaveBeenCalledWith(1, 7, false);
			expect(response.body).toEqual({
				id: 7,
				agent_id: 1,
				name: 'Existing',
				description: null,
				engine: null,
				content_type: null,
				body: '{}',
				tags: null,
				is_default: 0,
				capabilities: '{"name":"openai-chat"}',
				created_at: '2024-01-03'
			});
		});

		it('PATCH /api/agents/:id/request-templates/:templateId updates in place when unshared', async () => {
			mockedQueries.getAgentById.mockReturnValue({ id: 1, name: 'Agent A' } as any);
			mockedRepo.getAgentTemplateLink.mockReturnValue({ is_default: 0 } as any);
			mockedRepo.getRequestTemplateById.mockReturnValue({
				id: 2,
				name: 'T1',
				description: null,
				body: '{}',
				capability: null
			} as any);
			mockedRepo.getTemplateLinkCount.mockReturnValue(1);
			mockedRepo.updateRequestTemplate.mockReturnValue({
				id: 2,
				name: 'T1',
				description: null,
				body: '{"x":1}',
				capability: null
			} as any);

			const response = await callRoute(agentRoutes, 'patch', '/:id/request-templates/:templateId', {
				params: { id: '1', templateId: '2' },
				body: { body: '{"x":1}' }
			});

			expect(response.statusCode).toBe(200);
			expect(mockedRepo.updateRequestTemplate).toHaveBeenCalled();
			expect(mockedRepo.createRequestTemplate).not.toHaveBeenCalled();
			expect((response.body as any).id).toBe(2);
		});

		it('PATCH /api/agents/:id/request-templates/:templateId copy-on-write when shared', async () => {
			mockedQueries.getAgentById.mockReturnValue({ id: 1, name: 'Agent A' } as any);
			mockedRepo.getAgentTemplateLink
				.mockReturnValueOnce({ is_default: 1 } as any)
				.mockReturnValueOnce({ is_default: 1 } as any);
			mockedRepo.getRequestTemplateById.mockReturnValue({
				id: 2,
				name: 'T1',
				description: null,
				body: '{}',
				capability: null
			} as any);
			mockedRepo.getTemplateLinkCount.mockReturnValue(2);
			mockedRepo.getUniqueRequestTemplateName.mockReturnValue('T1 (Agent A)');
			mockedRepo.createRequestTemplate.mockReturnValue({
				id: 99,
				name: 'T1 (Agent A)',
				description: null,
				capability: null,
				body: '{"x":1}'
			} as any);

			const response = await callRoute(agentRoutes, 'patch', '/:id/request-templates/:templateId', {
				params: { id: '1', templateId: '2' },
				body: { body: '{"x":1}' }
			});

			expect(response.statusCode).toBe(200);
			expect(mockedRepo.createRequestTemplate).toHaveBeenCalled();
			expect(mockedRepo.linkTemplateToAgent).toHaveBeenCalledWith(1, 99, true);
			expect((response.body as any).id).toBe(99);
		});

		it('PATCH /api/agents/:id/request-templates/:templateId uses fallback defaults when link missing', async () => {
			mockedQueries.getAgentById.mockReturnValue({ id: 1, name: 'Agent A' } as any);
			mockedRepo.getAgentTemplateLink
				.mockReturnValueOnce({ is_default: 0 } as any)
				.mockReturnValueOnce(undefined as any);
			mockedRepo.getRequestTemplateById.mockReturnValue({
				id: 2,
				name: 'T1',
				description: 'desc',
				body: '{}',
				capability: '{"name":"cap-1"}'
			} as any);
			mockedRepo.getTemplateLinkCount.mockReturnValue(2);
			mockedRepo.getUniqueRequestTemplateName.mockReturnValue('T1 (Agent A)');
			mockedRepo.createRequestTemplate.mockReturnValue({
				id: 88,
				name: 'T1 (Agent A)',
				description: 'desc',
				body: '{}',
				capability: '{"name":"cap-1"}'
			} as any);

			const response = await callRoute(agentRoutes, 'patch', '/:id/request-templates/:templateId', {
				params: { id: '1', templateId: '2' },
				body: { name: 'Updated', capability: null }
			});

			expect(response.statusCode).toBe(200);
			expect(mockedRepo.createRequestTemplate).toHaveBeenCalledWith(
				expect.objectContaining({
					body: '{}',
					capability: '{"name":"cap-1"}'
				})
			);
			expect(mockedRepo.linkTemplateToAgent).toHaveBeenCalledWith(1, 88, false);
			expect((response.body as any).is_default).toBe(0);
		});

		it('DELETE /api/agents/:id/request-templates/:templateId unlinks only', async () => {
			mockedRepo.getAgentTemplateLink.mockReturnValue({ is_default: 0 } as any);

			const response = await callRoute(agentRoutes, 'delete', '/:id/request-templates/:templateId', {
				params: { id: '1', templateId: '2' }
			});

			expect(response.statusCode).toBe(204);
			expect(mockedRepo.unlinkTemplateFromAgent).toHaveBeenCalledWith(1, 2);
		});
	});

	describe('response maps', () => {
		it('GET /api/agents/:id/response-maps maps capabilities and legacy fields', async () => {
			mockedRepo.getAgentResponseMaps.mockReturnValue([
				{
					id: 5,
					name: 'M1',
					description: null,
					spec: '{"output":"x"}',
					capability: '{"name":"openai-chat"}',
					is_default: 1,
					created_at: '2024-01-02'
				}
			] as any);

			const response = await callRoute(agentRoutes, 'get', '/:id/response-maps', {
				params: { id: '1' }
			});

			expect(response.statusCode).toBe(200);
			expect(response.body).toEqual([
				{
					id: 5,
					agent_id: 1,
					name: 'M1',
					description: null,
					spec: '{"output":"x"}',
					tags: null,
					is_default: 1,
					capabilities: '{"name":"openai-chat"}',
					created_at: '2024-01-02'
				}
			]);
		});

		it('GET /api/agents/:id/response-maps defaults is_default to 0 when missing', async () => {
			mockedRepo.getAgentResponseMaps.mockReturnValue([
				{
					id: 6,
					name: 'M2',
					description: null,
					spec: '{"output":"y"}',
					capability: null,
					created_at: '2024-01-03'
				}
			] as any);

			const response = await callRoute(agentRoutes, 'get', '/:id/response-maps', {
				params: { id: '1' }
			});

			expect(response.statusCode).toBe(200);
			expect(response.body).toEqual([
				{
					id: 6,
					agent_id: 1,
					name: 'M2',
					description: null,
					spec: '{"output":"y"}',
					tags: null,
					is_default: 0,
					capabilities: null,
					created_at: '2024-01-03'
				}
			]);
		});

		it('POST /api/agents/:id/response-maps links an existing response map', async () => {
			mockedQueries.getAgentById.mockReturnValue({ id: 1, name: 'Agent A' } as any);
			mockedRepo.getResponseMapById.mockReturnValue({
				id: 11,
				name: 'Existing Map',
				description: null,
				spec: '{}',
				capability: '{"name":"openai-chat"}',
				created_at: '2024-01-04'
			} as any);
			mockedRepo.getAgentResponseMapLink.mockReturnValue({ is_default: 0 } as any);

			const response = await callRoute(agentRoutes, 'post', '/:id/response-maps', {
				params: { id: '1' },
				body: { response_map_id: 11 }
			});

			expect(response.statusCode).toBe(201);
			expect(mockedRepo.linkResponseMapToAgent).toHaveBeenCalledWith(1, 11, false);
			expect((response.body as any).id).toBe(11);
		});

		it('PATCH /api/agents/:id/response-maps/:mapId copy-on-write when shared', async () => {
			mockedQueries.getAgentById.mockReturnValue({ id: 1, name: 'Agent A' } as any);
			mockedRepo.getAgentResponseMapLink
				.mockReturnValueOnce({ is_default: 1 } as any)
				.mockReturnValueOnce({ is_default: 1 } as any);
			mockedRepo.getResponseMapById.mockReturnValue({
				id: 3,
				name: 'Map',
				description: null,
				spec: '{}',
				capability: null
			} as any);
			mockedRepo.getResponseMapLinkCount.mockReturnValue(2);
			mockedRepo.getUniqueResponseMapName.mockReturnValue('Map (Agent A)');
			mockedRepo.createResponseMap.mockReturnValue({
				id: 100,
				name: 'Map (Agent A)',
				description: null,
				spec: '{"x":1}',
				capability: null
			} as any);

			const response = await callRoute(agentRoutes, 'patch', '/:id/response-maps/:mapId', {
				params: { id: '1', mapId: '3' },
				body: { spec: '{"x":1}' }
			});

			expect(response.statusCode).toBe(200);
			expect(mockedRepo.createResponseMap).toHaveBeenCalled();
			expect(mockedRepo.linkResponseMapToAgent).toHaveBeenCalledWith(1, 100, true);
			expect((response.body as any).id).toBe(100);
		});

		it('PATCH /api/agents/:id/response-maps/:mapId uses fallback defaults when link missing', async () => {
			mockedQueries.getAgentById.mockReturnValue({ id: 1, name: 'Agent A' } as any);
			mockedRepo.getAgentResponseMapLink
				.mockReturnValueOnce({ is_default: 0 } as any)
				.mockReturnValueOnce(undefined as any);
			mockedRepo.getResponseMapById.mockReturnValue({
				id: 3,
				name: 'Map',
				description: 'desc',
				spec: '{"output":"z"}',
				capability: '{"name":"cap-9"}'
			} as any);
			mockedRepo.getResponseMapLinkCount.mockReturnValue(2);
			mockedRepo.getUniqueResponseMapName.mockReturnValue('Map (Agent A)');
			mockedRepo.createResponseMap.mockReturnValue({
				id: 77,
				name: 'Map (Agent A)',
				description: 'desc',
				spec: '{"output":"z"}',
				capability: '{"name":"cap-9"}'
			} as any);

			const response = await callRoute(agentRoutes, 'patch', '/:id/response-maps/:mapId', {
				params: { id: '1', mapId: '3' },
				body: { name: 'Updated', capability: null }
			});

			expect(response.statusCode).toBe(200);
			expect(mockedRepo.createResponseMap).toHaveBeenCalledWith(
				expect.objectContaining({
					spec: '{"output":"z"}',
					capability: '{"name":"cap-9"}'
				})
			);
			expect(mockedRepo.linkResponseMapToAgent).toHaveBeenCalledWith(1, 77, false);
			expect((response.body as any).is_default).toBe(0);
		});
	});

	describe('capability names', () => {
		it('GET /api/agents/capability-names/request-templates uses global names', async () => {
			mockedRepo.listRequestTemplateCapabilityNames.mockReturnValue(['openai-chat']);

			const response = await callRoute(agentRoutes, 'get', '/capability-names/request-templates');

			expect(response.statusCode).toBe(200);
			expect(response.body).toEqual(['openai-chat']);
		});

		it('GET /api/agents/capability-names/response-maps uses global names', async () => {
			mockedRepo.listResponseMapCapabilityNames.mockReturnValue(['openai-chat']);

			const response = await callRoute(agentRoutes, 'get', '/capability-names/response-maps');

			expect(response.statusCode).toBe(200);
			expect(response.body).toEqual(['openai-chat']);
		});
	});

	describe('linked templates', () => {
		it('GET /api/agents/:id/linked-templates returns 404 for missing agent', async () => {
			mockedQueries.getAgentById.mockReturnValue(null as any);

			const response = await callRoute(agentRoutes, 'get', '/:id/linked-templates', {
				params: { id: '5' }
			});

			expect(response.statusCode).toBe(404);
			expect((response.body as any).error).toBe('Agent not found');
		});

		it('GET /api/agents/:id/linked-templates returns linked templates', async () => {
			mockedQueries.getAgentById.mockReturnValue({ id: 1, name: 'Agent A' } as any);
			mockedRepo.getAgentTemplates.mockReturnValue([{ id: 10, name: 'Tpl' }] as any);

			const response = await callRoute(agentRoutes, 'get', '/:id/linked-templates', {
				params: { id: '1' }
			});

			expect(response.statusCode).toBe(200);
			expect(response.body).toEqual([{ id: 10, name: 'Tpl' }]);
		});

		it('POST /api/agents/:id/linked-templates links existing template', async () => {
			mockedQueries.getAgentById.mockReturnValue({ id: 1, name: 'Agent A' } as any);
			mockedRepo.getRequestTemplateById.mockReturnValue({ id: 4, name: 'Existing' } as any);

			const response = await callRoute(agentRoutes, 'post', '/:id/linked-templates', {
				params: { id: '1' },
				body: { template_id: 4, is_default: true }
			});

			expect(response.statusCode).toBe(201);
			expect(mockedRepo.linkTemplateToAgent).toHaveBeenCalledWith(1, 4, true);
			expect((response.body as any).id).toBe(4);
		});

		it('POST /api/agents/:id/linked-templates validates required fields for new templates', async () => {
			mockedQueries.getAgentById.mockReturnValue({ id: 1, name: 'Agent A' } as any);

			const response = await callRoute(agentRoutes, 'post', '/:id/linked-templates', {
				params: { id: '1' },
				body: { name: 'Missing body' }
			});

			expect(response.statusCode).toBe(400);
			expect((response.body as any).error).toBe('Name and body are required for new templates');
		});

		it('POST /api/agents/:id/linked-templates returns 409 on unique constraint', async () => {
			mockedQueries.getAgentById.mockReturnValue({ id: 1, name: 'Agent A' } as any);
			mockedRepo.createRequestTemplate.mockImplementation(() => {
				throw new Error('UNIQUE constraint failed: request_templates.name');
			});

			const response = await callRoute(agentRoutes, 'post', '/:id/linked-templates', {
				params: { id: '1' },
				body: { name: 'Dup', body: '{}' }
			});

			expect(response.statusCode).toBe(409);
			expect((response.body as any).error).toBe('A template with this name already exists');
		});

		it('DELETE /api/agents/:id/linked-templates/:templateId unlinks templates', async () => {
			const response = await callRoute(agentRoutes, 'delete', '/:id/linked-templates/:templateId', {
				params: { id: '1', templateId: '4' }
			});

			expect(response.statusCode).toBe(204);
			expect(mockedRepo.unlinkTemplateFromAgent).toHaveBeenCalledWith(1, 4);
		});

		it('POST /api/agents/:id/linked-templates/:templateId/default sets default', async () => {
			const response = await callRoute(agentRoutes, 'post', '/:id/linked-templates/:templateId/default', {
				params: { id: '1', templateId: '4' }
			});

			expect(response.statusCode).toBe(204);
			expect(mockedRepo.setAgentDefaultTemplate).toHaveBeenCalledWith(1, 4);
		});
	});

	describe('linked response maps', () => {
		it('GET /api/agents/:id/linked-response-maps returns 404 for missing agent', async () => {
			mockedQueries.getAgentById.mockReturnValue(null as any);

			const response = await callRoute(agentRoutes, 'get', '/:id/linked-response-maps', {
				params: { id: '5' }
			});

			expect(response.statusCode).toBe(404);
			expect((response.body as any).error).toBe('Agent not found');
		});

		it('GET /api/agents/:id/linked-response-maps returns linked maps', async () => {
			mockedQueries.getAgentById.mockReturnValue({ id: 1, name: 'Agent A' } as any);
			mockedRepo.getAgentResponseMaps.mockReturnValue([{ id: 22, name: 'Map' }] as any);

			const response = await callRoute(agentRoutes, 'get', '/:id/linked-response-maps', {
				params: { id: '1' }
			});

			expect(response.statusCode).toBe(200);
			expect(response.body).toEqual([{ id: 22, name: 'Map' }]);
		});

		it('POST /api/agents/:id/linked-response-maps links existing response map', async () => {
			mockedQueries.getAgentById.mockReturnValue({ id: 1, name: 'Agent A' } as any);
			mockedRepo.getResponseMapById.mockReturnValue({ id: 9, name: 'Existing' } as any);

			const response = await callRoute(agentRoutes, 'post', '/:id/linked-response-maps', {
				params: { id: '1' },
				body: { response_map_id: 9, is_default: false }
			});

			expect(response.statusCode).toBe(201);
			expect(mockedRepo.linkResponseMapToAgent).toHaveBeenCalledWith(1, 9, false);
			expect((response.body as any).id).toBe(9);
		});

		it('POST /api/agents/:id/linked-response-maps validates required fields', async () => {
			mockedQueries.getAgentById.mockReturnValue({ id: 1, name: 'Agent A' } as any);

			const response = await callRoute(agentRoutes, 'post', '/:id/linked-response-maps', {
				params: { id: '1' },
				body: { name: 'Missing spec' }
			});

			expect(response.statusCode).toBe(400);
			expect((response.body as any).error).toBe('Name and spec are required for new response maps');
		});

		it('POST /api/agents/:id/linked-response-maps returns 409 on unique constraint', async () => {
			mockedQueries.getAgentById.mockReturnValue({ id: 1, name: 'Agent A' } as any);
			mockedRepo.createResponseMap.mockImplementation(() => {
				throw new Error('UNIQUE constraint failed: response_maps.name');
			});

			const response = await callRoute(agentRoutes, 'post', '/:id/linked-response-maps', {
				params: { id: '1' },
				body: { name: 'Dup', spec: '{}' }
			});

			expect(response.statusCode).toBe(409);
			expect((response.body as any).error).toBe('A response map with this name already exists');
		});

		it('DELETE /api/agents/:id/linked-response-maps/:mapId unlinks maps', async () => {
			const response = await callRoute(agentRoutes, 'delete', '/:id/linked-response-maps/:mapId', {
				params: { id: '1', mapId: '9' }
			});

			expect(response.statusCode).toBe(204);
			expect(mockedRepo.unlinkResponseMapFromAgent).toHaveBeenCalledWith(1, 9);
		});

		it('POST /api/agents/:id/linked-response-maps/:mapId/default sets default', async () => {
			const response = await callRoute(agentRoutes, 'post', '/:id/linked-response-maps/:mapId/default', {
				params: { id: '1', mapId: '9' }
			});

			expect(response.statusCode).toBe(204);
			expect(mockedRepo.setAgentDefaultResponseMap).toHaveBeenCalledWith(1, 9);
		});
	});

	describe('request template error handling', () => {
		it('GET /api/agents/:id/request-templates handles errors', async () => {
			mockedRepo.getAgentTemplates.mockImplementation(() => {
				throw new Error('list failed');
			});

			const response = await callRoute(agentRoutes, 'get', '/:id/request-templates', {
				params: { id: '1' }
			});

			expect(response.statusCode).toBe(500);
			expect((response.body as any).error).toBe('Failed to list request templates');
		});

		it('POST /api/agents/:id/request-templates returns 404 when agent missing', async () => {
			mockedQueries.getAgentById.mockReturnValue(null as any);

			const response = await callRoute(agentRoutes, 'post', '/:id/request-templates', {
				params: { id: '1' },
				body: { name: 'Template', body: '{}' }
			});

			expect(response.statusCode).toBe(404);
			expect((response.body as any).error).toBe('Agent not found');
		});

		it('POST /api/agents/:id/request-templates returns 404 when template id missing', async () => {
			mockedQueries.getAgentById.mockReturnValue({ id: 1, name: 'Agent A' } as any);
			mockedRepo.getRequestTemplateById.mockReturnValue(null as any);

			const response = await callRoute(agentRoutes, 'post', '/:id/request-templates', {
				params: { id: '1' },
				body: { template_id: 999 }
			});

			expect(response.statusCode).toBe(404);
			expect((response.body as any).error).toBe('Template not found');
		});

		it('POST /api/agents/:id/request-templates validates name/body', async () => {
			mockedQueries.getAgentById.mockReturnValue({ id: 1, name: 'Agent A' } as any);

			const response = await callRoute(agentRoutes, 'post', '/:id/request-templates', {
				params: { id: '1' },
				body: { name: 'Missing body' }
			});

			expect(response.statusCode).toBe(400);
			expect((response.body as any).error).toBe('Name and body are required for new templates');
		});

		it('POST /api/agents/:id/request-templates handles create errors', async () => {
			mockedQueries.getAgentById.mockReturnValue({ id: 1, name: 'Agent A' } as any);
			mockedRepo.getUniqueRequestTemplateName.mockReturnValue('Default (Agent A)');
			mockedRepo.createRequestTemplate.mockImplementation(() => {
				throw new Error('DB fail');
			});

			const response = await callRoute(agentRoutes, 'post', '/:id/request-templates', {
				params: { id: '1' },
				body: { name: 'Default', body: '{}' }
			});

			expect(response.statusCode).toBe(500);
			expect((response.body as any).error).toBe('Failed to create request template');
		});

		it('POST /api/agents/:id/request-templates serializes capability fields', async () => {
			mockedQueries.getAgentById.mockReturnValue({ id: 1, name: 'Agent A' } as any);
			mockedRepo.getUniqueRequestTemplateName.mockReturnValue('Default (Agent A)');
			mockedRepo.createRequestTemplate.mockReturnValue({
				id: 12,
				name: 'Default (Agent A)',
				body: '{}',
				capability: '{"name":"cap-1"}'
			} as any);
			mockedRepo.getAgentTemplateLink.mockReturnValue({ is_default: 0 } as any);

			const response = await callRoute(agentRoutes, 'post', '/:id/request-templates', {
				params: { id: '1' },
				body: { name: 'Default', body: '{}', capability: { name: 'cap-1' } }
			});

			expect(response.statusCode).toBe(201);
			expect(mockedRepo.createRequestTemplate).toHaveBeenCalledWith(
				expect.objectContaining({
					capability: JSON.stringify({ name: 'cap-1' })
				})
			);
		});

		it('POST /api/agents/:id/request-templates supports capabilities field', async () => {
			mockedQueries.getAgentById.mockReturnValue({ id: 1, name: 'Agent A' } as any);
			mockedRepo.getUniqueRequestTemplateName.mockReturnValue('Default (Agent A)');
			mockedRepo.createRequestTemplate.mockReturnValue({
				id: 13,
				name: 'Default (Agent A)',
				body: '{}',
				capability: '{"name":"cap-2"}'
			} as any);
			mockedRepo.getAgentTemplateLink.mockReturnValue({ is_default: 0 } as any);

			const response = await callRoute(agentRoutes, 'post', '/:id/request-templates', {
				params: { id: '1' },
				body: { name: 'Default', body: '{}', capabilities: { name: 'cap-2' } }
			});

			expect(response.statusCode).toBe(201);
			expect(mockedRepo.createRequestTemplate).toHaveBeenCalledWith(
				expect.objectContaining({
					capability: JSON.stringify({ name: 'cap-2' })
				})
			);
		});

		it('PATCH /api/agents/:id/request-templates/:templateId returns 404 when agent missing', async () => {
			mockedQueries.getAgentById.mockReturnValue(null as any);

			const response = await callRoute(agentRoutes, 'patch', '/:id/request-templates/:templateId', {
				params: { id: '1', templateId: '2' },
				body: { name: 'Updated' }
			});

			expect(response.statusCode).toBe(404);
			expect((response.body as any).error).toBe('Agent not found');
		});

		it('PATCH /api/agents/:id/request-templates/:templateId returns 404 when link missing', async () => {
			mockedQueries.getAgentById.mockReturnValue({ id: 1, name: 'Agent A' } as any);
			mockedRepo.getAgentTemplateLink.mockReturnValue(null as any);

			const response = await callRoute(agentRoutes, 'patch', '/:id/request-templates/:templateId', {
				params: { id: '1', templateId: '2' },
				body: { name: 'Updated' }
			});

			expect(response.statusCode).toBe(404);
			expect((response.body as any).error).toBe('Template not found');
		});

		it('PATCH /api/agents/:id/request-templates/:templateId returns 404 when template missing', async () => {
			mockedQueries.getAgentById.mockReturnValue({ id: 1, name: 'Agent A' } as any);
			mockedRepo.getAgentTemplateLink.mockReturnValue({ is_default: 0 } as any);
			mockedRepo.getRequestTemplateById.mockReturnValue(null as any);

			const response = await callRoute(agentRoutes, 'patch', '/:id/request-templates/:templateId', {
				params: { id: '1', templateId: '2' },
				body: { name: 'Updated' }
			});

			expect(response.statusCode).toBe(404);
			expect((response.body as any).error).toBe('Template not found');
		});

		it('PATCH /api/agents/:id/request-templates/:templateId returns 404 when update missing', async () => {
			mockedQueries.getAgentById.mockReturnValue({ id: 1, name: 'Agent A' } as any);
			mockedRepo.getAgentTemplateLink.mockReturnValue({ is_default: 0 } as any);
			mockedRepo.getRequestTemplateById.mockReturnValue({
				id: 2,
				name: 'T1',
				body: '{}'
			} as any);
			mockedRepo.getTemplateLinkCount.mockReturnValue(1);
			mockedRepo.updateRequestTemplate.mockReturnValue(null as any);

			const response = await callRoute(agentRoutes, 'patch', '/:id/request-templates/:templateId', {
				params: { id: '1', templateId: '2' },
				body: { name: 'Updated' }
			});

			expect(response.statusCode).toBe(404);
			expect((response.body as any).error).toBe('Template not found');
		});

		it('PATCH /api/agents/:id/request-templates/:templateId sets default when requested', async () => {
			mockedQueries.getAgentById.mockReturnValue({ id: 1, name: 'Agent A' } as any);
			mockedRepo.getAgentTemplateLink.mockReturnValue({ is_default: 0 } as any);
			mockedRepo.getRequestTemplateById.mockReturnValue({
				id: 2,
				name: 'T1',
				body: '{}'
			} as any);
			mockedRepo.getTemplateLinkCount.mockReturnValue(1);
			mockedRepo.updateRequestTemplate.mockReturnValue({
				id: 2,
				name: 'T1',
				body: '{}'
			} as any);
			mockedRepo.getAgentTemplateLink.mockReturnValue({ is_default: 1 } as any);

			const response = await callRoute(agentRoutes, 'patch', '/:id/request-templates/:templateId', {
				params: { id: '1', templateId: '2' },
				body: { is_default: true }
			});

			expect(response.statusCode).toBe(200);
			expect(mockedRepo.setAgentDefaultTemplate).toHaveBeenCalledWith(1, 2);
		});

		it('PATCH /api/agents/:id/request-templates/:templateId updates capability', async () => {
			mockedQueries.getAgentById.mockReturnValue({ id: 1, name: 'Agent A' } as any);
			mockedRepo.getAgentTemplateLink.mockReturnValue({ is_default: 0 } as any);
			mockedRepo.getRequestTemplateById.mockReturnValue({
				id: 2,
				name: 'T1',
				body: '{}'
			} as any);
			mockedRepo.getTemplateLinkCount.mockReturnValue(1);
			mockedRepo.updateRequestTemplate.mockReturnValue({
				id: 2,
				name: 'T1',
				body: '{}',
				capability: '{"name":"cap-2"}'
			} as any);

			const response = await callRoute(agentRoutes, 'patch', '/:id/request-templates/:templateId', {
				params: { id: '1', templateId: '2' },
				body: { capability: { name: 'cap-2' } }
			});

			expect(response.statusCode).toBe(200);
			expect(mockedRepo.updateRequestTemplate).toHaveBeenCalledWith(
				2,
				expect.objectContaining({
					capability: JSON.stringify({ name: 'cap-2' })
				})
			);
		});

		it('PATCH /api/agents/:id/request-templates/:templateId updates description', async () => {
			mockedQueries.getAgentById.mockReturnValue({ id: 1, name: 'Agent A' } as any);
			mockedRepo.getAgentTemplateLink.mockReturnValue({ is_default: 0 } as any);
			mockedRepo.getRequestTemplateById.mockReturnValue({
				id: 2,
				name: 'T1',
				body: '{}',
				description: null
			} as any);
			mockedRepo.getTemplateLinkCount.mockReturnValue(1);
			mockedRepo.updateRequestTemplate.mockReturnValue({
				id: 2,
				name: 'T1',
				body: '{}',
				description: 'Updated'
			} as any);

			const response = await callRoute(agentRoutes, 'patch', '/:id/request-templates/:templateId', {
				params: { id: '1', templateId: '2' },
				body: { description: 'Updated' }
			});

			expect(response.statusCode).toBe(200);
			expect(mockedRepo.updateRequestTemplate).toHaveBeenCalledWith(
				2,
				expect.objectContaining({
					description: 'Updated'
				})
			);
		});

		it('PATCH /api/agents/:id/request-templates/:templateId handles errors', async () => {
			mockedQueries.getAgentById.mockReturnValue({ id: 1, name: 'Agent A' } as any);
			mockedRepo.getAgentTemplateLink.mockReturnValue({ is_default: 0 } as any);
			mockedRepo.getRequestTemplateById.mockReturnValue({
				id: 2,
				name: 'T1',
				body: '{}'
			} as any);
			mockedRepo.getTemplateLinkCount.mockReturnValue(1);
			mockedRepo.updateRequestTemplate.mockImplementation(() => {
				throw new Error('Update failed');
			});

			const response = await callRoute(agentRoutes, 'patch', '/:id/request-templates/:templateId', {
				params: { id: '1', templateId: '2' },
				body: { name: 'Updated' }
			});

			expect(response.statusCode).toBe(500);
			expect((response.body as any).error).toBe('Failed to update request template');
		});

		it('DELETE /api/agents/:id/request-templates/:templateId returns 404 when link missing', async () => {
			mockedRepo.getAgentTemplateLink.mockReturnValue(null as any);

			const response = await callRoute(agentRoutes, 'delete', '/:id/request-templates/:templateId', {
				params: { id: '1', templateId: '2' }
			});

			expect(response.statusCode).toBe(404);
			expect((response.body as any).error).toBe('Template not found');
		});

		it('DELETE /api/agents/:id/request-templates/:templateId handles errors', async () => {
			mockedRepo.getAgentTemplateLink.mockReturnValue({ is_default: 0 } as any);
			mockedRepo.unlinkTemplateFromAgent.mockImplementation(() => {
				throw new Error('Delete failed');
			});

			const response = await callRoute(agentRoutes, 'delete', '/:id/request-templates/:templateId', {
				params: { id: '1', templateId: '2' }
			});

			expect(response.statusCode).toBe(500);
			expect((response.body as any).error).toBe('Failed to delete request template');
		});

		it('POST /api/agents/:id/request-templates/:templateId/default returns 404 when link missing', async () => {
			mockedRepo.getAgentTemplateLink.mockReturnValue(null as any);

			const response = await callRoute(agentRoutes, 'post', '/:id/request-templates/:templateId/default', {
				params: { id: '1', templateId: '2' }
			});

			expect(response.statusCode).toBe(404);
			expect((response.body as any).error).toBe('Template not found');
		});

		it('POST /api/agents/:id/request-templates/:templateId/default handles errors', async () => {
			mockedRepo.getAgentTemplateLink.mockReturnValue({ is_default: 0 } as any);
			mockedRepo.setAgentDefaultTemplate.mockImplementation(() => {
				throw new Error('Default failed');
			});

			const response = await callRoute(agentRoutes, 'post', '/:id/request-templates/:templateId/default', {
				params: { id: '1', templateId: '2' }
			});

			expect(response.statusCode).toBe(500);
			expect((response.body as any).error).toBe('Failed to set default request template');
		});

		it('POST /api/agents/:id/request-templates/:templateId/default sets default', async () => {
			mockedRepo.getAgentTemplateLink.mockReturnValue({ is_default: 0 } as any);
			mockedRepo.setAgentDefaultTemplate.mockReturnValue(undefined as any);

			const response = await callRoute(agentRoutes, 'post', '/:id/request-templates/:templateId/default', {
				params: { id: '1', templateId: '2' }
			});

			expect(response.statusCode).toBe(204);
			expect(mockedRepo.setAgentDefaultTemplate).toHaveBeenCalledWith(1, 2);
		});
	});

	describe('response map error handling', () => {
		it('GET /api/agents/:id/response-maps handles errors', async () => {
			mockedRepo.getAgentResponseMaps.mockImplementation(() => {
				throw new Error('List failed');
			});

			const response = await callRoute(agentRoutes, 'get', '/:id/response-maps', {
				params: { id: '1' }
			});

			expect(response.statusCode).toBe(500);
			expect((response.body as any).error).toBe('Failed to list response maps');
		});

		it('POST /api/agents/:id/response-maps returns 404 when agent missing', async () => {
			mockedQueries.getAgentById.mockReturnValue(null as any);

			const response = await callRoute(agentRoutes, 'post', '/:id/response-maps', {
				params: { id: '1' },
				body: { name: 'Map', spec: '{}' }
			});

			expect(response.statusCode).toBe(404);
			expect((response.body as any).error).toBe('Agent not found');
		});

		it('POST /api/agents/:id/response-maps returns 404 when map id missing', async () => {
			mockedQueries.getAgentById.mockReturnValue({ id: 1, name: 'Agent A' } as any);
			mockedRepo.getResponseMapById.mockReturnValue(null as any);

			const response = await callRoute(agentRoutes, 'post', '/:id/response-maps', {
				params: { id: '1' },
				body: { response_map_id: 999 }
			});

			expect(response.statusCode).toBe(404);
			expect((response.body as any).error).toBe('Response map not found');
		});

		it('POST /api/agents/:id/response-maps validates name/spec', async () => {
			mockedQueries.getAgentById.mockReturnValue({ id: 1, name: 'Agent A' } as any);

			const response = await callRoute(agentRoutes, 'post', '/:id/response-maps', {
				params: { id: '1' },
				body: { name: 'Missing spec' }
			});

			expect(response.statusCode).toBe(400);
			expect((response.body as any).error).toBe('Name and spec are required for new response maps');
		});

		it('POST /api/agents/:id/response-maps handles create errors', async () => {
			mockedQueries.getAgentById.mockReturnValue({ id: 1, name: 'Agent A' } as any);
			mockedRepo.getUniqueResponseMapName.mockReturnValue('Map (Agent A)');
			mockedRepo.createResponseMap.mockImplementation(() => {
				throw new Error('DB fail');
			});

			const response = await callRoute(agentRoutes, 'post', '/:id/response-maps', {
				params: { id: '1' },
				body: { name: 'Map', spec: '{}' }
			});

			expect(response.statusCode).toBe(500);
			expect((response.body as any).error).toBe('Failed to create response map');
		});

		it('POST /api/agents/:id/response-maps serializes capability fields', async () => {
			mockedQueries.getAgentById.mockReturnValue({ id: 1, name: 'Agent A' } as any);
			mockedRepo.getUniqueResponseMapName.mockReturnValue('Map (Agent A)');
			mockedRepo.createResponseMap.mockReturnValue({
				id: 20,
				name: 'Map (Agent A)',
				spec: '{}',
				capability: '{"name":"cap-3"}'
			} as any);
			mockedRepo.getAgentResponseMapLink.mockReturnValue({ is_default: 0 } as any);

			const response = await callRoute(agentRoutes, 'post', '/:id/response-maps', {
				params: { id: '1' },
				body: { name: 'Map', spec: '{}', capability: { name: 'cap-3' } }
			});

			expect(response.statusCode).toBe(201);
			expect(mockedRepo.createResponseMap).toHaveBeenCalledWith(
				expect.objectContaining({
					capability: JSON.stringify({ name: 'cap-3' })
				})
			);
		});

		it('PATCH /api/agents/:id/response-maps/:mapId returns 404 when agent missing', async () => {
			mockedQueries.getAgentById.mockReturnValue(null as any);

			const response = await callRoute(agentRoutes, 'patch', '/:id/response-maps/:mapId', {
				params: { id: '1', mapId: '2' },
				body: { name: 'Updated' }
			});

			expect(response.statusCode).toBe(404);
			expect((response.body as any).error).toBe('Agent not found');
		});

		it('PATCH /api/agents/:id/response-maps/:mapId returns 404 when link missing', async () => {
			mockedQueries.getAgentById.mockReturnValue({ id: 1, name: 'Agent A' } as any);
			mockedRepo.getAgentResponseMapLink.mockReturnValue(null as any);

			const response = await callRoute(agentRoutes, 'patch', '/:id/response-maps/:mapId', {
				params: { id: '1', mapId: '2' },
				body: { name: 'Updated' }
			});

			expect(response.statusCode).toBe(404);
			expect((response.body as any).error).toBe('Response map not found');
		});

		it('PATCH /api/agents/:id/response-maps/:mapId returns 404 when map missing', async () => {
			mockedQueries.getAgentById.mockReturnValue({ id: 1, name: 'Agent A' } as any);
			mockedRepo.getAgentResponseMapLink.mockReturnValue({ is_default: 0 } as any);
			mockedRepo.getResponseMapById.mockReturnValue(null as any);

			const response = await callRoute(agentRoutes, 'patch', '/:id/response-maps/:mapId', {
				params: { id: '1', mapId: '2' },
				body: { name: 'Updated' }
			});

			expect(response.statusCode).toBe(404);
			expect((response.body as any).error).toBe('Response map not found');
		});

		it('PATCH /api/agents/:id/response-maps/:mapId returns 404 when update missing', async () => {
			mockedQueries.getAgentById.mockReturnValue({ id: 1, name: 'Agent A' } as any);
			mockedRepo.getAgentResponseMapLink.mockReturnValue({ is_default: 0 } as any);
			mockedRepo.getResponseMapById.mockReturnValue({
				id: 2,
				name: 'Map',
				spec: '{}'
			} as any);
			mockedRepo.getResponseMapLinkCount.mockReturnValue(1);
			mockedRepo.updateResponseMap.mockReturnValue(null as any);

			const response = await callRoute(agentRoutes, 'patch', '/:id/response-maps/:mapId', {
				params: { id: '1', mapId: '2' },
				body: { name: 'Updated' }
			});

			expect(response.statusCode).toBe(404);
			expect((response.body as any).error).toBe('Response map not found');
		});

		it('PATCH /api/agents/:id/response-maps/:mapId sets default when requested', async () => {
			mockedQueries.getAgentById.mockReturnValue({ id: 1, name: 'Agent A' } as any);
			mockedRepo.getAgentResponseMapLink.mockReturnValue({ is_default: 0 } as any);
			mockedRepo.getResponseMapById.mockReturnValue({
				id: 2,
				name: 'Map',
				spec: '{}'
			} as any);
			mockedRepo.getResponseMapLinkCount.mockReturnValue(1);
			mockedRepo.updateResponseMap.mockReturnValue({
				id: 2,
				name: 'Map',
				spec: '{}'
			} as any);
			mockedRepo.getAgentResponseMapLink.mockReturnValue({ is_default: 1 } as any);

			const response = await callRoute(agentRoutes, 'patch', '/:id/response-maps/:mapId', {
				params: { id: '1', mapId: '2' },
				body: { is_default: true }
			});

			expect(response.statusCode).toBe(200);
			expect(mockedRepo.setAgentDefaultResponseMap).toHaveBeenCalledWith(1, 2);
		});

		it('PATCH /api/agents/:id/response-maps/:mapId updates capability', async () => {
			mockedQueries.getAgentById.mockReturnValue({ id: 1, name: 'Agent A' } as any);
			mockedRepo.getAgentResponseMapLink.mockReturnValue({ is_default: 0 } as any);
			mockedRepo.getResponseMapById.mockReturnValue({
				id: 2,
				name: 'Map',
				spec: '{}'
			} as any);
			mockedRepo.getResponseMapLinkCount.mockReturnValue(1);
			mockedRepo.updateResponseMap.mockReturnValue({
				id: 2,
				name: 'Map',
				spec: '{}',
				capability: '{"name":"cap-4"}'
			} as any);

			const response = await callRoute(agentRoutes, 'patch', '/:id/response-maps/:mapId', {
				params: { id: '1', mapId: '2' },
				body: { capability: { name: 'cap-4' } }
			});

			expect(response.statusCode).toBe(200);
			expect(mockedRepo.updateResponseMap).toHaveBeenCalledWith(
				2,
				expect.objectContaining({
					capability: JSON.stringify({ name: 'cap-4' })
				})
			);
		});

		it('PATCH /api/agents/:id/response-maps/:mapId updates description', async () => {
			mockedQueries.getAgentById.mockReturnValue({ id: 1, name: 'Agent A' } as any);
			mockedRepo.getAgentResponseMapLink.mockReturnValue({ is_default: 0 } as any);
			mockedRepo.getResponseMapById.mockReturnValue({
				id: 2,
				name: 'Map',
				spec: '{}',
				description: null
			} as any);
			mockedRepo.getResponseMapLinkCount.mockReturnValue(1);
			mockedRepo.updateResponseMap.mockReturnValue({
				id: 2,
				name: 'Map',
				spec: '{}',
				description: 'Updated'
			} as any);

			const response = await callRoute(agentRoutes, 'patch', '/:id/response-maps/:mapId', {
				params: { id: '1', mapId: '2' },
				body: { description: 'Updated' }
			});

			expect(response.statusCode).toBe(200);
			expect(mockedRepo.updateResponseMap).toHaveBeenCalledWith(
				2,
				expect.objectContaining({
					description: 'Updated'
				})
			);
		});

		it('PATCH /api/agents/:id/response-maps/:mapId handles errors', async () => {
			mockedQueries.getAgentById.mockReturnValue({ id: 1, name: 'Agent A' } as any);
			mockedRepo.getAgentResponseMapLink.mockReturnValue({ is_default: 0 } as any);
			mockedRepo.getResponseMapById.mockReturnValue({
				id: 2,
				name: 'Map',
				spec: '{}'
			} as any);
			mockedRepo.getResponseMapLinkCount.mockReturnValue(1);
			mockedRepo.updateResponseMap.mockImplementation(() => {
				throw new Error('Update failed');
			});

			const response = await callRoute(agentRoutes, 'patch', '/:id/response-maps/:mapId', {
				params: { id: '1', mapId: '2' },
				body: { name: 'Updated' }
			});

			expect(response.statusCode).toBe(500);
			expect((response.body as any).error).toBe('Failed to update response map');
		});

		it('DELETE /api/agents/:id/response-maps/:mapId returns 404 when link missing', async () => {
			mockedRepo.getAgentResponseMapLink.mockReturnValue(null as any);

			const response = await callRoute(agentRoutes, 'delete', '/:id/response-maps/:mapId', {
				params: { id: '1', mapId: '2' }
			});

			expect(response.statusCode).toBe(404);
			expect((response.body as any).error).toBe('Response map not found');
		});

		it('DELETE /api/agents/:id/response-maps/:mapId unlinks response map', async () => {
			mockedRepo.getAgentResponseMapLink.mockReturnValue({ is_default: 0 } as any);

			const response = await callRoute(agentRoutes, 'delete', '/:id/response-maps/:mapId', {
				params: { id: '1', mapId: '2' }
			});

			expect(response.statusCode).toBe(204);
			expect(mockedRepo.unlinkResponseMapFromAgent).toHaveBeenCalledWith(1, 2);
		});

		it('DELETE /api/agents/:id/response-maps/:mapId handles errors', async () => {
			mockedRepo.getAgentResponseMapLink.mockReturnValue({ is_default: 0 } as any);
			mockedRepo.unlinkResponseMapFromAgent.mockImplementation(() => {
				throw new Error('Delete failed');
			});

			const response = await callRoute(agentRoutes, 'delete', '/:id/response-maps/:mapId', {
				params: { id: '1', mapId: '2' }
			});

			expect(response.statusCode).toBe(500);
			expect((response.body as any).error).toBe('Failed to delete response map');
		});

		it('POST /api/agents/:id/response-maps/:mapId/default returns 404 when link missing', async () => {
			mockedRepo.getAgentResponseMapLink.mockReturnValue(null as any);

			const response = await callRoute(agentRoutes, 'post', '/:id/response-maps/:mapId/default', {
				params: { id: '1', mapId: '2' }
			});

			expect(response.statusCode).toBe(404);
			expect((response.body as any).error).toBe('Response map not found');
		});

		it('POST /api/agents/:id/response-maps/:mapId/default handles errors', async () => {
			mockedRepo.getAgentResponseMapLink.mockReturnValue({ is_default: 0 } as any);
			mockedRepo.setAgentDefaultResponseMap.mockImplementation(() => {
				throw new Error('Default failed');
			});

			const response = await callRoute(agentRoutes, 'post', '/:id/response-maps/:mapId/default', {
				params: { id: '1', mapId: '2' }
			});

			expect(response.statusCode).toBe(500);
			expect((response.body as any).error).toBe('Failed to set default response map');
		});

		it('POST /api/agents/:id/response-maps/:mapId/default sets default', async () => {
			mockedRepo.getAgentResponseMapLink.mockReturnValue({ is_default: 0 } as any);
			mockedRepo.setAgentDefaultResponseMap.mockReturnValue(undefined as any);

			const response = await callRoute(agentRoutes, 'post', '/:id/response-maps/:mapId/default', {
				params: { id: '1', mapId: '2' }
			});

			expect(response.statusCode).toBe(204);
			expect(mockedRepo.setAgentDefaultResponseMap).toHaveBeenCalledWith(1, 2);
		});
	});

	describe('capability names error handling', () => {
		it('GET /api/agents/capability-names/request-templates handles errors', async () => {
			mockedRepo.listRequestTemplateCapabilityNames.mockImplementation(() => {
				throw new Error('fail');
			});

			const response = await callRoute(agentRoutes, 'get', '/capability-names/request-templates');

			expect(response.statusCode).toBe(500);
			expect((response.body as any).error).toBe('Failed to list capability names');
		});

		it('GET /api/agents/capability-names/response-maps handles errors', async () => {
			mockedRepo.listResponseMapCapabilityNames.mockImplementation(() => {
				throw new Error('fail');
			});

			const response = await callRoute(agentRoutes, 'get', '/capability-names/response-maps');

			expect(response.statusCode).toBe(500);
			expect((response.body as any).error).toBe('Failed to list capability names');
		});
	});

	describe('linked template error handling', () => {
		it('GET /api/agents/:id/linked-templates handles errors', async () => {
			mockedQueries.getAgentById.mockReturnValue({ id: 1, name: 'Agent A' } as any);
			mockedRepo.getAgentTemplates.mockImplementation(() => {
				throw new Error('fail');
			});

			const response = await callRoute(agentRoutes, 'get', '/:id/linked-templates', {
				params: { id: '1' }
			});

			expect(response.statusCode).toBe(500);
			expect((response.body as any).error).toBe('Failed to list linked templates');
		});

		it('POST /api/agents/:id/linked-templates returns 404 when agent missing', async () => {
			mockedQueries.getAgentById.mockReturnValue(null as any);

			const response = await callRoute(agentRoutes, 'post', '/:id/linked-templates', {
				params: { id: '1' },
				body: { name: 'Tpl', body: '{}' }
			});

			expect(response.statusCode).toBe(404);
			expect((response.body as any).error).toBe('Agent not found');
		});

		it('POST /api/agents/:id/linked-templates returns 404 when template missing', async () => {
			mockedQueries.getAgentById.mockReturnValue({ id: 1, name: 'Agent A' } as any);
			mockedRepo.getRequestTemplateById.mockReturnValue(null as any);

			const response = await callRoute(agentRoutes, 'post', '/:id/linked-templates', {
				params: { id: '1' },
				body: { template_id: 123 }
			});

			expect(response.statusCode).toBe(404);
			expect((response.body as any).error).toBe('Template not found');
		});

		it('POST /api/agents/:id/linked-templates handles generic errors', async () => {
			mockedQueries.getAgentById.mockReturnValue({ id: 1, name: 'Agent A' } as any);
			mockedRepo.createRequestTemplate.mockImplementation(() => {
				throw new Error('Other failure');
			});

			const response = await callRoute(agentRoutes, 'post', '/:id/linked-templates', {
				params: { id: '1' },
				body: { name: 'Tpl', body: '{}' }
			});

			expect(response.statusCode).toBe(500);
			expect((response.body as any).error).toBe('Failed to link template');
		});

		it('DELETE /api/agents/:id/linked-templates/:templateId handles errors', async () => {
			mockedRepo.unlinkTemplateFromAgent.mockImplementation(() => {
				throw new Error('unlink failed');
			});

			const response = await callRoute(agentRoutes, 'delete', '/:id/linked-templates/:templateId', {
				params: { id: '1', templateId: '4' }
			});

			expect(response.statusCode).toBe(500);
			expect((response.body as any).error).toBe('Failed to unlink template');
		});

		it('POST /api/agents/:id/linked-templates/:templateId/default handles errors', async () => {
			mockedRepo.setAgentDefaultTemplate.mockImplementation(() => {
				throw new Error('default failed');
			});

			const response = await callRoute(agentRoutes, 'post', '/:id/linked-templates/:templateId/default', {
				params: { id: '1', templateId: '4' }
			});

			expect(response.statusCode).toBe(500);
			expect((response.body as any).error).toBe('Failed to set default template');
		});
	});

	describe('linked response map error handling', () => {
		it('GET /api/agents/:id/linked-response-maps handles errors', async () => {
			mockedQueries.getAgentById.mockReturnValue({ id: 1, name: 'Agent A' } as any);
			mockedRepo.getAgentResponseMaps.mockImplementation(() => {
				throw new Error('fail');
			});

			const response = await callRoute(agentRoutes, 'get', '/:id/linked-response-maps', {
				params: { id: '1' }
			});

			expect(response.statusCode).toBe(500);
			expect((response.body as any).error).toBe('Failed to list linked response maps');
		});

		it('POST /api/agents/:id/linked-response-maps returns 404 when agent missing', async () => {
			mockedQueries.getAgentById.mockReturnValue(null as any);

			const response = await callRoute(agentRoutes, 'post', '/:id/linked-response-maps', {
				params: { id: '1' },
				body: { name: 'Map', spec: '{}' }
			});

			expect(response.statusCode).toBe(404);
			expect((response.body as any).error).toBe('Agent not found');
		});

		it('POST /api/agents/:id/linked-response-maps returns 404 when map missing', async () => {
			mockedQueries.getAgentById.mockReturnValue({ id: 1, name: 'Agent A' } as any);
			mockedRepo.getResponseMapById.mockReturnValue(null as any);

			const response = await callRoute(agentRoutes, 'post', '/:id/linked-response-maps', {
				params: { id: '1' },
				body: { response_map_id: 123 }
			});

			expect(response.statusCode).toBe(404);
			expect((response.body as any).error).toBe('Response map not found');
		});

		it('POST /api/agents/:id/linked-response-maps handles generic errors', async () => {
			mockedQueries.getAgentById.mockReturnValue({ id: 1, name: 'Agent A' } as any);
			mockedRepo.createResponseMap.mockImplementation(() => {
				throw new Error('Other failure');
			});

			const response = await callRoute(agentRoutes, 'post', '/:id/linked-response-maps', {
				params: { id: '1' },
				body: { name: 'Map', spec: '{}' }
			});

			expect(response.statusCode).toBe(500);
			expect((response.body as any).error).toBe('Failed to link response map');
		});

		it('DELETE /api/agents/:id/linked-response-maps/:mapId handles errors', async () => {
			mockedRepo.unlinkResponseMapFromAgent.mockImplementation(() => {
				throw new Error('unlink failed');
			});

			const response = await callRoute(agentRoutes, 'delete', '/:id/linked-response-maps/:mapId', {
				params: { id: '1', mapId: '9' }
			});

			expect(response.statusCode).toBe(500);
			expect((response.body as any).error).toBe('Failed to unlink response map');
		});

		it('POST /api/agents/:id/linked-response-maps/:mapId/default handles errors', async () => {
			mockedRepo.setAgentDefaultResponseMap.mockImplementation(() => {
				throw new Error('default failed');
			});

			const response = await callRoute(agentRoutes, 'post', '/:id/linked-response-maps/:mapId/default', {
				params: { id: '1', mapId: '9' }
			});

			expect(response.statusCode).toBe(500);
			expect((response.body as any).error).toBe('Failed to set default response map');
		});
	});
});
