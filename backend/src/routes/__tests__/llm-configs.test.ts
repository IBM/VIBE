import type { Request, Response } from 'express';

// Mock all dependencies before importing the router
jest.mock('../../db/queries');
jest.mock('../../services/llm-config-service');
jest.mock('../../utils/pagination');

import llmConfigsRouter from '../llm-configs';
import * as queries from '../../db/queries';
import { llmConfigService } from '../../services/llm-config-service';
import { hasPaginationParams, validatePaginationOrError } from '../../utils/pagination';

// Type the mocked functions
const mockGetLLMConfigsWithCount = queries.getLLMConfigsWithCount as jest.MockedFunction<
	typeof queries.getLLMConfigsWithCount
>;
const mockCreateLLMConfig = queries.createLLMConfig as jest.MockedFunction<typeof queries.createLLMConfig>;
const mockUpdateLLMConfig = queries.updateLLMConfig as jest.MockedFunction<typeof queries.updateLLMConfig>;
const mockDeleteLLMConfig = queries.deleteLLMConfig as jest.MockedFunction<typeof queries.deleteLLMConfig>;
const mockGetConfigs = llmConfigService.getConfigs as jest.MockedFunction<typeof llmConfigService.getConfigs>;
const mockGetConfigById = llmConfigService.getConfigById as jest.MockedFunction<typeof llmConfigService.getConfigById>;
const mockCallLLM = llmConfigService.callLLM as jest.MockedFunction<typeof llmConfigService.callLLM>;
const mockCallLLMWithFallback = llmConfigService.callLLMWithFallback as jest.MockedFunction<
	typeof llmConfigService.callLLMWithFallback
>;
const mockHasPaginationParams = hasPaginationParams as jest.MockedFunction<typeof hasPaginationParams>;
const mockValidatePaginationOrError = validatePaginationOrError as jest.MockedFunction<
	typeof validatePaginationOrError
>;

