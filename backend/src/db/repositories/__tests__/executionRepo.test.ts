import { Job, JobStatus, ExecutionSession, SessionMessage } from '@ibm-vibe/types';

describe('executionRepo', () => {
	let mockDb: any;
	let executionRepo: any;

	beforeEach(() => {
		jest.clearAllMocks();
		jest.isolateModules(() => {
			// Mock database
			mockDb = {
				prepare: jest.fn()
			};

			jest.doMock('../../database', () => ({
				__esModule: true,
				default: mockDb
			}));

			executionRepo = require('../executionRepo');
		});
	});

	describe('Job operations', () => {
		describe('createJob', () => {
			it('creates job with all fields', async () => {
				const mockJob: Job = {
					id: 'job-1',
					agent_id: 1,
					test_id: 10,
					conversation_id: 20,
					status: JobStatus.PENDING,
					progress: 0,
					partial_result: undefined,
					result_id: undefined,
					session_id: undefined,
					error: undefined,
					suite_run_id: 5,
					job_type: 'crewai',
					claimed_by: undefined,
					claimed_at: undefined,
					created_at: '2024-01-01T00:00:00Z',
					updated_at: '2024-01-01T00:00:00Z'
				};

				const mockRunStmt = { run: jest.fn() };
				const mockGetStmt = { get: jest.fn().mockReturnValue(mockJob) };
				(mockDb.prepare as any).mockReturnValueOnce(mockRunStmt).mockReturnValueOnce(mockGetStmt);

				const result = await executionRepo.createJob(mockJob);

				expect(mockRunStmt.run).toHaveBeenCalled();
				expect(mockGetStmt.get).toHaveBeenCalledWith('job-1');
				expect(result).toEqual(mockJob);
			});

			it('creates job with default values', async () => {
				const mockJob: Job = {
					id: 'job-2',
					agent_id: 1,
					status: JobStatus.PENDING,
					created_at: '2024-01-01T00:00:00Z',
					updated_at: '2024-01-01T00:00:00Z'
				} as Job;

				const mockRunStmt = { run: jest.fn() };
				const mockGetStmt = { get: jest.fn().mockReturnValue(mockJob) };
				(mockDb.prepare as any).mockReturnValueOnce(mockRunStmt).mockReturnValueOnce(mockGetStmt);

				await executionRepo.createJob({ id: 'job-2', agent_id: 1, status: JobStatus.PENDING });

				expect(mockRunStmt.run).toHaveBeenCalledWith(
					expect.objectContaining({
						progress: 0,
						job_type: 'crewai'
					})
				);
			});

			it('throws error when job creation fails', async () => {
				const mockRunStmt = { run: jest.fn() };
				const mockGetStmt = { get: jest.fn().mockReturnValue(undefined) };
				(mockDb.prepare as any).mockReturnValueOnce(mockRunStmt).mockReturnValueOnce(mockGetStmt);

				await expect(
					executionRepo.createJob({ id: 'job-3', agent_id: 1, status: JobStatus.PENDING })
				).rejects.toThrow('Failed to create job job-3');
			});
		});

		describe('getJobById', () => {
			it('returns job by id', async () => {
				const mockJob: Job = {
					id: 'job-1',
					agent_id: 1,
					status: JobStatus.PENDING,
					created_at: '2024-01-01T00:00:00Z',
					updated_at: '2024-01-01T00:00:00Z'
				} as Job;

				const mockStmt = { get: jest.fn().mockReturnValue(mockJob) };
				(mockDb.prepare as any).mockReturnValue(mockStmt);

				const result = await executionRepo.getJobById('job-1');

				expect(mockDb.prepare).toHaveBeenCalledWith('SELECT * FROM jobs WHERE id = ?');
				expect(mockStmt.get).toHaveBeenCalledWith('job-1');
				expect(result).toEqual(mockJob);
			});

			it('returns undefined when job not found', async () => {
				const mockStmt = { get: jest.fn().mockReturnValue(undefined) };
				(mockDb.prepare as any).mockReturnValue(mockStmt);

				const result = await executionRepo.getJobById('nonexistent');

				expect(result).toBeUndefined();
			});
		});

		describe('updateJob', () => {
			it('updates job with provided fields', async () => {
				const mockStmt = { run: jest.fn() };
				(mockDb.prepare as any).mockReturnValue(mockStmt);

				await executionRepo.updateJob('job-1', { status: JobStatus.RUNNING, progress: 50 });

				expect(mockStmt.run).toHaveBeenCalledWith(
					expect.objectContaining({
						id: 'job-1',
						status: 'running',
						progress: 50
					})
				);
			});

			it('does nothing when no fields to update', async () => {
				await executionRepo.updateJob('job-1', {});

				expect(mockDb.prepare).not.toHaveBeenCalled();
			});

			it('excludes id and created_at from updates', async () => {
				const mockStmt = { run: jest.fn() };
				(mockDb.prepare as any).mockReturnValue(mockStmt);

				await executionRepo.updateJob('job-1', {
					status: JobStatus.RUNNING,
					id: 'other' as any,
					created_at: '2025-01-01' as any
				});

				const query = (mockDb.prepare as any).mock.calls[0][0];
				// The WHERE clause contains "id = @id" which is expected
				// We're checking that the SET clause doesn't update id or created_at
				expect(query).toContain('SET status = @status');
				expect(query).not.toContain('SET id = @id');
				expect(query).not.toContain('created_at = @created_at');
			});
		});

		describe('listJobs', () => {
			it('returns all jobs without filters', async () => {
				const mockJobs = [
					{ id: 'job-1', status: 'pending' },
					{ id: 'job-2', status: 'running' }
				];

				const mockStmt = { all: jest.fn().mockReturnValue(mockJobs) };
				(mockDb.prepare as any).mockReturnValue(mockStmt);

				const result = await executionRepo.listJobs();

				expect(result).toEqual(mockJobs);
			});

			it('filters by status', async () => {
				const mockStmt = { all: jest.fn().mockReturnValue([]) };
				(mockDb.prepare as any).mockReturnValue(mockStmt);

				await executionRepo.listJobs({ status: JobStatus.PENDING });

				const query = (mockDb.prepare as any).mock.calls[0][0];
				expect(query).toContain('WHERE status = @status');
			});

			it('filters by agent_id', async () => {
				const mockStmt = { all: jest.fn().mockReturnValue([]) };
				(mockDb.prepare as any).mockReturnValue(mockStmt);

				await executionRepo.listJobs({ agent_id: 1 });

				const query = (mockDb.prepare as any).mock.calls[0][0];
				expect(query).toContain('WHERE agent_id = @agent_id');
			});

			it('filters by date range', async () => {
				const mockStmt = { all: jest.fn().mockReturnValue([]) };
				(mockDb.prepare as any).mockReturnValue(mockStmt);

				const after = new Date('2024-01-01');
				const before = new Date('2024-12-31');

				await executionRepo.listJobs({ after, before });

				const query = (mockDb.prepare as any).mock.calls[0][0];
				expect(query).toContain('created_at >= @after');
				expect(query).toContain('created_at <= @before');
			});

			it('applies limit and offset', async () => {
				const mockStmt = { all: jest.fn().mockReturnValue([]) };
				(mockDb.prepare as any).mockReturnValue(mockStmt);

				await executionRepo.listJobs({ limit: 10, offset: 20 });

				const query = (mockDb.prepare as any).mock.calls[0][0];
				expect(query).toContain('LIMIT @limit');
				expect(query).toContain('OFFSET @offset');
			});
		});

		describe('listJobsWithCount', () => {
			it('returns jobs with total count', async () => {
				const mockJobs = [{ id: 'job-1' }];
				const mockCountStmt = { get: jest.fn().mockReturnValue({ count: 5 }) };
				const mockDataStmt = { all: jest.fn().mockReturnValue(mockJobs) };

				(mockDb.prepare as any).mockReturnValueOnce(mockCountStmt).mockReturnValueOnce(mockDataStmt);

				const result = await executionRepo.listJobsWithCount();

				expect(result).toEqual({ data: mockJobs, total: 5 });
			});
		});

		describe('deleteOldJobs', () => {
			it('deletes completed and failed jobs older than date', async () => {
				const mockStmt = { run: jest.fn().mockReturnValue({ changes: 3 }) };
				(mockDb.prepare as any).mockReturnValue(mockStmt);

				const olderThan = new Date('2024-01-01');
				const result = await executionRepo.deleteOldJobs(olderThan);

				expect(mockStmt.run).toHaveBeenCalledWith(olderThan.toISOString());
				expect(result).toBe(3);
			});
		});

		describe('deleteJob', () => {
			it('deletes job and returns true', async () => {
				const mockStmt = { run: jest.fn().mockReturnValue({ changes: 1 }) };
				(mockDb.prepare as any).mockReturnValue(mockStmt);

				const result = await executionRepo.deleteJob('job-1');

				expect(mockStmt.run).toHaveBeenCalledWith('job-1');
				expect(result).toBe(true);
			});

			it('returns false when job not found', async () => {
				const mockStmt = { run: jest.fn().mockReturnValue({ changes: 0 }) };
				(mockDb.prepare as any).mockReturnValue(mockStmt);

				const result = await executionRepo.deleteJob('nonexistent');

				expect(result).toBe(false);
			});
		});

		describe('getJobsBySuiteRunId', () => {
			it('returns jobs for suite run', () => {
				const mockJobs = [{ id: 'job-1', suite_run_id: 5 }];
				const mockStmt = { all: jest.fn().mockReturnValue(mockJobs) };
				(mockDb.prepare as any).mockReturnValue(mockStmt);

				const result = executionRepo.getJobsBySuiteRunId(5);

				expect(mockStmt.all).toHaveBeenCalledWith(5);
				expect(result).toEqual(mockJobs);
			});
		});
	});

	describe('ExecutionSession operations', () => {
		describe('createExecutionSession', () => {
			it('creates session with all fields', () => {
				const mockSession: ExecutionSession = {
					id: 1,
					conversation_id: 10,
					agent_id: 5,
					status: 'completed',
					started_at: '2024-01-01T00:00:00Z',
					completed_at: '2024-01-01T01:00:00Z',
					success: true,
					error_message: undefined,
					metadata: '{"score":95}',
					variables: '{"var1":"value1"}'
				};

				const mockStmt = { get: jest.fn().mockReturnValue(mockSession) };
				(mockDb.prepare as any).mockReturnValue(mockStmt);

				const result = executionRepo.createExecutionSession(mockSession);

				expect(mockStmt.get).toHaveBeenCalled();
				expect(result).toEqual(mockSession);
			});

			it('creates session with default values', () => {
				const mockSession: ExecutionSession = {
					id: 1,
					conversation_id: 10,
					agent_id: 5,
					status: 'pending',
					started_at: expect.any(String),
					completed_at: undefined,
					success: undefined,
					error_message: undefined,
					metadata: '{}',
					variables: undefined
				};

				const mockStmt = { get: jest.fn().mockReturnValue(mockSession) };
				(mockDb.prepare as any).mockReturnValue(mockStmt);

				const result = executionRepo.createExecutionSession({
					conversation_id: 10,
					agent_id: 5
				} as ExecutionSession);

				expect(result).toEqual(mockSession);
			});

			it('converts boolean success to integer', () => {
				const mockSession: ExecutionSession = {
					id: 1,
					conversation_id: 10,
					agent_id: 5,
					status: 'completed',
					success: true
				} as ExecutionSession;

				const mockStmt = { get: jest.fn().mockReturnValue(mockSession) };
				(mockDb.prepare as any).mockReturnValue(mockStmt);

				executionRepo.createExecutionSession({ conversation_id: 10, agent_id: 5, success: true });

				expect(mockStmt.get).toHaveBeenCalledWith(
					expect.objectContaining({
						success: 1
					})
				);
			});
		});

		describe('getExecutionSessions', () => {
			it('returns all sessions', () => {
				const mockSessions = [
					{ id: 1, conversation_id: 10 },
					{ id: 2, conversation_id: 20 }
				];

				const mockStmt = { all: jest.fn().mockReturnValue(mockSessions) };
				(mockDb.prepare as any).mockReturnValue(mockStmt);

				const result = executionRepo.getExecutionSessions();

				expect(result).toEqual(mockSessions);
			});

			it('filters by conversation_id', () => {
				const mockStmt = { all: jest.fn().mockReturnValue([]) };
				(mockDb.prepare as any).mockReturnValue(mockStmt);

				executionRepo.getExecutionSessions({ conversation_id: 10 });

				const query = (mockDb.prepare as any).mock.calls[0][0];
				expect(query).toContain('WHERE conversation_id = ?');
			});

			it('filters by agent_id', () => {
				const mockStmt = { all: jest.fn().mockReturnValue([]) };
				(mockDb.prepare as any).mockReturnValue(mockStmt);

				executionRepo.getExecutionSessions({ agent_id: 5 });

				const query = (mockDb.prepare as any).mock.calls[0][0];
				expect(query).toContain('WHERE agent_id = ?');
			});

			it('applies limit and offset', () => {
				const mockStmt = { all: jest.fn().mockReturnValue([]) };
				(mockDb.prepare as any).mockReturnValue(mockStmt);

				executionRepo.getExecutionSessions({ limit: 10, offset: 20 });

				const query = (mockDb.prepare as any).mock.calls[0][0];
				expect(query).toContain('LIMIT ?');
				expect(query).toContain('OFFSET ?');
			});
		});

		describe('getExecutionSessionsWithCount', () => {
			it('returns sessions with total count', () => {
				const mockSessions = [{ id: 1 }];
				const mockCountStmt = { get: jest.fn().mockReturnValue({ count: 5 }) };
				const mockDataStmt = { all: jest.fn().mockReturnValue(mockSessions) };

				(mockDb.prepare as any).mockReturnValueOnce(mockCountStmt).mockReturnValueOnce(mockDataStmt);

				const result = executionRepo.getExecutionSessionsWithCount();

				expect(result).toEqual({ data: mockSessions, total: 5 });
			});
		});

		describe('getExecutionSessionById', () => {
			it('returns session by id', () => {
				const mockSession: ExecutionSession = {
					id: 1,
					conversation_id: 10,
					agent_id: 5,
					status: 'completed'
				} as ExecutionSession;

				const mockStmt = { get: jest.fn().mockReturnValue(mockSession) };
				(mockDb.prepare as any).mockReturnValue(mockStmt);

				const result = executionRepo.getExecutionSessionById(1);

				expect(mockStmt.get).toHaveBeenCalledWith(1);
				expect(result).toEqual(mockSession);
			});
		});

		describe('getExecutionSessionsByIds', () => {
			it('returns sessions by ids', () => {
				const mockSessions = [
					{ id: 1, conversation_id: 10 },
					{ id: 2, conversation_id: 20 }
				];

				const mockStmt = { all: jest.fn().mockReturnValue(mockSessions) };
				(mockDb.prepare as any).mockReturnValue(mockStmt);

				const result = executionRepo.getExecutionSessionsByIds([1, 2]);

				expect(mockStmt.all).toHaveBeenCalledWith(1, 2);
				expect(result).toEqual(mockSessions);
			});

			it('returns empty array for empty ids', () => {
				const result = executionRepo.getExecutionSessionsByIds([]);

				expect(result).toEqual([]);
				expect(mockDb.prepare).not.toHaveBeenCalled();
			});
		});

		describe('updateExecutionSession', () => {
			it('updates session with provided fields', () => {
				const mockUpdated: ExecutionSession = {
					id: 1,
					conversation_id: 10,
					agent_id: 5,
					status: 'completed',
					success: true
				} as ExecutionSession;

				const mockStmt = { get: jest.fn().mockReturnValue(mockUpdated) };
				(mockDb.prepare as any).mockReturnValue(mockStmt);

				const result = executionRepo.updateExecutionSession(1, { status: 'completed', success: true });

				expect(mockStmt.get).toHaveBeenCalledWith(
					expect.objectContaining({
						id: 1,
						status: 'completed',
						success: true
					})
				);
				expect(result).toEqual(mockUpdated);
			});

			it('returns existing session when no fields to update', () => {
				const mockSession: ExecutionSession = {
					id: 1,
					conversation_id: 10,
					agent_id: 5,
					status: 'pending'
				} as ExecutionSession;

				const mockStmt = { get: jest.fn().mockReturnValue(mockSession) };
				(mockDb.prepare as any).mockReturnValue(mockStmt);

				const result = executionRepo.updateExecutionSession(1, {});

				expect(mockDb.prepare).toHaveBeenCalledWith('SELECT * FROM execution_sessions WHERE id = ?');
				expect(result).toEqual(mockSession);
			});
		});
	});

	describe('SessionMessage operations', () => {
		describe('addSessionMessage', () => {
			it('adds message with all fields', () => {
				const mockMessage: SessionMessage = {
					id: 1,
					session_id: 10,
					sequence: 1,
					role: 'user',
					content: 'Test message',
					timestamp: '2024-01-01T00:00:00Z',
					metadata: '{"key":"value"}'
				};

				const mockStmt = { get: jest.fn().mockReturnValue(mockMessage) };
				(mockDb.prepare as any).mockReturnValue(mockStmt);

				const result = executionRepo.addSessionMessage(mockMessage);

				expect(mockStmt.get).toHaveBeenCalled();
				expect(result).toEqual(mockMessage);
			});

			it('handles null metadata', () => {
				const mockMessage: SessionMessage = {
					id: 1,
					session_id: 10,
					sequence: 1,
					role: 'user',
					content: 'Test',
					timestamp: '2024-01-01T00:00:00Z'
				} as SessionMessage;

				const mockStmt = { get: jest.fn().mockReturnValue(mockMessage) };
				(mockDb.prepare as any).mockReturnValue(mockStmt);

				executionRepo.addSessionMessage({ session_id: 10, sequence: 1, role: 'user', content: 'Test' });

				expect(mockStmt.get).toHaveBeenCalledWith(
					expect.objectContaining({
						metadata: null
					})
				);
			});
		});

		describe('updateSessionMessage', () => {
			it('updates message with provided fields', () => {
				const mockStmt = { run: jest.fn() };
				(mockDb.prepare as any).mockReturnValue(mockStmt);

				executionRepo.updateSessionMessage(1, { content: 'Updated content' });

				expect(mockStmt.run).toHaveBeenCalledWith(
					expect.objectContaining({
						id: 1,
						content: 'Updated content'
					})
				);
			});

			it('does nothing when no fields to update', () => {
				executionRepo.updateSessionMessage(1, {});

				expect(mockDb.prepare).not.toHaveBeenCalled();
			});
		});

		describe('getSessionMessages', () => {
			it('returns messages ordered by sequence', () => {
				const mockMessages: SessionMessage[] = [
					{
						id: 1,
						session_id: 10,
						sequence: 1,
						role: 'user',
						content: 'Message 1',
						timestamp: '2024-01-01T00:00:00Z'
					},
					{
						id: 2,
						session_id: 10,
						sequence: 2,
						role: 'assistant',
						content: 'Message 2',
						timestamp: '2024-01-01T00:00:01Z'
					}
				];

				const mockStmt = { all: jest.fn().mockReturnValue(mockMessages) };
				(mockDb.prepare as any).mockReturnValue(mockStmt);

				const result = executionRepo.getSessionMessages(10);

				expect(mockStmt.all).toHaveBeenCalledWith(10);
				expect(result).toEqual(mockMessages);
			});
		});

		describe('getFullSessionTranscript', () => {
			it('returns session with messages', () => {
				const mockSession: ExecutionSession = {
					id: 10,
					conversation_id: 5,
					agent_id: 1,
					status: 'completed'
				} as ExecutionSession;

				const mockMessages: SessionMessage[] = [
					{
						id: 1,
						session_id: 10,
						sequence: 1,
						role: 'user',
						content: 'Test',
						timestamp: '2024-01-01T00:00:00Z'
					}
				];

				const mockSessionStmt = { get: jest.fn().mockReturnValue(mockSession) };
				const mockMessagesStmt = { all: jest.fn().mockReturnValue(mockMessages) };

				(mockDb.prepare as any).mockReturnValueOnce(mockSessionStmt).mockReturnValueOnce(mockMessagesStmt);

				const result = executionRepo.getFullSessionTranscript(10);

				expect(result).toEqual({
					session: mockSession,
					messages: mockMessages
				});
			});
		});

		describe('countUserTurnsUpTo', () => {
			it('counts user messages up to sequence', () => {
				const mockStmt = { get: jest.fn().mockReturnValue({ cnt: 3 }) };
				(mockDb.prepare as any).mockReturnValue(mockStmt);

				const result = executionRepo.countUserTurnsUpTo(10, 5);

				expect(mockStmt.get).toHaveBeenCalledWith(10, 5);
				expect(result).toBe(3);
			});

			it('returns 0 when no user messages', () => {
				const mockStmt = { get: jest.fn().mockReturnValue({ cnt: 0 }) };
				(mockDb.prepare as any).mockReturnValue(mockStmt);

				const result = executionRepo.countUserTurnsUpTo(10, 5);

				expect(result).toBe(0);
			});
		});

		describe('updateSessionMessageScoring', () => {
			it('updates scoring fields', () => {
				const mockStmt = { run: jest.fn() };
				(mockDb.prepare as any).mockReturnValue(mockStmt);

				executionRepo.updateSessionMessageScoring(1, {
					similarity_score: 95,
					similarity_scoring_status: 'completed'
				});

				expect(mockStmt.run).toHaveBeenCalledWith(
					expect.objectContaining({
						id: 1,
						similarity_score: 95,
						similarity_scoring_status: 'completed'
					})
				);
			});

			it('does nothing when no fields to update', () => {
				executionRepo.updateSessionMessageScoring(1, {});

				expect(mockDb.prepare).not.toHaveBeenCalled();
			});
		});

		describe('getSessionMessageById', () => {
			it('returns message by id', () => {
				const mockMessage: SessionMessage = {
					id: 1,
					session_id: 10,
					sequence: 1,
					role: 'user',
					content: 'Test',
					timestamp: '2024-01-01T00:00:00Z'
				};

				const mockStmt = { get: jest.fn().mockReturnValue(mockMessage) };
				(mockDb.prepare as any).mockReturnValue(mockStmt);

				const result = executionRepo.getSessionMessageById(1);

				expect(mockStmt.get).toHaveBeenCalledWith(1);
				expect(result).toEqual(mockMessage);
			});

			it('returns undefined when message not found', () => {
				const mockStmt = { get: jest.fn().mockReturnValue(undefined) };
				(mockDb.prepare as any).mockReturnValue(mockStmt);

				const result = executionRepo.getSessionMessageById(999);

				expect(result).toBeUndefined();
			});
		});
	});
});

// Made with Bob
