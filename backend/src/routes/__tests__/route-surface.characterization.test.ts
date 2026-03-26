import agentsRouter from '../agents';
import testSuitesRouter from '../test-suites';
import resultsRouter from '../results';
import sessionsRouter from '../sessions';
import dataTransferRouter from '../data-transfer';

type SupportedMethod = 'get' | 'post' | 'put' | 'patch' | 'delete';

const listRouteSignatures = (router: any): string[] => (
	(router.stack || [])
		.filter((layer: any) => layer.route)
		.flatMap((layer: any) => {
			const methods = Object.keys(layer.route.methods || {}) as SupportedMethod[];
			return methods.map((method) => `${method.toUpperCase()} ${layer.route.path}`);
		})
);

describe('Route surface characterization for hotspot routers', () => {
	it('keeps the critical agents route surface intact', () => {
		const signatures = listRouteSignatures(agentsRouter);

		expect(signatures).toEqual(expect.arrayContaining([
			'GET /',
			'GET /:id',
			'POST /',
			'PUT /:id',
			'DELETE /:id',
			'GET /capability-names/request-templates',
			'GET /capability-names/response-maps',
			'GET /:id/request-templates',
			'POST /:id/request-templates',
			'PATCH /:id/request-templates/:templateId',
			'DELETE /:id/request-templates/:templateId',
			'POST /:id/request-templates/:templateId/default',
			'GET /:id/response-maps',
			'POST /:id/response-maps',
			'PATCH /:id/response-maps/:mapId',
			'DELETE /:id/response-maps/:mapId',
			'POST /:id/response-maps/:mapId/default'
		]));
	});

	it('keeps the critical test-suite route surface intact', () => {
		const signatures = listRouteSignatures(testSuitesRouter);

		expect(signatures).toEqual(expect.arrayContaining([
			'GET /',
			'GET /:id',
			'POST /',
			'PUT /:id',
			'DELETE /:id',
			'GET /:id/tests',
			'POST /:id/tests',
			'DELETE /:id/tests/:testId',
			'PUT /:id/tests/reorder',
			'GET /:id/entries',
			'POST /:id/entries',
			'PUT /:id/entries/:entryId',
			'DELETE /:id/entries/:entryId',
			'PUT /:id/entries/reorder'
		]));
	});

	it('keeps the critical results route surface intact', () => {
		const signatures = listRouteSignatures(resultsRouter);

		expect(signatures).toEqual(expect.arrayContaining([
			'GET /',
			'GET /:id',
			'POST /',
			'POST /:id/score'
		]));
	});

	it('keeps the critical sessions route surface intact', () => {
		const signatures = listRouteSignatures(sessionsRouter);

		expect(signatures).toEqual(expect.arrayContaining([
			'GET /',
			'GET /:id',
			'GET /:id/messages',
			'GET /:id/transcript',
			'PUT /:id',
			'POST /',
			'DELETE /:id'
		]));
	});

	it('keeps the critical data-transfer route surface intact', () => {
		const signatures = listRouteSignatures(dataTransferRouter);

		expect(signatures).toEqual(expect.arrayContaining([
			'GET /export',
			'POST /analyze',
			'POST /import'
		]));
	});
});
