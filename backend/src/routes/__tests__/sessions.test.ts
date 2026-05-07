import type { Request, Response } from 'express';

// Mock all dependencies before imports
jest.mock('../../db/queries');

import {
	getExecutionSessions,
	getExecutionSessionsWithCount,
	getExecutionSessionById,
	updateExecutionSession,
	getSessionMessages,
	getFullSessionTranscript,
	createExecutionSession
} from '../../db/queries';

const mockGetExecutionSessions = getExecutionSessions as jest.MockedFunction<typeof getExecutionSessions>;
const mockGetExecutionSessionsWithCount = getExecutionSessionsWithCount as jest.MockedFunction<
	typeof getExecutionSessionsWithCount
>;
const mockGetExecutionSessionById = getExecutionSessionById as jest.MockedFunction<typeof getExecutionSessionById>;
const mockUpdateExecutionSession = updateExecutionSession as jest.MockedFunction<typeof updateExecutionSession>;
const mockGetSessionMessages = getSessionMessages as jest.MockedFunction<typeof getSessionMessages>;
const mockGetFullSessionTranscript = getFullSessionTranscript as jest.MockedFunction<typeof getFullSessionTranscript>;
const mockCreateExecutionSession = createExecutionSession as jest.MockedFunction<typeof createExecutionSession>;

