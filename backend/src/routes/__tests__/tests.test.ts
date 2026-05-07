import type { Request, Response } from 'express';

// Mock all dependencies before imports
jest.mock('../../db/queries');
jest.mock('../../adapters/legacy-adapter');
jest.mock('../../utils/pagination');
jest.mock('../../db/database');

describe('Tests Routes (Legacy)', () => {
	let router: any;
	let mockReq: Partial<Request>;
	let mockRes: Partial<Response>;
	let mockJson: jest.Mock;
	let mockStatus: jest.Mock;
	let mockSend: jest.Mock;

	// Import mocked modules
	const queries = require('../../db/queries');
	const legacyAdapter = require('../../adapters/legacy-adapter');
	const pagination = require('../../utils/pagination');
	const database = require('../../db/database');

	beforeEach(() => {
		jest.clearAllMocks();

		// Setup response mocks
		mockJson = jest.fn().mockReturnThis();
		mockStatus = jest.fn().mockReturnThis();
		mockSend = jest.fn().mockReturnThis();

		mockRes = {
			json: mockJson,
			status: mockStatus,
			send: mockSend
		};

		// Setup default request
		mockReq = {
			params: {},
			body: {},
			query: {}
		};

		// Mock database
		const mockDb = {
			exec: jest.fn(),
			prepare: jest.fn().mockReturnValue({
				bind: jest.fn().mockReturnValue({
					source: '?'
				})
			})
		};
		(database.default as any) = mockDb;

		// Load router fresh for each test
		jest.isolateModules(() => {
			router = require('../tests').default;
		});
	});

	// Helper to extract route handler
	const getRouteHandler = (method: string, path: string) => {
		const routes = router.stack.filter((layer: any) => layer.route);
		const route = routes.find((layer: any) => {
			const routePath = layer.route.path;
			const routeMethod = Object.keys(layer.route.methods)[0].toUpperCase();
			return routePath === path && routeMethod === method;
		});
		if (!route) {
			throw new Error(`Route ${method} ${path} not found`);
		}
		return route.route.stack[0].handle;
	};

	describe('GET /api/tests', () => {
		it('should return all single-turn conversations as tests (no pagination)', async () => {
			const mockConversations = [
				{ id: 1, name: 'Test 1' },
				{ id: 2, name: 'Test 2' },
				{ id: 3, name: 'Multi-turn' }
			];
			const mockMessages1 = [{ role: 'user', content: 'test1' }];
			const mockMessages2 = [{ role: 'user', content: 'test2' }];
			const mockMessages3 = [
				{ role: 'user', content: 'msg1' },
				{ role: 'assistant', content: 'reply' }
			];
			const mockTest1 = { id: 1, name: 'Test 1', input: 'test1' };
			const mockTest2 = { id: 2, name: 'Test 2', input: 'test2' };

			(pagination.hasPaginationParams as any).mockReturnValue(false);
			(queries.getConversations as any).mockResolvedValue(mockConversations);
			(queries.getConversationMessages as any)
				.mockResolvedValueOnce(mockMessages1)
				.mockResolvedValueOnce(mockMessages2)
				.mockResolvedValueOnce(mockMessages3);
			(legacyAdapter.isSingleTurnConversation as any)
				.mockReturnValueOnce(true)
				.mockReturnValueOnce(true)
				.mockReturnValueOnce(false);
			(legacyAdapter.conversationToLegacyTest as any)
				.mockReturnValueOnce(mockTest1)
				.mockReturnValueOnce(mockTest2);

			const handler = getRouteHandler('GET', '/');
			await handler(mockReq, mockRes);

			expect(queries.getConversations).toHaveBeenCalled();
			expect(queries.getConversationMessages).toHaveBeenCalledTimes(3);
			expect(mockJson).toHaveBeenCalledWith([mockTest1, mockTest2]);
		});

		it('should return paginated single-turn conversations as tests', async () => {
			const mockConversations = [
				{ id: 1, name: 'Test 1' },
				{ id: 2, name: 'Test 2' }
			];
			const mockMessages = [{ role: 'user', content: 'test' }];
			const mockTest = { id: 1, name: 'Test 1', input: 'test' };

			(pagination.hasPaginationParams as any).mockReturnValue(true);
			(pagination.validatePaginationOrError as any).mockReturnValue({ limit: 10, offset: 0 });
			(queries.getConversationsWithCount as any).mockReturnValue({
				data: mockConversations,
				total: 2
			});
			(queries.getConversationMessages as any).mockResolvedValue(mockMessages);
			(legacyAdapter.isSingleTurnConversation as any).mockReturnValue(true);
			(legacyAdapter.conversationToLegacyTest as any).mockReturnValue(mockTest);

			const handler = getRouteHandler('GET', '/');
			await handler(mockReq, mockRes);

			expect(queries.getConversationsWithCount).toHaveBeenCalledWith({ limit: 10, offset: 0 });
			expect(mockJson).toHaveBeenCalledWith({
				data: [mockTest, mockTest],
				total: 2,
				limit: 10,
				offset: 0
			});
		});

		it('should filter out multi-turn conversations', async () => {
			const mockConversations = [
				{ id: 1, name: 'Single' },
				{ id: 2, name: 'Multi' }
			];
			const mockSingleMessages = [{ role: 'user', content: 'test' }];
			const mockMultiMessages = [
				{ role: 'user', content: 'msg1' },
				{ role: 'assistant', content: 'reply' }
			];
			const mockTest = { id: 1, name: 'Single', input: 'test' };

			(pagination.hasPaginationParams as any).mockReturnValue(false);
			(queries.getConversations as any).mockResolvedValue(mockConversations);
			(queries.getConversationMessages as any)
				.mockResolvedValueOnce(mockSingleMessages)
				.mockResolvedValueOnce(mockMultiMessages);
			(legacyAdapter.isSingleTurnConversation as any).mockReturnValueOnce(true).mockReturnValueOnce(false);
			(legacyAdapter.conversationToLegacyTest as any).mockReturnValue(mockTest);

			const handler = getRouteHandler('GET', '/');
			await handler(mockReq, mockRes);

			expect(mockJson).toHaveBeenCalledWith([mockTest]);
		});

		it('should return early if pagination validation fails', async () => {
			(pagination.hasPaginationParams as any).mockReturnValue(true);
			(pagination.validatePaginationOrError as any).mockReturnValue(null);

			const handler = getRouteHandler('GET', '/');
			await handler(mockReq, mockRes);

			expect(queries.getConversationsWithCount).not.toHaveBeenCalled();
		});

		it('should handle errors', async () => {
			const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
			(pagination.hasPaginationParams as any).mockReturnValue(false);
			(queries.getConversations as any).mockRejectedValue(new Error('Database error'));

			const handler = getRouteHandler('GET', '/');
			await handler(mockReq, mockRes);

			expect(mockStatus).toHaveBeenCalledWith(500);
			expect(mockJson).toHaveBeenCalledWith({ error: 'Failed to fetch tests' });
			consoleErrorSpy.mockRestore();
		});
	});

	describe('GET /api/tests/:id', () => {
		it('should return a single-turn conversation as test', async () => {
			mockReq.params = { id: '1' };
			const mockConversation = { id: 1, name: 'Test 1' };
			const mockMessages = [{ role: 'user', content: 'test' }];
			const mockTest = { id: 1, name: 'Test 1', input: 'test' };

			(queries.getConversationById as any).mockResolvedValue(mockConversation);
			(queries.getConversationMessages as any).mockResolvedValue(mockMessages);
			(legacyAdapter.isSingleTurnConversation as any).mockReturnValue(true);
			(legacyAdapter.conversationToLegacyTest as any).mockReturnValue(mockTest);

			const handler = getRouteHandler('GET', '/:id');
			await handler(mockReq, mockRes);

			expect(queries.getConversationById).toHaveBeenCalledWith(1);
			expect(queries.getConversationMessages).toHaveBeenCalledWith(1);
			expect(mockJson).toHaveBeenCalledWith(mockTest);
		});

		it('should return 404 if conversation not found', async () => {
			mockReq.params = { id: '999' };
			(queries.getConversationById as any).mockResolvedValue(null);

			const handler = getRouteHandler('GET', '/:id');
			await handler(mockReq, mockRes);

			expect(mockStatus).toHaveBeenCalledWith(404);
			expect(mockJson).toHaveBeenCalledWith({ error: 'Test not found' });
		});

		it('should return 404 if conversation is multi-turn', async () => {
			mockReq.params = { id: '1' };
			const mockConversation = { id: 1, name: 'Multi' };
			const mockMessages = [
				{ role: 'user', content: 'msg1' },
				{ role: 'assistant', content: 'reply' }
			];

			(queries.getConversationById as any).mockResolvedValue(mockConversation);
			(queries.getConversationMessages as any).mockResolvedValue(mockMessages);
			(legacyAdapter.isSingleTurnConversation as any).mockReturnValue(false);

			const handler = getRouteHandler('GET', '/:id');
			await handler(mockReq, mockRes);

			expect(mockStatus).toHaveBeenCalledWith(404);
			expect(mockJson).toHaveBeenCalledWith({ error: 'Test not found (multi-turn conversation)' });
		});

		it('should handle errors', async () => {
			const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
			mockReq.params = { id: '1' };
			(queries.getConversationById as any).mockRejectedValue(new Error('Database error'));

			const handler = getRouteHandler('GET', '/:id');
			await handler(mockReq, mockRes);

			expect(mockStatus).toHaveBeenCalledWith(500);
			expect(mockJson).toHaveBeenCalledWith({ error: 'Failed to fetch test' });
			consoleErrorSpy.mockRestore();
		});
	});

	describe('POST /api/tests', () => {
		it('should create a new test (conversation)', async () => {
			mockReq.body = {
				name: 'New Test',
				input: 'test input',
				expected_output: 'expected result'
			};
			const mockConversation = { id: 1, name: 'New Test' };
			const mockMessage = { id: 1, role: 'user', content: 'test input' };
			const mockTest = { id: 1, name: 'New Test', input: 'test input' };

			(legacyAdapter.legacyTestToConversation as any).mockReturnValue({
				conversation: { name: 'New Test' },
				messages: [{ role: 'user', content: 'test input' }]
			});
			(queries.createConversation as any).mockResolvedValue(mockConversation);
			(queries.addMessageToConversation as any).mockResolvedValue(mockMessage);
			(legacyAdapter.conversationToLegacyTest as any).mockReturnValue(mockTest);

			const handler = getRouteHandler('POST', '/');
			await handler(mockReq, mockRes);

			expect(queries.createConversation).toHaveBeenCalled();
			expect(queries.addMessageToConversation).toHaveBeenCalledWith({
				conversation_id: 1,
				role: 'user',
				content: 'test input'
			});
			expect(database.default.exec).toHaveBeenCalled();
			expect(mockStatus).toHaveBeenCalledWith(201);
			expect(mockJson).toHaveBeenCalledWith(mockTest);
		});

		it('should create test without expected_output', async () => {
			mockReq.body = {
				name: 'New Test',
				input: 'test input'
			};
			const mockConversation = { id: 1, name: 'New Test' };
			const mockMessage = { id: 1, role: 'user', content: 'test input' };
			const mockTest = { id: 1, name: 'New Test', input: 'test input' };

			(legacyAdapter.legacyTestToConversation as any).mockReturnValue({
				conversation: { name: 'New Test' },
				messages: [{ role: 'user', content: 'test input' }]
			});
			(queries.createConversation as any).mockResolvedValue(mockConversation);
			(queries.addMessageToConversation as any).mockResolvedValue(mockMessage);
			(legacyAdapter.conversationToLegacyTest as any).mockReturnValue(mockTest);

			const handler = getRouteHandler('POST', '/');
			await handler(mockReq, mockRes);

			expect(queries.createConversation).toHaveBeenCalled();
			expect(mockStatus).toHaveBeenCalledWith(201);
			expect(mockJson).toHaveBeenCalledWith(mockTest);
		});

		it('should return 400 if name is missing', async () => {
			mockReq.body = { input: 'test input' };

			const handler = getRouteHandler('POST', '/');
			await handler(mockReq, mockRes);

			expect(mockStatus).toHaveBeenCalledWith(400);
			expect(mockJson).toHaveBeenCalledWith({
				error: 'Failed to create test',
				details: 'Name and input are required fields'
			});
		});

		it('should return 400 if input is missing', async () => {
			mockReq.body = { name: 'Test' };

			const handler = getRouteHandler('POST', '/');
			await handler(mockReq, mockRes);

			expect(mockStatus).toHaveBeenCalledWith(400);
			expect(mockJson).toHaveBeenCalledWith({
				error: 'Failed to create test',
				details: 'Name and input are required fields'
			});
		});

		it('should handle turn target creation errors gracefully', async () => {
			mockReq.body = {
				name: 'New Test',
				input: 'test input',
				expected_output: 'expected result'
			};
			const mockConversation = { id: 1, name: 'New Test' };
			const mockMessage = { id: 1, role: 'user', content: 'test input' };
			const mockTest = { id: 1, name: 'New Test', input: 'test input' };

			(legacyAdapter.legacyTestToConversation as any).mockReturnValue({
				conversation: { name: 'New Test' },
				messages: [{ role: 'user', content: 'test input' }]
			});
			(queries.createConversation as any).mockResolvedValue(mockConversation);
			(queries.addMessageToConversation as any).mockResolvedValue(mockMessage);
			(legacyAdapter.conversationToLegacyTest as any).mockReturnValue(mockTest);
			(database.default.exec as any).mockImplementation(() => {
				throw new Error('DB error');
			});

			const handler = getRouteHandler('POST', '/');
			await handler(mockReq, mockRes);

			expect(mockStatus).toHaveBeenCalledWith(201);
			expect(mockJson).toHaveBeenCalledWith(mockTest);
		});

		it('should handle errors', async () => {
			const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
			mockReq.body = { name: 'Test', input: 'input' };
			(legacyAdapter.legacyTestToConversation as any).mockImplementation(() => {
				throw new Error('Conversion error');
			});

			const handler = getRouteHandler('POST', '/');
			await handler(mockReq, mockRes);

			expect(mockStatus).toHaveBeenCalledWith(500);
			expect(mockJson).toHaveBeenCalledWith({
				error: 'Failed to create test',
				details: 'Conversion error'
			});
			consoleErrorSpy.mockRestore();
		});
	});

	describe('PUT /api/tests/:id', () => {
		it('should update a test (conversation)', async () => {
			mockReq.params = { id: '1' };
			mockReq.body = {
				name: 'Updated Test',
				description: 'Updated description',
				input: 'updated input',
				expected_output: 'updated output'
			};
			const mockConversation = { id: 1, name: 'Old Test' };
			const mockMessages = [{ id: 1, role: 'user', content: 'old input' }];
			const mockUpdatedConversation = { id: 1, name: 'Updated Test', description: 'Updated description' };
			const mockUpdatedMessages = [{ id: 1, role: 'user', content: 'updated input' }];
			const mockTest = { id: 1, name: 'Updated Test', input: 'updated input' };

			(queries.getConversationById as any).mockResolvedValue(mockConversation);
			(queries.getConversationMessages as any)
				.mockResolvedValueOnce(mockMessages)
				.mockResolvedValueOnce(mockUpdatedMessages);
			(legacyAdapter.isSingleTurnConversation as any).mockReturnValue(true);
			(queries.updateConversation as any).mockResolvedValue(mockUpdatedConversation);
			(queries.updateConversationMessage as any).mockResolvedValue(undefined);
			(legacyAdapter.conversationToLegacyTest as any).mockReturnValue(mockTest);

			const handler = getRouteHandler('PUT', '/:id');
			await handler(mockReq, mockRes);

			expect(queries.getConversationById).toHaveBeenCalledWith(1);
			expect(queries.updateConversation).toHaveBeenCalledWith(1, {
				name: 'Updated Test',
				description: 'Updated description'
			});
			expect(queries.updateConversationMessage).toHaveBeenCalledWith(1, { content: 'updated input' });
			expect(database.default.exec).toHaveBeenCalled();
			expect(mockJson).toHaveBeenCalledWith(mockTest);
		});

		it('should update only provided fields', async () => {
			mockReq.params = { id: '1' };
			mockReq.body = { name: 'Updated Name' };
			const mockConversation = { id: 1, name: 'Old Test' };
			const mockMessages = [{ id: 1, role: 'user', content: 'input' }];
			const mockUpdatedConversation = { id: 1, name: 'Updated Name' };
			const mockTest = { id: 1, name: 'Updated Name', input: 'input' };

			(queries.getConversationById as any).mockResolvedValue(mockConversation);
			(queries.getConversationMessages as any).mockResolvedValue(mockMessages);
			(legacyAdapter.isSingleTurnConversation as any).mockReturnValue(true);
			(queries.updateConversation as any).mockResolvedValue(mockUpdatedConversation);
			(legacyAdapter.conversationToLegacyTest as any).mockReturnValue(mockTest);

			const handler = getRouteHandler('PUT', '/:id');
			await handler(mockReq, mockRes);

			expect(queries.updateConversation).toHaveBeenCalledWith(1, { name: 'Updated Name' });
			expect(queries.updateConversationMessage).not.toHaveBeenCalled();
			expect(mockJson).toHaveBeenCalledWith(mockTest);
		});

		it('should return 404 if conversation not found', async () => {
			mockReq.params = { id: '999' };
			mockReq.body = { name: 'Updated' };
			(queries.getConversationById as any).mockResolvedValue(null);

			const handler = getRouteHandler('PUT', '/:id');
			await handler(mockReq, mockRes);

			expect(mockStatus).toHaveBeenCalledWith(404);
			expect(mockJson).toHaveBeenCalledWith({ error: 'Test not found' });
		});

		it('should return 400 if conversation is multi-turn', async () => {
			mockReq.params = { id: '1' };
			mockReq.body = { name: 'Updated' };
			const mockConversation = { id: 1, name: 'Multi' };
			const mockMessages = [
				{ role: 'user', content: 'msg1' },
				{ role: 'assistant', content: 'reply' }
			];

			(queries.getConversationById as any).mockResolvedValue(mockConversation);
			(queries.getConversationMessages as any).mockResolvedValue(mockMessages);
			(legacyAdapter.isSingleTurnConversation as any).mockReturnValue(false);

			const handler = getRouteHandler('PUT', '/:id');
			await handler(mockReq, mockRes);

			expect(mockStatus).toHaveBeenCalledWith(400);
			expect(mockJson).toHaveBeenCalledWith({ error: 'Cannot update multi-turn conversation as test' });
		});

		it('should return 404 if update fails', async () => {
			mockReq.params = { id: '1' };
			mockReq.body = { name: 'Updated' };
			const mockConversation = { id: 1, name: 'Test' };
			const mockMessages = [{ role: 'user', content: 'input' }];

			(queries.getConversationById as any).mockResolvedValue(mockConversation);
			(queries.getConversationMessages as any).mockResolvedValue(mockMessages);
			(legacyAdapter.isSingleTurnConversation as any).mockReturnValue(true);
			(queries.updateConversation as any).mockResolvedValue(null);

			const handler = getRouteHandler('PUT', '/:id');
			await handler(mockReq, mockRes);

			expect(mockStatus).toHaveBeenCalledWith(404);
			expect(mockJson).toHaveBeenCalledWith({ error: 'Test not found' });
		});

		it('should handle turn target update errors gracefully', async () => {
			mockReq.params = { id: '1' };
			mockReq.body = { name: 'Updated', expected_output: 'output' };
			const mockConversation = { id: 1, name: 'Test' };
			const mockMessages = [{ role: 'user', content: 'input' }];
			const mockUpdatedConversation = { id: 1, name: 'Updated' };
			const mockTest = { id: 1, name: 'Updated', input: 'input' };

			(queries.getConversationById as any).mockResolvedValue(mockConversation);
			(queries.getConversationMessages as any).mockResolvedValue(mockMessages);
			(legacyAdapter.isSingleTurnConversation as any).mockReturnValue(true);
			(queries.updateConversation as any).mockResolvedValue(mockUpdatedConversation);
			(legacyAdapter.conversationToLegacyTest as any).mockReturnValue(mockTest);
			(database.default.exec as any).mockImplementation(() => {
				throw new Error('DB error');
			});

			const handler = getRouteHandler('PUT', '/:id');
			await handler(mockReq, mockRes);

			expect(mockJson).toHaveBeenCalledWith(mockTest);
		});

		it('should handle errors', async () => {
			const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
			mockReq.params = { id: '1' };
			mockReq.body = { name: 'Updated' };
			(queries.getConversationById as any).mockRejectedValue(new Error('Database error'));

			const handler = getRouteHandler('PUT', '/:id');
			await handler(mockReq, mockRes);

			expect(mockStatus).toHaveBeenCalledWith(500);
			expect(mockJson).toHaveBeenCalledWith({ error: 'Failed to update test' });
			consoleErrorSpy.mockRestore();
		});
	});

	describe('DELETE /api/tests/:id', () => {
		it('should delete a test (conversation)', async () => {
			mockReq.params = { id: '1' };
			const mockConversation = { id: 1, name: 'Test' };
			const mockMessages = [{ role: 'user', content: 'input' }];

			(queries.getConversationById as any).mockResolvedValue(mockConversation);
			(queries.getConversationMessages as any).mockResolvedValue(mockMessages);
			(legacyAdapter.isSingleTurnConversation as any).mockReturnValue(true);
			(queries.deleteConversation as any).mockResolvedValue(undefined);

			const handler = getRouteHandler('DELETE', '/:id');
			await handler(mockReq, mockRes);

			expect(queries.getConversationById).toHaveBeenCalledWith(1);
			expect(queries.deleteConversation).toHaveBeenCalledWith(1);
			expect(mockStatus).toHaveBeenCalledWith(204);
			expect(mockSend).toHaveBeenCalled();
		});

		it('should return 404 if conversation not found', async () => {
			mockReq.params = { id: '999' };
			(queries.getConversationById as any).mockResolvedValue(null);

			const handler = getRouteHandler('DELETE', '/:id');
			await handler(mockReq, mockRes);

			expect(mockStatus).toHaveBeenCalledWith(404);
			expect(mockJson).toHaveBeenCalledWith({ error: 'Test not found' });
		});

		it('should return 400 if conversation is multi-turn', async () => {
			mockReq.params = { id: '1' };
			const mockConversation = { id: 1, name: 'Multi' };
			const mockMessages = [
				{ role: 'user', content: 'msg1' },
				{ role: 'assistant', content: 'reply' }
			];

			(queries.getConversationById as any).mockResolvedValue(mockConversation);
			(queries.getConversationMessages as any).mockResolvedValue(mockMessages);
			(legacyAdapter.isSingleTurnConversation as any).mockReturnValue(false);

			const handler = getRouteHandler('DELETE', '/:id');
			await handler(mockReq, mockRes);

			expect(mockStatus).toHaveBeenCalledWith(400);
			expect(mockJson).toHaveBeenCalledWith({ error: 'Cannot delete multi-turn conversation as test' });
		});

		it('should handle errors', async () => {
			const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
			mockReq.params = { id: '1' };
			(queries.getConversationById as any).mockRejectedValue(new Error('Database error'));

			const handler = getRouteHandler('DELETE', '/:id');
			await handler(mockReq, mockRes);

			expect(mockStatus).toHaveBeenCalledWith(500);
			expect(mockJson).toHaveBeenCalledWith({
				error: 'Failed to delete test',
				details: 'Database error'
			});
			consoleErrorSpy.mockRestore();
		});
	});
});

// Made with Bob
