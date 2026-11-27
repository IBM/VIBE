import type { Request, Response } from 'express';

jest.mock('../../db/queries');
jest.mock('../../services/llm-config-service');
jest.mock('../../utils/pagination');

import llmConfigsRouter from '../llm-configs';
import * as queries from '../../db/queries';

const mockCreateLLMConfig = queries.createLLMConfig as jest.MockedFunction<typeof queries.createLLMConfig>;
const mockUpdateLLMConfig = queries.updateLLMConfig as jest.MockedFunction<typeof queries.updateLLMConfig>;

const findHandler = (method: string, path: string) => {
	const layer = (llmConfigsRouter as any).stack.find(
		(l: any) => l.route && l.route.path === path && l.route.methods[method]
	);
	return layer.route.stack[0].handle;
};

const invoke = async (handler: any, body: any, params: Record<string, string> = {}) => {
	const json = jest.fn();
	const status = jest.fn().mockReturnThis();
	const res = { json, status, send: jest.fn() } as unknown as Response;
	await handler({ body, params, query: {} } as unknown as Request, res, jest.fn());
	return { json, status };
};

describe('llm-configs save-time outbound checks', () => {
	beforeEach(() => {
		jest.clearAllMocks();
		mockCreateLLMConfig.mockImplementation((config: any) => ({ id: 1, ...config }) as any);
		mockUpdateLLMConfig.mockImplementation((id: number, updates: any) => ({ id, ...updates }) as any);
	});

	describe('POST /', () => {
		it('rejects a malformed base_url with 400 and does not save', async () => {
			const post = findHandler('post', '/');
			const { status, json } = await invoke(post, {
				name: 'x',
				provider: 'ollama',
				config: { base_url: 'not a url' }
			});

			expect(status).toHaveBeenCalledWith(400);
			expect(json).toHaveBeenCalledWith({ error: expect.stringContaining('base_url') });
			expect(mockCreateLLMConfig).not.toHaveBeenCalled();
		});

		it('rejects a non-http scheme with 400 when config is a JSON string', async () => {
			const post = findHandler('post', '/');
			const { status } = await invoke(post, {
				name: 'x',
				provider: 'ollama',
				config: JSON.stringify({ base_url: 'file:///etc/passwd' })
			});

			expect(status).toHaveBeenCalledWith(400);
			expect(mockCreateLLMConfig).not.toHaveBeenCalled();
		});

		it('saves but warns when base_url is a policy-blocked literal', async () => {
			const post = findHandler('post', '/');
			const { status, json } = await invoke(post, {
				name: 'x',
				provider: 'ollama',
				config: { base_url: 'http://169.254.169.254' }
			});

			expect(status).toHaveBeenCalledWith(201);
			expect(mockCreateLLMConfig).toHaveBeenCalled();
			expect(json).toHaveBeenCalledWith(
				expect.objectContaining({
					warnings: [expect.stringContaining('base_url')]
				})
			);
		});

		it('saves without warnings when base_url is allowed', async () => {
			const post = findHandler('post', '/');
			const { status, json } = await invoke(post, {
				name: 'x',
				provider: 'ollama',
				config: { base_url: 'https://8.8.8.8' }
			});

			expect(status).toHaveBeenCalledWith(201);
			expect(json.mock.calls[0][0].warnings).toBeUndefined();
		});

		it('saves a config without base_url unchanged', async () => {
			const post = findHandler('post', '/');
			const { status } = await invoke(post, { name: 'x', provider: 'openai', config: { api_key: 'k' } });

			expect(status).toHaveBeenCalledWith(201);
		});
	});

	describe('PUT /:id', () => {
		it('rejects a malformed base_url with 400 and does not update', async () => {
			const put = findHandler('put', '/:id');
			const { status } = await invoke(put, { config: { base_url: 'not a url' } }, { id: '3' });

			expect(status).toHaveBeenCalledWith(400);
			expect(mockUpdateLLMConfig).not.toHaveBeenCalled();
		});

		it('updates without validation when config is not part of the request', async () => {
			const put = findHandler('put', '/:id');
			const { status } = await invoke(put, { name: 'renamed' }, { id: '3' });

			expect(mockUpdateLLMConfig).toHaveBeenCalledWith(3, expect.objectContaining({ name: 'renamed' }));
			expect(status).not.toHaveBeenCalledWith(400);
		});

		it('warns on a policy-blocked base_url but still updates', async () => {
			const put = findHandler('put', '/:id');
			const { json } = await invoke(put, { config: { base_url: 'http://10.0.0.5' } }, { id: '3' });

			expect(mockUpdateLLMConfig).toHaveBeenCalled();
			expect(json).toHaveBeenCalledWith(expect.objectContaining({ warnings: [expect.any(String)] }));
		});
	});
});
