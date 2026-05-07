describe('agent-service-api bootstrap', () => {
	beforeEach(() => {
		jest.resetModules();
		jest.clearAllMocks();
	});

	it('wires middleware and starts server', () => {
		const use = jest.fn();
		const listen = jest.fn((_port: number, cb?: () => void) => {
			if (cb) cb();
			return {};
		});
		const json = jest.fn(() => 'json-mw');
		const urlencoded = jest.fn(() => 'url-mw');

		jest.doMock('express', () => {
			const express = () => ({ use, listen });
			(express as any).json = json;
			(express as any).urlencoded = urlencoded;
			return express;
		});

		const cors = jest.fn(() => 'cors-mw');
		jest.doMock('cors', () => cors);

		const routes = jest.fn();
		jest.doMock('../routes', () => routes);

		const startPolling = jest.fn();
		const stopPolling = jest.fn();
		jest.doMock('../services/job-poller', () => ({
			jobPoller: { startPolling, stopPolling }
		}));

		jest.doMock('../config', () => ({ SERVER_CONFIG: { port: 1234, host: 'localhost' } }));

		const onSpy = jest.spyOn(process, 'on').mockImplementation(() => process);
		const exitSpy = jest.spyOn(process, 'exit').mockImplementation(() => undefined as never);

		jest.isolateModules(() => {
			require('../index');
		});

		expect(listen).toHaveBeenCalledWith(1234, expect.any(Function));
		expect(startPolling).toHaveBeenCalled();

		const getHandler = (index: number) => {
			const call = use.mock.calls[index];
			return (typeof call[0] === 'function' ? call[0] : call[1]) as Function;
		};
		const req = { method: 'GET', url: '/test' };
		const res = {
			status: jest.fn().mockReturnThis(),
			json: jest.fn().mockReturnThis()
		};
		const next = jest.fn();

		// Logging middleware
		getHandler(3)(req, res, next);
		// Default 404 handler
		getHandler(5)(req, res);
		// Error handler
		getHandler(6)(new Error('boom'), req, res, next);
		getHandler(6)({} as any, req, res, next);

		const sigtermHandler = onSpy.mock.calls.find((call) => call[0] === 'SIGTERM')?.[1] as (() => void) | undefined;
		sigtermHandler?.();
		const sigintHandler = onSpy.mock.calls.find((call) => call[0] === 'SIGINT')?.[1] as (() => void) | undefined;
		sigintHandler?.();

		expect(stopPolling).toHaveBeenCalledTimes(2);

		onSpy.mockRestore();
		exitSpy.mockRestore();
	});

	it('loads types entrypoint', () => {
		jest.isolateModules(() => {
			require('../types');
		});
	});
});
