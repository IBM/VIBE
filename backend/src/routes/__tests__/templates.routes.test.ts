import templateRoutes from '../templates';
import responseMapsRoutes from '../response-maps';
import * as templateRepo from '../../db/repositories/templateRepo';

jest.mock('../../db/repositories/templateRepo');

const mockedRepo = templateRepo as jest.Mocked<typeof templateRepo>;

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

const getRouteHandler = (router: any, method: 'get' | 'post' | 'put' | 'delete', path: string) => {
	const layer = router.stack.find((entry: any) => entry.route?.path === path && entry.route?.methods?.[method]);
	if (!layer) {
		throw new Error(`Route not found: ${method.toUpperCase()} ${path}`);
	}
	return layer.route.stack[0].handle;
};

const callRoute = async (
	router: any,
	method: 'get' | 'post' | 'put' | 'delete',
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

describe('template routes (HTTP)', () => {
	beforeEach(() => {
		jest.clearAllMocks();
	});

	describe('request templates: /api/templates', () => {
		it('GET /api/templates returns templates', async () => {
			const templates = [
				{ id: 1, name: 'T1', body: '{}', created_at: '2024-01-01' },
				{ id: 2, name: 'T2', body: '{}', created_at: '2024-01-02' }
			] as any;
			mockedRepo.listRequestTemplates.mockReturnValue(templates);

			const response = await callRoute(templateRoutes, 'get', '/');

			expect(response.statusCode).toBe(200);
			expect(response.body).toEqual(templates);
			expect(mockedRepo.listRequestTemplates).toHaveBeenCalledWith(undefined);
		});

		it('GET /api/templates filters by capability', async () => {
			mockedRepo.listRequestTemplates.mockReturnValue([] as any);

			const response = await callRoute(templateRoutes, 'get', '/', {
				query: { capability: 'openai-chat' }
			});

			expect(response.statusCode).toBe(200);
			expect(mockedRepo.listRequestTemplates).toHaveBeenCalledWith({ capability: 'openai-chat' });
		});

		it('GET /api/templates/capability-names returns names', async () => {
			mockedRepo.listRequestTemplateCapabilityNames.mockReturnValue(['openai-chat', 'ollama-generate']);

			const response = await callRoute(templateRoutes, 'get', '/capability-names');

			expect(response.statusCode).toBe(200);
			expect(response.body).toEqual(['openai-chat', 'ollama-generate']);
		});

		it('GET /api/templates/:id returns 400 on invalid id', async () => {
			const response = await callRoute(templateRoutes, 'get', '/:id', {
				params: { id: 'not-a-number' }
			});

			expect(response.statusCode).toBe(400);
			expect(response.body).toEqual({ error: 'Invalid template ID' });
		});

		it('GET /api/templates/:id returns 404 when not found', async () => {
			mockedRepo.getRequestTemplateById.mockReturnValue(undefined);

			const response = await callRoute(templateRoutes, 'get', '/:id', {
				params: { id: '123' }
			});

			expect(response.statusCode).toBe(404);
			expect(response.body).toEqual({ error: 'Template not found' });
		});

		it('POST /api/templates validates required fields', async () => {
			const response = await callRoute(templateRoutes, 'post', '/', {
				body: { name: 'X' }
			});

			expect(response.statusCode).toBe(400);
			expect(response.body).toEqual({ error: 'Name and body are required fields' });
		});

		it('POST /api/templates creates a template', async () => {
			const created = { id: 10, name: 'New', body: '{}', description: null, capability: null } as any;
			mockedRepo.createRequestTemplate.mockReturnValue(created);

			const response = await callRoute(templateRoutes, 'post', '/', {
				body: { name: 'New', body: '{}', description: 'd', capability: '{"name":"x"}' }
			});

			expect(response.statusCode).toBe(201);
			expect(response.body).toEqual(created);
			expect(mockedRepo.createRequestTemplate).toHaveBeenCalledWith({
				name: 'New',
				body: '{}',
				description: 'd',
				capability: '{"name":"x"}'
			});
		});

		it('POST /api/templates returns 409 on unique constraint', async () => {
			mockedRepo.createRequestTemplate.mockImplementation(() => {
				throw new Error('UNIQUE constraint failed: request_templates.name');
			});

			const response = await callRoute(templateRoutes, 'post', '/', {
				body: { name: 'Dup', body: '{}' }
			});

			expect(response.statusCode).toBe(409);
			expect(response.body).toEqual({ error: 'A template with this name already exists' });
		});

		it('POST /api/templates validates missing name', async () => {
			const response = await callRoute(templateRoutes, 'post', '/', {
				body: { body: '{}' }
			});

			expect(response.statusCode).toBe(400);
			expect(response.body).toEqual({ error: 'Name and body are required fields' });
		});

		it('POST /api/templates validates missing body', async () => {
			const response = await callRoute(templateRoutes, 'post', '/', {
				body: { name: 'Test' }
			});

			expect(response.statusCode).toBe(400);
			expect(response.body).toEqual({ error: 'Name and body are required fields' });
		});

		it('POST /api/templates handles general errors', async () => {
			const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
			mockedRepo.createRequestTemplate.mockImplementation(() => {
				throw new Error('Database connection failed');
			});

			const response = await callRoute(templateRoutes, 'post', '/', {
				body: { name: 'Test', body: '{}' }
			});

			expect(response.statusCode).toBe(500);
			expect(response.body).toEqual({ error: 'Failed to create template' });
			consoleErrorSpy.mockRestore();
		});

		it('GET /api/templates/:id returns template successfully', async () => {
			const template = { id: 1, name: 'Test', body: '{}', capability: 'openai-chat' } as any;
			mockedRepo.getRequestTemplateById.mockReturnValue(template);

			const response = await callRoute(templateRoutes, 'get', '/:id', {
				params: { id: '1' }
			});

			expect(response.statusCode).toBe(200);
			expect(response.body).toEqual(template);
			expect(mockedRepo.getRequestTemplateById).toHaveBeenCalledWith(1);
		});

		it('GET /api/templates/:id handles errors', async () => {
			const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
			mockedRepo.getRequestTemplateById.mockImplementation(() => {
				throw new Error('Database error');
			});

			const response = await callRoute(templateRoutes, 'get', '/:id', {
				params: { id: '1' }
			});

			expect(response.statusCode).toBe(500);
			expect(response.body).toEqual({ error: 'Failed to fetch template' });
			consoleErrorSpy.mockRestore();
		});

		it('GET /api/templates handles errors', async () => {
			const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
			mockedRepo.listRequestTemplates.mockImplementation(() => {
				throw new Error('Database error');
			});

			const response = await callRoute(templateRoutes, 'get', '/');

			expect(response.statusCode).toBe(500);
			expect(response.body).toEqual({ error: 'Failed to fetch templates' });
			consoleErrorSpy.mockRestore();
		});

		it('GET /api/templates/capability-names handles errors', async () => {
			const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
			mockedRepo.listRequestTemplateCapabilityNames.mockImplementation(() => {
				throw new Error('Database error');
			});

			const response = await callRoute(templateRoutes, 'get', '/capability-names');

			expect(response.statusCode).toBe(500);
			expect(response.body).toEqual({ error: 'Failed to fetch capability names' });
			consoleErrorSpy.mockRestore();
		});

		it('PUT /api/templates/:id returns 400 on invalid id', async () => {
			const response = await callRoute(templateRoutes, 'put', '/:id', {
				params: { id: 'invalid' },
				body: { name: 'Updated' }
			});

			expect(response.statusCode).toBe(400);
			expect(response.body).toEqual({ error: 'Invalid template ID' });
		});

		it('PUT /api/templates/:id updates template successfully', async () => {
			const updated = { id: 1, name: 'Updated', body: '{"new":"data"}', capability: 'openai-chat' } as any;
			mockedRepo.updateRequestTemplate.mockReturnValue(updated);

			const response = await callRoute(templateRoutes, 'put', '/:id', {
				params: { id: '1' },
				body: { name: 'Updated', body: '{"new":"data"}' }
			});

			expect(response.statusCode).toBe(200);
			expect(response.body).toEqual(updated);
			expect(mockedRepo.updateRequestTemplate).toHaveBeenCalledWith(1, {
				name: 'Updated',
				body: '{"new":"data"}'
			});
		});

		it('PUT /api/templates/:id updates only provided fields', async () => {
			const updated = { id: 1, name: 'Test', body: '{}', description: 'New desc' } as any;
			mockedRepo.updateRequestTemplate.mockReturnValue(updated);

			const response = await callRoute(templateRoutes, 'put', '/:id', {
				params: { id: '1' },
				body: { description: 'New desc' }
			});

			expect(response.statusCode).toBe(200);
			expect(mockedRepo.updateRequestTemplate).toHaveBeenCalledWith(1, {
				description: 'New desc'
			});
		});

		it('PUT /api/templates/:id returns 409 on unique constraint', async () => {
			mockedRepo.updateRequestTemplate.mockImplementation(() => {
				throw new Error('UNIQUE constraint failed: request_templates.name');
			});

			const response = await callRoute(templateRoutes, 'put', '/:id', {
				params: { id: '1' },
				body: { name: 'Duplicate' }
			});

			expect(response.statusCode).toBe(409);
			expect(response.body).toEqual({ error: 'A template with this name already exists' });
		});

		it('PUT /api/templates/:id handles general errors', async () => {
			const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
			mockedRepo.updateRequestTemplate.mockImplementation(() => {
				throw new Error('Database error');
			});

			const response = await callRoute(templateRoutes, 'put', '/:id', {
				params: { id: '1' },
				body: { name: 'Updated' }
			});

			expect(response.statusCode).toBe(500);
			expect(response.body).toEqual({ error: 'Failed to update template' });
			consoleErrorSpy.mockRestore();
		});

		it('DELETE /api/templates/:id returns 400 on invalid id', async () => {
			const response = await callRoute(templateRoutes, 'delete', '/:id', {
				params: { id: 'invalid' }
			});

			expect(response.statusCode).toBe(400);
			expect(response.body).toEqual({ error: 'Invalid template ID' });
		});

		it('DELETE /api/templates/:id returns 404 when not found', async () => {
			mockedRepo.getRequestTemplateById.mockReturnValue(undefined);

			const response = await callRoute(templateRoutes, 'delete', '/:id', {
				params: { id: '999' }
			});

			expect(response.statusCode).toBe(404);
			expect(response.body).toEqual({ error: 'Template not found' });
		});

		it('DELETE /api/templates/:id handles errors', async () => {
			const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
			mockedRepo.getRequestTemplateById.mockReturnValue({ id: 1, name: 'T', body: '{}' } as any);
			mockedRepo.deleteRequestTemplate.mockImplementation(() => {
				throw new Error('Database error');
			});

			const response = await callRoute(templateRoutes, 'delete', '/:id', {
				params: { id: '1' }
			});

			expect(response.statusCode).toBe(500);
			expect(response.body).toEqual({ error: 'Failed to delete template' });
			consoleErrorSpy.mockRestore();
		});

		it('PUT /api/templates/:id returns 404 when not found', async () => {
			mockedRepo.updateRequestTemplate.mockReturnValue(undefined);

			const response = await callRoute(templateRoutes, 'put', '/:id', {
				params: { id: '999' },
				body: { name: 'Updated' }
			});

			expect(response.statusCode).toBe(404);
			expect(response.body).toEqual({ error: 'Template not found' });
		});

		it('DELETE /api/templates/:id returns 204 on success', async () => {
			mockedRepo.getRequestTemplateById.mockReturnValue({ id: 1, name: 'T', body: '{}' } as any);
			mockedRepo.deleteRequestTemplate.mockReturnValue(undefined);

			const response = await callRoute(templateRoutes, 'delete', '/:id', {
				params: { id: '1' }
			});

			expect(response.statusCode).toBe(204);
			expect(mockedRepo.deleteRequestTemplate).toHaveBeenCalledWith(1);
		});
	});

	describe('response maps: /api/response-maps', () => {
		it('GET /api/response-maps returns maps', async () => {
			const maps = [
				{ id: 1, name: 'M1', spec: '{"output":"x"}' },
				{ id: 2, name: 'M2', spec: '{"output":"y"}' }
			] as any;
			mockedRepo.listResponseMaps.mockReturnValue(maps);

			const response = await callRoute(responseMapsRoutes, 'get', '/');

			expect(response.statusCode).toBe(200);
			expect(response.body).toEqual(maps);
			expect(mockedRepo.listResponseMaps).toHaveBeenCalledWith(undefined);
		});

		it('GET /api/response-maps filters by capability', async () => {
			mockedRepo.listResponseMaps.mockReturnValue([] as any);

			const response = await callRoute(responseMapsRoutes, 'get', '/', {
				query: { capability: 'openai-chat' }
			});

			expect(response.statusCode).toBe(200);
			expect(mockedRepo.listResponseMaps).toHaveBeenCalledWith({ capability: 'openai-chat' });
		});

		it('GET /api/response-maps/capability-names returns names', async () => {
			mockedRepo.listResponseMapCapabilityNames.mockReturnValue(['openai-chat']);

			const response = await callRoute(responseMapsRoutes, 'get', '/capability-names');

			expect(response.statusCode).toBe(200);
			expect(response.body).toEqual(['openai-chat']);
		});

		it('POST /api/response-maps validates required fields', async () => {
			const response = await callRoute(responseMapsRoutes, 'post', '/', {
				body: { name: 'X' }
			});

			expect(response.statusCode).toBe(400);
			expect(response.body).toEqual({ error: 'Name and spec are required fields' });
		});

		it('POST /api/response-maps creates a response map', async () => {
			const created = { id: 10, name: 'New map', spec: '{}', description: null, capability: null } as any;
			mockedRepo.createResponseMap.mockReturnValue(created);

			const response = await callRoute(responseMapsRoutes, 'post', '/', {
				body: { name: 'New map', spec: '{}', description: 'd', capability: '{"name":"x"}' }
			});

			expect(response.statusCode).toBe(201);
			expect(response.body).toEqual(created);
			expect(mockedRepo.createResponseMap).toHaveBeenCalledWith({
				name: 'New map',
				spec: '{}',
				description: 'd',
				capability: '{"name":"x"}'
			});
		});

		it('DELETE /api/response-maps/:id returns 404 when not found', async () => {
			mockedRepo.getResponseMapById.mockReturnValue(undefined);

			const response = await callRoute(responseMapsRoutes, 'delete', '/:id', {
				params: { id: '999' }
			});

			expect(response.statusCode).toBe(404);
			expect(response.body).toEqual({ error: 'Response map not found' });
		});
	});
});
