import type { Request, Response } from 'express';

// Mock all dependencies before importing the router
jest.mock('../../db/repositories/templateRepo');

import responseMapsRouter from '../response-maps';
import * as templateRepo from '../../db/repositories/templateRepo';

// Type the mocked functions
const mockListResponseMaps = templateRepo.listResponseMaps as jest.MockedFunction<typeof templateRepo.listResponseMaps>;
const mockListResponseMapCapabilityNames = templateRepo.listResponseMapCapabilityNames as jest.MockedFunction<
	typeof templateRepo.listResponseMapCapabilityNames
>;
const mockGetResponseMapById = templateRepo.getResponseMapById as jest.MockedFunction<
	typeof templateRepo.getResponseMapById
>;
const mockCreateResponseMap = templateRepo.createResponseMap as jest.MockedFunction<
	typeof templateRepo.createResponseMap
>;
const mockUpdateResponseMap = templateRepo.updateResponseMap as jest.MockedFunction<
	typeof templateRepo.updateResponseMap
>;
const mockDeleteResponseMap = templateRepo.deleteResponseMap as jest.MockedFunction<
	typeof templateRepo.deleteResponseMap
>;

describe('response-maps routes', () => {
	let mockReq: Partial<Request>;
	let mockRes: Partial<Response>;
	let jsonMock: jest.Mock;
	let statusMock: jest.Mock;
	let sendMock: jest.Mock;

	beforeEach(() => {
		jest.clearAllMocks();

		jsonMock = jest.fn();
		statusMock = jest.fn().mockReturnThis();
		sendMock = jest.fn();

		mockReq = {
			body: {},
			params: {},
			query: {}
		};

		mockRes = {
			json: jsonMock,
			status: statusMock,
			send: sendMock
		};
	});

	// Helper to extract and call route handler
	const getRouteHandler = (method: string, path: string) => {
		const routes = (responseMapsRouter as any).stack;
		const route = routes.find((r: any) => {
			const routePath = r.route?.path;
			const routeMethod = r.route?.methods?.[method.toLowerCase()];
			return routePath === path && routeMethod;
		});
		return route?.route?.stack[0]?.handle;
	};

	const callRoute = async (method: string, path: string) => {
		const handler = getRouteHandler(method, path);
		if (!handler) throw new Error(`Route ${method} ${path} not found`);
		await handler(mockReq, mockRes);
	};

	describe('GET /api/response-maps', () => {
		it('returns all response maps without filter', async () => {
			(mockListResponseMaps as any).mockReturnValue([
				{ id: 1, name: 'Map 1', capability: 'cap1', spec: '{}' },
				{ id: 2, name: 'Map 2', capability: 'cap2', spec: '{}' }
			]);

			await callRoute('get', '/');

			expect(mockListResponseMaps).toHaveBeenCalledWith(undefined);
			expect(jsonMock).toHaveBeenCalledWith([
				{ id: 1, name: 'Map 1', capability: 'cap1', spec: '{}' },
				{ id: 2, name: 'Map 2', capability: 'cap2', spec: '{}' }
			]);
		});

		it('filters response maps by capability', async () => {
			mockReq.query = { capability: 'test-capability' };
			(mockListResponseMaps as any).mockReturnValue([
				{ id: 1, name: 'Map 1', capability: 'test-capability', spec: '{}' }
			]);

			await callRoute('get', '/');

			expect(mockListResponseMaps).toHaveBeenCalledWith({ capability: 'test-capability' });
			expect(jsonMock).toHaveBeenCalledWith([
				{ id: 1, name: 'Map 1', capability: 'test-capability', spec: '{}' }
			]);
		});

		it('handles errors gracefully', async () => {
			(mockListResponseMaps as any).mockImplementation(() => {
				throw new Error('Database error');
			});

			await callRoute('get', '/');

			expect(statusMock).toHaveBeenCalledWith(500);
			expect(jsonMock).toHaveBeenCalledWith({ error: 'Failed to fetch response maps' });
		});
	});

	describe('GET /api/response-maps/capability-names', () => {
		it('returns all capability names', async () => {
			(mockListResponseMapCapabilityNames as any).mockReturnValue(['capability1', 'capability2', 'capability3']);

			await callRoute('get', '/capability-names');

			expect(mockListResponseMapCapabilityNames).toHaveBeenCalled();
			expect(jsonMock).toHaveBeenCalledWith(['capability1', 'capability2', 'capability3']);
		});

		it('handles errors gracefully', async () => {
			(mockListResponseMapCapabilityNames as any).mockImplementation(() => {
				throw new Error('Database error');
			});

			await callRoute('get', '/capability-names');

			expect(statusMock).toHaveBeenCalledWith(500);
			expect(jsonMock).toHaveBeenCalledWith({ error: 'Failed to fetch capability names' });
		});
	});

	describe('GET /api/response-maps/:id', () => {
		it('returns a response map by id', async () => {
			mockReq.params = { id: '1' };
			(mockGetResponseMapById as any).mockReturnValue({
				id: 1,
				name: 'Test Map',
				description: 'Test description',
				capability: 'test-cap',
				spec: '{"field":"value"}'
			});

			await callRoute('get', '/:id');

			expect(mockGetResponseMapById).toHaveBeenCalledWith(1);
			expect(jsonMock).toHaveBeenCalledWith({
				id: 1,
				name: 'Test Map',
				description: 'Test description',
				capability: 'test-cap',
				spec: '{"field":"value"}'
			});
		});

		it('returns 400 for invalid id format', async () => {
			mockReq.params = { id: 'invalid' };

			await callRoute('get', '/:id');

			expect(statusMock).toHaveBeenCalledWith(400);
			expect(jsonMock).toHaveBeenCalledWith({ error: 'Invalid response map ID' });
		});

		it('returns 404 when response map not found', async () => {
			mockReq.params = { id: '999' };
			(mockGetResponseMapById as any).mockReturnValue(null);

			await callRoute('get', '/:id');

			expect(statusMock).toHaveBeenCalledWith(404);
			expect(jsonMock).toHaveBeenCalledWith({ error: 'Response map not found' });
		});

		it('handles errors gracefully', async () => {
			mockReq.params = { id: '1' };
			(mockGetResponseMapById as any).mockImplementation(() => {
				throw new Error('Database error');
			});

			await callRoute('get', '/:id');

			expect(statusMock).toHaveBeenCalledWith(500);
			expect(jsonMock).toHaveBeenCalledWith({ error: 'Failed to fetch response map' });
		});
	});

	describe('POST /api/response-maps', () => {
		it('creates a new response map', async () => {
			mockReq.body = {
				name: 'New Map',
				description: 'Test description',
				capability: 'test-cap',
				spec: '{"field":"value"}'
			};
			(mockCreateResponseMap as any).mockReturnValue({
				id: 1,
				name: 'New Map',
				description: 'Test description',
				capability: 'test-cap',
				spec: '{"field":"value"}'
			});

			await callRoute('post', '/');

			expect(mockCreateResponseMap).toHaveBeenCalledWith({
				name: 'New Map',
				description: 'Test description',
				capability: 'test-cap',
				spec: '{"field":"value"}'
			});
			expect(statusMock).toHaveBeenCalledWith(201);
			expect(jsonMock).toHaveBeenCalledWith({
				id: 1,
				name: 'New Map',
				description: 'Test description',
				capability: 'test-cap',
				spec: '{"field":"value"}'
			});
		});

		it('validates required name field', async () => {
			mockReq.body = {
				spec: '{}'
			};

			await callRoute('post', '/');

			expect(statusMock).toHaveBeenCalledWith(400);
			expect(jsonMock).toHaveBeenCalledWith({
				error: 'Name and spec are required fields'
			});
		});

		it('validates required spec field', async () => {
			mockReq.body = {
				name: 'Test Map'
			};

			await callRoute('post', '/');

			expect(statusMock).toHaveBeenCalledWith(400);
			expect(jsonMock).toHaveBeenCalledWith({
				error: 'Name and spec are required fields'
			});
		});

		it('returns 409 for duplicate name', async () => {
			mockReq.body = {
				name: 'Duplicate Map',
				spec: '{}'
			};
			(mockCreateResponseMap as any).mockImplementation(() => {
				const error = new Error('UNIQUE constraint failed');
				throw error;
			});

			await callRoute('post', '/');

			expect(statusMock).toHaveBeenCalledWith(409);
			expect(jsonMock).toHaveBeenCalledWith({
				error: 'A response map with this name already exists'
			});
		});

		it('handles other errors gracefully', async () => {
			mockReq.body = {
				name: 'Test Map',
				spec: '{}'
			};
			(mockCreateResponseMap as any).mockImplementation(() => {
				throw new Error('Database error');
			});

			await callRoute('post', '/');

			expect(statusMock).toHaveBeenCalledWith(500);
			expect(jsonMock).toHaveBeenCalledWith({ error: 'Failed to create response map' });
		});
	});

	describe('PUT /api/response-maps/:id', () => {
		it('updates a response map', async () => {
			mockReq.params = { id: '1' };
			mockReq.body = {
				name: 'Updated Map',
				description: 'Updated description',
				capability: 'updated-cap',
				spec: '{"updated":"value"}'
			};
			(mockUpdateResponseMap as any).mockReturnValue({
				id: 1,
				name: 'Updated Map',
				description: 'Updated description',
				capability: 'updated-cap',
				spec: '{"updated":"value"}'
			});

			await callRoute('put', '/:id');

			expect(mockUpdateResponseMap).toHaveBeenCalledWith(1, {
				name: 'Updated Map',
				description: 'Updated description',
				capability: 'updated-cap',
				spec: '{"updated":"value"}'
			});
			expect(jsonMock).toHaveBeenCalledWith({
				id: 1,
				name: 'Updated Map',
				description: 'Updated description',
				capability: 'updated-cap',
				spec: '{"updated":"value"}'
			});
		});

		it('updates only provided fields', async () => {
			mockReq.params = { id: '1' };
			mockReq.body = {
				name: 'Updated Name'
			};
			(mockUpdateResponseMap as any).mockReturnValue({
				id: 1,
				name: 'Updated Name'
			});

			await callRoute('put', '/:id');

			expect(mockUpdateResponseMap).toHaveBeenCalledWith(1, {
				name: 'Updated Name'
			});
		});

		it('returns 400 for invalid id format', async () => {
			mockReq.params = { id: 'invalid' };
			mockReq.body = { name: 'Test' };

			await callRoute('put', '/:id');

			expect(statusMock).toHaveBeenCalledWith(400);
			expect(jsonMock).toHaveBeenCalledWith({ error: 'Invalid response map ID' });
		});

		it('returns 404 when response map not found', async () => {
			mockReq.params = { id: '999' };
			mockReq.body = { name: 'Test' };
			(mockUpdateResponseMap as any).mockReturnValue(null);

			await callRoute('put', '/:id');

			expect(statusMock).toHaveBeenCalledWith(404);
			expect(jsonMock).toHaveBeenCalledWith({ error: 'Response map not found' });
		});

		it('returns 409 for duplicate name', async () => {
			mockReq.params = { id: '1' };
			mockReq.body = { name: 'Duplicate Name' };
			(mockUpdateResponseMap as any).mockImplementation(() => {
				const error = new Error('UNIQUE constraint failed');
				throw error;
			});

			await callRoute('put', '/:id');

			expect(statusMock).toHaveBeenCalledWith(409);
			expect(jsonMock).toHaveBeenCalledWith({
				error: 'A response map with this name already exists'
			});
		});

		it('handles other errors gracefully', async () => {
			mockReq.params = { id: '1' };
			mockReq.body = { name: 'Test' };
			(mockUpdateResponseMap as any).mockImplementation(() => {
				throw new Error('Database error');
			});

			await callRoute('put', '/:id');

			expect(statusMock).toHaveBeenCalledWith(500);
			expect(jsonMock).toHaveBeenCalledWith({ error: 'Failed to update response map' });
		});
	});

	describe('DELETE /api/response-maps/:id', () => {
		it('deletes a response map', async () => {
			mockReq.params = { id: '1' };
			(mockGetResponseMapById as any).mockReturnValue({
				id: 1,
				name: 'Test Map'
			});
			(mockDeleteResponseMap as any).mockReturnValue(undefined);

			await callRoute('delete', '/:id');

			expect(mockGetResponseMapById).toHaveBeenCalledWith(1);
			expect(mockDeleteResponseMap).toHaveBeenCalledWith(1);
			expect(statusMock).toHaveBeenCalledWith(204);
			expect(sendMock).toHaveBeenCalled();
		});

		it('returns 400 for invalid id format', async () => {
			mockReq.params = { id: 'invalid' };

			await callRoute('delete', '/:id');

			expect(statusMock).toHaveBeenCalledWith(400);
			expect(jsonMock).toHaveBeenCalledWith({ error: 'Invalid response map ID' });
		});

		it('returns 404 when response map not found', async () => {
			mockReq.params = { id: '999' };
			(mockGetResponseMapById as any).mockReturnValue(null);

			await callRoute('delete', '/:id');

			expect(statusMock).toHaveBeenCalledWith(404);
			expect(jsonMock).toHaveBeenCalledWith({ error: 'Response map not found' });
		});

		it('handles errors gracefully', async () => {
			mockReq.params = { id: '1' };
			(mockGetResponseMapById as any).mockReturnValue({ id: 1 });
			(mockDeleteResponseMap as any).mockImplementation(() => {
				throw new Error('Database error');
			});

			await callRoute('delete', '/:id');

			expect(statusMock).toHaveBeenCalledWith(500);
			expect(jsonMock).toHaveBeenCalledWith({ error: 'Failed to delete response map' });
		});
	});
});

// Made with Bob
