import type { Request, Response } from 'express';

// Mock all dependencies before imports
jest.mock('../../db/queries');
jest.mock('../../lib/sessionMetadata');

import {
	getSuiteRunById,
	getJobsBySuiteRunId,
	deleteSuiteRun,
	listSuiteRunsWithCount,
	getExecutionSessionsByIds,
	getSessionMessages
} from '../../db/queries';
import { computeSessionDurationMs } from '../../lib/sessionMetadata';

const mockGetSuiteRunById = getSuiteRunById as jest.MockedFunction<typeof getSuiteRunById>;
const mockGetJobsBySuiteRunId = getJobsBySuiteRunId as jest.MockedFunction<typeof getJobsBySuiteRunId>;
const mockDeleteSuiteRun = deleteSuiteRun as jest.MockedFunction<typeof deleteSuiteRun>;
const mockListSuiteRunsWithCount = listSuiteRunsWithCount as jest.MockedFunction<typeof listSuiteRunsWithCount>;
const mockGetExecutionSessionsByIds = getExecutionSessionsByIds as jest.MockedFunction<
	typeof getExecutionSessionsByIds
>;
const mockGetSessionMessages = getSessionMessages as jest.MockedFunction<typeof getSessionMessages>;
const mockComputeSessionDurationMs = computeSessionDurationMs as jest.MockedFunction<typeof computeSessionDurationMs>;

