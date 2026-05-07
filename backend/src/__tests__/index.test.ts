describe('backend bootstrap', () => {
	beforeEach(() => {
		jest.resetModules();
		jest.clearAllMocks();
	});

	it('wires middleware, routes, and health endpoint', () => {
		const use = jest.fn();
		const get = jest.fn();
		const listen = jest.fn((_port: number, cb?: () => void) => {
			if (cb) cb();
			return {};
		});
		const json = jest.fn(() => 'json-mw');

		jest.doMock('express', () => {
			const express = () => ({ use, get, listen });
			(express as any).json = json;
			return express;
		});

		const cors = jest.fn(() => 'cors-mw');
		jest.doMock('cors', () => cors);

		jest.doMock('../routes/agents', () => 'agents-route');
		jest.doMock('../routes/tests', () => 'tests-route');
		jest.doMock('../routes/results', () => 'results-route');
		jest.doMock('../routes/execute', () => 'execute-route');
		jest.doMock('../routes/jobs', () => 'jobs-route');
		jest.doMock('../routes/test-suites', () => 'test-suites-route');
		jest.doMock('../routes/execute-suite', () => 'execute-suite-route');
		jest.doMock('../routes/suite-runs', () => 'suite-runs-route');
		jest.doMock('../routes/llm-configs', () => 'llm-configs-route');
		jest.doMock('../routes/conversations', () => 'conversations-route');
		jest.doMock('../routes/sessions', () => 'sessions-route');
		jest.doMock('../routes/stats', () => 'stats-route');
		jest.doMock('../routes/session-messages', () => 'session-messages-route');
		jest.doMock('../routes/conversation-turn-targets', () => 'conversation-turn-targets-route');
		jest.doMock('../routes/templates', () => 'templates-route');
		jest.doMock('../routes/response-maps', () => 'response-maps-route');
		jest.doMock('../routes/data-transfer', () => 'data-transfer-route');
		jest.doMock('../config', () => ({ serverConfig: { port: 4321 } }));

		const logSpy = jest.spyOn(console, 'log').mockImplementation(() => undefined);
		const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);

		jest.isolateModules(() => {
			require('../index');
		});

		expect(cors).toHaveBeenCalled();
		expect(json).toHaveBeenCalledWith({ limit: '150mb' });
		expect(json).toHaveBeenCalledWith();
		expect(use).toHaveBeenCalledWith('/api/agents', 'agents-route');
		expect(use).toHaveBeenCalledWith('/api/tests', 'tests-route');
		expect(use).toHaveBeenCalledWith('/api/results', 'results-route');
		expect(use).toHaveBeenCalledWith('/api/execute', 'execute-route');
		expect(use).toHaveBeenCalledWith('/api/jobs', 'jobs-route');
		expect(use).toHaveBeenCalledWith('/api/test-suites', 'test-suites-route');
		expect(use).toHaveBeenCalledWith('/api/execute-suite', 'execute-suite-route');
		expect(use).toHaveBeenCalledWith('/api/suite-runs', 'suite-runs-route');
		expect(use).toHaveBeenCalledWith('/api/llm-configs', 'llm-configs-route');
		expect(use).toHaveBeenCalledWith('/api/conversations', 'conversations-route');
		expect(use).toHaveBeenCalledWith('/api/sessions', 'sessions-route');
		expect(use).toHaveBeenCalledWith('/api/stats', 'stats-route');
		expect(use).toHaveBeenCalledWith('/api/session-messages', 'session-messages-route');
		expect(use).toHaveBeenCalledWith('/api/conversation-turn-targets', 'conversation-turn-targets-route');
		expect(use).toHaveBeenCalledWith('/api/templates', 'templates-route');
		expect(use).toHaveBeenCalledWith('/api/response-maps', 'response-maps-route');
		expect(use).toHaveBeenCalledWith('/api/data-transfer', 'json-mw', 'data-transfer-route');

		const healthHandler = get.mock.calls.find((call) => call[0] === '/api/health')?.[1] as Function;
		const res = { json: jest.fn() };
		healthHandler({} as any, res as any);
		expect(res.json).toHaveBeenCalledWith({ status: 'ok' });

		const errorHandler = use.mock.calls.find(
			(call) => typeof call[0] === 'function' && call[0].length === 4
		)?.[0] as Function;
		const errorRes = { status: jest.fn().mockReturnThis(), json: jest.fn() };
		errorHandler(new Error('boom'), {} as any, errorRes as any, jest.fn());
		expect(errorRes.status).toHaveBeenCalledWith(500);
		expect(errorRes.json).toHaveBeenCalledWith({ error: 'Something went wrong!' });

		expect(listen).toHaveBeenCalledWith(4321, expect.any(Function));

		logSpy.mockRestore();
		errorSpy.mockRestore();
	});
});
