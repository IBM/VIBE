import type { Request, Response } from 'express';

// Mock all dependencies before importing the router
jest.mock('../../db/queries');
jest.mock('../../services/job-queue');
jest.mock('../../lib/legacyIdResolver');
jest.mock('../../adapters/legacy-adapter');
jest.mock('../../utils/pagination');

import jobsRouter from '../jobs';
import * as queries from '../../db/queries';
import { jobQueue, JobStatus } from '../../services/job-queue';
import { testIdToConversationId } from '../../lib/legacyIdResolver';
import { sessionToLegacyResult, isSingleTurnConversation } from '../../adapters/legacy-adapter';
import { hasPaginationParams, validatePaginationOrError } from '../../utils/pagination';

// Type the mocked functions
const mockListJobsWithCount = queries.listJobsWithCount as jest.MockedFunction<typeof queries.listJobsWithCount>;
const mockGetAgentById = queries.getAgentById as jest.MockedFunction<typeof queries.getAgentById>;
const mockGetConversationById = queries.getConversationById as jest.MockedFunction<typeof queries.getConversationById>;
const mockGetConversationMessages = queries.getConversationMessages as jest.MockedFunction<
	typeof queries.getConversationMessages
>;
const mockGetExecutionSessionById = queries.getExecutionSessionById as jest.MockedFunction<
	typeof queries.getExecutionSessionById
>;
const mockGetSessionMessages = queries.getSessionMessages as jest.MockedFunction<typeof queries.getSessionMessages>;
const mockGetAvailableJobs = jobQueue.getAvailableJobs as jest.MockedFunction<typeof jobQueue.getAvailableJobs>;
const mockGetJob = jobQueue.getJob as jest.MockedFunction<typeof jobQueue.getJob>;
const mockCreateConversationJob = jobQueue.createConversationJob as jest.MockedFunction<
	typeof jobQueue.createConversationJob
>;
const mockUpdateJob = jobQueue.updateJob as jest.MockedFunction<typeof jobQueue.updateJob>;
const mockDeleteJob = jobQueue.deleteJob as jest.MockedFunction<typeof jobQueue.deleteJob>;
const mockClaimJob = jobQueue.claimJob as jest.MockedFunction<typeof jobQueue.claimJob>;
const mockTestIdToConversationId = testIdToConversationId as jest.MockedFunction<typeof testIdToConversationId>;
const mockSessionToLegacyResult = sessionToLegacyResult as jest.MockedFunction<typeof sessionToLegacyResult>;
const mockIsSingleTurnConversation = isSingleTurnConversation as jest.MockedFunction<typeof isSingleTurnConversation>;
const mockHasPaginationParams = hasPaginationParams as jest.MockedFunction<typeof hasPaginationParams>;
const mockValidatePaginationOrError = validatePaginationOrError as jest.MockedFunction<
	typeof validatePaginationOrError
>;

