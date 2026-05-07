import type { Request, Response } from 'express';

// Mock all dependencies before imports
jest.mock('../../db/queries');
jest.mock('../../services/scoring-service');

import {
	addSessionMessage,
	countUserTurnsUpTo,
	getExecutionSessionById,
	getConversationTurnTarget,
	updateSessionMessage,
	getSessionMessageById
} from '../../db/queries';
import { scoreSimilarityText } from '../../services/scoring-service';

const mockAddSessionMessage = addSessionMessage as jest.MockedFunction<typeof addSessionMessage>;
const mockCountUserTurnsUpTo = countUserTurnsUpTo as jest.MockedFunction<typeof countUserTurnsUpTo>;
const mockGetExecutionSessionById = getExecutionSessionById as jest.MockedFunction<typeof getExecutionSessionById>;
const mockGetConversationTurnTarget = getConversationTurnTarget as jest.MockedFunction<
	typeof getConversationTurnTarget
>;
const mockUpdateSessionMessage = updateSessionMessage as jest.MockedFunction<typeof updateSessionMessage>;
const mockGetSessionMessageById = getSessionMessageById as jest.MockedFunction<typeof getSessionMessageById>;
const mockScoreSimilarityText = scoreSimilarityText as jest.MockedFunction<typeof scoreSimilarityText>;