describe('Suite Runs Routes', () => {
	let suiteRunsRouter: any;
	let mockReq: Partial<Request>;
	let mockRes: Partial<Response>;
	let jsonMock: jest.Mock;
	let statusMock: jest.Mock;
	let sendMock: jest.Mock;

	beforeEach(async () => {
		jest.clearAllMocks();

		// Reset modules to get fresh router
		jest.isolateModules(() => {
			suiteRunsRouter = require('../suite-runs').default;
		});

		jsonMock = jest.fn();
		sendMock = jest.fn();
		statusMock = jest.fn().mockReturnValue({ json: jsonMock, send: sendMock });

		mockReq = {
			query: {},
			params: {}
		};

		mockRes = {
			json: jsonMock,
			status: statusMock,
			send: sendMock
		};
	});

	const getRouteHandler = (method: string, path: string) => {
		const routes = suiteRunsRouter.stack || [];
		for (const layer of routes) {
			if (layer.route && layer.route.path === path) {
				const methodHandler = layer.route.stack.find((s: any) => s.method === method);
				if (methodHandler) {
					return methodHandler.handle;
				}
			}
		}
		throw new Error(`Route ${method.toUpperCase()} ${path} not found`);
	};

	const callRoute = async (handler: any, req: Partial<Request>, res: Partial<Response>) => {
		await handler(req, res);
	};

	describe('GET /', () => {
		it('should return suite runs with default pagination', async () => {
			const mockSuiteRuns = [
				{
					id: 1,
					suite_id: 1,
					agent_id: 1,
					status: 'completed',
					completed_tests: 5,
					successful_tests: 4,
					failed_tests: 1,
					progress: 100,
					created_at: '2024-01-01'
				}
			];
			const mockJobs = [
				{ id: 1, suite_run_id: 1, status: 'completed', session_id: 1 },
				{ id: 2, suite_run_id: 1, status: 'completed', session_id: 2 },
				{ id: 3, suite_run_id: 1, status: 'completed', session_id: 3 },
				{ id: 4, suite_run_id: 1, status: 'completed', session_id: 4 },
				{ id: 5, suite_run_id: 1, status: 'failed', session_id: 5 }
			];
			const mockSessions = [
				{ id: 1, started_at: '2024-01-01T10:00:00Z', completed_at: '2024-01-01T10:01:00Z' },
				{ id: 2, started_at: '2024-01-01T10:02:00Z', completed_at: '2024-01-01T10:03:00Z' },
				{ id: 3, started_at: '2024-01-01T10:04:00Z', completed_at: '2024-01-01T10:05:00Z' },
				{ id: 4, started_at: '2024-01-01T10:06:00Z', completed_at: '2024-01-01T10:07:00Z' },
				{ id: 5, started_at: '2024-01-01T10:08:00Z', completed_at: '2024-01-01T10:09:00Z' }
			];

			(mockListSuiteRunsWithCount as any).mockReturnValue({
				data: mockSuiteRuns,
				total: 1
			});
			(mockGetJobsBySuiteRunId as any).mockResolvedValue(mockJobs);
			(mockGetExecutionSessionsByIds as any).mockReturnValue(mockSessions);
			(mockComputeSessionDurationMs as any).mockReturnValue(60000);
			(mockGetSessionMessages as any).mockResolvedValue([]);

			const handler = getRouteHandler('get', '/');
			await callRoute(handler, mockReq, mockRes);

			expect(mockListSuiteRunsWithCount).toHaveBeenCalledWith({
				limit: 50,
				offset: 0
			});
			expect(jsonMock).toHaveBeenCalledWith({
				data: expect.arrayContaining([
					expect.objectContaining({
						id: 1,
						completed_tests: 5,
						successful_tests: 4
					})
				]),
				total: 1,
				limit: 50,
				offset: 0
			});
		});

		it('should return suite runs with custom pagination', async () => {
			mockReq.query = { limit: '10', offset: '5' };

			const mockSuiteRuns = [
				{
					id: 1,
					suite_id: 1,
					agent_id: 1,
					status: 'completed',
					completed_tests: 2,
					successful_tests: 2,
					failed_tests: 0,
					progress: 100,
					created_at: '2024-01-01'
				}
			];
			const mockJobs = [
				{ id: 1, suite_run_id: 1, status: 'completed', session_id: 1 },
				{ id: 2, suite_run_id: 1, status: 'completed', session_id: 2 }
			];

			(mockListSuiteRunsWithCount as any).mockReturnValue({
				data: mockSuiteRuns,
				total: 100
			});
			(mockGetJobsBySuiteRunId as any).mockResolvedValue(mockJobs);
			(mockGetExecutionSessionsByIds as any).mockReturnValue([]);
			(mockGetSessionMessages as any).mockResolvedValue([]);

			const handler = getRouteHandler('get', '/');
			await callRoute(handler, mockReq, mockRes);

			expect(mockListSuiteRunsWithCount).toHaveBeenCalledWith({
				limit: 10,
				offset: 5
			});
			expect(jsonMock).toHaveBeenCalledWith({
				data: expect.any(Array),
				total: 100,
				limit: 10,
				offset: 5
			});
		});

		it('should filter by status', async () => {
			mockReq.query = { status: 'running' };

			(mockListSuiteRunsWithCount as any).mockReturnValue({
				data: [],
				total: 0
			});

			const handler = getRouteHandler('get', '/');
			await callRoute(handler, mockReq, mockRes);

			expect(mockListSuiteRunsWithCount).toHaveBeenCalledWith({
				status: 'running',
				limit: 50,
				offset: 0
			});
		});

		it('should filter by suite_id', async () => {
			mockReq.query = { suite_id: '5' };

			(mockListSuiteRunsWithCount as any).mockReturnValue({
				data: [],
				total: 0
			});

			const handler = getRouteHandler('get', '/');
			await callRoute(handler, mockReq, mockRes);

			expect(mockListSuiteRunsWithCount).toHaveBeenCalledWith({
				suite_id: 5,
				limit: 50,
				offset: 0
			});
		});

		it('should filter by agent_id', async () => {
			mockReq.query = { agent_id: '3' };

			(mockListSuiteRunsWithCount as any).mockReturnValue({
				data: [],
				total: 0
			});

			const handler = getRouteHandler('get', '/');
			await callRoute(handler, mockReq, mockRes);

			expect(mockListSuiteRunsWithCount).toHaveBeenCalledWith({
				agent_id: 3,
				limit: 50,
				offset: 0
			});
		});

		it('should filter by before date', async () => {
			mockReq.query = { before: '2024-01-01T00:00:00Z' };

			(mockListSuiteRunsWithCount as any).mockReturnValue({
				data: [],
				total: 0
			});

			const handler = getRouteHandler('get', '/');
			await callRoute(handler, mockReq, mockRes);

			expect(mockListSuiteRunsWithCount).toHaveBeenCalledWith(
				expect.objectContaining({
					before: expect.any(Date),
					limit: 50,
					offset: 0
				})
			);
		});

		it('should filter by after date', async () => {
			mockReq.query = { after: '2024-01-01T00:00:00Z' };

			(mockListSuiteRunsWithCount as any).mockReturnValue({
				data: [],
				total: 0
			});

			const handler = getRouteHandler('get', '/');
			await callRoute(handler, mockReq, mockRes);

			expect(mockListSuiteRunsWithCount).toHaveBeenCalledWith(
				expect.objectContaining({
					after: expect.any(Date),
					limit: 50,
					offset: 0
				})
			);
		});

		it('recalculates status to completed when all jobs finished', async () => {
			const mockSuiteRuns = [
				{
					id: 10,
					suite_id: 1,
					agent_id: 1,
					status: 'running',
					completed_tests: 0,
					successful_tests: 0,
					failed_tests: 0,
					progress: 0,
					created_at: '2024-01-01'
				}
			];
			const mockJobs = [
				{ id: 1, suite_run_id: 10, status: 'completed', session_id: 1 },
				{ id: 2, suite_run_id: 10, status: 'completed', session_id: 2 }
			];

			(mockListSuiteRunsWithCount as any).mockReturnValue({
				data: mockSuiteRuns,
				total: 1
			});
			(mockGetJobsBySuiteRunId as any).mockResolvedValue(mockJobs);
			(mockGetExecutionSessionsByIds as any).mockReturnValue([]);
			(mockGetSessionMessages as any).mockResolvedValue([]);

			const handler = getRouteHandler('get', '/');
			await callRoute(handler, mockReq, mockRes);

			expect(jsonMock).toHaveBeenCalledWith({
				data: expect.arrayContaining([
					expect.objectContaining({
						id: 10,
						status: 'completed',
						progress: 100,
						completed_tests: 2,
						successful_tests: 2
					})
				]),
				total: 1,
				limit: 50,
				offset: 0
			});
		});

		it('sets status running, total time 0, and logs similarity errors', async () => {
			const mockSuiteRuns = [
				{
					id: 11,
					suite_id: 2,
					agent_id: 1,
					status: 'pending',
					completed_tests: 1,
					successful_tests: 1,
					failed_tests: 0,
					progress: 0,
					created_at: '2024-01-01'
				}
			];
			const mockJobs = [
				{ id: 1, suite_run_id: 11, status: 'running', session_id: 10 },
				{ id: 2, suite_run_id: 11, status: 'pending', session_id: 11 }
			];

			(mockListSuiteRunsWithCount as any).mockReturnValue({
				data: mockSuiteRuns,
				total: 1
			});
			(mockGetJobsBySuiteRunId as any).mockResolvedValue(mockJobs);
			(mockGetExecutionSessionsByIds as any).mockReturnValue([]);
			(mockGetSessionMessages as any).mockRejectedValue(new Error('messages failed'));

			const handler = getRouteHandler('get', '/');
			await callRoute(handler, mockReq, mockRes);

			expect(jsonMock).toHaveBeenCalledWith({
				data: expect.arrayContaining([
					expect.objectContaining({
						id: 11,
						status: 'running',
						total_execution_time: 0,
						completed_tests: 0,
						successful_tests: 0,
						failed_tests: 0
					})
				]),
				total: 1,
				limit: 50,
				offset: 0
			});
		});

		it('should recalculate progress when database values are incorrect', async () => {
			const mockSuiteRuns = [
				{
					id: 1,
					suite_id: 1,
					agent_id: 1,
					status: 'running',
					completed_tests: 0, // Incorrect
					successful_tests: 0, // Incorrect
					failed_tests: 0,
					progress: 0,
					created_at: '2024-01-01'
				}
			];
			const mockJobs = [
				{ id: 1, suite_run_id: 1, status: 'completed', session_id: 1 },
				{ id: 2, suite_run_id: 1, status: 'failed', session_id: 2 },
				{ id: 3, suite_run_id: 1, status: 'pending', session_id: null }
			];

			(mockListSuiteRunsWithCount as any).mockReturnValue({
				data: mockSuiteRuns,
				total: 1
			});
			(mockGetJobsBySuiteRunId as any).mockResolvedValue(mockJobs);
			(mockGetExecutionSessionsByIds as any).mockReturnValue([]);
			(mockGetSessionMessages as any).mockResolvedValue([]);

			const handler = getRouteHandler('get', '/');
			await callRoute(handler, mockReq, mockRes);

			expect(jsonMock).toHaveBeenCalledWith({
				data: expect.arrayContaining([
					expect.objectContaining({
						id: 1,
						completed_tests: 2, // Recalculated
						successful_tests: 1, // Recalculated
						failed_tests: 1, // Recalculated
						progress: 66 // Recalculated (2/3 * 100)
					})
				]),
				total: 1,
				limit: 50,
				offset: 0
			});
		});

		it('should calculate average similarity score from session messages', async () => {
			const mockSuiteRuns = [
				{
					id: 1,
					suite_id: 1,
					agent_id: 1,
					status: 'completed',
					completed_tests: 2,
					successful_tests: 2,
					failed_tests: 0,
					progress: 100,
					created_at: '2024-01-01'
				}
			];
			const mockJobs = [
				{ id: 1, suite_run_id: 1, status: 'completed', session_id: 1 },
				{ id: 2, suite_run_id: 1, status: 'completed', session_id: 2 }
			];
			const mockMessages1 = [
				{
					id: 1,
					role: 'assistant',
					similarity_scoring_status: 'completed',
					similarity_score: 80
				}
			];
			const mockMessages2 = [
				{
					id: 2,
					role: 'assistant',
					similarity_scoring_status: 'completed',
					similarity_score: 90
				}
			];

			(mockListSuiteRunsWithCount as any).mockReturnValue({
				data: mockSuiteRuns,
				total: 1
			});
			(mockGetJobsBySuiteRunId as any).mockResolvedValue(mockJobs);
			(mockGetExecutionSessionsByIds as any).mockReturnValue([]);
			(mockGetSessionMessages as any).mockResolvedValueOnce(mockMessages1).mockResolvedValueOnce(mockMessages2);

			const handler = getRouteHandler('get', '/');
			await callRoute(handler, mockReq, mockRes);

			expect(jsonMock).toHaveBeenCalledWith({
				data: expect.arrayContaining([
					expect.objectContaining({
						id: 1,
						avg_similarity_score: 85 // (80 + 90) / 2
					})
				]),
				total: 1,
				limit: 50,
				offset: 0
			});
		});

		it('should handle invalid pagination params', async () => {
			mockReq.query = { limit: 'invalid' };

			const handler = getRouteHandler('get', '/');
			await callRoute(handler, mockReq, mockRes);

			expect(statusMock).toHaveBeenCalledWith(400);
		});

		it('should handle errors gracefully', async () => {
			(mockListSuiteRunsWithCount as any).mockImplementation(() => {
				throw new Error('Database error');
			});

			const handler = getRouteHandler('get', '/');
			await callRoute(handler, mockReq, mockRes);

			expect(statusMock).toHaveBeenCalledWith(500);
			expect(jsonMock).toHaveBeenCalledWith({ error: 'Failed to fetch suite runs' });
		});
	});

	describe('GET /:id', () => {
		it('should return suite run by id with enrichment', async () => {
			mockReq.params = { id: '1' };

			const mockSuiteRun = {
				id: 1,
				suite_id: 1,
				agent_id: 1,
				status: 'completed',
				completed_tests: 2,
				successful_tests: 2,
				failed_tests: 0,
				progress: 100,
				created_at: '2024-01-01'
			};
			const mockJobs = [
				{ id: 1, suite_run_id: 1, status: 'completed', session_id: 1 },
				{ id: 2, suite_run_id: 1, status: 'completed', session_id: 2 }
			];

			(mockGetSuiteRunById as any).mockResolvedValue(mockSuiteRun);
			(mockGetJobsBySuiteRunId as any).mockResolvedValue(mockJobs);
			(mockGetExecutionSessionsByIds as any).mockReturnValue([]);
			(mockGetSessionMessages as any).mockResolvedValue([]);

			const handler = getRouteHandler('get', '/:id');
			await callRoute(handler, mockReq, mockRes);

			expect(mockGetSuiteRunById).toHaveBeenCalledWith(1);
			expect(jsonMock).toHaveBeenCalledWith(
				expect.objectContaining({
					id: 1,
					completed_tests: 2,
					successful_tests: 2
				})
			);
		});

		it('recalculates status to completed when all jobs finish', async () => {
			mockReq.params = { id: '1' };

			(mockGetSuiteRunById as any).mockResolvedValue({
				id: 1,
				status: 'running',
				completed_tests: 0,
				successful_tests: 0,
				failed_tests: 0,
				progress: 0
			});
			(mockGetJobsBySuiteRunId as any).mockResolvedValue([
				{ id: 1, suite_run_id: 1, status: 'completed', session_id: 1 },
				{ id: 2, suite_run_id: 1, status: 'completed', session_id: 2 }
			]);
			(mockGetExecutionSessionsByIds as any).mockReturnValue([]);
			(mockGetSessionMessages as any).mockResolvedValue([]);

			const handler = getRouteHandler('get', '/:id');
			await callRoute(handler, mockReq, mockRes);

			expect(jsonMock).toHaveBeenCalledWith(expect.objectContaining({ status: 'completed', progress: 100 }));
		});

		it('recalculates status to running when jobs are in progress', async () => {
			mockReq.params = { id: '2' };

			(mockGetSuiteRunById as any).mockResolvedValue({
				id: 2,
				status: 'pending',
				completed_tests: 1,
				successful_tests: 0,
				failed_tests: 0,
				progress: 0
			});
			(mockGetJobsBySuiteRunId as any).mockResolvedValue([
				{ id: 1, suite_run_id: 2, status: 'running', session_id: 1 },
				{ id: 2, suite_run_id: 2, status: 'pending', session_id: 2 }
			]);
			(mockGetExecutionSessionsByIds as any).mockReturnValue([]);
			(mockGetSessionMessages as any).mockResolvedValue([]);

			const handler = getRouteHandler('get', '/:id');
			await callRoute(handler, mockReq, mockRes);

			expect(jsonMock).toHaveBeenCalledWith(expect.objectContaining({ status: 'running' }));
		});

		it('sets total execution time to 0 and handles similarity errors', async () => {
			mockReq.params = { id: '3' };

			(mockGetSuiteRunById as any).mockResolvedValue({
				id: 3,
				status: 'pending',
				completed_tests: 0,
				successful_tests: 0,
				failed_tests: 0,
				progress: 0
			});
			(mockGetJobsBySuiteRunId as any).mockResolvedValue([
				{ id: 1, suite_run_id: 3, status: 'pending', session_id: 10 }
			]);
			(mockGetExecutionSessionsByIds as any).mockReturnValue([]);
			(mockGetSessionMessages as any).mockRejectedValue(new Error('messages failed'));

			const handler = getRouteHandler('get', '/:id');
			await callRoute(handler, mockReq, mockRes);

			expect(jsonMock).toHaveBeenCalledWith(expect.objectContaining({ total_execution_time: 0 }));
		});

		it('should return 400 for invalid ID', async () => {
			mockReq.params = { id: 'invalid' };

			const handler = getRouteHandler('get', '/:id');
			await callRoute(handler, mockReq, mockRes);

			expect(statusMock).toHaveBeenCalledWith(400);
			expect(jsonMock).toHaveBeenCalledWith({ error: 'Invalid suite run ID' });
		});

		it('should return 404 if suite run not found', async () => {
			mockReq.params = { id: '999' };

			(mockGetSuiteRunById as any).mockResolvedValue(null);

			const handler = getRouteHandler('get', '/:id');
			await callRoute(handler, mockReq, mockRes);

			expect(statusMock).toHaveBeenCalledWith(404);
			expect(jsonMock).toHaveBeenCalledWith({ error: 'Suite run not found' });
		});

		it('should handle errors gracefully', async () => {
			mockReq.params = { id: '1' };

			(mockGetSuiteRunById as any).mockRejectedValue(new Error('Database error'));

			const handler = getRouteHandler('get', '/:id');
			await callRoute(handler, mockReq, mockRes);

			expect(statusMock).toHaveBeenCalledWith(500);
			expect(jsonMock).toHaveBeenCalledWith({
				error: 'Failed to get suite run',
				details: 'Database error'
			});
		});
	});

	describe('GET /:id/jobs', () => {
		it('should return jobs for suite run', async () => {
			mockReq.params = { id: '1' };

			const mockSuiteRun = {
				id: 1,
				suite_id: 1,
				agent_id: 1,
				status: 'completed',
				created_at: '2024-01-01'
			};
			const mockJobs = [
				{ id: 1, suite_run_id: 1, status: 'completed', session_id: 1 },
				{ id: 2, suite_run_id: 1, status: 'completed', session_id: 2 }
			];

			(mockGetSuiteRunById as any).mockResolvedValue(mockSuiteRun);
			(mockGetJobsBySuiteRunId as any).mockResolvedValue(mockJobs);

			const handler = getRouteHandler('get', '/:id/jobs');
			await callRoute(handler, mockReq, mockRes);

			expect(mockGetSuiteRunById).toHaveBeenCalledWith(1);
			expect(mockGetJobsBySuiteRunId).toHaveBeenCalledWith(1);
			expect(jsonMock).toHaveBeenCalledWith(mockJobs);
		});

		it('should return 400 for invalid ID', async () => {
			mockReq.params = { id: 'invalid' };

			const handler = getRouteHandler('get', '/:id/jobs');
			await callRoute(handler, mockReq, mockRes);

			expect(statusMock).toHaveBeenCalledWith(400);
			expect(jsonMock).toHaveBeenCalledWith({ error: 'Invalid suite run ID' });
		});

		it('should return 404 if suite run not found', async () => {
			mockReq.params = { id: '999' };

			(mockGetSuiteRunById as any).mockResolvedValue(null);

			const handler = getRouteHandler('get', '/:id/jobs');
			await callRoute(handler, mockReq, mockRes);

			expect(statusMock).toHaveBeenCalledWith(404);
			expect(jsonMock).toHaveBeenCalledWith({ error: 'Suite run not found' });
		});

		it('should handle errors gracefully', async () => {
			mockReq.params = { id: '1' };

			(mockGetSuiteRunById as any).mockRejectedValue(new Error('Database error'));

			const handler = getRouteHandler('get', '/:id/jobs');
			await callRoute(handler, mockReq, mockRes);

			expect(statusMock).toHaveBeenCalledWith(500);
			expect(jsonMock).toHaveBeenCalledWith({
				error: 'Failed to get jobs for suite run',
				details: 'Database error'
			});
		});
	});

	describe('DELETE /:id', () => {
		it('should delete suite run successfully', async () => {
			mockReq.params = { id: '1' };

			const mockSuiteRun = {
				id: 1,
				suite_id: 1,
				agent_id: 1,
				status: 'completed',
				created_at: '2024-01-01'
			};

			(mockGetSuiteRunById as any).mockResolvedValue(mockSuiteRun);
			(mockDeleteSuiteRun as any).mockResolvedValue(undefined);

			const handler = getRouteHandler('delete', '/:id');
			await callRoute(handler, mockReq, mockRes);

			expect(mockGetSuiteRunById).toHaveBeenCalledWith(1);
			expect(mockDeleteSuiteRun).toHaveBeenCalledWith(1);
			expect(statusMock).toHaveBeenCalledWith(204);
			expect(sendMock).toHaveBeenCalled();
		});

		it('should return 400 for invalid ID', async () => {
			mockReq.params = { id: 'invalid' };

			const handler = getRouteHandler('delete', '/:id');
			await callRoute(handler, mockReq, mockRes);

			expect(statusMock).toHaveBeenCalledWith(400);
			expect(jsonMock).toHaveBeenCalledWith({ error: 'Invalid suite run ID' });
		});

		it('should return 404 if suite run not found', async () => {
			mockReq.params = { id: '999' };

			(mockGetSuiteRunById as any).mockResolvedValue(null);

			const handler = getRouteHandler('delete', '/:id');
			await callRoute(handler, mockReq, mockRes);

			expect(statusMock).toHaveBeenCalledWith(404);
			expect(jsonMock).toHaveBeenCalledWith({ error: 'Suite run not found' });
		});

		it('should handle errors gracefully', async () => {
			mockReq.params = { id: '1' };

			(mockGetSuiteRunById as any).mockRejectedValue(new Error('Database error'));

			const handler = getRouteHandler('delete', '/:id');
			await callRoute(handler, mockReq, mockRes);

			expect(statusMock).toHaveBeenCalledWith(500);
			expect(jsonMock).toHaveBeenCalledWith({
				error: 'Failed to delete suite run',
				details: 'Database error'
			});
		});
	});
});

// Made with Bob
