import type { Request, Response } from 'express';

// Mock all dependencies before imports
jest.mock('../../db/queries');
jest.mock('../../adapters/legacy-adapter');
jest.mock('../../lib/legacyIdResolver');
jest.mock('../../lib/tokenUsageExtractor');
jest.mock('../../services/scoring-service');

import {
	getExecutionSessionsWithCount,
	getExecutionSessionById,
	getSessionMessages,
	getConversationById,
	createExecutionSession,
	addSessionMessage,
	countUserTurnsUpTo,
	getConversationTurnTarget,
	getConversationMessages,
	getResultById,
	getTestById
} from '../../db/queries';
import { sessionToLegacyResult, legacyResultToSession } from '../../adapters/legacy-adapter';
import { testIdToConversationId } from '../../lib/legacyIdResolver';
import { extractTokenUsage, validateTokenUsage } from '../../lib/tokenUsageExtractor';

const mockGetExecutionSessionsWithCount = getExecutionSessionsWithCount as jest.MockedFunction<
	typeof getExecutionSessionsWithCount
>;
const mockGetExecutionSessionById = getExecutionSessionById as jest.MockedFunction<typeof getExecutionSessionById>;
const mockGetSessionMessages = getSessionMessages as jest.MockedFunction<typeof getSessionMessages>;
const mockGetConversationById = getConversationById as jest.MockedFunction<typeof getConversationById>;
const mockCreateExecutionSession = createExecutionSession as jest.MockedFunction<typeof createExecutionSession>;
const mockAddSessionMessage = addSessionMessage as jest.MockedFunction<typeof addSessionMessage>;
const mockCountUserTurnsUpTo = countUserTurnsUpTo as jest.MockedFunction<typeof countUserTurnsUpTo>;
const mockGetConversationTurnTarget = getConversationTurnTarget as jest.MockedFunction<
	typeof getConversationTurnTarget
>;
const mockGetConversationMessages = getConversationMessages as jest.MockedFunction<typeof getConversationMessages>;
const mockGetResultById = getResultById as jest.MockedFunction<typeof getResultById>;
const mockGetTestById = getTestById as jest.MockedFunction<typeof getTestById>;
const mockSessionToLegacyResult = sessionToLegacyResult as jest.MockedFunction<typeof sessionToLegacyResult>;
const mockLegacyResultToSession = legacyResultToSession as jest.MockedFunction<typeof legacyResultToSession>;
const mockTestIdToConversationId = testIdToConversationId as jest.MockedFunction<typeof testIdToConversationId>;
const mockExtractTokenUsage = extractTokenUsage as jest.MockedFunction<typeof extractTokenUsage>;
const mockValidateTokenUsage = validateTokenUsage as jest.MockedFunction<typeof validateTokenUsage>;

