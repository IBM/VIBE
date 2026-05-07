import conversationTurnTargetsRoutes from '../conversation-turn-targets';
import db from '../../db/database';

jest.mock('../../db/database');

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

const getRouteHandler = (router: any, method: 'get' | 'put' | 'delete', path: string) => {
	const layer = router.stack.find((entry: any) => entry.route?.path === path && entry.route?.methods?.[method]);
	if (!layer) {
		throw new Error(`Route not found: ${method.toUpperCase()} ${path}`);
	}
	return layer.route.stack[0].handle;
};

const callRoute = async (
	router: any,
	method: 'get' | 'put' | 'delete',
	path: string,
	options?: { params?: Record<string, string>; body?: Record<string, unknown> }
) => {
	const handler = getRouteHandler(router, method, path);
	const req = {
		params: options?.params ?? {},
		body: options?.body ?? {}
	} as any;
	const res = createMockResponse();
	await handler(req, res);
	return res;
};

describe('conversation-turn-targets routes', () => {
	beforeEach(() => {
		jest.clearAllMocks();
	});

	describe('GET /conversation/:conversationId', () => {
		it('returns turn targets for a conversation', async () => {
			const mockTargets = [
				{
					id: 1,
					conversation_id: 5,
					user_sequence: 1,
					target_reply: 'Expected response 1',
					threshold: 80,
					weight: 1.0
				},
				{
					id: 2,
					conversation_id: 5,
					user_sequence: 2,
					target_reply: 'Expected response 2',
					threshold: 85,
					weight: 1.5
				}
			];

			mockedDb.prepare = jest.fn().mockReturnValue({
				all: jest.fn().mockReturnValue(mockTargets)
			} as any);

			const response = await callRoute(conversationTurnTargetsRoutes, 'get', '/conversation/:conversationId', {
				params: { conversationId: '5' }
			});

			expect(response.statusCode).toBe(200);
			expect(response.body).toEqual(mockTargets);
		});

		it('returns empty array when no targets exist', async () => {
			mockedDb.prepare = jest.fn().mockReturnValue({
				all: jest.fn().mockReturnValue([])
			} as any);

			const response = await callRoute(conversationTurnTargetsRoutes, 'get', '/conversation/:conversationId', {
				params: { conversationId: '999' }
			});

			expect(response.statusCode).toBe(200);
			expect(response.body).toEqual([]);
		});

		it('returns 500 on database error', async () => {
			mockedDb.prepare = jest.fn().mockImplementation(() => {
				throw new Error('Database error');
			});

			const response = await callRoute(conversationTurnTargetsRoutes, 'get', '/conversation/:conversationId', {
				params: { conversationId: '5' }
			});

			expect(response.statusCode).toBe(500);
			expect(response.body).toEqual({ error: 'Failed to fetch turn targets' });
		});
	});

	describe('PUT /', () => {
		it('creates a new turn target', async () => {
			const newTarget = {
				id: 10,
				conversation_id: 5,
				user_sequence: 3,
				target_reply: 'New expected response',
				threshold: 75,
				weight: 1.0
			};

			mockedDb.prepare = jest
				.fn()
				.mockReturnValueOnce({
					get: jest.fn().mockReturnValue(undefined) // No existing target
				} as any)
				.mockReturnValueOnce({
					get: jest.fn().mockReturnValue(newTarget) // Insert returns new target
				} as any);

			const response = await callRoute(conversationTurnTargetsRoutes, 'put', '/', {
				body: {
					conversation_id: 5,
					user_sequence: 3,
					target_reply: 'New expected response',
					threshold: 75,
					weight: 1.0
				}
			});

			expect(response.statusCode).toBe(201);
			expect(response.body).toEqual(newTarget);
		});

		it('updates an existing turn target', async () => {
			const existingTarget = {
				id: 1,
				conversation_id: 5,
				user_sequence: 1,
				target_reply: 'Old response',
				threshold: 80,
				weight: 1.0
			};

			const updatedTarget = {
				...existingTarget,
				target_reply: 'Updated response',
				threshold: 90
			};

			mockedDb.prepare = jest
				.fn()
				.mockReturnValueOnce({
					get: jest.fn().mockReturnValue(existingTarget) // Existing target found
				} as any)
				.mockReturnValueOnce({
					get: jest.fn().mockReturnValue(updatedTarget) // Update returns updated target
				} as any);

			const response = await callRoute(conversationTurnTargetsRoutes, 'put', '/', {
				body: {
					conversation_id: 5,
					user_sequence: 1,
					target_reply: 'Updated response',
					threshold: 90,
					weight: 1.0
				}
			});

			expect(response.statusCode).toBe(200);
			expect(response.body).toEqual(updatedTarget);
		});

		it('returns 400 when conversation_id is missing', async () => {
			const response = await callRoute(conversationTurnTargetsRoutes, 'put', '/', {
				body: {
					user_sequence: 1,
					target_reply: 'Response'
				}
			});

			expect(response.statusCode).toBe(400);
			expect(response.body).toEqual({ error: 'conversation_id, user_sequence, and target_reply are required' });
		});

		it('returns 400 when user_sequence is missing', async () => {
			const response = await callRoute(conversationTurnTargetsRoutes, 'put', '/', {
				body: {
					conversation_id: 5,
					target_reply: 'Response'
				}
			});

			expect(response.statusCode).toBe(400);
			expect(response.body).toEqual({ error: 'conversation_id, user_sequence, and target_reply are required' });
		});

		it('returns 400 when target_reply is missing', async () => {
			const response = await callRoute(conversationTurnTargetsRoutes, 'put', '/', {
				body: {
					conversation_id: 5,
					user_sequence: 1
				}
			});

			expect(response.statusCode).toBe(400);
			expect(response.body).toEqual({ error: 'conversation_id, user_sequence, and target_reply are required' });
		});

		it('accepts user_sequence of 0', async () => {
			const newTarget = {
				id: 10,
				conversation_id: 5,
				user_sequence: 0,
				target_reply: 'Response for sequence 0',
				threshold: null,
				weight: null
			};

			mockedDb.prepare = jest
				.fn()
				.mockReturnValueOnce({
					get: jest.fn().mockReturnValue(undefined)
				} as any)
				.mockReturnValueOnce({
					get: jest.fn().mockReturnValue(newTarget)
				} as any);

			const response = await callRoute(conversationTurnTargetsRoutes, 'put', '/', {
				body: {
					conversation_id: 5,
					user_sequence: 0,
					target_reply: 'Response for sequence 0'
				}
			});

			expect(response.statusCode).toBe(201);
			expect(response.body).toEqual(newTarget);
		});

		it('returns 500 on database error', async () => {
			mockedDb.prepare = jest.fn().mockImplementation(() => {
				throw new Error('Database error');
			});

			const response = await callRoute(conversationTurnTargetsRoutes, 'put', '/', {
				body: {
					conversation_id: 5,
					user_sequence: 1,
					target_reply: 'Response'
				}
			});

			expect(response.statusCode).toBe(500);
			expect(response.body).toEqual({ error: 'Failed to save turn target' });
		});
	});

	describe('DELETE /:id', () => {
		it('deletes a turn target', async () => {
			mockedDb.prepare = jest.fn().mockReturnValue({
				run: jest.fn()
			} as any);

			const response = await callRoute(conversationTurnTargetsRoutes, 'delete', '/:id', {
				params: { id: '1' }
			});

			expect(response.statusCode).toBe(204);
		});

		it('returns 500 on database error', async () => {
			mockedDb.prepare = jest.fn().mockImplementation(() => {
				throw new Error('Database error');
			});

			const response = await callRoute(conversationTurnTargetsRoutes, 'delete', '/:id', {
				params: { id: '1' }
			});

			expect(response.statusCode).toBe(500);
			expect(response.body).toEqual({ error: 'Failed to delete turn target' });
		});
	});
});

// Made with Bob