describe('Sessions Routes', () => {
	let sessionsRouter: any;
	let mockReq: Partial<Request>;
	let mockRes: Partial<Response>;
	let jsonMock: jest.Mock;
	let statusMock: jest.Mock;
	let sendMock: jest.Mock;

	beforeEach(async () => {
		jest.clearAllMocks();

		// Reset modules to get fresh router
		jest.isolateModules(() => {
			sessionsRouter = require('../sessions').default;
		});

		jsonMock = jest.fn();
		sendMock = jest.fn();
		statusMock = jest.fn().mockReturnValue({ json: jsonMock, send: sendMock });

		mockReq = {
			query: {},
			params: {},
			body: {}
		};

		mockRes = {
			json: jsonMock,
			status: statusMock,
			send: sendMock
		};
	});

	const getRouteHandler = (method: string, path: string) => {
		const routes = sessionsRouter.stack || [];
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
		it('should return all sessions without pagination', async () => {
			const mockSessions = [
				{ id: 1, agent_id: 1, conversation_id: 1, status: 'completed', created_at: '2024-01-01' },
				{ id: 2, agent_id: 1, conversation_id: 2, status: 'running', created_at: '2024-01-02' }
			];

			(mockGetExecutionSessions as any).mockResolvedValue(mockSessions);

			const handler = getRouteHandler('get', '/');
			await callRoute(handler, mockReq, mockRes);

			expect(mockGetExecutionSessions).toHaveBeenCalledWith({});
			expect(jsonMock).toHaveBeenCalledWith(mockSessions);
		});

		it('should return sessions with pagination when params provided', async () => {
			mockReq.query = { limit: '10', offset: '5' };

			const mockSessions = [
				{ id: 1, agent_id: 1, conversation_id: 1, status: 'completed', created_at: '2024-01-01' }
			];

			(mockGetExecutionSessionsWithCount as any).mockReturnValue({
				data: mockSessions,
				total: 100
			});

			const handler = getRouteHandler('get', '/');
			await callRoute(handler, mockReq, mockRes);

			expect(mockGetExecutionSessionsWithCount).toHaveBeenCalledWith({
				limit: 10,
				offset: 5
			});
			expect(jsonMock).toHaveBeenCalledWith({
				data: mockSessions,
				total: 100,
				limit: 10,
				offset: 5
			});
		});

		it('should filter by conversation_id when provided', async () => {
			mockReq.query = { conversation_id: '5' };

			(mockGetExecutionSessions as any).mockResolvedValue([]);

			const handler = getRouteHandler('get', '/');
			await callRoute(handler, mockReq, mockRes);

			expect(mockGetExecutionSessions).toHaveBeenCalledWith({
				conversation_id: 5
			});
		});

		it('should filter by agent_id when provided', async () => {
			mockReq.query = { agent_id: '3' };

			(mockGetExecutionSessions as any).mockResolvedValue([]);

			const handler = getRouteHandler('get', '/');
			await callRoute(handler, mockReq, mockRes);

			expect(mockGetExecutionSessions).toHaveBeenCalledWith({
				agent_id: 3
			});
		});

		it('should filter by both conversation_id and agent_id', async () => {
			mockReq.query = { conversation_id: '5', agent_id: '3' };

			(mockGetExecutionSessions as any).mockResolvedValue([]);

			const handler = getRouteHandler('get', '/');
			await callRoute(handler, mockReq, mockRes);

			expect(mockGetExecutionSessions).toHaveBeenCalledWith({
				conversation_id: 5,
				agent_id: 3
			});
		});

		it('should handle invalid pagination params', async () => {
			mockReq.query = { limit: 'invalid' };

			const handler = getRouteHandler('get', '/');
			await callRoute(handler, mockReq, mockRes);

			expect(statusMock).toHaveBeenCalledWith(400);
		});

		it('should handle errors gracefully', async () => {
			(mockGetExecutionSessions as any).mockRejectedValue(new Error('Database error'));

			const handler = getRouteHandler('get', '/');
			await callRoute(handler, mockReq, mockRes);

			expect(statusMock).toHaveBeenCalledWith(500);
			expect(jsonMock).toHaveBeenCalledWith({ error: 'Failed to fetch execution sessions' });
		});
	});

	describe('GET /:id', () => {
		it('should return session by id', async () => {
			mockReq.params = { id: '1' };

			const mockSession = {
				id: 1,
				agent_id: 1,
				conversation_id: 1,
				status: 'completed',
				created_at: '2024-01-01'
			};

			(mockGetExecutionSessionById as any).mockResolvedValue(mockSession);

			const handler = getRouteHandler('get', '/:id');
			await callRoute(handler, mockReq, mockRes);

			expect(mockGetExecutionSessionById).toHaveBeenCalledWith(1);
			expect(jsonMock).toHaveBeenCalledWith(mockSession);
		});

		it('should return 404 if session not found', async () => {
			mockReq.params = { id: '999' };

			(mockGetExecutionSessionById as any).mockResolvedValue(null);

			const handler = getRouteHandler('get', '/:id');
			await callRoute(handler, mockReq, mockRes);

			expect(statusMock).toHaveBeenCalledWith(404);
			expect(jsonMock).toHaveBeenCalledWith({ error: 'Execution session not found' });
		});

		it('should handle errors gracefully', async () => {
			mockReq.params = { id: '1' };

			(mockGetExecutionSessionById as any).mockRejectedValue(new Error('Database error'));

			const handler = getRouteHandler('get', '/:id');
			await callRoute(handler, mockReq, mockRes);

			expect(statusMock).toHaveBeenCalledWith(500);
			expect(jsonMock).toHaveBeenCalledWith({ error: 'Failed to fetch execution session' });
		});
	});

	describe('GET /:id/messages', () => {
		it('should return session messages', async () => {
			mockReq.params = { id: '1' };

			const mockSession = {
				id: 1,
				agent_id: 1,
				conversation_id: 1,
				status: 'completed',
				created_at: '2024-01-01'
			};
			const mockMessages = [
				{ id: 1, session_id: 1, role: 'user', content: 'test', sequence: 1 },
				{ id: 2, session_id: 1, role: 'assistant', content: 'response', sequence: 2 }
			];

			(mockGetExecutionSessionById as any).mockResolvedValue(mockSession);
			(mockGetSessionMessages as any).mockResolvedValue(mockMessages);

			const handler = getRouteHandler('get', '/:id/messages');
			await callRoute(handler, mockReq, mockRes);

			expect(mockGetExecutionSessionById).toHaveBeenCalledWith(1);
			expect(mockGetSessionMessages).toHaveBeenCalledWith(1);
			expect(jsonMock).toHaveBeenCalledWith(mockMessages);
		});

		it('should return 404 if session not found', async () => {
			mockReq.params = { id: '999' };

			(mockGetExecutionSessionById as any).mockResolvedValue(null);

			const handler = getRouteHandler('get', '/:id/messages');
			await callRoute(handler, mockReq, mockRes);

			expect(statusMock).toHaveBeenCalledWith(404);
			expect(jsonMock).toHaveBeenCalledWith({ error: 'Execution session not found' });
		});

		it('should handle errors gracefully', async () => {
			mockReq.params = { id: '1' };

			(mockGetExecutionSessionById as any).mockRejectedValue(new Error('Database error'));

			const handler = getRouteHandler('get', '/:id/messages');
			await callRoute(handler, mockReq, mockRes);

			expect(statusMock).toHaveBeenCalledWith(500);
			expect(jsonMock).toHaveBeenCalledWith({ error: 'Failed to fetch session messages' });
		});
	});

	describe('GET /:id/transcript', () => {
		it('should return full session transcript', async () => {
			mockReq.params = { id: '1' };

			const mockTranscript = {
				session: {
					id: 1,
					agent_id: 1,
					conversation_id: 1,
					status: 'completed',
					created_at: '2024-01-01'
				},
				messages: [
					{ id: 1, session_id: 1, role: 'user', content: 'test', sequence: 1 },
					{ id: 2, session_id: 1, role: 'assistant', content: 'response', sequence: 2 }
				]
			};

			(mockGetFullSessionTranscript as any).mockResolvedValue(mockTranscript);

			const handler = getRouteHandler('get', '/:id/transcript');
			await callRoute(handler, mockReq, mockRes);

			expect(mockGetFullSessionTranscript).toHaveBeenCalledWith(1);
			expect(jsonMock).toHaveBeenCalledWith(mockTranscript);
		});

		it('should return 404 if session not found', async () => {
			mockReq.params = { id: '999' };

			const mockTranscript = {
				session: null,
				messages: []
			};

			(mockGetFullSessionTranscript as any).mockResolvedValue(mockTranscript);

			const handler = getRouteHandler('get', '/:id/transcript');
			await callRoute(handler, mockReq, mockRes);

			expect(statusMock).toHaveBeenCalledWith(404);
			expect(jsonMock).toHaveBeenCalledWith({ error: 'Execution session not found' });
		});

		it('should handle errors gracefully', async () => {
			mockReq.params = { id: '1' };

			(mockGetFullSessionTranscript as any).mockRejectedValue(new Error('Database error'));

			const handler = getRouteHandler('get', '/:id/transcript');
			await callRoute(handler, mockReq, mockRes);

			expect(statusMock).toHaveBeenCalledWith(500);
			expect(jsonMock).toHaveBeenCalledWith({ error: 'Failed to fetch session transcript' });
		});
	});

	describe('PUT /:id', () => {
		it('should update session successfully', async () => {
			mockReq.params = { id: '1' };
			mockReq.body = {
				status: 'completed',
				completed_at: '2024-01-01T12:00:00.000Z'
			};

			const mockExistingSession = {
				id: 1,
				agent_id: 1,
				conversation_id: 1,
				status: 'running',
				created_at: '2024-01-01'
			};
			const mockUpdatedSession = {
				...mockExistingSession,
				status: 'completed',
				completed_at: '2024-01-01T12:00:00.000Z'
			};

			(mockGetExecutionSessionById as any).mockResolvedValue(mockExistingSession);
			(mockUpdateExecutionSession as any).mockResolvedValue(mockUpdatedSession);

			const handler = getRouteHandler('put', '/:id');
			await callRoute(handler, mockReq, mockRes);

			expect(mockGetExecutionSessionById).toHaveBeenCalledWith(1);
			expect(mockUpdateExecutionSession).toHaveBeenCalledWith(1, mockReq.body);
			expect(jsonMock).toHaveBeenCalledWith(mockUpdatedSession);
		});

		it('should return 404 if session not found', async () => {
			mockReq.params = { id: '999' };
			mockReq.body = { status: 'completed' };

			(mockGetExecutionSessionById as any).mockResolvedValue(null);

			const handler = getRouteHandler('put', '/:id');
			await callRoute(handler, mockReq, mockRes);

			expect(statusMock).toHaveBeenCalledWith(404);
			expect(jsonMock).toHaveBeenCalledWith({ error: 'Execution session not found' });
		});

		it('should handle errors gracefully', async () => {
			mockReq.params = { id: '1' };
			mockReq.body = { status: 'completed' };

			(mockGetExecutionSessionById as any).mockRejectedValue(new Error('Database error'));

			const handler = getRouteHandler('put', '/:id');
			await callRoute(handler, mockReq, mockRes);

			expect(statusMock).toHaveBeenCalledWith(500);
			expect(jsonMock).toHaveBeenCalledWith({ error: 'Failed to update execution session' });
		});
	});

	describe('POST /', () => {
		it('should create session successfully', async () => {
			mockReq.body = {
				agent_id: 1,
				conversation_id: 1,
				status: 'running'
			};

			const mockCreatedSession = {
				id: 1,
				agent_id: 1,
				conversation_id: 1,
				status: 'running',
				success: null,
				metadata: null,
				error_message: null,
				created_at: '2024-01-01T00:00:00.000Z'
			};

			(mockCreateExecutionSession as any).mockResolvedValue(mockCreatedSession);

			const handler = getRouteHandler('post', '/');
			await callRoute(handler, mockReq, mockRes);

			expect(mockCreateExecutionSession).toHaveBeenCalledWith(
				expect.objectContaining({
					agent_id: 1,
					conversation_id: 1,
					status: 'running',
					success: null,
					metadata: null,
					error_message: null
				})
			);
			expect(statusMock).toHaveBeenCalledWith(201);
			expect(jsonMock).toHaveBeenCalledWith(mockCreatedSession);
		});

		it('should normalize conversation_id and agent_id to numbers', async () => {
			mockReq.body = {
				agent_id: '1',
				conversation_id: '2',
				status: 'running'
			};

			const mockCreatedSession = {
				id: 1,
				agent_id: 1,
				conversation_id: 2,
				status: 'running',
				created_at: '2024-01-01T00:00:00.000Z'
			};

			(mockCreateExecutionSession as any).mockResolvedValue(mockCreatedSession);

			const handler = getRouteHandler('post', '/');
			await callRoute(handler, mockReq, mockRes);

			expect(mockCreateExecutionSession).toHaveBeenCalledWith(
				expect.objectContaining({
					agent_id: 1,
					conversation_id: 2
				})
			);
		});

		it('should convert boolean success to 0/1', async () => {
			mockReq.body = {
				agent_id: 1,
				conversation_id: 1,
				status: 'completed',
				success: true
			};

			const mockCreatedSession = {
				id: 1,
				agent_id: 1,
				conversation_id: 1,
				status: 'completed',
				success: 1,
				created_at: '2024-01-01T00:00:00.000Z'
			};

			(mockCreateExecutionSession as any).mockResolvedValue(mockCreatedSession);

			const handler = getRouteHandler('post', '/');
			await callRoute(handler, mockReq, mockRes);

			expect(mockCreateExecutionSession).toHaveBeenCalledWith(
				expect.objectContaining({
					success: 1
				})
			);
		});

		it('should convert false success to 0', async () => {
			mockReq.body = {
				agent_id: 1,
				conversation_id: 1,
				status: 'completed',
				success: false
			};

			const mockCreatedSession = {
				id: 1,
				agent_id: 1,
				conversation_id: 1,
				status: 'completed',
				success: 0,
				created_at: '2024-01-01T00:00:00.000Z'
			};

			(mockCreateExecutionSession as any).mockResolvedValue(mockCreatedSession);

			const handler = getRouteHandler('post', '/');
			await callRoute(handler, mockReq, mockRes);

			expect(mockCreateExecutionSession).toHaveBeenCalledWith(
				expect.objectContaining({
					success: 0
				})
			);
		});

		it('should convert numeric success to 0/1', async () => {
			mockReq.body = {
				agent_id: 1,
				conversation_id: 1,
				status: 'completed',
				success: 1
			};

			const mockCreatedSession = {
				id: 1,
				agent_id: 1,
				conversation_id: 1,
				status: 'completed',
				success: 1,
				created_at: '2024-01-01T00:00:00.000Z'
			};

			(mockCreateExecutionSession as any).mockResolvedValue(mockCreatedSession);

			const handler = getRouteHandler('post', '/');
			await callRoute(handler, mockReq, mockRes);

			expect(mockCreateExecutionSession).toHaveBeenCalledWith(
				expect.objectContaining({
					success: 1
				})
			);
		});

		it('should set success to null if undefined', async () => {
			mockReq.body = {
				agent_id: 1,
				conversation_id: 1,
				status: 'running'
			};

			const mockCreatedSession = {
				id: 1,
				agent_id: 1,
				conversation_id: 1,
				status: 'running',
				success: null,
				created_at: '2024-01-01T00:00:00.000Z'
			};

			(mockCreateExecutionSession as any).mockResolvedValue(mockCreatedSession);

			const handler = getRouteHandler('post', '/');
			await callRoute(handler, mockReq, mockRes);

			expect(mockCreateExecutionSession).toHaveBeenCalledWith(
				expect.objectContaining({
					success: null
				})
			);
		});

		it('should stringify metadata object', async () => {
			mockReq.body = {
				agent_id: 1,
				conversation_id: 1,
				status: 'running',
				metadata: { key: 'value' }
			};

			const mockCreatedSession = {
				id: 1,
				agent_id: 1,
				conversation_id: 1,
				status: 'running',
				metadata: '{"key":"value"}',
				created_at: '2024-01-01T00:00:00.000Z'
			};

			(mockCreateExecutionSession as any).mockResolvedValue(mockCreatedSession);

			const handler = getRouteHandler('post', '/');
			await callRoute(handler, mockReq, mockRes);

			expect(mockCreateExecutionSession).toHaveBeenCalledWith(
				expect.objectContaining({
					metadata: '{"key":"value"}'
				})
			);
		});

		it('should set metadata to null if undefined', async () => {
			mockReq.body = {
				agent_id: 1,
				conversation_id: 1,
				status: 'running'
			};

			const mockCreatedSession = {
				id: 1,
				agent_id: 1,
				conversation_id: 1,
				status: 'running',
				metadata: null,
				created_at: '2024-01-01T00:00:00.000Z'
			};

			(mockCreateExecutionSession as any).mockResolvedValue(mockCreatedSession);

			const handler = getRouteHandler('post', '/');
			await callRoute(handler, mockReq, mockRes);

			expect(mockCreateExecutionSession).toHaveBeenCalledWith(
				expect.objectContaining({
					metadata: null
				})
			);
		});

		it('should handle metadata stringify errors gracefully', async () => {
			const circularObj: any = {};
			circularObj.self = circularObj;

			mockReq.body = {
				agent_id: 1,
				conversation_id: 1,
				status: 'running',
				metadata: circularObj
			};

			const mockCreatedSession = {
				id: 1,
				agent_id: 1,
				conversation_id: 1,
				status: 'running',
				metadata: null,
				created_at: '2024-01-01T00:00:00.000Z'
			};

			(mockCreateExecutionSession as any).mockResolvedValue(mockCreatedSession);

			const handler = getRouteHandler('post', '/');
			await callRoute(handler, mockReq, mockRes);

			expect(mockCreateExecutionSession).toHaveBeenCalledWith(
				expect.objectContaining({
					metadata: null
				})
			);
		});

		it('should set error_message to null if undefined', async () => {
			mockReq.body = {
				agent_id: 1,
				conversation_id: 1,
				status: 'running'
			};

			const mockCreatedSession = {
				id: 1,
				agent_id: 1,
				conversation_id: 1,
				status: 'running',
				error_message: null,
				created_at: '2024-01-01T00:00:00.000Z'
			};

			(mockCreateExecutionSession as any).mockResolvedValue(mockCreatedSession);

			const handler = getRouteHandler('post', '/');
			await callRoute(handler, mockReq, mockRes);

			expect(mockCreateExecutionSession).toHaveBeenCalledWith(
				expect.objectContaining({
					error_message: null
				})
			);
		});

		it('should convert non-string error_message to string', async () => {
			mockReq.body = {
				agent_id: 1,
				conversation_id: 1,
				status: 'failed',
				error_message: 123
			};

			const mockCreatedSession = {
				id: 1,
				agent_id: 1,
				conversation_id: 1,
				status: 'failed',
				error_message: '123',
				created_at: '2024-01-01T00:00:00.000Z'
			};

			(mockCreateExecutionSession as any).mockResolvedValue(mockCreatedSession);

			const handler = getRouteHandler('post', '/');
			await callRoute(handler, mockReq, mockRes);

			expect(mockCreateExecutionSession).toHaveBeenCalledWith(
				expect.objectContaining({
					error_message: '123'
				})
			);
		});

		it('should convert timestamp objects to ISO strings', async () => {
			const startDate = new Date('2024-01-01T10:00:00.000Z');
			const completeDate = new Date('2024-01-01T11:00:00.000Z');

			mockReq.body = {
				agent_id: 1,
				conversation_id: 1,
				status: 'completed',
				started_at: startDate,
				completed_at: completeDate
			};

			const mockCreatedSession = {
				id: 1,
				agent_id: 1,
				conversation_id: 1,
				status: 'completed',
				started_at: '2024-01-01T10:00:00.000Z',
				completed_at: '2024-01-01T11:00:00.000Z',
				created_at: '2024-01-01T00:00:00.000Z'
			};

			(mockCreateExecutionSession as any).mockResolvedValue(mockCreatedSession);

			const handler = getRouteHandler('post', '/');
			await callRoute(handler, mockReq, mockRes);

			expect(mockCreateExecutionSession).toHaveBeenCalledWith(
				expect.objectContaining({
					started_at: '2024-01-01T10:00:00.000Z',
					completed_at: '2024-01-01T11:00:00.000Z'
				})
			);
		});

		it('should handle errors gracefully', async () => {
			mockReq.body = {
				agent_id: 1,
				conversation_id: 1,
				status: 'running'
			};

			(mockCreateExecutionSession as any).mockRejectedValue(new Error('Database error'));

			const handler = getRouteHandler('post', '/');
			await callRoute(handler, mockReq, mockRes);

			expect(statusMock).toHaveBeenCalledWith(500);
			expect(jsonMock).toHaveBeenCalledWith({ error: 'Failed to create execution session' });
		});
	});

	describe('DELETE /:id', () => {
		it('should cancel session successfully', async () => {
			mockReq.params = { id: '1' };

			const mockExistingSession = {
				id: 1,
				agent_id: 1,
				conversation_id: 1,
				status: 'running',
				created_at: '2024-01-01'
			};

			(mockGetExecutionSessionById as any).mockResolvedValue(mockExistingSession);
			(mockUpdateExecutionSession as any).mockResolvedValue({
				...mockExistingSession,
				status: 'failed',
				error_message: 'Session cancelled by user'
			});

			const handler = getRouteHandler('delete', '/:id');
			await callRoute(handler, mockReq, mockRes);

			expect(mockGetExecutionSessionById).toHaveBeenCalledWith(1);
			expect(mockUpdateExecutionSession).toHaveBeenCalledWith(
				1,
				expect.objectContaining({
					status: 'failed',
					error_message: 'Session cancelled by user'
				})
			);
			expect(statusMock).toHaveBeenCalledWith(204);
			expect(sendMock).toHaveBeenCalled();
		});

		it('should return 404 if session not found', async () => {
			mockReq.params = { id: '999' };

			(mockGetExecutionSessionById as any).mockResolvedValue(null);

			const handler = getRouteHandler('delete', '/:id');
			await callRoute(handler, mockReq, mockRes);

			expect(statusMock).toHaveBeenCalledWith(404);
			expect(jsonMock).toHaveBeenCalledWith({ error: 'Execution session not found' });
		});

		it('should handle errors gracefully', async () => {
			mockReq.params = { id: '1' };

			(mockGetExecutionSessionById as any).mockRejectedValue(new Error('Database error'));

			const handler = getRouteHandler('delete', '/:id');
			await callRoute(handler, mockReq, mockRes);

			expect(statusMock).toHaveBeenCalledWith(500);
			expect(jsonMock).toHaveBeenCalledWith({
				error: 'Failed to cancel execution session',
				details: 'Database error'
			});
		});
	});
});

// Made with Bob