describe('llm-configs routes', () => {
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
		const routes = (llmConfigsRouter as any).stack;
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

	describe('GET /api/llm-configs', () => {
		it('returns all configs without pagination', async () => {
			(mockHasPaginationParams as any).mockReturnValue(false);
			(mockGetConfigs as any).mockReturnValue([
				{ id: 1, name: 'Config 1', provider: 'openai', config: '{}', priority: 100 },
				{ id: 2, name: 'Config 2', provider: 'anthropic', config: '{}', priority: 200 }
			]);

			await callRoute('get', '/');

			expect(mockGetConfigs).toHaveBeenCalled();
			expect(jsonMock).toHaveBeenCalledWith([
				{ id: 1, name: 'Config 1', provider: 'openai', config: '{}', priority: 100 },
				{ id: 2, name: 'Config 2', provider: 'anthropic', config: '{}', priority: 200 }
			]);
		});

		it('returns paginated configs when pagination params provided', async () => {
			mockReq.query = { limit: '10', offset: '0' };
			(mockHasPaginationParams as any).mockReturnValue(true);
			(mockValidatePaginationOrError as any).mockReturnValue({ limit: 10, offset: 0 });
			(mockGetLLMConfigsWithCount as any).mockReturnValue({
				data: [{ id: 1, name: 'Config 1', provider: 'openai', config: '{}', priority: 100 }],
				total: 1
			});

			await callRoute('get', '/');

			expect(jsonMock).toHaveBeenCalledWith({
				data: [{ id: 1, name: 'Config 1', provider: 'openai', config: '{}', priority: 100 }],
				total: 1,
				limit: 10,
				offset: 0
			});
		});

		it('handles errors gracefully', async () => {
			(mockHasPaginationParams as any).mockReturnValue(false);
			(mockGetConfigs as any).mockImplementation(() => {
				throw new Error('Database error');
			});

			await callRoute('get', '/');

			expect(statusMock).toHaveBeenCalledWith(500);
			expect(jsonMock).toHaveBeenCalledWith({ error: 'Database error' });
		});
	});

	describe('GET /api/llm-configs/:id', () => {
		it('returns a config by id', async () => {
			mockReq.params = { id: '1' };
			(mockGetConfigById as any).mockReturnValue({
				id: 1,
				name: 'Test Config',
				provider: 'openai',
				config: '{"model":"gpt-4"}',
				priority: 100
			});

			await callRoute('get', '/:id');

			expect(mockGetConfigById).toHaveBeenCalledWith(1);
			expect(jsonMock).toHaveBeenCalledWith({
				id: 1,
				name: 'Test Config',
				provider: 'openai',
				config: '{"model":"gpt-4"}',
				priority: 100
			});
		});

		it('returns 400 for invalid id format', async () => {
			mockReq.params = { id: 'invalid' };

			await callRoute('get', '/:id');

			expect(statusMock).toHaveBeenCalledWith(400);
			expect(jsonMock).toHaveBeenCalledWith({ error: 'Invalid ID format' });
		});

		it('returns 404 when config not found', async () => {
			mockReq.params = { id: '999' };
			(mockGetConfigById as any).mockReturnValue(null);

			await callRoute('get', '/:id');

			expect(statusMock).toHaveBeenCalledWith(404);
			expect(jsonMock).toHaveBeenCalledWith({ error: 'LLM config not found' });
		});

		it('handles errors gracefully', async () => {
			mockReq.params = { id: '1' };
			(mockGetConfigById as any).mockImplementation(() => {
				throw new Error('Database error');
			});

			await callRoute('get', '/:id');

			expect(statusMock).toHaveBeenCalledWith(500);
			expect(jsonMock).toHaveBeenCalledWith({ error: 'Database error' });
		});
	});

	describe('POST /api/llm-configs', () => {
		it('creates a new config with string config', async () => {
			mockReq.body = {
				name: 'New Config',
				provider: 'openai',
				config: '{"model":"gpt-4"}',
				priority: 150
			};
			(mockCreateLLMConfig as any).mockReturnValue({
				id: 1,
				name: 'New Config',
				provider: 'openai',
				config: '{"model":"gpt-4"}',
				priority: 150
			});

			await callRoute('post', '/');

			expect(mockCreateLLMConfig).toHaveBeenCalledWith({
				name: 'New Config',
				provider: 'openai',
				config: '{"model":"gpt-4"}',
				priority: 150
			});
			expect(statusMock).toHaveBeenCalledWith(201);
			expect(jsonMock).toHaveBeenCalledWith({
				id: 1,
				name: 'New Config',
				provider: 'openai',
				config: '{"model":"gpt-4"}',
				priority: 150
			});
		});

		it('creates a new config with object config', async () => {
			mockReq.body = {
				name: 'New Config',
				provider: 'openai',
				config: { model: 'gpt-4' },
				priority: 150
			};
			(mockCreateLLMConfig as any).mockReturnValue({
				id: 1,
				name: 'New Config',
				provider: 'openai',
				config: '{"model":"gpt-4"}',
				priority: 150
			});

			await callRoute('post', '/');

			expect(mockCreateLLMConfig).toHaveBeenCalledWith({
				name: 'New Config',
				provider: 'openai',
				config: '{"model":"gpt-4"}',
				priority: 150
			});
		});

		it('uses default priority when not provided', async () => {
			mockReq.body = {
				name: 'New Config',
				provider: 'openai',
				config: '{}'
			};
			(mockCreateLLMConfig as any).mockReturnValue({
				id: 1,
				name: 'New Config',
				provider: 'openai',
				config: '{}',
				priority: 100
			});

			await callRoute('post', '/');

			expect(mockCreateLLMConfig).toHaveBeenCalledWith(expect.objectContaining({ priority: 100 }));
		});

		it('validates required name field', async () => {
			mockReq.body = {
				provider: 'openai',
				config: '{}'
			};

			await callRoute('post', '/');

			expect(statusMock).toHaveBeenCalledWith(400);
			expect(jsonMock).toHaveBeenCalledWith({
				error: 'Missing required fields: name, provider, and config are required'
			});
		});

		it('validates required provider field', async () => {
			mockReq.body = {
				name: 'Test',
				config: '{}'
			};

			await callRoute('post', '/');

			expect(statusMock).toHaveBeenCalledWith(400);
			expect(jsonMock).toHaveBeenCalledWith({
				error: 'Missing required fields: name, provider, and config are required'
			});
		});

		it('validates required config field', async () => {
			mockReq.body = {
				name: 'Test',
				provider: 'openai'
			};

			await callRoute('post', '/');

			expect(statusMock).toHaveBeenCalledWith(400);
			expect(jsonMock).toHaveBeenCalledWith({
				error: 'Missing required fields: name, provider, and config are required'
			});
		});

		it('handles errors gracefully', async () => {
			mockReq.body = {
				name: 'Test',
				provider: 'openai',
				config: '{}'
			};
			(mockCreateLLMConfig as any).mockImplementation(() => {
				throw new Error('Database error');
			});

			await callRoute('post', '/');

			expect(statusMock).toHaveBeenCalledWith(500);
			expect(jsonMock).toHaveBeenCalledWith({ error: 'Database error' });
		});
	});

	describe('PUT /api/llm-configs/:id', () => {
		it('updates an existing config', async () => {
			mockReq.params = { id: '1' };
			mockReq.body = {
				name: 'Updated Config',
				provider: 'anthropic',
				config: '{"model":"claude-3"}',
				priority: 200
			};
			(mockUpdateLLMConfig as any).mockReturnValue({
				id: 1,
				name: 'Updated Config',
				provider: 'anthropic',
				config: '{"model":"claude-3"}',
				priority: 200
			});

			await callRoute('put', '/:id');

			expect(mockUpdateLLMConfig).toHaveBeenCalledWith(1, expect.any(Object));
			expect(jsonMock).toHaveBeenCalledWith({
				id: 1,
				name: 'Updated Config',
				provider: 'anthropic',
				config: '{"model":"claude-3"}',
				priority: 200
			});
		});

		it('converts object config to string', async () => {
			mockReq.params = { id: '1' };
			mockReq.body = {
				name: 'Updated Config',
				config: { model: 'claude-3' }
			};
			(mockUpdateLLMConfig as any).mockReturnValue({
				id: 1,
				name: 'Updated Config',
				config: '{"model":"claude-3"}'
			});

			await callRoute('put', '/:id');

			expect(mockUpdateLLMConfig).toHaveBeenCalledWith(
				1,
				expect.objectContaining({ config: '{"model":"claude-3"}' })
			);
		});

		it('returns 400 for invalid id format', async () => {
			mockReq.params = { id: 'invalid' };
			mockReq.body = { name: 'Test' };

			await callRoute('put', '/:id');

			expect(statusMock).toHaveBeenCalledWith(400);
			expect(jsonMock).toHaveBeenCalledWith({ error: 'Invalid ID format' });
		});

		it('returns 404 when config not found', async () => {
			mockReq.params = { id: '999' };
			mockReq.body = { name: 'Test' };
			(mockUpdateLLMConfig as any).mockReturnValue(null);

			await callRoute('put', '/:id');

			expect(statusMock).toHaveBeenCalledWith(404);
			expect(jsonMock).toHaveBeenCalledWith({ error: 'LLM config not found' });
		});

		it('handles errors gracefully', async () => {
			mockReq.params = { id: '1' };
			mockReq.body = { name: 'Test' };
			(mockUpdateLLMConfig as any).mockImplementation(() => {
				throw new Error('Database error');
			});

			await callRoute('put', '/:id');

			expect(statusMock).toHaveBeenCalledWith(500);
			expect(jsonMock).toHaveBeenCalledWith({ error: 'Database error' });
		});
	});

	describe('DELETE /api/llm-configs/:id', () => {
		it('deletes an existing config', async () => {
			mockReq.params = { id: '1' };
			(mockDeleteLLMConfig as any).mockReturnValue({ changes: 1 });

			await callRoute('delete', '/:id');

			expect(mockDeleteLLMConfig).toHaveBeenCalledWith(1);
			expect(statusMock).toHaveBeenCalledWith(204);
			expect(sendMock).toHaveBeenCalled();
		});

		it('returns 400 for invalid id format', async () => {
			mockReq.params = { id: 'invalid' };

			await callRoute('delete', '/:id');

			expect(statusMock).toHaveBeenCalledWith(400);
			expect(jsonMock).toHaveBeenCalledWith({ error: 'Invalid ID format' });
		});

		it('returns 404 when config not found', async () => {
			mockReq.params = { id: '999' };
			(mockDeleteLLMConfig as any).mockReturnValue({ changes: 0 });

			await callRoute('delete', '/:id');

			expect(statusMock).toHaveBeenCalledWith(404);
			expect(jsonMock).toHaveBeenCalledWith({ error: 'LLM config not found' });
		});

		it('handles errors gracefully', async () => {
			mockReq.params = { id: '1' };
			(mockDeleteLLMConfig as any).mockImplementation(() => {
				throw new Error('Database error');
			});

			await callRoute('delete', '/:id');

			expect(statusMock).toHaveBeenCalledWith(500);
			expect(jsonMock).toHaveBeenCalledWith({ error: 'Database error' });
		});
	});

	describe('POST /api/llm-configs/:id/call', () => {
		it('calls a specific LLM config', async () => {
			mockReq.params = { id: '1' };
			mockReq.body = {
				prompt: 'Test prompt',
				max_tokens: 100,
				temperature: 0.7
			};
			(mockCallLLM as any).mockResolvedValue({
				response: 'Test response',
				usage: { total_tokens: 50 }
			});

			await callRoute('post', '/:id/call');

			expect(mockCallLLM).toHaveBeenCalledWith(1, {
				prompt: 'Test prompt',
				max_tokens: 100,
				temperature: 0.7,
				stop: undefined
			});
			expect(jsonMock).toHaveBeenCalledWith({
				response: 'Test response',
				usage: { total_tokens: 50 }
			});
		});

		it('returns 400 for invalid id format', async () => {
			mockReq.params = { id: 'invalid' };
			mockReq.body = { prompt: 'Test' };

			await callRoute('post', '/:id/call');

			expect(statusMock).toHaveBeenCalledWith(400);
			expect(jsonMock).toHaveBeenCalledWith({ error: 'Invalid ID format' });
		});

		it('validates required prompt field', async () => {
			mockReq.params = { id: '1' };
			mockReq.body = {};

			await callRoute('post', '/:id/call');

			expect(statusMock).toHaveBeenCalledWith(400);
			expect(jsonMock).toHaveBeenCalledWith({ error: 'Prompt is required' });
		});

		it('returns 500 when LLM call fails', async () => {
			mockReq.params = { id: '1' };
			mockReq.body = { prompt: 'Test' };
			(mockCallLLM as any).mockResolvedValue({
				error: 'LLM API error'
			});

			await callRoute('post', '/:id/call');

			expect(statusMock).toHaveBeenCalledWith(500);
			expect(jsonMock).toHaveBeenCalledWith({ error: 'LLM API error' });
		});

		it('handles errors gracefully', async () => {
			mockReq.params = { id: '1' };
			mockReq.body = { prompt: 'Test' };
			(mockCallLLM as any).mockRejectedValue(new Error('Network error'));

			await callRoute('post', '/:id/call');

			expect(statusMock).toHaveBeenCalledWith(500);
			expect(jsonMock).toHaveBeenCalledWith({ error: 'Network error' });
		});
	});

	describe('POST /api/llm-configs/call', () => {
		it('calls LLMs with fallback', async () => {
			mockReq.body = {
				prompt: 'Test prompt',
				max_tokens: 100,
				temperature: 0.7
			};
			(mockCallLLMWithFallback as any).mockResolvedValue({
				response: 'Test response',
				config_id: 1,
				usage: { total_tokens: 50 }
			});

			await callRoute('post', '/call');

			expect(mockCallLLMWithFallback).toHaveBeenCalledWith({
				prompt: 'Test prompt',
				max_tokens: 100,
				temperature: 0.7,
				stop: undefined
			});
			expect(jsonMock).toHaveBeenCalledWith({
				response: 'Test response',
				config_id: 1,
				usage: { total_tokens: 50 }
			});
		});

		it('validates required prompt field', async () => {
			mockReq.body = {};

			await callRoute('post', '/call');

			expect(statusMock).toHaveBeenCalledWith(400);
			expect(jsonMock).toHaveBeenCalledWith({ error: 'Prompt is required' });
		});

		it('handles errors gracefully', async () => {
			mockReq.body = { prompt: 'Test' };
			(mockCallLLMWithFallback as any).mockRejectedValue(new Error('All LLMs failed'));

			await callRoute('post', '/call');

			expect(statusMock).toHaveBeenCalledWith(500);
			expect(jsonMock).toHaveBeenCalledWith({ error: 'All LLMs failed' });
		});
	});
});

// Made with Bob