describe('Session Messages Routes', () => {
	let sessionMessagesRouter: any;
	let mockReq: Partial<Request>;
	let mockRes: Partial<Response>;
	let jsonMock: jest.Mock;
	let statusMock: jest.Mock;

	beforeEach(async () => {
		jest.clearAllMocks();

		// Reset modules to get fresh router
		jest.isolateModules(() => {
			sessionMessagesRouter = require('../session-messages').default;
		});

		jsonMock = jest.fn();
		statusMock = jest.fn().mockReturnValue({ json: jsonMock });

		mockReq = {
			params: {},
			body: {}
		};

		mockRes = {
			json: jsonMock,
			status: statusMock
		};
	});

	const getRouteHandler = (method: string, path: string) => {
		const routes = sessionMessagesRouter.stack || [];
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

	describe('POST /', () => {
		it('should create a user message successfully', async () => {
			mockReq.body = {
				session_id: 1,
				role: 'user',
				content: 'test message',
				sequence: 1
			};

			const mockMessage = {
				id: 1,
				session_id: 1,
				role: 'user',
				content: 'test message',
				sequence: 1,
				timestamp: '2024-01-01T00:00:00.000Z'
			};

			(mockAddSessionMessage as any).mockResolvedValue(mockMessage);

			const handler = getRouteHandler('post', '/');
			await callRoute(handler, mockReq, mockRes);

			expect(mockAddSessionMessage).toHaveBeenCalledWith(
				expect.objectContaining({
					session_id: 1,
					role: 'user',
					content: 'test message',
					sequence: 1
				})
			);
			expect(statusMock).toHaveBeenCalledWith(201);
			expect(jsonMock).toHaveBeenCalledWith(mockMessage);
		});

		it('should create an assistant message and trigger similarity scoring', async () => {
			mockReq.body = {
				session_id: 1,
				role: 'assistant',
				content: 'assistant response',
				sequence: 2
			};

			const mockMessage = {
				id: 2,
				session_id: 1,
				role: 'assistant',
				content: 'assistant response',
				sequence: 2,
				timestamp: '2024-01-01T00:00:00.000Z'
			};
			const mockSession = {
				id: 1,
				agent_id: 1,
				conversation_id: 1,
				status: 'completed',
				created_at: '2024-01-01'
			};
			const mockTarget = {
				id: 1,
				conversation_id: 1,
				turn_index: 1,
				target_reply: 'expected response',
				threshold: 80
			};

			(mockAddSessionMessage as any).mockResolvedValue(mockMessage);
			(mockGetExecutionSessionById as any).mockResolvedValue(mockSession);
			(mockCountUserTurnsUpTo as any).mockReturnValue(1);
			(mockGetConversationTurnTarget as any).mockReturnValue(mockTarget);
			(mockUpdateSessionMessage as any).mockReturnValue(undefined);
			(mockScoreSimilarityText as any).mockResolvedValue({
				score: 85,
				metadata: { model: 'test-model' }
			});

			const handler = getRouteHandler('post', '/');
			await callRoute(handler, mockReq, mockRes);

			expect(mockAddSessionMessage).toHaveBeenCalled();
			expect(mockGetExecutionSessionById).toHaveBeenCalledWith(1);
			expect(mockCountUserTurnsUpTo).toHaveBeenCalledWith(1, 2);
			expect(mockGetConversationTurnTarget).toHaveBeenCalledWith(1, 1);
			expect(mockUpdateSessionMessage).toHaveBeenCalledWith(2, { similarity_scoring_status: 'pending' });
			expect(statusMock).toHaveBeenCalledWith(201);
			expect(jsonMock).toHaveBeenCalledWith(mockMessage);

			// Wait for async scoring to complete
			await new Promise((resolve) => setTimeout(resolve, 10));
		});

		it('should skip scoring if session_id is missing', async () => {
			mockReq.body = {
				role: 'assistant',
				content: 'assistant response',
				sequence: 2
			};

			const mockMessage = {
				id: 2,
				session_id: null,
				role: 'assistant',
				content: 'assistant response',
				sequence: 2,
				timestamp: '2024-01-01T00:00:00.000Z'
			};

			(mockAddSessionMessage as any).mockResolvedValue(mockMessage);

			const handler = getRouteHandler('post', '/');
			await callRoute(handler, mockReq, mockRes);

			expect(mockGetExecutionSessionById).not.toHaveBeenCalled();
			expect(statusMock).toHaveBeenCalledWith(201);
			expect(jsonMock).toHaveBeenCalledWith(mockMessage);
		});

		it('should skip scoring if no conversation found', async () => {
			mockReq.body = {
				session_id: 1,
				role: 'assistant',
				content: 'assistant response',
				sequence: 2
			};

			const mockMessage = {
				id: 2,
				session_id: 1,
				role: 'assistant',
				content: 'assistant response',
				sequence: 2,
				timestamp: '2024-01-01T00:00:00.000Z'
			};
			const mockSession = {
				id: 1,
				agent_id: 1,
				conversation_id: null,
				status: 'completed',
				created_at: '2024-01-01'
			};

			(mockAddSessionMessage as any).mockResolvedValue(mockMessage);
			(mockGetExecutionSessionById as any).mockResolvedValue(mockSession);

			const handler = getRouteHandler('post', '/');
			await callRoute(handler, mockReq, mockRes);

			expect(mockGetExecutionSessionById).toHaveBeenCalledWith(1);
			expect(mockGetConversationTurnTarget).not.toHaveBeenCalled();
			expect(statusMock).toHaveBeenCalledWith(201);
		});

		it('should skip scoring if no target found', async () => {
			mockReq.body = {
				session_id: 1,
				role: 'assistant',
				content: 'assistant response',
				sequence: 2
			};

			const mockMessage = {
				id: 2,
				session_id: 1,
				role: 'assistant',
				content: 'assistant response',
				sequence: 2,
				timestamp: '2024-01-01T00:00:00.000Z'
			};
			const mockSession = {
				id: 1,
				agent_id: 1,
				conversation_id: 1,
				status: 'completed',
				created_at: '2024-01-01'
			};

			(mockAddSessionMessage as any).mockResolvedValue(mockMessage);
			(mockGetExecutionSessionById as any).mockResolvedValue(mockSession);
			(mockCountUserTurnsUpTo as any).mockReturnValue(1);
			(mockGetConversationTurnTarget as any).mockReturnValue(null);

			const handler = getRouteHandler('post', '/');
			await callRoute(handler, mockReq, mockRes);

			expect(mockGetConversationTurnTarget).toHaveBeenCalledWith(1, 1);
			expect(mockUpdateSessionMessage).not.toHaveBeenCalled();
			expect(statusMock).toHaveBeenCalledWith(201);
		});

		it('should normalize session_id to number', async () => {
			mockReq.body = {
				session_id: '1',
				role: 'user',
				content: 'test',
				sequence: '1'
			};

			const mockMessage = {
				id: 1,
				session_id: 1,
				role: 'user',
				content: 'test',
				sequence: 1,
				timestamp: '2024-01-01T00:00:00.000Z'
			};

			(mockAddSessionMessage as any).mockResolvedValue(mockMessage);

			const handler = getRouteHandler('post', '/');
			await callRoute(handler, mockReq, mockRes);

			expect(mockAddSessionMessage).toHaveBeenCalledWith(
				expect.objectContaining({
					session_id: 1,
					sequence: 1
				})
			);
		});

		it('should default role to assistant if missing', async () => {
			mockReq.body = {
				session_id: 1,
				content: 'test',
				sequence: 1
			};

			const mockMessage = {
				id: 1,
				session_id: 1,
				role: 'assistant',
				content: 'test',
				sequence: 1,
				timestamp: '2024-01-01T00:00:00.000Z'
			};

			(mockAddSessionMessage as any).mockResolvedValue(mockMessage);

			const handler = getRouteHandler('post', '/');
			await callRoute(handler, mockReq, mockRes);

			expect(mockAddSessionMessage).toHaveBeenCalledWith(
				expect.objectContaining({
					role: 'assistant'
				})
			);
		});

		it('should default content to empty string if missing', async () => {
			mockReq.body = {
				session_id: 1,
				role: 'user',
				sequence: 1
			};

			const mockMessage = {
				id: 1,
				session_id: 1,
				role: 'user',
				content: '',
				sequence: 1,
				timestamp: '2024-01-01T00:00:00.000Z'
			};

			(mockAddSessionMessage as any).mockResolvedValue(mockMessage);

			const handler = getRouteHandler('post', '/');
			await callRoute(handler, mockReq, mockRes);

			expect(mockAddSessionMessage).toHaveBeenCalledWith(
				expect.objectContaining({
					content: ''
				})
			);
		});

		it('should convert non-string role to string', async () => {
			mockReq.body = {
				session_id: 1,
				role: 123,
				content: 'test',
				sequence: 1
			};

			const mockMessage = {
				id: 1,
				session_id: 1,
				role: '123',
				content: 'test',
				sequence: 1,
				timestamp: '2024-01-01T00:00:00.000Z'
			};

			(mockAddSessionMessage as any).mockResolvedValue(mockMessage);

			const handler = getRouteHandler('post', '/');
			await callRoute(handler, mockReq, mockRes);

			expect(mockAddSessionMessage).toHaveBeenCalledWith(
				expect.objectContaining({
					role: '123'
				})
			);
		});

		it('should convert non-string content to string', async () => {
			mockReq.body = {
				session_id: 1,
				role: 'user',
				content: 456,
				sequence: 1
			};

			const mockMessage = {
				id: 1,
				session_id: 1,
				role: 'user',
				content: '456',
				sequence: 1,
				timestamp: '2024-01-01T00:00:00.000Z'
			};

			(mockAddSessionMessage as any).mockResolvedValue(mockMessage);

			const handler = getRouteHandler('post', '/');
			await callRoute(handler, mockReq, mockRes);

			expect(mockAddSessionMessage).toHaveBeenCalledWith(
				expect.objectContaining({
					content: '456'
				})
			);
		});

		it('should convert timestamp to ISO string if not string', async () => {
			const date = new Date('2024-01-01T12:00:00.000Z');
			mockReq.body = {
				session_id: 1,
				role: 'user',
				content: 'test',
				sequence: 1,
				timestamp: date
			};

			const mockMessage = {
				id: 1,
				session_id: 1,
				role: 'user',
				content: 'test',
				sequence: 1,
				timestamp: '2024-01-01T12:00:00.000Z'
			};

			(mockAddSessionMessage as any).mockResolvedValue(mockMessage);

			const handler = getRouteHandler('post', '/');
			await callRoute(handler, mockReq, mockRes);

			expect(mockAddSessionMessage).toHaveBeenCalledWith(
				expect.objectContaining({
					timestamp: '2024-01-01T12:00:00.000Z'
				})
			);
		});

		it('should stringify metadata object', async () => {
			mockReq.body = {
				session_id: 1,
				role: 'user',
				content: 'test',
				sequence: 1,
				metadata: { key: 'value' }
			};

			const mockMessage = {
				id: 1,
				session_id: 1,
				role: 'user',
				content: 'test',
				sequence: 1,
				timestamp: '2024-01-01T00:00:00.000Z',
				metadata: '{"key":"value"}'
			};

			(mockAddSessionMessage as any).mockResolvedValue(mockMessage);

			const handler = getRouteHandler('post', '/');
			await callRoute(handler, mockReq, mockRes);

			expect(mockAddSessionMessage).toHaveBeenCalledWith(
				expect.objectContaining({
					metadata: '{"key":"value"}'
				})
			);
		});

		it('should set metadata to null if undefined', async () => {
			mockReq.body = {
				session_id: 1,
				role: 'user',
				content: 'test',
				sequence: 1
			};

			const mockMessage = {
				id: 1,
				session_id: 1,
				role: 'user',
				content: 'test',
				sequence: 1,
				timestamp: '2024-01-01T00:00:00.000Z',
				metadata: null
			};

			(mockAddSessionMessage as any).mockResolvedValue(mockMessage);

			const handler = getRouteHandler('post', '/');
			await callRoute(handler, mockReq, mockRes);

			expect(mockAddSessionMessage).toHaveBeenCalledWith(
				expect.objectContaining({
					metadata: null
				})
			);
		});

		it('should handle metadata stringify errors gracefully', async () => {
			const circularObj: any = {};
			circularObj.self = circularObj;

			mockReq.body = {
				session_id: 1,
				role: 'user',
				content: 'test',
				sequence: 1,
				metadata: circularObj
			};

			const mockMessage = {
				id: 1,
				session_id: 1,
				role: 'user',
				content: 'test',
				sequence: 1,
				timestamp: '2024-01-01T00:00:00.000Z',
				metadata: null
			};

			(mockAddSessionMessage as any).mockResolvedValue(mockMessage);

			const handler = getRouteHandler('post', '/');
			await callRoute(handler, mockReq, mockRes);

			expect(mockAddSessionMessage).toHaveBeenCalledWith(
				expect.objectContaining({
					metadata: null
				})
			);
		});

		it('should handle errors gracefully', async () => {
			mockReq.body = {
				session_id: 1,
				role: 'user',
				content: 'test',
				sequence: 1
			};

			(mockAddSessionMessage as any).mockRejectedValue(new Error('Database error'));

			const handler = getRouteHandler('post', '/');
			await callRoute(handler, mockReq, mockRes);

			expect(statusMock).toHaveBeenCalledWith(500);
			expect(jsonMock).toHaveBeenCalledWith({ error: 'Failed to create session message' });
		});

		it('should handle scoring errors gracefully', async () => {
			mockReq.body = {
				session_id: 1,
				role: 'assistant',
				content: 'assistant response',
				sequence: 2
			};

			const mockMessage = {
				id: 2,
				session_id: 1,
				role: 'assistant',
				content: 'assistant response',
				sequence: 2,
				timestamp: '2024-01-01T00:00:00.000Z'
			};

			(mockAddSessionMessage as any).mockResolvedValue(mockMessage);
			(mockGetExecutionSessionById as any).mockRejectedValue(new Error('Session error'));

			const handler = getRouteHandler('post', '/');
			await callRoute(handler, mockReq, mockRes);

			// Should still return 201 even if scoring fails
			expect(statusMock).toHaveBeenCalledWith(201);
			expect(jsonMock).toHaveBeenCalledWith(mockMessage);
		});
	});

	describe('POST /:id/regenerate-score', () => {
		it('should regenerate similarity score successfully', async () => {
			mockReq.params = { id: '2' };

			const mockMessage = {
				id: 2,
				session_id: 1,
				role: 'assistant',
				content: 'assistant response',
				sequence: 2,
				timestamp: '2024-01-01T00:00:00.000Z'
			};
			const mockSession = {
				id: 1,
				agent_id: 1,
				conversation_id: 1,
				status: 'completed',
				created_at: '2024-01-01'
			};
			const mockTarget = {
				id: 1,
				conversation_id: 1,
				turn_index: 1,
				target_reply: 'expected response',
				threshold: 80
			};

			(mockGetSessionMessageById as any).mockResolvedValue(mockMessage);
			(mockGetExecutionSessionById as any).mockResolvedValue(mockSession);
			(mockCountUserTurnsUpTo as any).mockReturnValue(1);
			(mockGetConversationTurnTarget as any).mockReturnValue(mockTarget);
			(mockUpdateSessionMessage as any).mockReturnValue(undefined);
			(mockScoreSimilarityText as any).mockResolvedValue({
				score: 85,
				metadata: { model: 'test-model' }
			});

			const handler = getRouteHandler('post', '/:id/regenerate-score');
			await callRoute(handler, mockReq, mockRes);

			expect(mockGetSessionMessageById).toHaveBeenCalledWith(2);
			expect(mockGetExecutionSessionById).toHaveBeenCalledWith(1);
			expect(mockCountUserTurnsUpTo).toHaveBeenCalledWith(1, 2);
			expect(mockGetConversationTurnTarget).toHaveBeenCalledWith(1, 1);
			expect(mockUpdateSessionMessage).toHaveBeenCalledWith(2, { similarity_scoring_status: 'pending' });
			expect(statusMock).toHaveBeenCalledWith(202);
			expect(jsonMock).toHaveBeenCalledWith({
				message: 'Similarity scoring initiated',
				message_id: 2
			});

			// Wait for async scoring to complete
			await new Promise((resolve) => setTimeout(resolve, 10));
		});

		it('should return 400 for invalid message ID', async () => {
			mockReq.params = { id: 'invalid' };

			const handler = getRouteHandler('post', '/:id/regenerate-score');
			await callRoute(handler, mockReq, mockRes);

			expect(statusMock).toHaveBeenCalledWith(400);
			expect(jsonMock).toHaveBeenCalledWith({ error: 'Invalid message ID' });
		});

		it('should return 404 if message not found', async () => {
			mockReq.params = { id: '999' };

			(mockGetSessionMessageById as any).mockResolvedValue(null);

			const handler = getRouteHandler('post', '/:id/regenerate-score');
			await callRoute(handler, mockReq, mockRes);

			expect(statusMock).toHaveBeenCalledWith(404);
			expect(jsonMock).toHaveBeenCalledWith({ error: 'Message not found' });
		});

		it('should return 400 if message is not assistant role', async () => {
			mockReq.params = { id: '1' };

			const mockMessage = {
				id: 1,
				session_id: 1,
				role: 'user',
				content: 'user message',
				sequence: 1,
				timestamp: '2024-01-01T00:00:00.000Z'
			};

			(mockGetSessionMessageById as any).mockResolvedValue(mockMessage);

			const handler = getRouteHandler('post', '/:id/regenerate-score');
			await callRoute(handler, mockReq, mockRes);

			expect(statusMock).toHaveBeenCalledWith(400);
			expect(jsonMock).toHaveBeenCalledWith({ error: 'Only assistant messages can be scored' });
		});

		it('should return 400 if session_id is missing', async () => {
			mockReq.params = { id: '2' };

			const mockMessage = {
				id: 2,
				session_id: null,
				role: 'assistant',
				content: 'assistant response',
				sequence: 2,
				timestamp: '2024-01-01T00:00:00.000Z'
			};

			(mockGetSessionMessageById as any).mockResolvedValue(mockMessage);

			const handler = getRouteHandler('post', '/:id/regenerate-score');
			await callRoute(handler, mockReq, mockRes);

			expect(statusMock).toHaveBeenCalledWith(400);
			expect(jsonMock).toHaveBeenCalledWith({ error: 'Session ID missing' });
		});

		it('should return 400 if session not found', async () => {
			mockReq.params = { id: '2' };

			const mockMessage = {
				id: 2,
				session_id: 1,
				role: 'assistant',
				content: 'assistant response',
				sequence: 2,
				timestamp: '2024-01-01T00:00:00.000Z'
			};

			(mockGetSessionMessageById as any).mockResolvedValue(mockMessage);
			(mockGetExecutionSessionById as any).mockResolvedValue(null);

			const handler = getRouteHandler('post', '/:id/regenerate-score');
			await callRoute(handler, mockReq, mockRes);

			expect(statusMock).toHaveBeenCalledWith(400);
			expect(jsonMock).toHaveBeenCalledWith({ error: 'Session or conversation not found' });
		});

		it('should return 400 if conversation not found', async () => {
			mockReq.params = { id: '2' };

			const mockMessage = {
				id: 2,
				session_id: 1,
				role: 'assistant',
				content: 'assistant response',
				sequence: 2,
				timestamp: '2024-01-01T00:00:00.000Z'
			};
			const mockSession = {
				id: 1,
				agent_id: 1,
				conversation_id: null,
				status: 'completed',
				created_at: '2024-01-01'
			};

			(mockGetSessionMessageById as any).mockResolvedValue(mockMessage);
			(mockGetExecutionSessionById as any).mockResolvedValue(mockSession);

			const handler = getRouteHandler('post', '/:id/regenerate-score');
			await callRoute(handler, mockReq, mockRes);

			expect(statusMock).toHaveBeenCalledWith(400);
			expect(jsonMock).toHaveBeenCalledWith({ error: 'Session or conversation not found' });
		});

		it('should return 400 if no target found', async () => {
			mockReq.params = { id: '2' };

			const mockMessage = {
				id: 2,
				session_id: 1,
				role: 'assistant',
				content: 'assistant response',
				sequence: 2,
				timestamp: '2024-01-01T00:00:00.000Z'
			};
			const mockSession = {
				id: 1,
				agent_id: 1,
				conversation_id: 1,
				status: 'completed',
				created_at: '2024-01-01'
			};

			(mockGetSessionMessageById as any).mockResolvedValue(mockMessage);
			(mockGetExecutionSessionById as any).mockResolvedValue(mockSession);
			(mockCountUserTurnsUpTo as any).mockReturnValue(1);
			(mockGetConversationTurnTarget as any).mockReturnValue(null);

			const handler = getRouteHandler('post', '/:id/regenerate-score');
			await callRoute(handler, mockReq, mockRes);

			expect(statusMock).toHaveBeenCalledWith(400);
			expect(jsonMock).toHaveBeenCalledWith({ error: 'No target found for this turn' });
		});

		it('should return 400 if target has no id', async () => {
			mockReq.params = { id: '2' };

			const mockMessage = {
				id: 2,
				session_id: 1,
				role: 'assistant',
				content: 'assistant response',
				sequence: 2,
				timestamp: '2024-01-01T00:00:00.000Z'
			};
			const mockSession = {
				id: 1,
				agent_id: 1,
				conversation_id: 1,
				status: 'completed',
				created_at: '2024-01-01'
			};
			const mockTarget = {
				conversation_id: 1,
				turn_index: 1,
				target_reply: 'expected response',
				threshold: 80
			};

			(mockGetSessionMessageById as any).mockResolvedValue(mockMessage);
			(mockGetExecutionSessionById as any).mockResolvedValue(mockSession);
			(mockCountUserTurnsUpTo as any).mockReturnValue(1);
			(mockGetConversationTurnTarget as any).mockReturnValue(mockTarget);

			const handler = getRouteHandler('post', '/:id/regenerate-score');
			await callRoute(handler, mockReq, mockRes);

			expect(statusMock).toHaveBeenCalledWith(400);
			expect(jsonMock).toHaveBeenCalledWith({ error: 'No target found for this turn' });
		});

		it('should handle errors gracefully', async () => {
			mockReq.params = { id: '2' };

			(mockGetSessionMessageById as any).mockRejectedValue(new Error('Database error'));

			const handler = getRouteHandler('post', '/:id/regenerate-score');
			await callRoute(handler, mockReq, mockRes);

			expect(statusMock).toHaveBeenCalledWith(500);
			expect(jsonMock).toHaveBeenCalledWith({ error: 'Failed to regenerate similarity score' });
		});
	});
});

// Made with Bob
