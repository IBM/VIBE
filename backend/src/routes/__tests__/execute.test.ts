import type { Request, Response } from 'express';

// Mock all dependencies before importing the router
jest.mock('../../db/queries');
jest.mock('../../db/repositories/templateRepo');
jest.mock('../../lib/legacyIdResolver');
jest.mock('../../services/job-queue');
jest.mock('../../adapters/legacy-adapter');
jest.mock('../../utils/agent-utils');
jest.mock('../../lib/conversationPreflight');

import executeRouter from '../execute';
import * as queries from '../../db/queries';
import * as templateRepo from '../../db/repositories/templateRepo';
import { testIdToConversationId } from '../../lib/legacyIdResolver';
import { jobQueue } from '../../services/job-queue';
import { isSingleTurnConversation } from '../../adapters/legacy-adapter';
import { getAgentJobType } from '../../utils/agent-utils';
import { preflightConversationExecution } from '../../lib/conversationPreflight';

// Type the mocked functions
const mockGetAgentById = queries.getAgentById as jest.MockedFunction<typeof queries.getAgentById>;
const mockGetConversationById = queries.getConversationById as jest.MockedFunction<typeof queries.getConversationById>;
const mockGetConversationMessages = queries.getConversationMessages as jest.MockedFunction<
	typeof queries.getConversationMessages
>;
const mockTestIdToConversationId = testIdToConversationId as jest.MockedFunction<typeof testIdToConversationId>;
const mockCreateConversationJob = jobQueue.createConversationJob as jest.MockedFunction<
	typeof jobQueue.createConversationJob
>;
const mockIsSingleTurnConversation = isSingleTurnConversation as jest.MockedFunction<typeof isSingleTurnConversation>;
const mockGetAgentJobType = getAgentJobType as jest.MockedFunction<typeof getAgentJobType>;
const mockPreflightConversationExecution = preflightConversationExecution as jest.MockedFunction<
	typeof preflightConversationExecution
>;
const mockGetAgentTemplates = templateRepo.getAgentTemplates as jest.MockedFunction<
	typeof templateRepo.getAgentTemplates
>;
const mockGetAgentResponseMaps = templateRepo.getAgentResponseMaps as jest.MockedFunction<
	typeof templateRepo.getAgentResponseMaps
>;