describe('jobs routes', () => {
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
			params: {},
			query: {}
		};

		mockRes = {
			json: jsonMock,
			status: statusMock
		};
	});

	// Helper to extract and call route handler
	const getRouteHandler = (method: string, path: string) => {
		const routes = (jobsRouter as any).stack;
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

	describe('GET /api/jobs', () => {
		it('lists jobs with default pagination', async () => {
			(mockHasPaginationParams as any).mockReturnValue(false);
			(mockListJobsWithCount as any).mockResolvedValue({
				data: [
					{ id: '1', status: JobStatus.PENDING },
					{ id: '2', status: JobStatus.RUNNING }
				],
				total: 2
			});

			await callRoute('get', '/');

			expect(jsonMock).toHaveBeenCalledWith({
				data: [
					{ id: '1', status: JobStatus.PENDING },
					{ id: '2', status: JobStatus.RUNNING }
				],
				total: 2,
				limit: 50,
				offset: 0
			});
		});

		it('lists jobs with custom pagination', async () => {
			mockReq.query = { limit: '10', offset: '5' };
			(mockHasPaginationParams as any).mockReturnValue(true);
			(mockValidatePaginationOrError as any).mockReturnValue({ limit: 10, offset: 5 });
			(mockListJobsWithCount as any).mockResolvedValue({
				data: [{ id: '1', status: JobStatus.PENDING }],
				total: 50
			});

			await callRoute('get', '/');

			expect(jsonMock).toHaveBeenCalledWith({
				data: [{ id: '1', status: JobStatus.PENDING }],
				total: 50,
				limit: 10,
				offset: 5
			});
		});

		it('lists jobs with custom pagination but no offset', async () => {
			mockReq.query = { limit: '10' };
			(mockHasPaginationParams as any).mockReturnValue(true);
			(mockValidatePaginationOrError as any).mockReturnValue({ limit: 10 });
			(mockListJobsWithCount as any).mockResolvedValue({
				data: [{ id: '1', status: JobStatus.PENDING }],
				total: 1
			});

			await callRoute('get', '/');

			expect(jsonMock).toHaveBeenCalledWith({
				data: [{ id: '1', status: JobStatus.PENDING }],
				total: 1,
				limit: 10,
				offset: 0
			});
		});

		it('filters jobs by status', async () => {
			mockReq.query = { status: JobStatus.COMPLETED };
			(mockHasPaginationParams as any).mockReturnValue(false);
			(mockListJobsWithCount as any).mockResolvedValue({
				data: [{ id: '1', status: JobStatus.COMPLETED }],
				total: 1
			});

			await callRoute('get', '/');

			expect(mockListJobsWithCount).toHaveBeenCalledWith(
				expect.objectContaining({ status: JobStatus.COMPLETED })
			);
		});

		it('filters jobs by agent_id', async () => {
			mockReq.query = { agent_id: '5' };
			(mockHasPaginationParams as any).mockReturnValue(false);
			(mockListJobsWithCount as any).mockResolvedValue({ data: [], total: 0 });

			await callRoute('get', '/');

			expect(mockListJobsWithCount).toHaveBeenCalledWith(expect.objectContaining({ agent_id: 5 }));
		});

		it('filters jobs by test_id', async () => {
			mockReq.query = { test_id: '10' };
			(mockHasPaginationParams as any).mockReturnValue(false);
			(mockListJobsWithCount as any).mockResolvedValue({ data: [], total: 0 });

			await callRoute('get', '/');

			expect(mockListJobsWithCount).toHaveBeenCalledWith(expect.objectContaining({ test_id: 10 }));
		});

		it('filters jobs by date range', async () => {
			mockReq.query = { before: '2024-01-01', after: '2023-01-01' };
			(mockHasPaginationParams as any).mockReturnValue(false);
			(mockListJobsWithCount as any).mockResolvedValue({ data: [], total: 0 });

			await callRoute('get', '/');

			expect(mockListJobsWithCount).toHaveBeenCalledWith(
				expect.objectContaining({
					before: new Date('2024-01-01'),
					after: new Date('2023-01-01')
				})
			);
		});

		it('handles database errors gracefully', async () => {
			(mockHasPaginationParams as any).mockReturnValue(false);
			(mockListJobsWithCount as any).mockRejectedValue(new Error('Database error'));

			await callRoute('get', '/');

			expect(statusMock).toHaveBeenCalledWith(500);
			expect(jsonMock).toHaveBeenCalledWith({
				error: 'Failed to list jobs',
				details: 'Database error'
			});
		});

		it('handles unknown errors gracefully', async () => {
			(mockHasPaginationParams as any).mockReturnValue(false);
			(mockListJobsWithCount as any).mockRejectedValue({ not: 'an Error' });

			await callRoute('get', '/');

			expect(statusMock).toHaveBeenCalledWith(500);
			expect(jsonMock).toHaveBeenCalledWith({
				error: 'Failed to list jobs',
				details: 'Unknown error'
			});
		});

		it('returns early when pagination validation fails', async () => {
			(mockHasPaginationParams as any).mockReturnValue(true);
			(mockValidatePaginationOrError as any).mockReturnValue(null);

			await callRoute('get', '/');

			expect(mockValidatePaginationOrError).toHaveBeenCalledWith(mockReq, mockRes);
			expect(mockListJobsWithCount).not.toHaveBeenCalled();
			expect(jsonMock).not.toHaveBeenCalled();
		});
	});

	describe('GET /api/jobs/available/:job_type?', () => {
		it('gets available jobs without job type', async () => {
			mockReq.params = {};
			mockReq.query = {};
			(mockGetAvailableJobs as any).mockResolvedValue([{ id: '1', status: JobStatus.PENDING }]);

			await callRoute('get', '/available/:job_type?');

			expect(mockGetAvailableJobs).toHaveBeenCalledWith(undefined, 10);
			expect(jsonMock).toHaveBeenCalledWith([{ id: '1', status: JobStatus.PENDING }]);
		});

		it('gets available jobs with job type', async () => {
			mockReq.params = { job_type: 'conversation' };
			mockReq.query = { limit: '5' };
			(mockGetAvailableJobs as any).mockResolvedValue([]);

			await callRoute('get', '/available/:job_type?');

			expect(mockGetAvailableJobs).toHaveBeenCalledWith('conversation', 5);
		});

		it('handles errors gracefully', async () => {
			mockReq.params = {};
			(mockGetAvailableJobs as any).mockRejectedValue(new Error('Queue error'));

			await callRoute('get', '/available/:job_type?');

			expect(statusMock).toHaveBeenCalledWith(500);
			expect(jsonMock).toHaveBeenCalledWith({
				error: 'Failed to get available jobs',
				details: 'Queue error'
			});
		});

		it('handles unknown errors gracefully', async () => {
			mockReq.params = {};
			(mockGetAvailableJobs as any).mockRejectedValue('not an Error');

			await callRoute('get', '/available/:job_type?');

			expect(statusMock).toHaveBeenCalledWith(500);
			expect(jsonMock).toHaveBeenCalledWith({
				error: 'Failed to get available jobs',
				details: 'Unknown error'
			});
		});
	});

	describe('GET /api/jobs/:id', () => {
		it('returns a job by id', async () => {
			mockReq.params = { id: 'job-123' };
			(mockGetJob as any).mockResolvedValue({
				id: 'job-123',
				status: JobStatus.COMPLETED
			});

			await callRoute('get', '/:id');

			expect(jsonMock).toHaveBeenCalledWith({
				id: 'job-123',
				status: JobStatus.COMPLETED
			});
		});

		it('enriches job with session result', async () => {
			mockReq.params = { id: 'job-123' };
			(mockGetJob as any).mockResolvedValue({
				id: 'job-123',
				session_id: 'session-1',
				status: JobStatus.COMPLETED
			});
			(mockGetExecutionSessionById as any).mockResolvedValue({
				id: 'session-1',
				agent_id: 1
			});
			(mockGetSessionMessages as any).mockResolvedValue([]);
			(mockSessionToLegacyResult as any).mockReturnValue({ result: 'data' });

			await callRoute('get', '/:id');

			expect(mockGetExecutionSessionById).toHaveBeenCalledWith('session-1');
			expect(mockSessionToLegacyResult).toHaveBeenCalled();
			expect(jsonMock).toHaveBeenCalledWith(expect.objectContaining({ result: { result: 'data' } }));
		});

		it('returns job without result when session_id points to missing session', async () => {
			mockReq.params = { id: 'job-123' };
			(mockGetJob as any).mockResolvedValue({
				id: 'job-123',
				session_id: 'session-missing',
				status: JobStatus.COMPLETED
			});
			(mockGetExecutionSessionById as any).mockResolvedValue(null);

			await callRoute('get', '/:id');

			expect(mockGetExecutionSessionById).toHaveBeenCalledWith('session-missing');
			expect(mockSessionToLegacyResult).not.toHaveBeenCalled();
			expect(jsonMock).toHaveBeenCalledWith({
				id: 'job-123',
				session_id: 'session-missing',
				status: JobStatus.COMPLETED
			});
		});

		it('enriches job with legacy result_id', async () => {
			mockReq.params = { id: 'job-123' };
			(mockGetJob as any).mockResolvedValue({
				id: 'job-123',
				result_id: 'result-1',
				status: JobStatus.COMPLETED
			});
			(mockGetExecutionSessionById as any).mockResolvedValue({
				id: 'result-1',
				agent_id: 1
			});
			(mockGetSessionMessages as any).mockResolvedValue([]);
			(mockSessionToLegacyResult as any).mockReturnValue({ legacy: 'result' });

			await callRoute('get', '/:id');

			expect(jsonMock).toHaveBeenCalledWith(expect.objectContaining({ result: { legacy: 'result' } }));
		});

		it('handles session enrichment errors', async () => {
			mockReq.params = { id: 'job-err' };
			(mockGetJob as any).mockResolvedValue({
				id: 'job-err',
				session_id: 'session-err',
				status: JobStatus.COMPLETED
			});
			(mockGetExecutionSessionById as any).mockRejectedValue(new Error('session fail'));

			await callRoute('get', '/:id');

			expect(jsonMock).toHaveBeenCalledWith({
				id: 'job-err',
				session_id: 'session-err',
				status: JobStatus.COMPLETED
			});
			expect(mockSessionToLegacyResult).not.toHaveBeenCalled();
		});

		it('handles legacy result enrichment errors', async () => {
			mockReq.params = { id: 'job-legacy-err' };
			(mockGetJob as any).mockResolvedValue({
				id: 'job-legacy-err',
				result_id: 'result-err',
				status: JobStatus.COMPLETED
			});
			(mockGetExecutionSessionById as any).mockRejectedValue(new Error('legacy fail'));

			await callRoute('get', '/:id');

			expect(jsonMock).toHaveBeenCalledWith({
				id: 'job-legacy-err',
				result_id: 'result-err',
				status: JobStatus.COMPLETED
			});
			expect(mockSessionToLegacyResult).not.toHaveBeenCalled();
		});

		it('returns 404 when job not found', async () => {
			mockReq.params = { id: 'nonexistent' };
			(mockGetJob as any).mockResolvedValue(null);

			await callRoute('get', '/:id');

			expect(statusMock).toHaveBeenCalledWith(404);
			expect(jsonMock).toHaveBeenCalledWith({ error: 'Job not found' });
		});

		it('handles errors gracefully', async () => {
			mockReq.params = { id: 'job-123' };
			(mockGetJob as any).mockRejectedValue(new Error('Database error'));

			await callRoute('get', '/:id');

			expect(statusMock).toHaveBeenCalledWith(500);
			expect(jsonMock).toHaveBeenCalledWith({
				error: 'Failed to get job',
				details: 'Database error'
			});
		});

		it('handles unknown errors gracefully', async () => {
			mockReq.params = { id: 'job-123' };
			(mockGetJob as any).mockRejectedValue({ not: 'an Error' });

			await callRoute('get', '/:id');

			expect(statusMock).toHaveBeenCalledWith(500);
			expect(jsonMock).toHaveBeenCalledWith({
				error: 'Failed to get job',
				details: 'Unknown error'
			});
		});
	});

	describe('POST /api/jobs', () => {
		it('creates a new job successfully', async () => {
			mockReq.body = { agent_id: 1, test_id: 100 };
			(mockTestIdToConversationId as any).mockReturnValue(10);
			(mockGetAgentById as any).mockResolvedValue({ id: 1, name: 'Agent' });
			(mockGetConversationById as any).mockResolvedValue({ id: 10, name: 'Test' });
			(mockGetConversationMessages as any).mockResolvedValue([{ id: 1, role: 'user', content: 'Hello' }]);
			(mockIsSingleTurnConversation as any).mockReturnValue(true);
			(mockCreateConversationJob as any).mockResolvedValue('job-456');

			await callRoute('post', '/');

			expect(statusMock).toHaveBeenCalledWith(202);
			expect(jsonMock).toHaveBeenCalledWith({
				job_id: 'job-456',
				message: 'Job created and queued for execution'
			});
		});

		it('falls back to using test_id as conversation id when legacy mapping is missing', async () => {
			mockReq.body = { agent_id: 1, test_id: 100 };
			(mockTestIdToConversationId as any).mockReturnValue(undefined);
			(mockGetAgentById as any).mockResolvedValue({ id: 1, name: 'Agent' });
			(mockGetConversationById as any).mockResolvedValue({ id: 100, name: 'Test' });
			(mockGetConversationMessages as any).mockResolvedValue([{ id: 1, role: 'user', content: 'Hello' }]);
			(mockIsSingleTurnConversation as any).mockReturnValue(true);
			(mockCreateConversationJob as any).mockResolvedValue('job-456');

			await callRoute('post', '/');

			expect(mockGetConversationById).toHaveBeenCalledWith(100);
			expect(mockGetConversationMessages).toHaveBeenCalledWith(100);
			expect(mockCreateConversationJob).toHaveBeenCalledWith(1, 100);
		});

		it('validates required agent_id', async () => {
			mockReq.body = { test_id: 100 };

			await callRoute('post', '/');

			expect(statusMock).toHaveBeenCalledWith(400);
			expect(jsonMock).toHaveBeenCalledWith({
				error: 'agent_id and test_id are required'
			});
		});

		it('validates required test_id', async () => {
			mockReq.body = { agent_id: 1 };

			await callRoute('post', '/');

			expect(statusMock).toHaveBeenCalledWith(400);
			expect(jsonMock).toHaveBeenCalledWith({
				error: 'agent_id and test_id are required'
			});
		});

		it('returns 404 when agent not found', async () => {
			mockReq.body = { agent_id: 999, test_id: 100 };
			(mockTestIdToConversationId as any).mockReturnValue(10);
			(mockGetAgentById as any).mockResolvedValue(null);

			await callRoute('post', '/');

			expect(statusMock).toHaveBeenCalledWith(404);
			expect(jsonMock).toHaveBeenCalledWith({ error: 'Agent not found' });
		});

		it('returns 404 when test not found', async () => {
			mockReq.body = { agent_id: 1, test_id: 999 };
			(mockTestIdToConversationId as any).mockReturnValue(999);
			(mockGetAgentById as any).mockResolvedValue({ id: 1, name: 'Agent' });
			(mockGetConversationById as any).mockResolvedValue(null);

			await callRoute('post', '/');

			expect(statusMock).toHaveBeenCalledWith(404);
			expect(jsonMock).toHaveBeenCalledWith({ error: 'Test not found' });
		});

		it('rejects multi-turn conversation', async () => {
			mockReq.body = { agent_id: 1, test_id: 100 };
			(mockTestIdToConversationId as any).mockReturnValue(10);
			(mockGetAgentById as any).mockResolvedValue({ id: 1, name: 'Agent' });
			(mockGetConversationById as any).mockResolvedValue({ id: 10, name: 'Test' });
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

		it('handles errors gracefully', async () => {
			mockReq.body = { agent_id: 1, test_id: 100 };
			(mockTestIdToConversationId as any).mockReturnValue(10);
			(mockGetAgentById as any).mockRejectedValue(new Error('Database error'));

			await callRoute('post', '/');

			expect(statusMock).toHaveBeenCalledWith(500);
			expect(jsonMock).toHaveBeenCalledWith({
				error: 'Failed to create job',
				details: 'Database error'
			});
		});

		it('handles unknown errors gracefully', async () => {
			mockReq.body = { agent_id: 1, test_id: 100 };
			(mockTestIdToConversationId as any).mockReturnValue(10);
			(mockGetAgentById as any).mockRejectedValue({ not: 'an Error' });

			await callRoute('post', '/');

			expect(statusMock).toHaveBeenCalledWith(500);
			expect(jsonMock).toHaveBeenCalledWith({
				error: 'Failed to create job',
				details: 'Unknown error'
			});
		});
	});

	describe('POST /api/jobs/:id/cancel', () => {
		it('cancels a pending job', async () => {
			mockReq.params = { id: 'job-123' };
			(mockGetJob as any).mockResolvedValue({
				id: 'job-123',
				status: JobStatus.PENDING
			});
			(mockUpdateJob as any).mockResolvedValue(undefined);

			await callRoute('post', '/:id/cancel');

			expect(mockUpdateJob).toHaveBeenCalledWith('job-123', {
				status: JobStatus.FAILED,
				error: 'Job canceled by user'
			});
			expect(statusMock).toHaveBeenCalledWith(200);
			expect(jsonMock).toHaveBeenCalledWith({
				message: 'Job canceled successfully'
			});
		});

		it('cancels a running job', async () => {
			mockReq.params = { id: 'job-123' };
			(mockGetJob as any).mockResolvedValue({
				id: 'job-123',
				status: JobStatus.RUNNING
			});
			(mockUpdateJob as any).mockResolvedValue(undefined);

			await callRoute('post', '/:id/cancel');

			expect(mockUpdateJob).toHaveBeenCalled();
			expect(statusMock).toHaveBeenCalledWith(200);
		});

		it('returns 404 when job not found', async () => {
			mockReq.params = { id: 'nonexistent' };
			(mockGetJob as any).mockResolvedValue(null);

			await callRoute('post', '/:id/cancel');

			expect(statusMock).toHaveBeenCalledWith(404);
			expect(jsonMock).toHaveBeenCalledWith({ error: 'Job not found' });
		});

		it('rejects canceling completed job', async () => {
			mockReq.params = { id: 'job-123' };
			(mockGetJob as any).mockResolvedValue({
				id: 'job-123',
				status: JobStatus.COMPLETED
			});

			await callRoute('post', '/:id/cancel');

			expect(statusMock).toHaveBeenCalledWith(400);
			expect(jsonMock).toHaveBeenCalledWith({
				error: 'Cannot cancel job',
				details: 'Job status is completed'
			});
		});

		it('handles errors gracefully', async () => {
			mockReq.params = { id: 'job-123' };
			(mockGetJob as any).mockRejectedValue(new Error('Database error'));

			await callRoute('post', '/:id/cancel');

			expect(statusMock).toHaveBeenCalledWith(500);
			expect(jsonMock).toHaveBeenCalledWith({
				error: 'Failed to cancel job',
				details: 'Database error'
			});
		});

		it('handles unknown errors gracefully', async () => {
			mockReq.params = { id: 'job-123' };
			(mockGetJob as any).mockRejectedValue({ not: 'an Error' });

			await callRoute('post', '/:id/cancel');

			expect(statusMock).toHaveBeenCalledWith(500);
			expect(jsonMock).toHaveBeenCalledWith({
				error: 'Failed to cancel job',
				details: 'Unknown error'
			});
		});
	});

	describe('DELETE /api/jobs/:id', () => {
		it('deletes a job successfully', async () => {
			mockReq.params = { id: 'job-123' };
			(mockDeleteJob as any).mockResolvedValue(true);

			await callRoute('delete', '/:id');

			expect(mockDeleteJob).toHaveBeenCalledWith('job-123');
			expect(statusMock).toHaveBeenCalledWith(200);
			expect(jsonMock).toHaveBeenCalledWith({
				message: 'Job deleted successfully'
			});
		});

		it('returns 404 when job not found', async () => {
			mockReq.params = { id: 'nonexistent' };
			(mockDeleteJob as any).mockResolvedValue(false);

			await callRoute('delete', '/:id');

			expect(statusMock).toHaveBeenCalledWith(404);
			expect(jsonMock).toHaveBeenCalledWith({ error: 'Job not found' });
		});

		it('handles errors gracefully', async () => {
			mockReq.params = { id: 'job-123' };
			(mockDeleteJob as any).mockRejectedValue(new Error('Database error'));

			await callRoute('delete', '/:id');

			expect(statusMock).toHaveBeenCalledWith(500);
			expect(jsonMock).toHaveBeenCalledWith({
				error: 'Failed to delete job',
				details: 'Database error'
			});
		});

		it('handles unknown errors gracefully', async () => {
			mockReq.params = { id: 'job-123' };
			(mockDeleteJob as any).mockRejectedValue({ not: 'an Error' });

			await callRoute('delete', '/:id');

			expect(statusMock).toHaveBeenCalledWith(500);
			expect(jsonMock).toHaveBeenCalledWith({
				error: 'Failed to delete job',
				details: 'Unknown error'
			});
		});
	});

	describe('POST /api/jobs/:id/claim', () => {
		it('claims a job successfully', async () => {
			mockReq.params = { id: 'job-123' };
			mockReq.body = { service_id: 'service-1' };
			(mockClaimJob as any).mockResolvedValue(true);

			await callRoute('post', '/:id/claim');

			expect(mockClaimJob).toHaveBeenCalledWith('job-123', 'service-1');
			expect(statusMock).toHaveBeenCalledWith(200);
			expect(jsonMock).toHaveBeenCalledWith({
				message: 'Job claimed successfully',
				job_id: 'job-123'
			});
		});

		it('validates required service_id', async () => {
			mockReq.params = { id: 'job-123' };
			mockReq.body = {};

			await callRoute('post', '/:id/claim');

			expect(statusMock).toHaveBeenCalledWith(400);
			expect(jsonMock).toHaveBeenCalledWith({
				error: 'service_id is required'
			});
		});

		it('returns 409 when job cannot be claimed', async () => {
			mockReq.params = { id: 'job-123' };
			mockReq.body = { service_id: 'service-1' };
			(mockClaimJob as any).mockResolvedValue(false);

			await callRoute('post', '/:id/claim');

			expect(statusMock).toHaveBeenCalledWith(409);
			expect(jsonMock).toHaveBeenCalledWith({
				error: 'Job could not be claimed (may be already running or completed)'
			});
		});

		it('handles errors gracefully', async () => {
			mockReq.params = { id: 'job-123' };
			mockReq.body = { service_id: 'service-1' };
			(mockClaimJob as any).mockRejectedValue(new Error('Database error'));

			await callRoute('post', '/:id/claim');

			expect(statusMock).toHaveBeenCalledWith(500);
			expect(jsonMock).toHaveBeenCalledWith({
				error: 'Failed to claim job',
				details: 'Database error'
			});
		});

		it('handles unknown errors gracefully', async () => {
			mockReq.params = { id: 'job-123' };
			mockReq.body = { service_id: 'service-1' };
			(mockClaimJob as any).mockRejectedValue({ not: 'an Error' });

			await callRoute('post', '/:id/claim');

			expect(statusMock).toHaveBeenCalledWith(500);
			expect(jsonMock).toHaveBeenCalledWith({
				error: 'Failed to claim job',
				details: 'Unknown error'
			});
		});
	});

	describe('PUT /api/jobs/:id', () => {
		it('updates job with valid fields', async () => {
			mockReq.params = { id: 'job-123' };
			mockReq.body = {
				status: JobStatus.COMPLETED,
				progress: 100,
				result_id: 'result-1'
			};
			(mockUpdateJob as any).mockResolvedValue(undefined);

			await callRoute('put', '/:id');

			expect(mockUpdateJob).toHaveBeenCalledWith('job-123', {
				status: JobStatus.COMPLETED,
				progress: 100,
				result_id: 'result-1'
			});
			expect(statusMock).toHaveBeenCalledWith(200);
			expect(jsonMock).toHaveBeenCalledWith({
				message: 'Job updated successfully'
			});
		});

		it('filters out invalid fields', async () => {
			mockReq.params = { id: 'job-123' };
			mockReq.body = {
				status: JobStatus.RUNNING,
				invalid_field: 'should be ignored',
				agent_id: 999
			};
			(mockUpdateJob as any).mockResolvedValue(undefined);

			await callRoute('put', '/:id');

			expect(mockUpdateJob).toHaveBeenCalledWith('job-123', {
				status: JobStatus.RUNNING
			});
		});

		it('returns 400 when no valid fields provided', async () => {
			mockReq.params = { id: 'job-123' };
			mockReq.body = {
				invalid_field: 'value',
				another_invalid: 'value'
			};

			await callRoute('put', '/:id');

			expect(statusMock).toHaveBeenCalledWith(400);
			expect(jsonMock).toHaveBeenCalledWith({
				error: 'No valid fields to update'
			});
		});

		it('handles errors gracefully', async () => {
			mockReq.params = { id: 'job-123' };
			mockReq.body = { status: JobStatus.COMPLETED };
			(mockUpdateJob as any).mockRejectedValue(new Error('Database error'));

			await callRoute('put', '/:id');

			expect(statusMock).toHaveBeenCalledWith(500);
			expect(jsonMock).toHaveBeenCalledWith({
				error: 'Failed to update job',
				details: 'Database error'
			});
		});

		it('handles unknown errors gracefully', async () => {
			mockReq.params = { id: 'job-123' };
			mockReq.body = { status: JobStatus.COMPLETED };
			(mockUpdateJob as any).mockRejectedValue('not an Error');

			await callRoute('put', '/:id');

			expect(statusMock).toHaveBeenCalledWith(500);
			expect(jsonMock).toHaveBeenCalledWith({
				error: 'Failed to update job',
				details: 'Unknown error'
			});
		});
	});
});

// Made with Bob
