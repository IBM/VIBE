import conversationRoutes from '../conversations';
import * as queries from '../../db/queries';
import db from '../../db/database';

jest.mock('../../db/queries');
jest.mock('../../db/database', () => ({
	prepare: jest.fn()
}));

const mockedQueries = queries as jest.Mocked<typeof queries>;
const mockedDb = db as jest.Mocked<typeof db>;

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

describe('conversation routes', () => {
	beforeEach(() => {
		jest.clearAllMocks();
	});

	describe('GET /api/conversations', () => {
		it('returns all conversations without pagination', async () => {
			(mockedQueries.getConversations as any).mockReturnValue([
				{ id: 1, name: 'Conv 1', description: 'desc1' },
				{ id: 2, name: 'Conv 2', description: 'desc2' }
			]);

			const response = await callRoute(conversationRoutes, 'get', '/');

			expect(response.statusCode).toBe(200);
			expect(response.body).toHaveLength(2);
		});

		it('returns paginated conversations when pagination params provided', async () => {
			(mockedQueries.getConversationsWithCount as any).mockReturnValue({
				data: [{ id: 1, name: 'Conv 1', description: 'desc1' }],
				total: 10
			});

			const response = await callRoute(conversationRoutes, 'get', '/', {
				query: { limit: '5', offset: '0' }
			});

			expect(response.statusCode).toBe(200);
			expect((response.body as any).data).toHaveLength(1);
			expect((response.body as any).total).toBe(10);
		});

		it('handles errors gracefully', async () => {
			(mockedQueries.getConversations as any).mockImplementation(() => {
				throw new Error('Database error');
			});

			const response = await callRoute(conversationRoutes, 'get', '/');

			expect(response.statusCode).toBe(500);
			expect((response.body as any).error).toBe('Failed to fetch conversations');
		});

		it('returns 400 for invalid pagination params', async () => {
			const response = await callRoute(conversationRoutes, 'get', '/', {
				query: { limit: 'invalid' }
			});

			expect(response.statusCode).toBe(400);
			expect((response.body as any).error).toBe('Invalid limit parameter');
		});
	});

	describe('GET /api/conversations/:id', () => {
		it('returns conversation with messages', async () => {
			(mockedQueries.getConversationById as any).mockReturnValue({
				id: 1,
				name: 'Test Conversation',
				description: 'desc'
			});
			(mockedQueries.getConversationMessages as any).mockReturnValue([
				{ id: 1, conversation_id: 1, sequence: 1, role: 'user', content: 'hello' }
			]);

			const response = await callRoute(conversationRoutes, 'get', '/:id', {
				params: { id: '1' }
			});

			expect(response.statusCode).toBe(200);
			expect((response.body as any).name).toBe('Test Conversation');
			expect((response.body as any).messages).toHaveLength(1);
		});

		it('returns 404 when conversation not found', async () => {
			(mockedQueries.getConversationById as any).mockReturnValue(null);

			const response = await callRoute(conversationRoutes, 'get', '/:id', {
				params: { id: '999' }
			});

			expect(response.statusCode).toBe(404);
			expect((response.body as any).error).toBe('Conversation not found');
		});

		it('handles errors gracefully', async () => {
			(mockedQueries.getConversationById as any).mockImplementation(() => {
				throw new Error('Database error');
			});

			const response = await callRoute(conversationRoutes, 'get', '/:id', {
				params: { id: '1' }
			});

			expect(response.statusCode).toBe(500);
			expect((response.body as any).error).toBe('Failed to fetch conversation');
		});
	});

	describe('POST /api/conversations', () => {
		it('creates a new conversation without messages', async () => {
			const newConv = {
				name: 'New Conversation',
				description: 'test desc'
			};

			(mockedQueries.createConversation as any).mockReturnValue({
				id: 1,
				...newConv,
				created_at: '2024-01-01'
			});

			const response = await callRoute(conversationRoutes, 'post', '/', {
				body: newConv
			});

			expect(response.statusCode).toBe(201);
			expect((response.body as any).id).toBe(1);
			expect((response.body as any).name).toBe('New Conversation');
		});

		it('creates a new conversation with messages', async () => {
			const newConv = {
				name: 'New Conversation',
				description: 'test desc',
				messages: [
					{ sequence: 1, role: 'user', content: 'hello' },
					{ sequence: 2, role: 'user', content: 'world' }
				]
			};

			(mockedQueries.createConversation as any).mockReturnValue({
				id: 1,
				name: newConv.name,
				description: newConv.description,
				created_at: '2024-01-01'
			});

			(mockedQueries.addMessageToConversation as any).mockImplementation((msg: any) => ({
				id: msg.sequence,
				...msg
			}));

			const response = await callRoute(conversationRoutes, 'post', '/', {
				body: newConv
			});

			expect(response.statusCode).toBe(201);
			expect((response.body as any).messages).toHaveLength(2);
			expect(mockedQueries.addMessageToConversation).toHaveBeenCalledTimes(2);
		});

		it('validates required name field', async () => {
			const response = await callRoute(conversationRoutes, 'post', '/', {
				body: { description: 'test' }
			});

			expect(response.statusCode).toBe(400);
			expect((response.body as any).error).toBe('Failed to create conversation');
			expect((response.body as any).details).toContain('Name is required');
		});

		it('handles database errors', async () => {
			(mockedQueries.createConversation as any).mockImplementation(() => {
				throw new Error('Constraint violation');
			});

			const response = await callRoute(conversationRoutes, 'post', '/', {
				body: { name: 'Test' }
			});

			expect(response.statusCode).toBe(500);
			expect((response.body as any).error).toBe('Failed to create conversation');
		});
	});

	describe('PUT /api/conversations/:id', () => {
		it('updates conversation metadata only', async () => {
			(mockedQueries.updateConversation as any).mockReturnValue({
				id: 1,
				name: 'Updated Name',
				description: 'updated desc'
			});

			const response = await callRoute(conversationRoutes, 'put', '/:id', {
				params: { id: '1' },
				body: { name: 'Updated Name', description: 'updated desc' }
			});

			expect(response.statusCode).toBe(200);
			expect((response.body as any).name).toBe('Updated Name');
		});

		it('updates conversation with new messages', async () => {
			const mockPrepare = jest.fn().mockReturnValue({
				run: jest.fn()
			});
			(mockedDb.prepare as any) = mockPrepare;

			(mockedQueries.updateConversation as any).mockReturnValue({
				id: 1,
				name: 'Test',
				description: 'desc'
			});

			(mockedQueries.addMessageToConversation as any).mockImplementation((msg: any) => ({
				id: msg.sequence,
				...msg
			}));

			const response = await callRoute(conversationRoutes, 'put', '/:id', {
				params: { id: '1' },
				body: {
					name: 'Test',
					messages: [{ sequence: 1, role: 'user', content: 'new message' }]
				}
			});

			expect(response.statusCode).toBe(200);
			expect((response.body as any).messages).toHaveLength(1);
			expect(mockPrepare).toHaveBeenCalledWith('DELETE FROM conversation_messages WHERE conversation_id = ?');
		});

		it('returns 404 when conversation not found', async () => {
			(mockedQueries.updateConversation as any).mockReturnValue(null);

			const response = await callRoute(conversationRoutes, 'put', '/:id', {
				params: { id: '999' },
				body: { name: 'Updated' }
			});

			expect(response.statusCode).toBe(404);
			expect((response.body as any).error).toBe('Conversation not found');
		});

		it('handles database errors', async () => {
			(mockedQueries.updateConversation as any).mockImplementation(() => {
				throw new Error('Database error');
			});

			const response = await callRoute(conversationRoutes, 'put', '/:id', {
				params: { id: '1' },
				body: { name: 'Updated' }
			});

			expect(response.statusCode).toBe(500);
			expect((response.body as any).error).toBe('Failed to update conversation');
		});
	});

	describe('DELETE /api/conversations/:id', () => {
		it('deletes an existing conversation', async () => {
			(mockedQueries.getConversationById as any).mockReturnValue({
				id: 1,
				name: 'Test'
			});
			(mockedQueries.deleteConversation as any).mockReturnValue(undefined);

			const response = await callRoute(conversationRoutes, 'delete', '/:id', {
				params: { id: '1' }
			});

			expect(response.statusCode).toBe(204);
			expect(mockedQueries.deleteConversation).toHaveBeenCalledWith(1);
		});

		it('returns 404 when conversation not found', async () => {
			(mockedQueries.getConversationById as any).mockReturnValue(null);

			const response = await callRoute(conversationRoutes, 'delete', '/:id', {
				params: { id: '999' }
			});

			expect(response.statusCode).toBe(404);
			expect((response.body as any).error).toBe('Conversation not found');
		});

		it('handles database errors', async () => {
			(mockedQueries.getConversationById as any).mockReturnValue({ id: 1, name: 'Test' });
			(mockedQueries.deleteConversation as any).mockImplementation(() => {
				throw new Error('Foreign key constraint');
			});

			const response = await callRoute(conversationRoutes, 'delete', '/:id', {
				params: { id: '1' }
			});

			expect(response.statusCode).toBe(500);
			expect((response.body as any).error).toBe('Failed to delete conversation');
		});
	});

	describe('GET /api/conversations/:id/messages', () => {
		it('returns messages for a conversation', async () => {
			(mockedQueries.getConversationById as any).mockReturnValue({ id: 1, name: 'Test' });
			(mockedQueries.getConversationMessages as any).mockReturnValue([
				{ id: 1, conversation_id: 1, sequence: 1, role: 'user', content: 'hello' },
				{ id: 2, conversation_id: 1, sequence: 2, role: 'user', content: 'world' }
			]);

			const response = await callRoute(conversationRoutes, 'get', '/:id/messages', {
				params: { id: '1' }
			});

			expect(response.statusCode).toBe(200);
			expect(response.body).toHaveLength(2);
		});

		it('returns 404 when conversation not found', async () => {
			(mockedQueries.getConversationById as any).mockReturnValue(null);

			const response = await callRoute(conversationRoutes, 'get', '/:id/messages', {
				params: { id: '999' }
			});

			expect(response.statusCode).toBe(404);
			expect((response.body as any).error).toBe('Conversation not found');
		});

		it('handles errors gracefully', async () => {
			(mockedQueries.getConversationById as any).mockReturnValue({ id: 1, name: 'Test' });
			(mockedQueries.getConversationMessages as any).mockImplementation(() => {
				throw new Error('Database error');
			});

			const response = await callRoute(conversationRoutes, 'get', '/:id/messages', {
				params: { id: '1' }
			});

			expect(response.statusCode).toBe(500);
			expect((response.body as any).error).toBe('Failed to fetch conversation messages');
		});
	});

	describe('POST /api/conversations/:id/messages', () => {
		it('adds a message to a conversation', async () => {
			(mockedQueries.getConversationById as any).mockReturnValue({ id: 1, name: 'Test' });
			(mockedQueries.addMessageToConversation as any).mockReturnValue({
				id: 1,
				conversation_id: 1,
				sequence: 1,
				role: 'user',
				content: 'hello'
			});

			const response = await callRoute(conversationRoutes, 'post', '/:id/messages', {
				params: { id: '1' },
				body: { sequence: 1, role: 'user', content: 'hello' }
			});

			expect(response.statusCode).toBe(201);
			expect((response.body as any).content).toBe('hello');
		});

		it('auto-assigns sequence if not provided', async () => {
			(mockedQueries.getConversationById as any).mockReturnValue({ id: 1, name: 'Test' });
			(mockedQueries.getConversationMessages as any).mockReturnValue([
				{ id: 1, sequence: 1 },
				{ id: 2, sequence: 2 }
			]);
			(mockedQueries.addMessageToConversation as any).mockReturnValue({
				id: 3,
				conversation_id: 1,
				sequence: 3,
				role: 'user',
				content: 'hello'
			});

			const response = await callRoute(conversationRoutes, 'post', '/:id/messages', {
				params: { id: '1' },
				body: { role: 'user', content: 'hello' }
			});

			expect(response.statusCode).toBe(201);
			expect((response.body as any).sequence).toBe(3);
		});

		it('validates required fields', async () => {
			(mockedQueries.getConversationById as any).mockReturnValue({ id: 1, name: 'Test' });

			const response = await callRoute(conversationRoutes, 'post', '/:id/messages', {
				params: { id: '1' },
				body: { sequence: 1 }
			});

			expect(response.statusCode).toBe(400);
			expect((response.body as any).details).toContain('Role and content are required');
		});

		it('returns 404 when conversation not found', async () => {
			(mockedQueries.getConversationById as any).mockReturnValue(null);

			const response = await callRoute(conversationRoutes, 'post', '/:id/messages', {
				params: { id: '999' },
				body: { role: 'user', content: 'hello' }
			});

			expect(response.statusCode).toBe(404);
			expect((response.body as any).error).toBe('Conversation not found');
		});

		it('handles errors gracefully', async () => {
			(mockedQueries.getConversationById as any).mockReturnValue({ id: 1, name: 'Test' });
			(mockedQueries.addMessageToConversation as any).mockImplementation(() => {
				throw new Error('Insert failed');
			});

			const response = await callRoute(conversationRoutes, 'post', '/:id/messages', {
				params: { id: '1' },
				body: { role: 'user', content: 'hello' }
			});

			expect(response.statusCode).toBe(500);
			expect((response.body as any).error).toBe('Failed to create message');
			expect((response.body as any).details).toBe('Insert failed');
		});

		it('handles unknown errors gracefully', async () => {
			(mockedQueries.getConversationById as any).mockReturnValue({ id: 1, name: 'Test' });
			(mockedQueries.addMessageToConversation as any).mockImplementation(() => {
				throw { code: 'unknown' };
			});

			const response = await callRoute(conversationRoutes, 'post', '/:id/messages', {
				params: { id: '1' },
				body: { role: 'user', content: 'hello' }
			});

			expect(response.statusCode).toBe(500);
			expect((response.body as any).details).toBe('Unknown error');
		});
	});

	describe('PUT /api/conversations/:id/messages/:messageId', () => {
		it('returns 404 when conversation not found', async () => {
			(mockedQueries.getConversationById as any).mockReturnValue(null);

			const response = await callRoute(conversationRoutes, 'put', '/:id/messages/:messageId', {
				params: { id: '1', messageId: '1' },
				body: { content: 'updated' }
			});

			expect(response.statusCode).toBe(404);
			expect((response.body as any).error).toBe('Conversation not found');
		});

		it('returns 404 when message not found', async () => {
			(mockedQueries.getConversationById as any).mockReturnValue({ id: 1, name: 'Test' });
			(mockedQueries.updateConversationMessage as any).mockReturnValue(null);

			const response = await callRoute(conversationRoutes, 'put', '/:id/messages/:messageId', {
				params: { id: '1', messageId: '99' },
				body: { content: 'updated' }
			});

			expect(response.statusCode).toBe(404);
			expect((response.body as any).error).toBe('Message not found');
		});

		it('handles errors gracefully', async () => {
			(mockedQueries.getConversationById as any).mockReturnValue({ id: 1, name: 'Test' });
			(mockedQueries.updateConversationMessage as any).mockImplementation(() => {
				throw new Error('Update failed');
			});

			const response = await callRoute(conversationRoutes, 'put', '/:id/messages/:messageId', {
				params: { id: '1', messageId: '1' },
				body: { content: 'updated' }
			});

			expect(response.statusCode).toBe(500);
			expect((response.body as any).error).toBe('Failed to update message');
		});
	});

	describe('DELETE /api/conversations/:id/messages/:messageId', () => {
		it('deletes a message', async () => {
			(mockedQueries.getConversationById as any).mockReturnValue({ id: 1, name: 'Test' });
			(mockedQueries.deleteConversationMessage as any).mockReturnValue(undefined);

			const response = await callRoute(conversationRoutes, 'delete', '/:id/messages/:messageId', {
				params: { id: '1', messageId: '1' }
			});

			expect(response.statusCode).toBe(204);
			expect(mockedQueries.deleteConversationMessage).toHaveBeenCalledWith(1);
		});

		it('returns 404 when conversation not found', async () => {
			(mockedQueries.getConversationById as any).mockReturnValue(null);

			const response = await callRoute(conversationRoutes, 'delete', '/:id/messages/:messageId', {
				params: { id: '1', messageId: '1' }
			});

			expect(response.statusCode).toBe(404);
			expect((response.body as any).error).toBe('Conversation not found');
		});

		it('handles errors gracefully', async () => {
			(mockedQueries.getConversationById as any).mockReturnValue({ id: 1, name: 'Test' });
			(mockedQueries.deleteConversationMessage as any).mockImplementation(() => {
				throw new Error('Delete failed');
			});

			const response = await callRoute(conversationRoutes, 'delete', '/:id/messages/:messageId', {
				params: { id: '1', messageId: '1' }
			});

			expect(response.statusCode).toBe(500);
			expect((response.body as any).error).toBe('Failed to delete message');
			expect((response.body as any).details).toBe('Delete failed');
		});

		it('handles unknown errors gracefully', async () => {
			(mockedQueries.getConversationById as any).mockReturnValue({ id: 1, name: 'Test' });
			(mockedQueries.deleteConversationMessage as any).mockImplementation(() => {
				throw { code: 'unknown' };
			});

			const response = await callRoute(conversationRoutes, 'delete', '/:id/messages/:messageId', {
				params: { id: '1', messageId: '1' }
			});

			expect(response.statusCode).toBe(500);
			expect((response.body as any).details).toBe('Unknown error');
		});
	});

	describe('PUT /api/conversations/:id/messages/reorder', () => {
		it('reorders messages and returns updated list', async () => {
			(mockedQueries.getConversationById as any).mockReturnValue({ id: 1, name: 'Test' });
			(mockedQueries.reorderConversationMessages as any).mockReturnValue(undefined);
			(mockedQueries.getConversationMessages as any).mockReturnValue([
				{ id: 2, sequence: 1 },
				{ id: 1, sequence: 2 }
			]);

			const response = await callRoute(conversationRoutes, 'put', '/:id/messages/reorder', {
				params: { id: '1' },
				body: { messages: [{ id: 2, sequence: 1 }] }
			});

			expect(response.statusCode).toBe(200);
			expect(response.body).toHaveLength(2);
		});

		it('returns 404 when conversation not found', async () => {
			(mockedQueries.getConversationById as any).mockReturnValue(null);

			const response = await callRoute(conversationRoutes, 'put', '/:id/messages/reorder', {
				params: { id: '1' },
				body: { messages: [{ id: 1, sequence: 1 }] }
			});

			expect(response.statusCode).toBe(404);
			expect((response.body as any).error).toBe('Conversation not found');
		});

		it('returns 400 when messages array is missing', async () => {
			(mockedQueries.getConversationById as any).mockReturnValue({ id: 1, name: 'Test' });

			const response = await callRoute(conversationRoutes, 'put', '/:id/messages/reorder', {
				params: { id: '1' },
				body: { messages: null as any }
			});

			expect(response.statusCode).toBe(400);
			expect((response.body as any).error).toBe('Invalid request');
		});

		it('handles errors gracefully', async () => {
			(mockedQueries.getConversationById as any).mockReturnValue({ id: 1, name: 'Test' });
			(mockedQueries.reorderConversationMessages as any).mockImplementation(() => {
				throw new Error('Reorder failed');
			});

			const response = await callRoute(conversationRoutes, 'put', '/:id/messages/reorder', {
				params: { id: '1' },
				body: { messages: [{ id: 1, sequence: 1 }] }
			});

			expect(response.statusCode).toBe(500);
			expect((response.body as any).error).toBe('Failed to reorder messages');
			expect((response.body as any).details).toBe('Reorder failed');
		});

		it('handles unknown errors gracefully', async () => {
			(mockedQueries.getConversationById as any).mockReturnValue({ id: 1, name: 'Test' });
			(mockedQueries.reorderConversationMessages as any).mockImplementation(() => {
				throw { code: 'unknown' };
			});

			const response = await callRoute(conversationRoutes, 'put', '/:id/messages/reorder', {
				params: { id: '1' },
				body: { messages: [{ id: 1, sequence: 1 }] }
			});

			expect(response.statusCode).toBe(500);
			expect((response.body as any).details).toBe('Unknown error');
		});
	});
});

// Made with Bob