describe('Results Routes', () => {
	let resultsRouter: any;
	let mockReq: Partial<Request>;
	let mockRes: Partial<Response>;
	let jsonMock: jest.Mock;
	let statusMock: jest.Mock;

	beforeEach(async () => {
		jest.clearAllMocks();

		// Reset modules to get fresh router
		jest.isolateModules(() => {
			resultsRouter = require('../results').default;
		});

		jsonMock = jest.fn();
		statusMock = jest.fn().mockReturnValue({ json: jsonMock });

		mockReq = {
			query: {},
			params: {},
			body: {}
		};

		mockRes = {
			json: jsonMock,
			status: statusMock
		};
	});

	const getRouteHandler = (method: string, path: string) => {
		const routes = resultsRouter.stack || [];
		for (const layer of routes) {
			if (layer.route && layer.route.path === path) {
				const methodHandler = layer.route.stack.find((s: any) => s.method === method);
				if (methodHandler) {
					return methodHandler.handle;
				}
			}
		}
		throw new Error(`Route ${method.toUpperCase()} ${path} not found`);
	};

	const callRoute = async (handler: any, req: Partial<Request>, res: Partial<Response>) => {
		await handler(req, res);
	};

	describe('GET /', () => {
		it('should return results with default pagination when no params provided', async () => {
			const mockSessions = [
				{ id: 1, agent_id: 1, conversation_id: 1, status: 'completed', created_at: '2024-01-01' }
			];
			const mockMessages = [{ id: 1, session_id: 1, role: 'user', content: 'test', sequence: 1 }];
			const mockLegacyResult = {
				id: 1,
				agent_id: 1,
				test_id: 1,
				output: 'result',
				success: true,
				created_at: '2024-01-01'
			};

			(mockGetExecutionSessionsWithCount as any).mockReturnValue({
				data: mockSessions,
				total: 1
			});
			(mockGetSessionMessages as any).mockResolvedValue(mockMessages);
			(mockSessionToLegacyResult as any).mockReturnValue(mockLegacyResult);

			const handler = getRouteHandler('get', '/');
			await callRoute(handler, mockReq, mockRes);

			expect(mockGetExecutionSessionsWithCount).toHaveBeenCalledWith({
				limit: 50,
				offset: 0
			});
			expect(jsonMock).toHaveBeenCalledWith({
				data: [mockLegacyResult],
				total: 1,
				limit: 50,
				offset: 0
			});
		});

		it('should return results with custom pagination when params provided', async () => {
			mockReq.query = { limit: '10', offset: '5' };

			const mockSessions = [
				{ id: 1, agent_id: 1, conversation_id: 1, status: 'completed', created_at: '2024-01-01' }
			];
			const mockMessages = [{ id: 1, session_id: 1, role: 'user', content: 'test', sequence: 1 }];
			const mockLegacyResult = {
				id: 1,
				agent_id: 1,
				test_id: 1,
				output: 'result',
				success: true,
				created_at: '2024-01-01'
			};

			(mockGetExecutionSessionsWithCount as any).mockReturnValue({
				data: mockSessions,
				total: 100
			});
			(mockGetSessionMessages as any).mockResolvedValue(mockMessages);
			(mockSessionToLegacyResult as any).mockReturnValue(mockLegacyResult);

			const handler = getRouteHandler('get', '/');
			await callRoute(handler, mockReq, mockRes);

			expect(mockGetExecutionSessionsWithCount).toHaveBeenCalledWith({
				limit: 10,
				offset: 5
			});
			expect(jsonMock).toHaveBeenCalledWith({
				data: [mockLegacyResult],
				total: 100,
				limit: 10,
				offset: 5
			});
		});

		it('should filter by agent_id when provided', async () => {
			mockReq.query = { agent_id: '5' };

			(mockGetExecutionSessionsWithCount as any).mockReturnValue({
				data: [],
				total: 0
			});

			const handler = getRouteHandler('get', '/');
			await callRoute(handler, mockReq, mockRes);

			expect(mockGetExecutionSessionsWithCount).toHaveBeenCalledWith({
				agent_id: 5,
				limit: 50,
				offset: 0
			});
		});

		it('should filter by test_id (mapped to conversation_id) when provided', async () => {
			mockReq.query = { test_id: '10' };

			(mockGetExecutionSessionsWithCount as any).mockReturnValue({
				data: [],
				total: 0
			});

			const handler = getRouteHandler('get', '/');
			await callRoute(handler, mockReq, mockRes);

			expect(mockGetExecutionSessionsWithCount).toHaveBeenCalledWith({
				conversation_id: 10,
				limit: 50,
				offset: 0
			});
		});

		it('should calculate success from similarity score when available', async () => {
			mockReq.query = { limit: '10' };

			const mockSessions = [
				{ id: 1, agent_id: 1, conversation_id: 1, status: 'completed', created_at: '2024-01-01' }
			];
			const mockMessages = [
				{
					id: 1,
					session_id: 1,
					role: 'assistant',
					content: 'response',
					sequence: 2,
					similarity_scoring_status: 'completed',
					similarity_score: 85
				}
			];
			const mockLegacyResult = {
				id: 1,
				agent_id: 1,
				test_id: 1,
				output: 'result',
				success: false,
				created_at: '2024-01-01'
			};

			(mockGetExecutionSessionsWithCount as any).mockReturnValue({
				data: mockSessions,
				total: 1
			});
			(mockGetSessionMessages as any).mockResolvedValue(mockMessages);
			(mockSessionToLegacyResult as any).mockReturnValue(mockLegacyResult);
			(mockCountUserTurnsUpTo as any).mockReturnValue(1);
			(mockGetConversationTurnTarget as any).mockReturnValue({ threshold: 80 });

			const handler = getRouteHandler('get', '/');
			await callRoute(handler, mockReq, mockRes);

			expect(mockCountUserTurnsUpTo).toHaveBeenCalledWith(1, 2);
			expect(mockGetConversationTurnTarget).toHaveBeenCalledWith(1, 1);
			expect(jsonMock).toHaveBeenCalledWith({
				data: [{ ...mockLegacyResult, success: true }],
				total: 1,
				limit: 10,
				offset: 0
			});
		});

		it('should use default threshold of 70 when target not found', async () => {
			mockReq.query = { limit: '10' };

			const mockSessions = [
				{ id: 1, agent_id: 1, conversation_id: 1, status: 'completed', created_at: '2024-01-01' }
			];
			const mockMessages = [
				{
					id: 1,
					session_id: 1,
					role: 'assistant',
					content: 'response',
					sequence: 2,
					similarity_scoring_status: 'completed',
					similarity_score: 75
				}
			];
			const mockLegacyResult = {
				id: 1,
				agent_id: 1,
				test_id: 1,
				output: 'result',
				success: false,
				created_at: '2024-01-01'
			};

			(mockGetExecutionSessionsWithCount as any).mockReturnValue({
				data: mockSessions,
				total: 1
			});
			(mockGetSessionMessages as any).mockResolvedValue(mockMessages);
			(mockSessionToLegacyResult as any).mockReturnValue(mockLegacyResult);
			(mockCountUserTurnsUpTo as any).mockReturnValue(1);
			(mockGetConversationTurnTarget as any).mockReturnValue(null);

			const handler = getRouteHandler('get', '/');
			await callRoute(handler, mockReq, mockRes);

			expect(jsonMock).toHaveBeenCalledWith({
				data: [{ ...mockLegacyResult, success: true }],
				total: 1,
				limit: 10,
				offset: 0
			});
		});

		it('should handle errors gracefully', async () => {
			(mockGetExecutionSessionsWithCount as any).mockImplementation(() => {
				throw new Error('Database error');
			});

			const handler = getRouteHandler('get', '/');
			await callRoute(handler, mockReq, mockRes);

			expect(statusMock).toHaveBeenCalledWith(500);
			expect(jsonMock).toHaveBeenCalledWith({ error: 'Failed to fetch results' });
		});

		it('should handle invalid pagination params', async () => {
			mockReq.query = { limit: 'invalid' };

			const handler = getRouteHandler('get', '/');
			await callRoute(handler, mockReq, mockRes);

			expect(statusMock).toHaveBeenCalledWith(400);
		});
	});

	describe('GET /:id', () => {
		it('should return result by session ID', async () => {
			mockReq.params = { id: '1' };

			const mockSession = {
				id: 1,
				agent_id: 1,
				conversation_id: 1,
				status: 'completed',
				created_at: '2024-01-01'
			};
			const mockMessages = [{ id: 1, session_id: 1, role: 'user', content: 'test', sequence: 1 }];
			const mockLegacyResult = {
				id: 1,
				agent_id: 1,
				test_id: 1,
				output: 'result',
				success: true,
				created_at: '2024-01-01'
			};

			(mockGetExecutionSessionById as any).mockResolvedValue(mockSession);
			(mockGetSessionMessages as any).mockResolvedValue(mockMessages);
			(mockSessionToLegacyResult as any).mockReturnValue(mockLegacyResult);

			const handler = getRouteHandler('get', '/:id');
			await callRoute(handler, mockReq, mockRes);

			expect(mockGetExecutionSessionById).toHaveBeenCalledWith(1);
			expect(jsonMock).toHaveBeenCalledWith(mockLegacyResult);
		});

		it('should calculate success from similarity score when available', async () => {
			mockReq.params = { id: '1' };

			const mockSession = {
				id: 1,
				agent_id: 1,
				conversation_id: 1,
				status: 'completed',
				created_at: '2024-01-01'
			};
			const mockMessages = [
				{
					id: 1,
					session_id: 1,
					role: 'assistant',
					content: 'response',
					sequence: 2,
					similarity_scoring_status: 'completed',
					similarity_score: 90
				}
			];
			const mockLegacyResult = {
				id: 1,
				agent_id: 1,
				test_id: 1,
				output: 'result',
				success: false,
				created_at: '2024-01-01'
			};

			(mockGetExecutionSessionById as any).mockResolvedValue(mockSession);
			(mockGetSessionMessages as any).mockResolvedValue(mockMessages);
			(mockSessionToLegacyResult as any).mockReturnValue(mockLegacyResult);
			(mockCountUserTurnsUpTo as any).mockReturnValue(1);
			(mockGetConversationTurnTarget as any).mockReturnValue({ threshold: 75 });

			const handler = getRouteHandler('get', '/:id');
			await callRoute(handler, mockReq, mockRes);

			expect(jsonMock).toHaveBeenCalledWith({ ...mockLegacyResult, success: true });
		});

		it('should default to threshold 70 when target is missing', async () => {
			mockReq.params = { id: '1' };

			const mockSession = {
				id: 1,
				agent_id: 1,
				conversation_id: 1,
				status: 'completed',
				created_at: '2024-01-01'
			};
			const mockMessages = [
				{
					id: 1,
					session_id: 1,
					role: 'assistant',
					content: 'response',
					sequence: 2,
					similarity_scoring_status: 'completed',
					similarity_score: 70
				}
			];
			const mockLegacyResult = {
				id: 1,
				agent_id: 1,
				test_id: 1,
				output: 'result',
				success: false,
				created_at: '2024-01-01'
			};

			(mockGetExecutionSessionById as any).mockResolvedValue(mockSession);
			(mockGetSessionMessages as any).mockResolvedValue(mockMessages);
			(mockSessionToLegacyResult as any).mockReturnValue(mockLegacyResult);
			(mockCountUserTurnsUpTo as any).mockReturnValue(1);
			(mockGetConversationTurnTarget as any).mockReturnValue(undefined);

			const handler = getRouteHandler('get', '/:id');
			await callRoute(handler, mockReq, mockRes);

			expect(jsonMock).toHaveBeenCalledWith({ ...mockLegacyResult, success: true });
		});

		it('should return result without overriding success when assistant has no completed scoring', async () => {
			mockReq.params = { id: '1' };

			const mockSession = {
				id: 1,
				agent_id: 1,
				conversation_id: 1,
				status: 'completed',
				created_at: '2024-01-01'
			};
			const mockMessages = [
				{
					id: 1,
					session_id: 1,
					role: 'assistant',
					content: 'response',
					sequence: 2,
					similarity_scoring_status: 'pending',
					similarity_score: null
				}
			];
			const mockLegacyResult = {
				id: 1,
				agent_id: 1,
				test_id: 1,
				output: 'result',
				success: false,
				created_at: '2024-01-01'
			};

			(mockGetExecutionSessionById as any).mockResolvedValue(mockSession);
			(mockGetSessionMessages as any).mockResolvedValue(mockMessages);
			(mockSessionToLegacyResult as any).mockReturnValue(mockLegacyResult);

			const handler = getRouteHandler('get', '/:id');
			await callRoute(handler, mockReq, mockRes);

			expect(jsonMock).toHaveBeenCalledWith(mockLegacyResult);
		});

		it('should return result without overriding success when similarity calculation throws', async () => {
			mockReq.params = { id: '1' };

			const mockSession = {
				id: 1,
				agent_id: 1,
				conversation_id: 1,
				status: 'completed',
				created_at: '2024-01-01'
			};
			const mockMessages = [
				{
					id: 1,
					session_id: 1,
					role: 'assistant',
					content: 'response',
					sequence: 2,
					similarity_scoring_status: 'completed',
					similarity_score: 85
				}
			];
			const mockLegacyResult = {
				id: 1,
				agent_id: 1,
				test_id: 1,
				output: 'result',
				success: false,
				created_at: '2024-01-01'
			};

			(mockGetExecutionSessionById as any).mockResolvedValue(mockSession);
			(mockGetSessionMessages as any).mockResolvedValue(mockMessages);
			(mockSessionToLegacyResult as any).mockReturnValue(mockLegacyResult);
			(mockCountUserTurnsUpTo as any).mockReturnValue(1);
			(mockGetConversationTurnTarget as any).mockImplementation(() => {
				throw new Error('DB error');
			});

			const handler = getRouteHandler('get', '/:id');
			await callRoute(handler, mockReq, mockRes);

			expect(jsonMock).toHaveBeenCalledWith(mockLegacyResult);
		});

		it('should fallback to legacy result if session not found', async () => {
			mockReq.params = { id: '999' };

			const mockLegacyResultRow = {
				id: 999,
				agent_id: 1,
				test_id: 1,
				output: 'legacy result',
				intermediate_steps: '[]',
				success: true,
				execution_time: 1000,
				created_at: '2024-01-01'
			};

			(mockGetExecutionSessionById as any).mockResolvedValue(null);
			(mockGetResultById as any).mockReturnValue(mockLegacyResultRow);

			const handler = getRouteHandler('get', '/:id');
			await callRoute(handler, mockReq, mockRes);

			expect(mockGetResultById).toHaveBeenCalledWith(999);
			expect(jsonMock).toHaveBeenCalledWith(
				expect.objectContaining({
					id: 999,
					agent_id: 1,
					test_id: 1,
					output: 'legacy result',
					success: true
				})
			);
		});

		it('should return 404 if result not found', async () => {
			mockReq.params = { id: '999' };

			(mockGetExecutionSessionById as any).mockResolvedValue(null);
			(mockGetResultById as any).mockReturnValue(null);

			const handler = getRouteHandler('get', '/:id');
			await callRoute(handler, mockReq, mockRes);

			expect(statusMock).toHaveBeenCalledWith(404);
			expect(jsonMock).toHaveBeenCalledWith({ error: 'Result not found' });
		});

		it('should return 400 for invalid ID', async () => {
			mockReq.params = { id: 'invalid' };

			const handler = getRouteHandler('get', '/:id');
			await callRoute(handler, mockReq, mockRes);

			expect(statusMock).toHaveBeenCalledWith(400);
			expect(jsonMock).toHaveBeenCalledWith({ error: 'Invalid result ID' });
		});

		it('should handle errors gracefully', async () => {
			mockReq.params = { id: '1' };

			(mockGetExecutionSessionById as any).mockRejectedValue(new Error('Database error'));

			const handler = getRouteHandler('get', '/:id');
			await callRoute(handler, mockReq, mockRes);

			expect(statusMock).toHaveBeenCalledWith(500);
			expect(jsonMock).toHaveBeenCalledWith({ error: 'Failed to fetch result' });
		});
	});

	describe('POST /:id/score', () => {
		it('should score a result successfully', async () => {
			mockReq.params = { id: '1' };
			mockReq.body = { llm_config_id: 5 };

			const mockResult = {
				id: 1,
				agent_id: 1,
				test_id: 1,
				output: 'result',
				success: true,
				created_at: '2024-01-01'
			};
			const mockTest = {
				id: 1,
				name: 'Test',
				input: 'test input',
				expected_output: 'expected'
			};
			const mockUpdatedResult = {
				...mockResult,
				similarity_score: 85,
				similarity_scoring_status: 'completed'
			};

			(mockGetResultById as any).mockReturnValue(mockResult);
			(mockGetTestById as any).mockReturnValue(mockTest);

			// Mock the scoring service
			const mockScoringService = {
				scoreTestResult: jest.fn().mockResolvedValue(undefined)
			};
			jest.doMock('../../services/scoring-service', () => ({
				scoringService: mockScoringService
			}));

			// Get updated result after scoring
			(mockGetResultById as any).mockReturnValueOnce(mockResult).mockReturnValueOnce(mockUpdatedResult);

			const handler = getRouteHandler('post', '/:id/score');
			await callRoute(handler, mockReq, mockRes);

			expect(mockGetResultById).toHaveBeenCalledWith(1);
			expect(mockGetTestById).toHaveBeenCalledWith(1);
			expect(jsonMock).toHaveBeenCalledWith(mockUpdatedResult);
		});

		it('should return 404 when legacy result accessor is missing', async () => {
			mockReq.params = { id: '1' };
			mockReq.body = { llm_config_id: 5 };

			const queriesModule = require('../../db/queries');
			const originalGetResultById = queriesModule.getResultById;
			queriesModule.getResultById = undefined;

			try {
				const handler = getRouteHandler('post', '/:id/score');
				await callRoute(handler, mockReq, mockRes);

				expect(statusMock).toHaveBeenCalledWith(404);
				expect(jsonMock).toHaveBeenCalledWith({ error: 'Result not found' });
			} finally {
				queriesModule.getResultById = originalGetResultById;
			}
		});

		it('should return 404 when legacy test accessor is missing', async () => {
			mockReq.params = { id: '1' };
			mockReq.body = { llm_config_id: 5 };

			const mockResult = {
				id: 1,
				agent_id: 1,
				test_id: 1,
				output: 'result',
				success: true,
				created_at: '2024-01-01'
			};

			(mockGetResultById as any).mockReturnValue(mockResult);

			const queriesModule = require('../../db/queries');
			const originalGetTestById = queriesModule.getTestById;
			queriesModule.getTestById = undefined;

			try {
				const handler = getRouteHandler('post', '/:id/score');
				await callRoute(handler, mockReq, mockRes);

				expect(statusMock).toHaveBeenCalledWith(404);
				expect(jsonMock).toHaveBeenCalledWith({ error: 'Test associated with result not found' });
			} finally {
				queriesModule.getTestById = originalGetTestById;
			}
		});

		it('should return null when updated result is missing', async () => {
			mockReq.params = { id: '1' };
			mockReq.body = { llm_config_id: 5 };

			const mockResult = {
				id: 1,
				agent_id: 1,
				test_id: 1,
				output: 'result',
				success: true,
				created_at: '2024-01-01'
			};
			const mockTest = {
				id: 1,
				name: 'Test',
				input: 'test input',
				expected_output: 'expected'
			};

			(mockGetResultById as any).mockReturnValueOnce(mockResult).mockReturnValueOnce(null);
			(mockGetTestById as any).mockReturnValue(mockTest);

			const mockScoringService = {
				scoreTestResult: jest.fn().mockResolvedValue(undefined)
			};
			jest.doMock('../../services/scoring-service', () => ({
				scoringService: mockScoringService
			}));

			const handler = getRouteHandler('post', '/:id/score');
			await callRoute(handler, mockReq, mockRes);

			expect(jsonMock).toHaveBeenCalledWith(null);
		});

		it('should return 400 for invalid ID', async () => {
			mockReq.params = { id: 'invalid' };
			mockReq.body = { llm_config_id: 5 };

			const handler = getRouteHandler('post', '/:id/score');
			await callRoute(handler, mockReq, mockRes);

			expect(statusMock).toHaveBeenCalledWith(400);
			expect(jsonMock).toHaveBeenCalledWith({ error: 'Invalid result ID' });
		});

		it('should return 404 if result not found', async () => {
			mockReq.params = { id: '999' };
			mockReq.body = { llm_config_id: 5 };

			(mockGetResultById as any).mockReturnValue(null);

			const handler = getRouteHandler('post', '/:id/score');
			await callRoute(handler, mockReq, mockRes);

			expect(statusMock).toHaveBeenCalledWith(404);
			expect(jsonMock).toHaveBeenCalledWith({ error: 'Result not found' });
		});

		it('should return 404 if test not found', async () => {
			mockReq.params = { id: '1' };
			mockReq.body = { llm_config_id: 5 };

			const mockResult = {
				id: 1,
				agent_id: 1,
				test_id: 999,
				output: 'result',
				success: true,
				created_at: '2024-01-01'
			};

			(mockGetResultById as any).mockReturnValue(mockResult);
			(mockGetTestById as any).mockReturnValue(null);

			const handler = getRouteHandler('post', '/:id/score');
			await callRoute(handler, mockReq, mockRes);

			expect(statusMock).toHaveBeenCalledWith(404);
			expect(jsonMock).toHaveBeenCalledWith({ error: 'Test associated with result not found' });
		});

		it('should handle errors gracefully', async () => {
			mockReq.params = { id: '1' };
			mockReq.body = { llm_config_id: 5 };

			(mockGetResultById as any).mockImplementation(() => {
				throw new Error('Database error');
			});

			const handler = getRouteHandler('post', '/:id/score');
			await callRoute(handler, mockReq, mockRes);

			expect(statusMock).toHaveBeenCalledWith(500);
			expect(jsonMock).toHaveBeenCalledWith({ error: 'Failed to score result' });
		});
	});

	describe('POST /', () => {
		it('should create a new result successfully', async () => {
			mockReq.body = {
				agent_id: 1,
				test_id: 1,
				output: 'test output',
				intermediate_steps: '[]',
				success: true,
				execution_time: 1000
			};

			const mockConversation = {
				id: 1,
				name: 'Test Conversation',
				created_at: '2024-01-01'
			};
			const mockAuthoredMessages = [
				{ id: 1, conversation_id: 1, role: 'user', content: 'test input', sequence: 1 }
			];
			const mockSession = {
				agent_id: 1,
				conversation_id: 1,
				status: 'completed'
			};
			const mockMessages = [
				{ role: 'user', content: 'test input', sequence: 1 },
				{ role: 'assistant', content: 'test output', sequence: 2 }
			];
			const mockCreatedSession = {
				id: 1,
				...mockSession,
				created_at: '2024-01-01'
			};
			const mockCreatedMessage = {
				id: 1,
				session_id: 1,
				role: 'user',
				content: 'test input',
				sequence: 1
			};
			const mockLegacyResult = {
				id: 1,
				agent_id: 1,
				test_id: 1,
				output: 'test output',
				success: true,
				created_at: '2024-01-01'
			};

			(mockTestIdToConversationId as any).mockReturnValue(1);
			(mockGetConversationById as any).mockResolvedValue(mockConversation);
			(mockGetConversationMessages as any).mockResolvedValue(mockAuthoredMessages);
			(mockLegacyResultToSession as any).mockReturnValue({
				session: mockSession,
				messages: mockMessages
			});
			(mockCreateExecutionSession as any).mockResolvedValue(mockCreatedSession);
			(mockAddSessionMessage as any).mockResolvedValue(mockCreatedMessage);
			(mockSessionToLegacyResult as any).mockReturnValue(mockLegacyResult);

			const handler = getRouteHandler('post', '/');
			await callRoute(handler, mockReq, mockRes);

			expect(mockGetConversationById).toHaveBeenCalledWith(1);
			expect(mockCreateExecutionSession).toHaveBeenCalledWith(mockSession);
			expect(mockAddSessionMessage).toHaveBeenCalledTimes(2);
			expect(statusMock).toHaveBeenCalledWith(201);
			expect(jsonMock).toHaveBeenCalledWith(
				expect.objectContaining({
					id: 1,
					agent_id: 1,
					test_id: 1,
					output: 'test output',
					success: true
				})
			);
		});

		it('should extract token usage from intermediate steps if not provided', async () => {
			mockReq.body = {
				agent_id: 1,
				test_id: 1,
				output: 'test output',
				intermediate_steps: JSON.stringify([{ usage: { input_tokens: 10, output_tokens: 20 } }]),
				success: true,
				execution_time: 1000
			};

			const mockConversation = {
				id: 1,
				name: 'Test Conversation',
				created_at: '2024-01-01'
			};
			const mockAuthoredMessages = [
				{ id: 1, conversation_id: 1, role: 'user', content: 'test input', sequence: 1 }
			];
			const mockSession = {
				agent_id: 1,
				conversation_id: 1,
				status: 'completed'
			};
			const mockMessages = [{ role: 'user', content: 'test input', sequence: 1 }];
			const mockCreatedSession = {
				id: 1,
				...mockSession,
				created_at: '2024-01-01'
			};
			const mockCreatedMessage = {
				id: 1,
				session_id: 1,
				role: 'user',
				content: 'test input',
				sequence: 1
			};
			const mockLegacyResult = {
				id: 1,
				agent_id: 1,
				test_id: 1,
				output: 'test output',
				success: true,
				created_at: '2024-01-01',
				input_tokens: 10,
				output_tokens: 20
			};

			(mockTestIdToConversationId as any).mockReturnValue(1);
			(mockGetConversationById as any).mockResolvedValue(mockConversation);
			(mockGetConversationMessages as any).mockResolvedValue(mockAuthoredMessages);
			(mockExtractTokenUsage as any).mockReturnValue({
				tokens: { input_tokens: 10, output_tokens: 20 },
				metadata: { source: 'intermediate_steps' }
			});
			(mockValidateTokenUsage as any).mockReturnValue({
				input_tokens: 10,
				output_tokens: 20
			});
			(mockLegacyResultToSession as any).mockReturnValue({
				session: mockSession,
				messages: mockMessages
			});
			(mockCreateExecutionSession as any).mockResolvedValue(mockCreatedSession);
			(mockAddSessionMessage as any).mockResolvedValue(mockCreatedMessage);
			(mockSessionToLegacyResult as any).mockReturnValue(mockLegacyResult);

			const handler = getRouteHandler('post', '/');
			await callRoute(handler, mockReq, mockRes);

			expect(mockExtractTokenUsage).toHaveBeenCalled();
			expect(mockValidateTokenUsage).toHaveBeenCalledWith({
				input_tokens: 10,
				output_tokens: 20
			});
			expect(statusMock).toHaveBeenCalledWith(201);
		});

		it('should skip token metadata when extraction yields no tokens', async () => {
			mockReq.body = {
				agent_id: 1,
				test_id: 1,
				output: 'test output',
				intermediate_steps: '[]',
				success: true,
				execution_time: 1000
			};

			const mockConversation = {
				id: 1,
				name: 'Test Conversation',
				created_at: '2024-01-01'
			};
			const mockAuthoredMessages = [
				{ id: 1, conversation_id: 1, role: 'assistant', content: 'assistant message', sequence: 1 }
			];
			const mockSession = {
				agent_id: 1,
				conversation_id: 1,
				status: 'completed'
			};
			const mockMessages = [{ role: 'assistant', content: 'test output', sequence: 1 }];
			const mockCreatedSession = {
				id: 1,
				...mockSession,
				created_at: '2024-01-01'
			};
			const mockCreatedMessage = {
				id: 1,
				session_id: 1,
				role: 'assistant',
				content: 'test output',
				sequence: 1
			};
			const mockLegacyResult = {
				id: 1,
				agent_id: 1,
				test_id: 1,
				output: 'test output',
				success: true,
				created_at: '2024-01-01'
			};

			(mockTestIdToConversationId as any).mockReturnValue(1);
			(mockGetConversationById as any).mockResolvedValue(mockConversation);
			(mockGetConversationMessages as any).mockResolvedValue(mockAuthoredMessages);
			(mockExtractTokenUsage as any).mockReturnValue({
				tokens: { input_tokens: undefined, output_tokens: undefined },
				metadata: { source: 'intermediate_steps' }
			});
			(mockValidateTokenUsage as any).mockReturnValue({
				input_tokens: undefined,
				output_tokens: undefined
			});
			(mockLegacyResultToSession as any).mockReturnValue({
				session: mockSession,
				messages: mockMessages
			});
			(mockCreateExecutionSession as any).mockResolvedValue(mockCreatedSession);
			(mockAddSessionMessage as any).mockResolvedValue(mockCreatedMessage);
			(mockSessionToLegacyResult as any).mockReturnValue(mockLegacyResult);

			const handler = getRouteHandler('post', '/');
			await callRoute(handler, mockReq, mockRes);

			const [passedResult, passedInput] = mockLegacyResultToSession.mock.calls[0];
			expect(passedInput).toBe('');
			expect(Object.prototype.hasOwnProperty.call(passedResult, 'input_tokens')).toBe(false);
			expect(Object.prototype.hasOwnProperty.call(passedResult, 'output_tokens')).toBe(false);
			expect(Object.prototype.hasOwnProperty.call(passedResult, 'token_mapping_metadata')).toBe(false);
			expect(statusMock).toHaveBeenCalledWith(201);
		});

		it('should validate token usage if provided directly', async () => {
			mockReq.body = {
				agent_id: 1,
				test_id: 1,
				output: 'test output',
				intermediate_steps: '[]',
				success: true,
				execution_time: 1000,
				input_tokens: 15,
				output_tokens: 25
			};

			const mockConversation = {
				id: 1,
				name: 'Test Conversation',
				created_at: '2024-01-01'
			};
			const mockAuthoredMessages = [
				{ id: 1, conversation_id: 1, role: 'user', content: 'test input', sequence: 1 }
			];
			const mockSession = {
				agent_id: 1,
				conversation_id: 1,
				status: 'completed'
			};
			const mockMessages = [{ role: 'user', content: 'test input', sequence: 1 }];
			const mockCreatedSession = {
				id: 1,
				...mockSession,
				created_at: '2024-01-01'
			};
			const mockCreatedMessage = {
				id: 1,
				session_id: 1,
				role: 'user',
				content: 'test input',
				sequence: 1
			};
			const mockLegacyResult = {
				id: 1,
				agent_id: 1,
				test_id: 1,
				output: 'test output',
				success: true,
				created_at: '2024-01-01',
				input_tokens: 15,
				output_tokens: 25
			};

			(mockTestIdToConversationId as any).mockReturnValue(1);
			(mockGetConversationById as any).mockResolvedValue(mockConversation);
			(mockGetConversationMessages as any).mockResolvedValue(mockAuthoredMessages);
			(mockValidateTokenUsage as any).mockReturnValue({
				input_tokens: 15,
				output_tokens: 25
			});
			(mockLegacyResultToSession as any).mockReturnValue({
				session: mockSession,
				messages: mockMessages
			});
			(mockCreateExecutionSession as any).mockResolvedValue(mockCreatedSession);
			(mockAddSessionMessage as any).mockResolvedValue(mockCreatedMessage);
			(mockSessionToLegacyResult as any).mockReturnValue(mockLegacyResult);

			const handler = getRouteHandler('post', '/');
			await callRoute(handler, mockReq, mockRes);

			expect(mockValidateTokenUsage).toHaveBeenCalledWith({
				input_tokens: 15,
				output_tokens: 25
			});
			expect(statusMock).toHaveBeenCalledWith(201);
		});

		it('should return 404 if conversation not found', async () => {
			mockReq.body = {
				agent_id: 1,
				test_id: 999,
				output: 'test output',
				intermediate_steps: '[]',
				success: true,
				execution_time: 1000
			};

			(mockTestIdToConversationId as any).mockReturnValue(999);
			(mockGetConversationById as any).mockResolvedValue(null);

			const handler = getRouteHandler('post', '/');
			await callRoute(handler, mockReq, mockRes);

			expect(statusMock).toHaveBeenCalledWith(404);
			expect(jsonMock).toHaveBeenCalledWith({ error: 'Test not found' });
		});

		it('should handle token extraction errors gracefully', async () => {
			mockReq.body = {
				agent_id: 1,
				test_id: 1,
				output: 'test output',
				intermediate_steps: 'invalid json',
				success: true,
				execution_time: 1000
			};

			const mockConversation = {
				id: 1,
				name: 'Test Conversation',
				created_at: '2024-01-01'
			};
			const mockAuthoredMessages = [
				{ id: 1, conversation_id: 1, role: 'user', content: 'test input', sequence: 1 }
			];
			const mockSession = {
				agent_id: 1,
				conversation_id: 1,
				status: 'completed'
			};
			const mockMessages = [{ role: 'user', content: 'test input', sequence: 1 }];
			const mockCreatedSession = {
				id: 1,
				...mockSession,
				created_at: '2024-01-01'
			};
			const mockCreatedMessage = {
				id: 1,
				session_id: 1,
				role: 'user',
				content: 'test input',
				sequence: 1
			};
			const mockLegacyResult = {
				id: 1,
				agent_id: 1,
				test_id: 1,
				output: 'test output',
				success: true,
				created_at: '2024-01-01'
			};

			(mockTestIdToConversationId as any).mockReturnValue(1);
			(mockGetConversationById as any).mockResolvedValue(mockConversation);
			(mockGetConversationMessages as any).mockResolvedValue(mockAuthoredMessages);
			(mockExtractTokenUsage as any).mockImplementation(() => {
				throw new Error('Invalid JSON');
			});
			(mockLegacyResultToSession as any).mockReturnValue({
				session: mockSession,
				messages: mockMessages
			});
			(mockCreateExecutionSession as any).mockResolvedValue(mockCreatedSession);
			(mockAddSessionMessage as any).mockResolvedValue(mockCreatedMessage);
			(mockSessionToLegacyResult as any).mockReturnValue(mockLegacyResult);

			const handler = getRouteHandler('post', '/');
			await callRoute(handler, mockReq, mockRes);

			// Should still create result despite token extraction failure
			expect(statusMock).toHaveBeenCalledWith(201);
		});

		it('should handle errors gracefully', async () => {
			mockReq.body = {
				agent_id: 1,
				test_id: 1,
				output: 'test output',
				intermediate_steps: '[]',
				success: true,
				execution_time: 1000
			};

			(mockTestIdToConversationId as any).mockImplementation(() => {
				throw new Error('Database error');
			});

			const handler = getRouteHandler('post', '/');
			await callRoute(handler, mockReq, mockRes);

			expect(statusMock).toHaveBeenCalledWith(500);
			expect(jsonMock).toHaveBeenCalledWith({ error: 'Failed to create result' });
		});
	});
});

// Made with Bob