describe('execute routes', () => {
	let mockReq: Partial<Request>;
	let mockRes: Partial<Response>;
	let jsonMock: jest.Mock;
	let statusMock: jest.Mock;

	beforeEach(() => {
		jest.clearAllMocks();

		jsonMock = jest.fn();
		statusMock = jest.fn().mockReturnThis();

		mockReq = {
			body: {},
			params: {}
		};

		mockRes = {
			json: jsonMock,
			status: statusMock
		};
	});

	// Helper to extract and call route handler
	const getRouteHandler = (method: string, path: string) => {
		const routes = (executeRouter as any).stack;
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

	describe('POST /api/execute', () => {
		it('executes a legacy test successfully', async () => {
			mockReq.body = { agent_id: 1, test_id: 100 };

			(mockTestIdToConversationId as any).mockReturnValue(1);
			(mockGetAgentById as any).mockResolvedValue({ id: 1, name: 'Test Agent' });
			(mockGetConversationById as any).mockResolvedValue({ id: 1, name: 'Test Conversation' });
			(mockGetConversationMessages as any).mockResolvedValue([{ id: 1, role: 'user', content: 'Hello' }]);
			(mockIsSingleTurnConversation as any).mockReturnValue(true);
			(mockCreateConversationJob as any).mockResolvedValue(42);

			await callRoute('post', '/');

			expect(statusMock).toHaveBeenCalledWith(202);
			expect(jsonMock).toHaveBeenCalledWith({
				job_id: 42,
				message: 'Test execution job created and queued for execution'
			});
		});

		it('validates required agent_id field', async () => {
			mockReq.body = { test_id: 100 };

			await callRoute('post', '/');

			expect(statusMock).toHaveBeenCalledWith(400);
			expect(jsonMock).toHaveBeenCalledWith({
				error: 'agent_id and test_id are required'
			});
		});

		it('validates required test_id field', async () => {
			mockReq.body = { agent_id: 1 };

			await callRoute('post', '/');

			expect(statusMock).toHaveBeenCalledWith(400);
			expect(jsonMock).toHaveBeenCalledWith({
				error: 'agent_id and test_id are required'
			});
		});

		it('returns 404 when agent not found', async () => {
			mockReq.body = { agent_id: 999, test_id: 100 };

			(mockTestIdToConversationId as any).mockReturnValue(1);
			(mockGetAgentById as any).mockResolvedValue(null);

			await callRoute('post', '/');

			expect(statusMock).toHaveBeenCalledWith(404);
			expect(jsonMock).toHaveBeenCalledWith({ error: 'Agent not found' });
		});

		it('returns 404 when test not found', async () => {
			mockReq.body = { agent_id: 1, test_id: 999 };

			(mockTestIdToConversationId as any).mockReturnValue(999);
			(mockGetAgentById as any).mockResolvedValue({ id: 1, name: 'Test Agent' });
			(mockGetConversationById as any).mockResolvedValue(null);

			await callRoute('post', '/');

			expect(statusMock).toHaveBeenCalledWith(404);
			expect(jsonMock).toHaveBeenCalledWith({ error: 'Test not found' });
		});

		it('rejects multi-turn conversation as legacy test', async () => {
			mockReq.body = { agent_id: 1, test_id: 100 };

			(mockTestIdToConversationId as any).mockReturnValue(1);
			(mockGetAgentById as any).mockResolvedValue({ id: 1, name: 'Test Agent' });
			(mockGetConversationById as any).mockResolvedValue({ id: 1, name: 'Multi-turn' });
			(mockGetConversationMessages as any).mockResolvedValue([
				{ id: 1, role: 'user', content: 'Hello' },
				{ id: 2, role: 'assistant', content: 'Hi' }
			]);
			(mockIsSingleTurnConversation as any).mockReturnValue(false);

			await callRoute('post', '/');

			expect(statusMock).toHaveBeenCalledWith(400);
			expect(jsonMock).toHaveBeenCalledWith({
				error: 'Cannot execute multi-turn conversation as legacy test'
			});
		});

		it('uses test_id directly when no legacy mapping exists', async () => {
			mockReq.body = { agent_id: 1, test_id: 50 };

			(mockTestIdToConversationId as any).mockReturnValue(null);
			(mockGetAgentById as any).mockResolvedValue({ id: 1, name: 'Test Agent' });
			(mockGetConversationById as any).mockResolvedValue({ id: 50, name: 'Direct Conversation' });
			(mockGetConversationMessages as any).mockResolvedValue([{ id: 1, role: 'user', content: 'Hello' }]);
			(mockIsSingleTurnConversation as any).mockReturnValue(true);
			(mockCreateConversationJob as any).mockResolvedValue(99);

			await callRoute('post', '/');

			expect(mockGetConversationById).toHaveBeenCalledWith(50);
			expect(statusMock).toHaveBeenCalledWith(202);
		});

		it('handles database errors gracefully', async () => {
			mockReq.body = { agent_id: 1, test_id: 100 };

			(mockTestIdToConversationId as any).mockReturnValue(1);
			(mockGetAgentById as any).mockRejectedValue(new Error('Database error'));

			await callRoute('post', '/');

			expect(statusMock).toHaveBeenCalledWith(500);
			expect(jsonMock).toHaveBeenCalledWith({
				error: 'Failed to execute test',
				details: 'Database error'
			});
		});
	});

	describe('POST /api/execute/conversation', () => {
		it('executes a conversation successfully with non-external agent', async () => {
			mockReq.body = { agent_id: 1, conversation_id: 10 };

			(mockGetAgentById as any).mockResolvedValue({
				id: 1,
				name: 'Test Agent',
				settings: { type: 'standard' }
			});
			(mockGetConversationById as any).mockResolvedValue({ id: 10, name: 'Test Conversation' });
			(mockGetAgentJobType as any).mockReturnValue('standard');
			(mockPreflightConversationExecution as any).mockReturnValue({ ok: true });
			(mockCreateConversationJob as any).mockResolvedValue(55);

			await callRoute('post', '/conversation');

			expect(statusMock).toHaveBeenCalledWith(202);
			expect(jsonMock).toHaveBeenCalledWith({
				job_id: 55,
				message: 'Conversation execution job created and queued for execution'
			});
		});

		it('executes a conversation successfully with external_api agent', async () => {
			mockReq.body = { agent_id: 1, conversation_id: 10 };

			(mockGetAgentById as any).mockResolvedValue({
				id: 1,
				name: 'External Agent',
				settings: { type: 'external_api' }
			});
			(mockGetConversationById as any).mockResolvedValue({ id: 10, name: 'Test Conversation' });
			(mockGetConversationMessages as any).mockResolvedValue([{ id: 1, role: 'user', content: 'Hello' }]);
			(mockGetAgentTemplates as any).mockReturnValue([{ id: 1, is_default: true, capability: null }]);
			(mockGetAgentResponseMaps as any).mockReturnValue([{ id: 1, is_default: true, capability: null }]);
			(mockGetAgentJobType as any).mockReturnValue('external_api');
			(mockPreflightConversationExecution as any).mockReturnValue({ ok: true });
			(mockCreateConversationJob as any).mockResolvedValue(66);

			await callRoute('post', '/conversation');

			expect(mockGetConversationMessages).toHaveBeenCalledWith(10);
			expect(mockGetAgentTemplates).toHaveBeenCalledWith(1);
			expect(mockGetAgentResponseMaps).toHaveBeenCalledWith(1);
			expect(statusMock).toHaveBeenCalledWith(202);
		});

		it('validates required agent_id field', async () => {
			mockReq.body = { conversation_id: 10 };

			await callRoute('post', '/conversation');

			expect(statusMock).toHaveBeenCalledWith(400);
			expect(jsonMock).toHaveBeenCalledWith({
				error: 'agent_id and conversation_id are required'
			});
		});

		it('validates required conversation_id field', async () => {
			mockReq.body = { agent_id: 1 };

			await callRoute('post', '/conversation');

			expect(statusMock).toHaveBeenCalledWith(400);
			expect(jsonMock).toHaveBeenCalledWith({
				error: 'agent_id and conversation_id are required'
			});
		});

		it('returns 404 when agent not found', async () => {
			mockReq.body = { agent_id: 999, conversation_id: 10 };

			(mockGetAgentById as any).mockResolvedValue(null);

			await callRoute('post', '/conversation');

			expect(statusMock).toHaveBeenCalledWith(404);
			expect(jsonMock).toHaveBeenCalledWith({ error: 'Agent not found' });
		});

		it('returns 404 when conversation not found', async () => {
			mockReq.body = { agent_id: 1, conversation_id: 999 };

			(mockGetAgentById as any).mockResolvedValue({ id: 1, name: 'Test Agent' });
			(mockGetConversationById as any).mockResolvedValue(null);

			await callRoute('post', '/conversation');

			expect(statusMock).toHaveBeenCalledWith(404);
			expect(jsonMock).toHaveBeenCalledWith({ error: 'Conversation not found' });
		});

		it('fails preflight validation for external_api agent', async () => {
			mockReq.body = { agent_id: 1, conversation_id: 10 };

			(mockGetAgentById as any).mockResolvedValue({
				id: 1,
				name: 'External Agent',
				settings: { type: 'external_api' }
			});
			(mockGetConversationById as any).mockResolvedValue({ id: 10, name: 'Test Conversation' });
			(mockGetConversationMessages as any).mockResolvedValue([]);
			(mockGetAgentTemplates as any).mockReturnValue([]);
			(mockGetAgentResponseMaps as any).mockReturnValue([]);
			(mockGetAgentJobType as any).mockReturnValue('external_api');
			(mockPreflightConversationExecution as any).mockReturnValue({
				ok: false,
				errors: ['Missing required template']
			});

			await callRoute('post', '/conversation');

			expect(statusMock).toHaveBeenCalledWith(400);
			expect(jsonMock).toHaveBeenCalledWith({
				error: 'Conversation cannot be executed with this agent',
				code: 'CONVERSATION_PREFLIGHT_FAILED',
				details: ['Missing required template']
			});
		});

		it('fails preflight validation for non-external agent', async () => {
			mockReq.body = { agent_id: 1, conversation_id: 10 };

			(mockGetAgentById as any).mockResolvedValue({
				id: 1,
				name: 'Standard Agent',
				settings: { type: 'standard' }
			});
			(mockGetConversationById as any).mockResolvedValue({ id: 10, name: 'Test Conversation' });
			(mockGetAgentJobType as any).mockReturnValue('standard');
			(mockPreflightConversationExecution as any).mockReturnValue({
				ok: false,
				errors: ['Conversation requires external API capabilities']
			});

			await callRoute('post', '/conversation');

			expect(statusMock).toHaveBeenCalledWith(400);
			expect(jsonMock).toHaveBeenCalledWith({
				error: 'Conversation cannot be executed with this agent',
				code: 'CONVERSATION_PREFLIGHT_FAILED',
				details: ['Conversation requires external API capabilities']
			});
		});

		it('handles database errors gracefully', async () => {
			mockReq.body = { agent_id: 1, conversation_id: 10 };

			(mockGetAgentById as any).mockRejectedValue(new Error('Connection timeout'));

			await callRoute('post', '/conversation');

			expect(statusMock).toHaveBeenCalledWith(500);
			expect(jsonMock).toHaveBeenCalledWith({
				error: 'Failed to execute conversation',
				details: 'Connection timeout'
			});
		});
	});
});

// Made with Bob
