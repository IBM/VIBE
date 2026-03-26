import dataTransferRoutes from '../data-transfer';
import { ExportableDataType } from '@ibm-vibe/types';
import * as exportService from '../../services/data-transfer/export';
import * as analyzeService from '../../services/data-transfer/analyze';
import * as executeService from '../../services/data-transfer/execute';
const { ImportValidationError } = jest.requireActual('../../services/data-transfer/execute');

jest.mock('../../services/data-transfer/export');
jest.mock('../../services/data-transfer/analyze');
jest.mock('../../services/data-transfer/execute');

const mockedExportService = exportService as jest.Mocked<typeof exportService>;
const mockedAnalyzeService = analyzeService as jest.Mocked<typeof analyzeService>;
const mockedExecuteService = executeService as jest.Mocked<typeof executeService>;

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

describe('data transfer routes', () => {
	beforeEach(() => {
		jest.clearAllMocks();
	});

	describe('GET /api/data-transfer/export', () => {
		it('calls export service with parsed types', async () => {
			const expectedBundle = {
				version: 1,
				exported_at: '2026-03-03T12:00:00.000Z',
				instance_name: 'test',
				data: {}
			} as any;
			mockedExportService.buildExportBundle.mockReturnValue(expectedBundle);

			const response = await callRoute(dataTransferRoutes, 'get', '/export', {
				query: {
					types: `${ExportableDataType.AGENTS},${ExportableDataType.CONVERSATIONS}`
				}
			});

			expect(response.statusCode).toBe(200);
			expect(response.body).toEqual(expectedBundle);
			expect(mockedExportService.buildExportBundle).toHaveBeenCalledWith(
				[ExportableDataType.AGENTS, ExportableDataType.CONVERSATIONS],
				expect.any(String)
			);
		});

		it('returns 400 when types are not provided', async () => {
			const response = await callRoute(dataTransferRoutes, 'get', '/export');

			expect(response.statusCode).toBe(400);
			expect(response.body).toEqual({ error: 'At least one export type must be provided' });
		});

		it('returns 400 when a type is invalid', async () => {
			const response = await callRoute(dataTransferRoutes, 'get', '/export', {
				query: { types: 'agents,bad-type' }
			});

			expect(response.statusCode).toBe(400);
			expect(response.body).toEqual({ error: 'Invalid export types: bad-type' });
		});
	});

	describe('POST /api/data-transfer/analyze', () => {
		it('calls analyze service and returns report', async () => {
			const report = {
				items: [],
				totals: { new: 0, conflict: 0, dependency_missing: 0 },
				has_issues: false
			} as any;
			mockedAnalyzeService.analyzeImportBundle.mockReturnValue(report);

			const payload = {
				bundle: {
					version: 1,
					exported_at: '2026-03-03T12:00:00.000Z',
					data: {}
				}
			};

			const response = await callRoute(dataTransferRoutes, 'post', '/analyze', { body: payload });

			expect(response.statusCode).toBe(200);
			expect(response.body).toEqual(report);
			expect(mockedAnalyzeService.analyzeImportBundle).toHaveBeenCalledWith(payload.bundle, undefined);
		});

		it('passes optional resolutions through to the analyze service', async () => {
			const report = {
				items: [],
				totals: { new: 0, conflict: 0, dependency_missing: 0 },
				has_issues: false
			} as any;
			mockedAnalyzeService.analyzeImportBundle.mockReturnValue(report);

			const payload = {
				bundle: {
					version: 1,
					exported_at: '2026-03-03T12:00:00.000Z',
					data: {}
				},
				resolutions: {
					'agents:Bot@1.0.0': {
						item_key: 'agents:Bot@1.0.0',
						decision: 'skip'
					}
				}
			};

			const response = await callRoute(dataTransferRoutes, 'post', '/analyze', { body: payload });

			expect(response.statusCode).toBe(200);
			expect(response.body).toEqual(report);
			expect(mockedAnalyzeService.analyzeImportBundle).toHaveBeenCalledWith(payload.bundle, payload.resolutions);
		});

		it('returns 400 when bundle is missing required version', async () => {
			const response = await callRoute(dataTransferRoutes, 'post', '/analyze', {
				body: {
					bundle: {
						exported_at: '2026-03-03T12:00:00.000Z',
						data: {}
					}
				}
			});

			expect(response.statusCode).toBe(400);
			expect(response.body).toEqual({ error: 'Invalid bundle payload' });
		});

		it('returns 400 when bundle collections are malformed', async () => {
			const response = await callRoute(dataTransferRoutes, 'post', '/analyze', {
				body: {
					bundle: {
						version: 1,
						exported_at: '2026-03-03T12:00:00.000Z',
						data: {
							agents: 'not-an-array'
						}
					}
				}
			});

			expect(response.statusCode).toBe(400);
			expect(response.body).toEqual({ error: 'Invalid bundle payload' });
			expect(mockedAnalyzeService.analyzeImportBundle).not.toHaveBeenCalled();
		});

		it('returns 400 when bundle version is unsupported', async () => {
			const response = await callRoute(dataTransferRoutes, 'post', '/analyze', {
				body: {
					bundle: {
						version: 2,
						exported_at: '2026-03-03T12:00:00.000Z',
						data: {}
					}
				}
			});

			expect(response.statusCode).toBe(400);
			expect(response.body).toEqual({ error: 'Unsupported bundle version: 2' });
			expect(mockedAnalyzeService.analyzeImportBundle).not.toHaveBeenCalled();
		});

		it('returns 400 when resolutions payload is invalid', async () => {
			const response = await callRoute(dataTransferRoutes, 'post', '/analyze', {
				body: {
					bundle: {
						version: 1,
						exported_at: '2026-03-03T12:00:00.000Z',
						data: {}
					},
					resolutions: []
				}
			});

			expect(response.statusCode).toBe(400);
			expect(response.body).toEqual({ error: 'Invalid resolutions payload' });
		});

		it('returns 400 when a resolution record key does not match item_key', async () => {
			const response = await callRoute(dataTransferRoutes, 'post', '/analyze', {
				body: {
					bundle: {
						version: 1,
						exported_at: '2026-03-03T12:00:00.000Z',
						data: {}
					},
					resolutions: {
						'agents:Bot@1.0.0': {
							item_key: 'agents:Other@1.0.0',
							decision: 'skip'
						}
					}
				}
			});

			expect(response.statusCode).toBe(400);
			expect(response.body).toEqual({ error: 'Invalid resolutions payload' });
		});

		it('returns 400 when bundle semantics are invalid', async () => {
			const response = await callRoute(dataTransferRoutes, 'post', '/analyze', {
				body: {
					bundle: {
						version: 1,
						exported_at: '2026-03-03T12:00:00.000Z',
						data: {
							conversations: [{
								name: 'Greeting flow',
								reference_key: 'conversation:forged',
								messages: [{ sequence: 1, role: 'user', content: 'hello' }]
							}]
						}
					}
				}
			});

			expect(response.statusCode).toBe(400);
			expect(response.body).toEqual({ error: 'Conversation "Greeting flow" has an invalid reference key' });
			expect(mockedAnalyzeService.analyzeImportBundle).not.toHaveBeenCalled();
		});
	});

	describe('POST /api/data-transfer/import', () => {
		it('calls execute service and returns summary', async () => {
			const summary = {
				created: 1,
				updated: 0,
				skipped: 0,
				items: []
			} as any;
			mockedExecuteService.executeImportBundle.mockReturnValue(summary);

			const payload = {
				bundle: {
					version: 1,
					exported_at: '2026-03-03T12:00:00.000Z',
					data: {}
				},
				resolutions: {}
			};
			const response = await callRoute(dataTransferRoutes, 'post', '/import', { body: payload });

			expect(response.statusCode).toBe(200);
			expect(response.body).toEqual(summary);
			expect(mockedExecuteService.executeImportBundle).toHaveBeenCalledWith(payload);
		});

		it('returns 400 when nested import bundle data is malformed', async () => {
			const response = await callRoute(dataTransferRoutes, 'post', '/import', {
				body: {
					bundle: {
						version: 1,
						exported_at: '2026-03-03T12:00:00.000Z',
						data: {
							conversations: [
								{
									name: 'Broken conversation',
									messages: 'not-an-array'
								}
							]
						}
					},
					resolutions: {}
				}
			});

			expect(response.statusCode).toBe(400);
			expect(response.body).toEqual({ error: 'Invalid import payload' });
			expect(mockedExecuteService.executeImportBundle).not.toHaveBeenCalled();
		});

		it('returns 400 when resolutions are missing', async () => {
			const response = await callRoute(dataTransferRoutes, 'post', '/import', {
				body: {
					bundle: {
						version: 1,
						exported_at: '2026-03-03T12:00:00.000Z',
						data: {}
					}
				}
			});

			expect(response.statusCode).toBe(400);
			expect(response.body).toEqual({ error: 'Invalid import payload' });
		});

		it('returns 400 when import bundle version is unsupported', async () => {
			const response = await callRoute(dataTransferRoutes, 'post', '/import', {
				body: {
					bundle: {
						version: 2,
						exported_at: '2026-03-03T12:00:00.000Z',
						data: {}
					},
					resolutions: {}
				}
			});

			expect(response.statusCode).toBe(400);
			expect(response.body).toEqual({ error: 'Unsupported bundle version: 2' });
			expect(mockedExecuteService.executeImportBundle).not.toHaveBeenCalled();
		});
	});

	describe('error handling', () => {
		it('returns 500 when export service throws', async () => {
			mockedExportService.buildExportBundle.mockImplementation(() => {
				throw new Error('boom');
			});

			const response = await callRoute(dataTransferRoutes, 'get', '/export', {
				query: { types: `${ExportableDataType.AGENTS}` }
			});

			expect(response.statusCode).toBe(500);
			expect(response.body).toEqual({ error: 'Failed to export data' });
		});

		it('returns 400 when import execution rejects invalid decisions', async () => {
			mockedExecuteService.executeImportBundle.mockImplementation(() => {
				throw new ImportValidationError('Invalid decision "create_new" for conversations "Broken" with status dependency_missing');
			});

			const response = await callRoute(dataTransferRoutes, 'post', '/import', {
				body: {
					bundle: {
						version: 1,
						exported_at: '2026-03-03T12:00:00.000Z',
						data: {}
					},
					resolutions: {}
				}
			});

			expect(response.statusCode).toBe(400);
			expect(response.body).toEqual({
				error: 'Invalid decision "create_new" for conversations "Broken" with status dependency_missing'
			});
		});
	});
});
