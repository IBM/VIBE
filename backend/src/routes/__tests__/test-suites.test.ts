import type { Request, Response } from 'express';

// Mock all dependencies before imports
jest.mock('../../db/queries');
jest.mock('../../services/suite-processing-service');
jest.mock('../../adapters/legacy-adapter');
jest.mock('../../utils/pagination');

describe('Test Suites Routes', () => {
	let router: any;
	let mockReq: Partial<Request>;
	let mockRes: Partial<Response>;
	let mockJson: jest.Mock;
	let mockStatus: jest.Mock;
	let mockSend: jest.Mock;

	// Import mocked modules
	const queries = require('../../db/queries');
	const suiteProcessingService = require('../../services/suite-processing-service');
	const legacyAdapter = require('../../adapters/legacy-adapter');
	const pagination = require('../../utils/pagination');

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

		// Load router fresh for each test
		jest.isolateModules(() => {
			router = require('../test-suites').default;
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

	describe('GET /api/test-suites', () => {
		it('should return all test suites with test counts (no pagination)', async () => {
			const mockSuites = [
				{ id: 1, name: 'Suite 1', description: 'Test suite 1' },
				{ id: 2, name: 'Suite 2', description: 'Test suite 2' }
			];

			(pagination.hasPaginationParams as any).mockReturnValue(false);
			(queries.getTestSuites as any).mockReturnValue(mockSuites);
			(suiteProcessingService.suiteProcessingService.countLeafTests as any)
				.mockReturnValueOnce(5)
				.mockReturnValueOnce(3);

			const handler = getRouteHandler('GET', '/');
			await handler(mockReq, mockRes);

			expect(queries.getTestSuites).toHaveBeenCalled();
			expect(suiteProcessingService.suiteProcessingService.countLeafTests).toHaveBeenCalledWith(1);
			expect(suiteProcessingService.suiteProcessingService.countLeafTests).toHaveBeenCalledWith(2);
			expect(mockJson).toHaveBeenCalledWith([
				{ id: 1, name: 'Suite 1', description: 'Test suite 1', test_count: 5 },
				{ id: 2, name: 'Suite 2', description: 'Test suite 2', test_count: 3 }
			]);
		});

		it('should return paginated test suites with test counts', async () => {
			const mockSuites = [{ id: 1, name: 'Suite 1', description: 'Test suite 1' }];

			(pagination.hasPaginationParams as any).mockReturnValue(true);
			(pagination.validatePaginationOrError as any).mockReturnValue({ limit: 10, offset: 0 });
			(queries.getTestSuitesWithCount as any).mockReturnValue({
				data: mockSuites,
				total: 1
			});
			(suiteProcessingService.suiteProcessingService.countLeafTests as any).mockReturnValue(5);

			const handler = getRouteHandler('GET', '/');
			await handler(mockReq, mockRes);

			expect(queries.getTestSuitesWithCount).toHaveBeenCalledWith({ limit: 10, offset: 0 });
			expect(mockJson).toHaveBeenCalledWith({
				data: [{ id: 1, name: 'Suite 1', description: 'Test suite 1', test_count: 5 }],
				total: 1,
				limit: 10,
				offset: 0
			});
		});

		it('should handle test count calculation errors gracefully', async () => {
			const mockSuites = [{ id: 1, name: 'Suite 1' }];

			(pagination.hasPaginationParams as any).mockReturnValue(false);
			(queries.getTestSuites as any).mockReturnValue(mockSuites);
			(suiteProcessingService.suiteProcessingService.countLeafTests as any).mockImplementation(() => {
				throw new Error('Count error');
			});

			const handler = getRouteHandler('GET', '/');
			await handler(mockReq, mockRes);

			expect(mockJson).toHaveBeenCalledWith([{ id: 1, name: 'Suite 1', test_count: 0 }]);
		});

		it('should return early if pagination validation fails', async () => {
			(pagination.hasPaginationParams as any).mockReturnValue(true);
			(pagination.validatePaginationOrError as any).mockReturnValue(null);

			const handler = getRouteHandler('GET', '/');
			await handler(mockReq, mockRes);

			expect(queries.getTestSuitesWithCount).not.toHaveBeenCalled();
		});

		it('should handle errors', async () => {
			const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
			(pagination.hasPaginationParams as any).mockReturnValue(false);
			(queries.getTestSuites as any).mockImplementation(() => {
				throw new Error('Database error');
			});

			const handler = getRouteHandler('GET', '/');
			await handler(mockReq, mockRes);

			expect(mockStatus).toHaveBeenCalledWith(500);
			expect(mockJson).toHaveBeenCalledWith({ error: 'Failed to fetch test suites' });
			consoleErrorSpy.mockRestore();
		});
	});

	describe('GET /api/test-suites/:id', () => {
		it('should return a test suite by ID', async () => {
			const mockSuite = { id: 1, name: 'Suite 1', description: 'Test suite' };
			mockReq.params = { id: '1' };

			(queries.getTestSuiteById as any).mockResolvedValue(mockSuite);

			const handler = getRouteHandler('GET', '/:id');
			await handler(mockReq, mockRes);

			expect(queries.getTestSuiteById).toHaveBeenCalledWith(1);
			expect(mockJson).toHaveBeenCalledWith(mockSuite);
		});

		it('should return 400 for invalid ID', async () => {
			mockReq.params = { id: 'invalid' };

			const handler = getRouteHandler('GET', '/:id');
			await handler(mockReq, mockRes);

			expect(mockStatus).toHaveBeenCalledWith(400);
			expect(mockJson).toHaveBeenCalledWith({ error: 'Invalid test suite ID' });
		});

		it('should return 404 if test suite not found', async () => {
			mockReq.params = { id: '999' };
			(queries.getTestSuiteById as any).mockResolvedValue(null);

			const handler = getRouteHandler('GET', '/:id');
			await handler(mockReq, mockRes);

			expect(mockStatus).toHaveBeenCalledWith(404);
			expect(mockJson).toHaveBeenCalledWith({ error: 'Test suite not found' });
		});

		it('should handle errors', async () => {
			const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
			mockReq.params = { id: '1' };
			(queries.getTestSuiteById as any).mockRejectedValue(new Error('Database error'));

			const handler = getRouteHandler('GET', '/:id');
			await handler(mockReq, mockRes);

			expect(mockStatus).toHaveBeenCalledWith(500);
			expect(mockJson).toHaveBeenCalledWith({ error: 'Failed to fetch test suite' });
			consoleErrorSpy.mockRestore();
		});
	});

	describe('POST /api/test-suites', () => {
		it('should create a new test suite', async () => {
			const newSuite = { name: 'New Suite', description: 'Description', tags: ['tag1'] };
			const createdSuite = { id: 1, ...newSuite };
			mockReq.body = newSuite;

			(queries.createTestSuite as any).mockReturnValue(createdSuite);

			const handler = getRouteHandler('POST', '/');
			await handler(mockReq, mockRes);

			expect(queries.createTestSuite).toHaveBeenCalledWith(newSuite);
			expect(mockStatus).toHaveBeenCalledWith(201);
			expect(mockJson).toHaveBeenCalledWith(createdSuite);
		});

		it('should return 400 if name is missing', async () => {
			mockReq.body = { description: 'Description' };

			const handler = getRouteHandler('POST', '/');
			await handler(mockReq, mockRes);

			expect(mockStatus).toHaveBeenCalledWith(400);
			expect(mockJson).toHaveBeenCalledWith({ error: 'Test suite name is required' });
		});

		it('should handle errors', async () => {
			const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
			mockReq.body = { name: 'Suite' };
			(queries.createTestSuite as any).mockImplementation(() => {
				throw new Error('Database error');
			});

			const handler = getRouteHandler('POST', '/');
			await handler(mockReq, mockRes);

			expect(mockStatus).toHaveBeenCalledWith(500);
			expect(mockJson).toHaveBeenCalledWith({ error: 'Failed to create test suite' });
			consoleErrorSpy.mockRestore();
		});
	});

	describe('PUT /api/test-suites/:id', () => {
		it('should update a test suite', async () => {
			const updates = { name: 'Updated Suite', description: 'Updated' };
			const updatedSuite = { id: 1, ...updates };
			mockReq.params = { id: '1' };
			mockReq.body = updates;

			(queries.getTestSuiteById as any).mockResolvedValue({ id: 1, name: 'Old' });
			(queries.updateTestSuite as any).mockReturnValue(updatedSuite);

			const handler = getRouteHandler('PUT', '/:id');
			await handler(mockReq, mockRes);

			expect(queries.getTestSuiteById).toHaveBeenCalledWith(1);
			expect(queries.updateTestSuite).toHaveBeenCalledWith(1, updates);
			expect(mockJson).toHaveBeenCalledWith(updatedSuite);
		});

		it('should return 400 for invalid ID', async () => {
			mockReq.params = { id: 'invalid' };

			const handler = getRouteHandler('PUT', '/:id');
			await handler(mockReq, mockRes);

			expect(mockStatus).toHaveBeenCalledWith(400);
			expect(mockJson).toHaveBeenCalledWith({ error: 'Invalid test suite ID' });
		});

		it('should return 404 if test suite not found', async () => {
			mockReq.params = { id: '999' };
			mockReq.body = { name: 'Updated' };
			(queries.getTestSuiteById as any).mockResolvedValue(null);

			const handler = getRouteHandler('PUT', '/:id');
			await handler(mockReq, mockRes);

			expect(mockStatus).toHaveBeenCalledWith(404);
			expect(mockJson).toHaveBeenCalledWith({ error: 'Test suite not found' });
		});

		it('should handle errors', async () => {
			const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
			mockReq.params = { id: '1' };
			mockReq.body = { name: 'Updated' };
			(queries.getTestSuiteById as any).mockRejectedValue(new Error('Database error'));

			const handler = getRouteHandler('PUT', '/:id');
			await handler(mockReq, mockRes);

			expect(mockStatus).toHaveBeenCalledWith(500);
			expect(mockJson).toHaveBeenCalledWith({ error: 'Failed to update test suite' });
			consoleErrorSpy.mockRestore();
		});
	});

	describe('DELETE /api/test-suites/:id', () => {
		it('should delete a test suite', async () => {
			mockReq.params = { id: '1' };
			(queries.getTestSuiteById as any).mockResolvedValue({ id: 1, name: 'Suite' });
			(queries.deleteTestSuite as any).mockReturnValue(undefined);

			const handler = getRouteHandler('DELETE', '/:id');
			await handler(mockReq, mockRes);

			expect(queries.getTestSuiteById).toHaveBeenCalledWith(1);
			expect(queries.deleteTestSuite).toHaveBeenCalledWith(1);
			expect(mockStatus).toHaveBeenCalledWith(204);
			expect(mockSend).toHaveBeenCalled();
		});

		it('should return 400 for invalid ID', async () => {
			mockReq.params = { id: 'invalid' };

			const handler = getRouteHandler('DELETE', '/:id');
			await handler(mockReq, mockRes);

			expect(mockStatus).toHaveBeenCalledWith(400);
			expect(mockJson).toHaveBeenCalledWith({ error: 'Invalid test suite ID' });
		});

		it('should return 404 if test suite not found', async () => {
			mockReq.params = { id: '999' };
			(queries.getTestSuiteById as any).mockResolvedValue(null);

			const handler = getRouteHandler('DELETE', '/:id');
			await handler(mockReq, mockRes);

			expect(mockStatus).toHaveBeenCalledWith(404);
			expect(mockJson).toHaveBeenCalledWith({ error: 'Test suite not found' });
		});

		it('should handle errors', async () => {
			const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
			mockReq.params = { id: '1' };
			(queries.getTestSuiteById as any).mockRejectedValue(new Error('Database error'));

			const handler = getRouteHandler('DELETE', '/:id');
			await handler(mockReq, mockRes);

			expect(mockStatus).toHaveBeenCalledWith(500);
			expect(mockJson).toHaveBeenCalledWith({ error: 'Failed to delete test suite' });
			consoleErrorSpy.mockRestore();
		});
	});

	describe('GET /api/test-suites/:id/tests', () => {
		it('should return tests in a suite (single-turn conversations)', async () => {
			mockReq.params = { id: '1' };
			const mockEntries = [
				{ id: 1, conversation_id: 10, sequence: 1 },
				{ id: 2, conversation_id: 20, sequence: 2 }
			];
			const mockConversation1 = { id: 10, name: 'Conv 1' };
			const mockConversation2 = { id: 20, name: 'Conv 2' };
			const mockMessages1 = [{ role: 'user', content: 'test' }];
			const mockMessages2 = [{ role: 'user', content: 'test2' }];
			const mockLegacyTest1 = { id: 10, prompt: 'test' };
			const mockLegacyTest2 = { id: 20, prompt: 'test2' };

			(queries.getTestSuiteById as any).mockResolvedValue({ id: 1, name: 'Suite' });
			(queries.getEntriesInSuite as any).mockReturnValue(mockEntries);
			(queries.getConversationById as any)
				.mockResolvedValueOnce(mockConversation1)
				.mockResolvedValueOnce(mockConversation2);
			(queries.getConversationMessages as any)
				.mockResolvedValueOnce(mockMessages1)
				.mockResolvedValueOnce(mockMessages2);
			(legacyAdapter.isSingleTurnConversation as any).mockReturnValue(true);
			(legacyAdapter.conversationToLegacyTest as any)
				.mockReturnValueOnce(mockLegacyTest1)
				.mockReturnValueOnce(mockLegacyTest2);

			const handler = getRouteHandler('GET', '/:id/tests');
			await handler(mockReq, mockRes);

			expect(queries.getTestSuiteById).toHaveBeenCalledWith(1);
			expect(queries.getEntriesInSuite).toHaveBeenCalledWith(1);
			expect(mockJson).toHaveBeenCalledWith([
				{ ...mockLegacyTest1, sequence: 1 },
				{ ...mockLegacyTest2, sequence: 2 }
			]);
		});

		it('should filter out multi-turn conversations', async () => {
			mockReq.params = { id: '1' };
			const mockEntries = [
				{ id: 1, conversation_id: 10, sequence: 1 },
				{ id: 2, conversation_id: 20, sequence: 2 }
			];

			(queries.getTestSuiteById as any).mockResolvedValue({ id: 1, name: 'Suite' });
			(queries.getEntriesInSuite as any).mockReturnValue(mockEntries);
			(queries.getConversationById as any).mockResolvedValue({ id: 10, name: 'Conv' });
			(queries.getConversationMessages as any).mockResolvedValue([]);
			(legacyAdapter.isSingleTurnConversation as any).mockReturnValueOnce(true).mockReturnValueOnce(false);
			(legacyAdapter.conversationToLegacyTest as any).mockReturnValue({ id: 10, prompt: 'test' });

			const handler = getRouteHandler('GET', '/:id/tests');
			await handler(mockReq, mockRes);

			expect(mockJson).toHaveBeenCalledWith([{ id: 10, prompt: 'test', sequence: 1 }]);
		});

		it('should filter out entries without conversation_id (nested suites)', async () => {
			mockReq.params = { id: '1' };
			const mockEntries = [
				{ id: 1, conversation_id: 10, sequence: 1 },
				{ id: 2, child_suite_id: 5, sequence: 2 }
			];

			(queries.getTestSuiteById as any).mockResolvedValue({ id: 1, name: 'Suite' });
			(queries.getEntriesInSuite as any).mockReturnValue(mockEntries);
			(queries.getConversationById as any).mockResolvedValue({ id: 10, name: 'Conv' });
			(queries.getConversationMessages as any).mockResolvedValue([]);
			(legacyAdapter.isSingleTurnConversation as any).mockReturnValue(true);
			(legacyAdapter.conversationToLegacyTest as any).mockReturnValue({ id: 10, prompt: 'test' });

			const handler = getRouteHandler('GET', '/:id/tests');
			await handler(mockReq, mockRes);

			expect(queries.getConversationById).toHaveBeenCalledTimes(1);
			expect(mockJson).toHaveBeenCalledWith([{ id: 10, prompt: 'test', sequence: 1 }]);
		});

		it('should handle entry processing errors gracefully', async () => {
			mockReq.params = { id: '1' };
			const mockEntries = [{ id: 1, conversation_id: 10, sequence: 1 }];

			(queries.getTestSuiteById as any).mockResolvedValue({ id: 1, name: 'Suite' });
			(queries.getEntriesInSuite as any).mockReturnValue(mockEntries);
			(queries.getConversationById as any).mockRejectedValue(new Error('Conv error'));

			const handler = getRouteHandler('GET', '/:id/tests');
			await handler(mockReq, mockRes);

			expect(mockJson).toHaveBeenCalledWith([]);
		});

		it('should return 400 for invalid ID', async () => {
			mockReq.params = { id: 'invalid' };

			const handler = getRouteHandler('GET', '/:id/tests');
			await handler(mockReq, mockRes);

			expect(mockStatus).toHaveBeenCalledWith(400);
			expect(mockJson).toHaveBeenCalledWith({ error: 'Invalid test suite ID' });
		});

		it('should return 404 if test suite not found', async () => {
			mockReq.params = { id: '999' };
			(queries.getTestSuiteById as any).mockResolvedValue(null);

			const handler = getRouteHandler('GET', '/:id/tests');
			await handler(mockReq, mockRes);

			expect(mockStatus).toHaveBeenCalledWith(404);
			expect(mockJson).toHaveBeenCalledWith({ error: 'Test suite not found' });
		});

		it('should handle errors', async () => {
			const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
			mockReq.params = { id: '1' };
			(queries.getTestSuiteById as any).mockRejectedValue(new Error('Database error'));

			const handler = getRouteHandler('GET', '/:id/tests');
			await handler(mockReq, mockRes);

			expect(mockStatus).toHaveBeenCalledWith(500);
			expect(mockJson).toHaveBeenCalledWith({ error: 'Failed to fetch tests for suite' });
			consoleErrorSpy.mockRestore();
		});
	});

	describe('POST /api/test-suites/:id/tests', () => {
		it('should add a test to a suite', async () => {
			mockReq.params = { id: '1' };
			mockReq.body = { test_id: '10', sequence: 1 };
			const mockConversation = { id: 10, name: 'Conv' };
			const mockMessages = [{ role: 'user', content: 'test' }];
			const mockEntry = { id: 1, parent_suite_id: 1, conversation_id: 10, sequence: 1 };

			(queries.getTestSuiteById as any).mockResolvedValue({ id: 1, name: 'Suite' });
			(queries.getConversationById as any).mockResolvedValue(mockConversation);
			(queries.getConversationMessages as any).mockResolvedValue(mockMessages);
			(legacyAdapter.isSingleTurnConversation as any).mockReturnValue(true);
			(queries.addSuiteEntry as any).mockReturnValue(mockEntry);

			const handler = getRouteHandler('POST', '/:id/tests');
			await handler(mockReq, mockRes);

			expect(queries.getTestSuiteById).toHaveBeenCalledWith(1);
			expect(queries.getConversationById).toHaveBeenCalledWith(10);
			expect(queries.addSuiteEntry).toHaveBeenCalledWith({
				parent_suite_id: 1,
				conversation_id: 10,
				sequence: 1
			});
			expect(mockStatus).toHaveBeenCalledWith(201);
			expect(mockJson).toHaveBeenCalledWith(mockEntry);
		});

		it('should return 400 for invalid suite ID', async () => {
			mockReq.params = { id: 'invalid' };

			const handler = getRouteHandler('POST', '/:id/tests');
			await handler(mockReq, mockRes);

			expect(mockStatus).toHaveBeenCalledWith(400);
			expect(mockJson).toHaveBeenCalledWith({ error: 'Invalid test suite ID' });
		});

		it('should return 400 if test_id is missing', async () => {
			mockReq.params = { id: '1' };
			mockReq.body = { sequence: 1 };

			const handler = getRouteHandler('POST', '/:id/tests');
			await handler(mockReq, mockRes);

			expect(mockStatus).toHaveBeenCalledWith(400);
			expect(mockJson).toHaveBeenCalledWith({ error: 'Valid test ID is required' });
		});

		it('should return 400 if test_id is invalid', async () => {
			mockReq.params = { id: '1' };
			mockReq.body = { test_id: 'invalid' };

			const handler = getRouteHandler('POST', '/:id/tests');
			await handler(mockReq, mockRes);

			expect(mockStatus).toHaveBeenCalledWith(400);
			expect(mockJson).toHaveBeenCalledWith({ error: 'Valid test ID is required' });
		});

		it('should return 404 if test suite not found', async () => {
			mockReq.params = { id: '999' };
			mockReq.body = { test_id: '10' };
			(queries.getTestSuiteById as any).mockResolvedValue(null);

			const handler = getRouteHandler('POST', '/:id/tests');
			await handler(mockReq, mockRes);

			expect(mockStatus).toHaveBeenCalledWith(404);
			expect(mockJson).toHaveBeenCalledWith({ error: 'Test suite not found' });
		});

		it('should return 404 if conversation not found', async () => {
			mockReq.params = { id: '1' };
			mockReq.body = { test_id: '999' };
			(queries.getTestSuiteById as any).mockResolvedValue({ id: 1, name: 'Suite' });
			(queries.getConversationById as any).mockResolvedValue(null);

			const handler = getRouteHandler('POST', '/:id/tests');
			await handler(mockReq, mockRes);

			expect(mockStatus).toHaveBeenCalledWith(404);
			expect(mockJson).toHaveBeenCalledWith({ error: 'Test not found' });
		});

		it('should return 400 if conversation is multi-turn', async () => {
			mockReq.params = { id: '1' };
			mockReq.body = { test_id: '10' };
			(queries.getTestSuiteById as any).mockResolvedValue({ id: 1, name: 'Suite' });
			(queries.getConversationById as any).mockResolvedValue({ id: 10, name: 'Conv' });
			(queries.getConversationMessages as any).mockResolvedValue([]);
			(legacyAdapter.isSingleTurnConversation as any).mockReturnValue(false);

			const handler = getRouteHandler('POST', '/:id/tests');
			await handler(mockReq, mockRes);

			expect(mockStatus).toHaveBeenCalledWith(400);
			expect(mockJson).toHaveBeenCalledWith({ error: 'Cannot add multi-turn conversation as test to suite' });
		});

		it('should handle errors', async () => {
			const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
			mockReq.params = { id: '1' };
			mockReq.body = { test_id: '10' };
			(queries.getTestSuiteById as any).mockRejectedValue(new Error('Database error'));

			const handler = getRouteHandler('POST', '/:id/tests');
			await handler(mockReq, mockRes);

			expect(mockStatus).toHaveBeenCalledWith(500);
			expect(mockJson).toHaveBeenCalledWith({ error: 'Failed to add test to suite' });
			consoleErrorSpy.mockRestore();
		});
	});

	describe('DELETE /api/test-suites/:id/tests/:testId', () => {
		it('should remove a test from a suite', async () => {
			mockReq.params = { id: '1', testId: '10' };
			const mockEntries = [
				{ id: 1, conversation_id: 10, sequence: 1 },
				{ id: 2, conversation_id: 20, sequence: 2 }
			];

			(queries.getTestSuiteById as any).mockResolvedValue({ id: 1, name: 'Suite' });
			(queries.getEntriesInSuite as any).mockReturnValue(mockEntries);
			(queries.deleteSuiteEntry as any).mockReturnValue(undefined);

			const handler = getRouteHandler('DELETE', '/:id/tests/:testId');
			await handler(mockReq, mockRes);

			expect(queries.getTestSuiteById).toHaveBeenCalledWith(1);
			expect(queries.getEntriesInSuite).toHaveBeenCalledWith(1);
			expect(queries.deleteSuiteEntry).toHaveBeenCalledWith(1);
			expect(mockStatus).toHaveBeenCalledWith(204);
			expect(mockSend).toHaveBeenCalled();
		});

		it('should return 400 for invalid suite ID', async () => {
			mockReq.params = { id: 'invalid', testId: '10' };

			const handler = getRouteHandler('DELETE', '/:id/tests/:testId');
			await handler(mockReq, mockRes);

			expect(mockStatus).toHaveBeenCalledWith(400);
			expect(mockJson).toHaveBeenCalledWith({ error: 'Invalid suite ID or test ID' });
		});

		it('should return 400 for invalid test ID', async () => {
			mockReq.params = { id: '1', testId: 'invalid' };

			const handler = getRouteHandler('DELETE', '/:id/tests/:testId');
			await handler(mockReq, mockRes);

			expect(mockStatus).toHaveBeenCalledWith(400);
			expect(mockJson).toHaveBeenCalledWith({ error: 'Invalid suite ID or test ID' });
		});

		it('should return 404 if test suite not found', async () => {
			mockReq.params = { id: '999', testId: '10' };
			(queries.getTestSuiteById as any).mockResolvedValue(null);

			const handler = getRouteHandler('DELETE', '/:id/tests/:testId');
			await handler(mockReq, mockRes);

			expect(mockStatus).toHaveBeenCalledWith(404);
			expect(mockJson).toHaveBeenCalledWith({ error: 'Test suite not found' });
		});

		it('should return 404 if test not found in suite', async () => {
			mockReq.params = { id: '1', testId: '999' };
			const mockEntries = [{ id: 1, conversation_id: 10, sequence: 1 }];

			(queries.getTestSuiteById as any).mockResolvedValue({ id: 1, name: 'Suite' });
			(queries.getEntriesInSuite as any).mockReturnValue(mockEntries);

			const handler = getRouteHandler('DELETE', '/:id/tests/:testId');
			await handler(mockReq, mockRes);

			expect(mockStatus).toHaveBeenCalledWith(404);
			expect(mockJson).toHaveBeenCalledWith({ error: 'Test not found in suite' });
		});

		it('should handle errors', async () => {
			const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
			mockReq.params = { id: '1', testId: '10' };
			(queries.getTestSuiteById as any).mockRejectedValue(new Error('Database error'));

			const handler = getRouteHandler('DELETE', '/:id/tests/:testId');
			await handler(mockReq, mockRes);

			expect(mockStatus).toHaveBeenCalledWith(500);
			expect(mockJson).toHaveBeenCalledWith({ error: 'Failed to remove test from suite' });
			consoleErrorSpy.mockRestore();
		});
	});

	describe('PUT /api/test-suites/:id/tests/reorder', () => {
		it('should reorder tests in a suite', async () => {
			mockReq.params = { id: '1' };
			mockReq.body = {
				test_orders: [
					{ test_id: 10, sequence: 2 },
					{ test_id: 20, sequence: 1 }
				]
			};
			const mockEntries = [
				{ id: 1, conversation_id: 10, sequence: 1 },
				{ id: 2, conversation_id: 20, sequence: 2 }
			];

			(queries.getTestSuiteById as any).mockResolvedValue({ id: 1, name: 'Suite' });
			(queries.getEntriesInSuite as any).mockReturnValue(mockEntries);
			(queries.reorderSuiteEntries as any).mockReturnValue(undefined);

			const handler = getRouteHandler('PUT', '/:id/tests/reorder');
			await handler(mockReq, mockRes);

			expect(queries.getTestSuiteById).toHaveBeenCalledWith(1);
			expect(queries.reorderSuiteEntries).toHaveBeenCalledWith(1, [
				{ entry_id: 1, sequence: 2 },
				{ entry_id: 2, sequence: 1 }
			]);
			expect(mockStatus).toHaveBeenCalledWith(200);
			expect(mockJson).toHaveBeenCalledWith({ success: true });
		});

		it('should return 400 for invalid suite ID', async () => {
			mockReq.params = { id: 'invalid' };

			const handler = getRouteHandler('PUT', '/:id/tests/reorder');
			await handler(mockReq, mockRes);

			expect(mockStatus).toHaveBeenCalledWith(400);
			expect(mockJson).toHaveBeenCalledWith({ error: 'Invalid test suite ID' });
		});

		it('should return 400 if test_orders is not an array', async () => {
			mockReq.params = { id: '1' };
			mockReq.body = { test_orders: 'invalid' };

			const handler = getRouteHandler('PUT', '/:id/tests/reorder');
			await handler(mockReq, mockRes);

			expect(mockStatus).toHaveBeenCalledWith(400);
			expect(mockJson).toHaveBeenCalledWith({ error: 'Valid test orders array is required' });
		});

		it('should return 400 if test_orders is empty', async () => {
			mockReq.params = { id: '1' };
			mockReq.body = { test_orders: [] };

			const handler = getRouteHandler('PUT', '/:id/tests/reorder');
			await handler(mockReq, mockRes);

			expect(mockStatus).toHaveBeenCalledWith(400);
			expect(mockJson).toHaveBeenCalledWith({ error: 'Valid test orders array is required' });
		});

		it('should return 404 if test suite not found', async () => {
			mockReq.params = { id: '999' };
			mockReq.body = { test_orders: [{ test_id: 10, sequence: 1 }] };
			(queries.getTestSuiteById as any).mockResolvedValue(null);

			const handler = getRouteHandler('PUT', '/:id/tests/reorder');
			await handler(mockReq, mockRes);

			expect(mockStatus).toHaveBeenCalledWith(404);
			expect(mockJson).toHaveBeenCalledWith({ error: 'Test suite not found' });
		});

		it('should handle test not found in suite', async () => {
			const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
			mockReq.params = { id: '1' };
			mockReq.body = { test_orders: [{ test_id: 999, sequence: 1 }] };
			const mockEntries = [{ id: 1, conversation_id: 10, sequence: 1 }];

			(queries.getTestSuiteById as any).mockResolvedValue({ id: 1, name: 'Suite' });
			(queries.getEntriesInSuite as any).mockReturnValue(mockEntries);

			const handler = getRouteHandler('PUT', '/:id/tests/reorder');
			await handler(mockReq, mockRes);

			expect(mockStatus).toHaveBeenCalledWith(500);
			expect(mockJson).toHaveBeenCalledWith({ error: 'Failed to reorder tests in suite' });
			consoleErrorSpy.mockRestore();
		});

		it('should handle errors', async () => {
			const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
			mockReq.params = { id: '1' };
			mockReq.body = { test_orders: [{ test_id: 10, sequence: 1 }] };
			(queries.getTestSuiteById as any).mockRejectedValue(new Error('Database error'));

			const handler = getRouteHandler('PUT', '/:id/tests/reorder');
			await handler(mockReq, mockRes);

			expect(mockStatus).toHaveBeenCalledWith(500);
			expect(mockJson).toHaveBeenCalledWith({ error: 'Failed to reorder tests in suite' });
			consoleErrorSpy.mockRestore();
		});
	});

	describe('GET /api/test-suites/:id/entries', () => {
		it('should return all entries in a suite', async () => {
			mockReq.params = { id: '1' };
			const mockEntries = [
				{ id: 1, conversation_id: 10, sequence: 1 },
				{ id: 2, child_suite_id: 5, sequence: 2 }
			];

			(queries.getTestSuiteById as any).mockResolvedValue({ id: 1, name: 'Suite' });
			(queries.getEntriesInSuite as any).mockReturnValue(mockEntries);

			const handler = getRouteHandler('GET', '/:id/entries');
			await handler(mockReq, mockRes);

			expect(queries.getTestSuiteById).toHaveBeenCalledWith(1);
			expect(queries.getEntriesInSuite).toHaveBeenCalledWith(1);
			expect(mockJson).toHaveBeenCalledWith(mockEntries);
		});

		it('should return 400 for invalid suite ID', async () => {
			mockReq.params = { id: 'invalid' };

			const handler = getRouteHandler('GET', '/:id/entries');
			await handler(mockReq, mockRes);

			expect(mockStatus).toHaveBeenCalledWith(400);
			expect(mockJson).toHaveBeenCalledWith({ error: 'Invalid test suite ID' });
		});

		it('should return 404 if test suite not found', async () => {
			mockReq.params = { id: '999' };
			(queries.getTestSuiteById as any).mockResolvedValue(null);

			const handler = getRouteHandler('GET', '/:id/entries');
			await handler(mockReq, mockRes);

			expect(mockStatus).toHaveBeenCalledWith(404);
			expect(mockJson).toHaveBeenCalledWith({ error: 'Test suite not found' });
		});

		it('should handle errors', async () => {
			const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
			mockReq.params = { id: '1' };
			(queries.getTestSuiteById as any).mockRejectedValue(new Error('Database error'));

			const handler = getRouteHandler('GET', '/:id/entries');
			await handler(mockReq, mockRes);

			expect(mockStatus).toHaveBeenCalledWith(500);
			expect(mockJson).toHaveBeenCalledWith({ error: 'Failed to fetch entries for suite' });
			consoleErrorSpy.mockRestore();
		});
	});

	describe('POST /api/test-suites/:id/entries', () => {
		it('should add an entry with test_id', async () => {
			mockReq.params = { id: '1' };
			mockReq.body = { test_id: '10', sequence: 1, agent_id_override: '5' };
			const mockEntry = { id: 1, parent_suite_id: 1, test_id: 10, sequence: 1, agent_id_override: 5 };

			(queries.getTestSuiteById as any).mockResolvedValue({ id: 1, name: 'Suite' });
			(queries.addSuiteEntry as any).mockReturnValue(mockEntry);

			const handler = getRouteHandler('POST', '/:id/entries');
			await handler(mockReq, mockRes);

			expect(queries.addSuiteEntry).toHaveBeenCalledWith({
				parent_suite_id: 1,
				sequence: 1,
				test_id: 10,
				child_suite_id: undefined,
				agent_id_override: 5
			});
			expect(mockStatus).toHaveBeenCalledWith(201);
			expect(mockJson).toHaveBeenCalledWith(mockEntry);
		});

		it('should add an entry with child_suite_id', async () => {
			mockReq.params = { id: '1' };
			mockReq.body = { child_suite_id: '5', sequence: 2 };
			const mockEntry = { id: 2, parent_suite_id: 1, child_suite_id: 5, sequence: 2 };

			(queries.getTestSuiteById as any).mockResolvedValue({ id: 1, name: 'Suite' });
			(queries.addSuiteEntry as any).mockReturnValue(mockEntry);

			const handler = getRouteHandler('POST', '/:id/entries');
			await handler(mockReq, mockRes);

			expect(queries.addSuiteEntry).toHaveBeenCalledWith({
				parent_suite_id: 1,
				sequence: 2,
				test_id: undefined,
				child_suite_id: 5,
				agent_id_override: undefined
			});
			expect(mockStatus).toHaveBeenCalledWith(201);
			expect(mockJson).toHaveBeenCalledWith(mockEntry);
		});

		it('should return 400 for invalid suite ID', async () => {
			mockReq.params = { id: 'invalid' };

			const handler = getRouteHandler('POST', '/:id/entries');
			await handler(mockReq, mockRes);

			expect(mockStatus).toHaveBeenCalledWith(400);
			expect(mockJson).toHaveBeenCalledWith({ error: 'Invalid test suite ID' });
		});

		it('should return 400 if neither test_id nor child_suite_id provided', async () => {
			mockReq.params = { id: '1' };
			mockReq.body = { sequence: 1 };

			const handler = getRouteHandler('POST', '/:id/entries');
			await handler(mockReq, mockRes);

			expect(mockStatus).toHaveBeenCalledWith(400);
			expect(mockJson).toHaveBeenCalledWith({ error: 'Either test_id or child_suite_id must be provided' });
		});

		it('should return 400 if both test_id and child_suite_id provided', async () => {
			mockReq.params = { id: '1' };
			mockReq.body = { test_id: '10', child_suite_id: '5' };

			const handler = getRouteHandler('POST', '/:id/entries');
			await handler(mockReq, mockRes);

			expect(mockStatus).toHaveBeenCalledWith(400);

			expect(mockJson).toHaveBeenCalledWith({ error: 'Cannot specify both test_id and child_suite_id' });
		});

		it('should return 404 if test suite not found', async () => {
			mockReq.params = { id: '999' };
			mockReq.body = { test_id: '10' };
			(queries.getTestSuiteById as any).mockResolvedValue(null);

			const handler = getRouteHandler('POST', '/:id/entries');
			await handler(mockReq, mockRes);

			expect(mockStatus).toHaveBeenCalledWith(404);
			expect(mockJson).toHaveBeenCalledWith({ error: 'Test suite not found' });
		});

		it('should handle errors', async () => {
			const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
			mockReq.params = { id: '1' };
			mockReq.body = { test_id: '10' };
			(queries.getTestSuiteById as any).mockRejectedValue(new Error('Database error'));

			const handler = getRouteHandler('POST', '/:id/entries');
			await handler(mockReq, mockRes);

			expect(mockStatus).toHaveBeenCalledWith(500);
			expect(mockJson).toHaveBeenCalledWith({ error: 'Failed to add entry to suite' });
			consoleErrorSpy.mockRestore();
		});
	});

	describe('PUT /api/test-suites/:id/entries/:entryId', () => {
		it('should update a suite entry', async () => {
			mockReq.params = { id: '1', entryId: '1' };
			mockReq.body = { sequence: 5, agent_id_override: '10' };

			(queries.updateSuiteEntryOrder as any).mockReturnValue(undefined);

			const handler = getRouteHandler('PUT', '/:id/entries/:entryId');
			await handler(mockReq, mockRes);

			expect(queries.updateSuiteEntryOrder).toHaveBeenCalledWith(1, 5, '10');
			expect(mockJson).toHaveBeenCalledWith({ message: 'Entry updated successfully' });
		});

		it('should return 400 for invalid entry ID', async () => {
			mockReq.params = { id: '1', entryId: 'invalid' };

			const handler = getRouteHandler('PUT', '/:id/entries/:entryId');
			await handler(mockReq, mockRes);

			expect(mockStatus).toHaveBeenCalledWith(400);
			expect(mockJson).toHaveBeenCalledWith({ error: 'Invalid entry ID' });
		});

		it('should handle errors', async () => {
			const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
			mockReq.params = { id: '1', entryId: '1' };
			mockReq.body = { sequence: 5 };
			(queries.updateSuiteEntryOrder as any).mockImplementation(() => {
				throw new Error('Database error');
			});

			const handler = getRouteHandler('PUT', '/:id/entries/:entryId');
			await handler(mockReq, mockRes);

			expect(mockStatus).toHaveBeenCalledWith(500);
			expect(mockJson).toHaveBeenCalledWith({ error: 'Failed to update entry' });
			consoleErrorSpy.mockRestore();
		});
	});

	describe('DELETE /api/test-suites/:id/entries/:entryId', () => {
		it('should delete a suite entry', async () => {
			mockReq.params = { id: '1', entryId: '1' };
			(queries.deleteSuiteEntry as any).mockReturnValue(undefined);

			const handler = getRouteHandler('DELETE', '/:id/entries/:entryId');
			await handler(mockReq, mockRes);

			expect(queries.deleteSuiteEntry).toHaveBeenCalledWith(1);
			expect(mockStatus).toHaveBeenCalledWith(204);
			expect(mockSend).toHaveBeenCalled();
		});

		it('should return 400 for invalid entry ID', async () => {
			mockReq.params = { id: '1', entryId: 'invalid' };

			const handler = getRouteHandler('DELETE', '/:id/entries/:entryId');
			await handler(mockReq, mockRes);

			expect(mockStatus).toHaveBeenCalledWith(400);
			expect(mockJson).toHaveBeenCalledWith({ error: 'Invalid entry ID' });
		});

		it('should handle errors', async () => {
			const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
			mockReq.params = { id: '1', entryId: '1' };
			(queries.deleteSuiteEntry as any).mockImplementation(() => {
				throw new Error('Database error');
			});

			const handler = getRouteHandler('DELETE', '/:id/entries/:entryId');
			await handler(mockReq, mockRes);

			expect(mockStatus).toHaveBeenCalledWith(500);
			expect(mockJson).toHaveBeenCalledWith({ error: 'Failed to delete entry' });
			consoleErrorSpy.mockRestore();
		});
	});

	describe('PUT /api/test-suites/:id/entries/reorder', () => {
		it('should reorder entries in a suite', async () => {
			mockReq.params = { id: '1' };
			mockReq.body = {
				entry_orders: [
					{ entry_id: '1', sequence: '2' },
					{ entry_id: '2', sequence: '1' }
				]
			};

			(queries.getTestSuiteById as any).mockResolvedValue({ id: 1, name: 'Suite' });
			(queries.reorderSuiteEntries as any).mockReturnValue(undefined);

			const handler = getRouteHandler('PUT', '/:id/entries/reorder');
			await handler(mockReq, mockRes);

			expect(queries.getTestSuiteById).toHaveBeenCalledWith(1);
			expect(queries.reorderSuiteEntries).toHaveBeenCalledWith(1, mockReq.body.entry_orders);
			expect(mockJson).toHaveBeenCalledWith({ message: 'Entries reordered successfully' });
		});

		it('should return 400 for invalid suite ID', async () => {
			mockReq.params = { id: 'invalid' };

			const handler = getRouteHandler('PUT', '/:id/entries/reorder');
			await handler(mockReq, mockRes);

			expect(mockStatus).toHaveBeenCalledWith(400);
			expect(mockJson).toHaveBeenCalledWith({ error: 'Invalid test suite ID' });
		});

		it('should return 400 if entry_orders is not an array', async () => {
			mockReq.params = { id: '1' };
			mockReq.body = { entry_orders: 'invalid' };

			const handler = getRouteHandler('PUT', '/:id/entries/reorder');
			await handler(mockReq, mockRes);

			expect(mockStatus).toHaveBeenCalledWith(400);
			expect(mockJson).toHaveBeenCalledWith({ error: 'entry_orders must be an array' });
		});

		it('should return 400 if entry_orders has invalid format', async () => {
			mockReq.params = { id: '1' };
			mockReq.body = {
				entry_orders: [{ entry_id: 'invalid', sequence: '1' }]
			};

			const handler = getRouteHandler('PUT', '/:id/entries/reorder');
			await handler(mockReq, mockRes);

			expect(mockStatus).toHaveBeenCalledWith(400);
			expect(mockJson).toHaveBeenCalledWith({ error: 'Each entry order must have valid entry_id and sequence' });
		});

		it('should return 404 if test suite not found', async () => {
			mockReq.params = { id: '999' };
			mockReq.body = {
				entry_orders: [{ entry_id: '1', sequence: '1' }]
			};
			(queries.getTestSuiteById as any).mockResolvedValue(null);

			const handler = getRouteHandler('PUT', '/:id/entries/reorder');
			await handler(mockReq, mockRes);

			expect(mockStatus).toHaveBeenCalledWith(404);
			expect(mockJson).toHaveBeenCalledWith({ error: 'Test suite not found' });
		});

		it('should handle errors', async () => {
			const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
			mockReq.params = { id: '1' };
			mockReq.body = {
				entry_orders: [{ entry_id: '1', sequence: '1' }]
			};
			(queries.getTestSuiteById as any).mockRejectedValue(new Error('Database error'));

			const handler = getRouteHandler('PUT', '/:id/entries/reorder');
			await handler(mockReq, mockRes);

			expect(mockStatus).toHaveBeenCalledWith(500);
			expect(mockJson).toHaveBeenCalledWith({ error: 'Failed to reorder entries' });
			consoleErrorSpy.mockRestore();
		});
	});
});
