import router from '../index';
import { apiService } from '../../services/api-service';

jest.mock('../../services/api-service', () => ({
	apiService: {
		executeTest: jest.fn()
	}
}));

const mockedApiService = apiService as jest.Mocked<typeof apiService>;

type MockResponse = {
	statusCode: number;
	body?: unknown;
	status: (code: number) => MockResponse;
	json: (data: unknown) => MockResponse;
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
		}
	} as MockResponse;
	return res;
};

const getRouteHandler = (method: 'get' | 'post', path: string) => {
	const layer = router.stack.find(
		(entry: any) => entry.route?.path === path && entry.route?.methods?.[method]
	) as any;
	if (!layer || !layer.route) {
		throw new Error(`Route not found: ${method.toUpperCase()} ${path}`);
	}
	return layer.route.stack[0].handle as any;
};

const callRoute = async (method: 'get' | 'post', path: string, options?: { body?: Record<string, unknown> }) => {
	const handler = getRouteHandler(method, path);
	const req = {
		body: options?.body ?? {}
	} as any;
	const res = createMockResponse();
	const next = jest.fn();
	await handler(req, res, next);
	return res;
};

describe('agent-service-api routes', () => {
	beforeEach(() => {
		jest.clearAllMocks();
	});

	it('GET /health returns ok', async () => {
		const response = await callRoute('get', '/health');

		expect(response.statusCode).toBe(200);
		expect(response.body).toEqual({ status: 'ok' });
	});

	it('POST /execute-test validates required fields', async () => {
		const response = await callRoute('post', '/execute-test', { body: { api_endpoint: 'http://test' } });

		expect(response.statusCode).toBe(400);
		expect((response.body as any).error).toBe('test_input is required');
	});

	it('POST /execute-test validates api_endpoint', async () => {
		const response = await callRoute('post', '/execute-test', { body: { test_id: 1, test_input: 'hi' } });

		expect(response.statusCode).toBe(400);
		expect((response.body as any).error).toBe('api_endpoint is required');
	});

	it('POST /execute-test validates test_id', async () => {
		const response = await callRoute('post', '/execute-test', {
			body: { test_input: 'hi', api_endpoint: 'http://test' }
		});

		expect(response.statusCode).toBe(400);
		expect((response.body as any).error).toBe('test_id is required');
	});

	it('POST /execute-test executes via service', async () => {
		mockedApiService.executeTest.mockResolvedValue({ test_id: 1, output: 'ok', success: true } as any);

		const response = await callRoute('post', '/execute-test', {
			body: { test_id: 1, test_input: 'hi', api_endpoint: 'http://test' }
		});

		expect(response.statusCode).toBe(200);
		expect(mockedApiService.executeTest).toHaveBeenCalled();
		expect((response.body as any).output).toBe('ok');
	});

	it('POST /execute-test handles service errors', async () => {
		mockedApiService.executeTest.mockRejectedValueOnce(new Error('boom'));

		const response = await callRoute('post', '/execute-test', {
			body: { test_id: 1, test_input: 'hi', api_endpoint: 'http://test' }
		});

		expect(response.statusCode).toBe(500);
		expect((response.body as any).error).toBe('Failed to execute test');
	});

	it('POST /execute-test handles unknown error messages', async () => {
		mockedApiService.executeTest.mockRejectedValueOnce({} as any);

		const response = await callRoute('post', '/execute-test', {
			body: { test_id: 1, test_input: 'hi', api_endpoint: 'http://test' }
		});

		expect(response.statusCode).toBe(500);
		expect((response.body as any).details).toBe('Unknown error');
	});
});
