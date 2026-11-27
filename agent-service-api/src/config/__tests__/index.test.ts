describe('agent-service-api config', () => {
	it('exports config from loadAgentServiceApiConfig', () => {
		jest.resetModules();
		jest.doMock('@ibm-vibe/config', () => ({
			loadAgentServiceApiConfig: jest.fn().mockReturnValue({
				server: { port: 1234 },
				backend: { url: 'http://backend.test' },
				defaults: { requestTimeout: 1111, healthCheckInterval: 2222 },
				outbound: { allowLoopback: true, allowPrivateNetworks: false }
			})
		}));

		const config = require('../index');

		expect(config.SERVER_CONFIG).toEqual({ port: 1234 });
		expect(config.BACKEND_CONFIG).toEqual({ url: 'http://backend.test' });
		expect(config.DEFAULT_TIMEOUT).toBe(1111);
		expect(config.HEALTH_CHECK_INTERVAL).toBe(2222);
	});

	it('denies this service port and the backend port for outbound requests', () => {
		jest.resetModules();
		jest.doMock('@ibm-vibe/config', () => ({
			loadAgentServiceApiConfig: jest.fn().mockReturnValue({
				server: { port: 5003 },
				backend: { url: 'http://localhost:5100' },
				defaults: { requestTimeout: 1111, healthCheckInterval: 2222 },
				outbound: { allowLoopback: true, allowPrivateNetworks: false }
			})
		}));

		const config = require('../index');

		expect(config.OUTBOUND_CONFIG).toEqual({
			allowLoopback: true,
			allowPrivateNetworks: false,
			denyPorts: [5003, 5100]
		});
	});

	it('uses the scheme default port when the backend URL has none', () => {
		jest.resetModules();
		jest.doMock('@ibm-vibe/config', () => ({
			loadAgentServiceApiConfig: jest.fn().mockReturnValue({
				server: { port: 5003 },
				backend: { url: 'https://backend.test' },
				defaults: { requestTimeout: 1111, healthCheckInterval: 2222 },
				outbound: { allowLoopback: false, allowPrivateNetworks: true }
			})
		}));

		const config = require('../index');

		expect(config.OUTBOUND_CONFIG.denyPorts).toEqual([5003, 443]);
		expect(config.OUTBOUND_CONFIG.allowPrivateNetworks).toBe(true);
	});
});
