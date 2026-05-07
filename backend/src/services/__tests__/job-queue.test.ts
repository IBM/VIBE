import { JobQueueService, JobStatus } from '../job-queue';
import * as dbQueries from '../../db/queries';
import { suiteProcessingService } from '../suite-processing-service';
import { getAgentJobType } from '../../utils/agent-utils';

// Mock dependencies
jest.mock('../../db/queries');
jest.mock('../suite-processing-service');
jest.mock('../../utils/agent-utils');

describe('JobQueueService', () => {
	let service: JobQueueService;

	beforeEach(() => {
		jest.clearAllMocks();

		// Mock database queries with proper typing
		(dbQueries.listJobs as any).mockResolvedValue([]);
		(dbQueries.getAgentById as any).mockResolvedValue({
			id: 1,
			name: 'Test Agent',
			settings: JSON.stringify({ type: 'crewai' }),
			created_at: new Date().toISOString()
		});
		(getAgentJobType as any).mockReturnValue('crewai');

		// Create new service instance for each test
		service = new JobQueueService(3);
	});

	afterEach(async () => {
		// Cleanup the service to stop the interval
		if (service) {
			await service.cleanup();
		}
	});

	describe('constructor', () => {
		it('should initialize with empty job maps', () => {
			expect(service['jobs'].size).toBe(0);
			expect(service['runningJobs'].size).toBe(0);
		});
	});

	describe('createJob', () => {
		it('should create a new job successfully', async () => {
			(dbQueries.createJob as any).mockResolvedValue();

			const jobId = await service.createJob(1, 100);

			expect(jobId).toBeDefined();
			expect(typeof jobId).toBe('string');
			expect(dbQueries.getAgentById).toHaveBeenCalledWith(1);
			expect(dbQueries.createJob).toHaveBeenCalledWith(
				expect.objectContaining({
					id: jobId,
					agent_id: 1,
					test_id: 100,
					status: JobStatus.PENDING,
					progress: 0,
					job_type: 'crewai'
				})
			);
		});

		it('should create job with suite_run_id when provided', async () => {
			(dbQueries.createJob as any).mockResolvedValue();

			await service.createJob(1, 100, 5);

			expect(dbQueries.createJob).toHaveBeenCalledWith(
				expect.objectContaining({
					suite_run_id: 5
				})
			);
		});

		it('should throw error when agent not found', async () => {
			(dbQueries.getAgentById as any).mockResolvedValue(null);

			await expect(service.createJob(999, 100)).rejects.toThrow('Agent 999 not found');
		});

		it('should determine correct job type from agent settings', async () => {
			(dbQueries.getAgentById as any).mockResolvedValue({
				id: 1,
				name: 'External Agent',
				settings: JSON.stringify({ type: 'external_api' }),
				created_at: new Date().toISOString()
			});
			(getAgentJobType as any).mockReturnValue('external_api');
			(dbQueries.createJob as any).mockResolvedValue();

			await service.createJob(1, 100);

			expect(getAgentJobType).toHaveBeenCalled();
			expect(dbQueries.createJob).toHaveBeenCalledWith(
				expect.objectContaining({
					job_type: 'external_api'
				})
			);
		});
	});

	describe('createConversationJob', () => {
		it('should create a conversation job successfully', async () => {
			(dbQueries.createJob as any).mockResolvedValue();

			const jobId = await service.createConversationJob(1, 200);

			expect(jobId).toBeDefined();
			expect(dbQueries.createJob).toHaveBeenCalledWith(
				expect.objectContaining({
					agent_id: 1,
					conversation_id: 200,
					status: JobStatus.PENDING,
					progress: 0,
					job_type: 'crewai'
				})
			);
		});

		it('should throw error when agent not found', async () => {
			(dbQueries.getAgentById as any).mockResolvedValue(null);

			await expect(service.createConversationJob(999, 200)).rejects.toThrow('Agent 999 not found');
		});
	});

	describe('getJob', () => {
		it('should return job from memory if available', async () => {
			const mockJob = {
				id: 'job-1',
				agent_id: 1,
				test_id: 100,
				status: JobStatus.PENDING,
				progress: 0,
				job_type: 'crewai'
			};
			service['jobs'].set('job-1', mockJob);

			const result = await service.getJob('job-1');

			expect(result).toEqual(mockJob);
			expect(dbQueries.getJobById).not.toHaveBeenCalled();
		});

		it('should fetch job from database if not in memory', async () => {
			const mockJob = {
				id: 'job-2',
				agent_id: 1,
				test_id: 100,
				status: JobStatus.PENDING,
				progress: 0,
				job_type: 'crewai'
			};
			(dbQueries.getJobById as any).mockResolvedValue(mockJob);

			const result = await service.getJob('job-2');

			expect(result).toEqual(mockJob);
			expect(dbQueries.getJobById).toHaveBeenCalledWith('job-2');
			expect(service['jobs'].has('job-2')).toBe(true);
		});

		it('should return undefined if job not found', async () => {
			(dbQueries.getJobById as any).mockResolvedValue(null);

			const result = await service.getJob('nonexistent');

			expect(result).toBeUndefined();
		});

		it('should return undefined on database error', async () => {
			(dbQueries.getJobById as any).mockRejectedValue(new Error('fail'));

			const result = await service.getJob('job-error');

			expect(result).toBeUndefined();
		});
	});

	describe('updateJob', () => {
		it('should update job in memory and database', async () => {
			const mockJob = {
				id: 'job-1',
				agent_id: 1,
				test_id: 100,
				status: JobStatus.PENDING,
				progress: 0,
				job_type: 'crewai'
			};
			service['jobs'].set('job-1', mockJob);
			(dbQueries.updateJob as any).mockResolvedValue();

			await service.updateJob('job-1', { progress: 50, status: JobStatus.RUNNING });

			expect(service['jobs'].get('job-1')).toMatchObject({
				progress: 50,
				status: JobStatus.RUNNING
			});
			expect(dbQueries.updateJob).toHaveBeenCalledWith('job-1', {
				progress: 50,
				status: JobStatus.RUNNING
			});
		});

		it('should remove from running jobs when completed', async () => {
			const mockJob = {
				id: 'job-1',
				agent_id: 1,
				test_id: 100,
				status: JobStatus.RUNNING,
				progress: 50,
				job_type: 'crewai'
			};
			service['jobs'].set('job-1', mockJob);
			service['runningJobs'].add('job-1');
			(dbQueries.updateJob as any).mockResolvedValue();

			await service.updateJob('job-1', { status: JobStatus.COMPLETED });

			expect(service['runningJobs'].has('job-1')).toBe(false);
		});

		it('should throw error if job not found', async () => {
			(dbQueries.getJobById as any).mockResolvedValue(null);

			await expect(service.updateJob('nonexistent', { progress: 50 })).rejects.toThrow(
				'Job nonexistent not found'
			);
		});

		it('should update suite run progress for completed suite jobs', async () => {
			const mockJob = {
				id: 'job-suite',
				agent_id: 1,
				test_id: 100,
				status: JobStatus.PENDING,
				progress: 0,
				job_type: 'crewai',
				suite_run_id: 55
			};
			service['jobs'].set('job-suite', mockJob);
			(dbQueries.updateJob as any).mockResolvedValue();
			const updateSuiteSpy = jest.spyOn(service, 'updateSuiteRunProgress').mockResolvedValue();

			await service.updateJob('job-suite', { status: JobStatus.COMPLETED });

			expect(updateSuiteSpy).toHaveBeenCalledWith(55);
		});
	});

	describe('getAvailableJobs', () => {
		it('should return pending jobs', async () => {
			const mockJobs = [
				{
					id: 'job-1',
					agent_id: 1,
					test_id: 100,
					status: JobStatus.PENDING,
					progress: 0,
					job_type: 'crewai'
				}
			];
			(dbQueries.listJobs as any).mockResolvedValue(mockJobs);

			const result = await service.getAvailableJobs();

			expect(result).toEqual(mockJobs);
			expect(dbQueries.listJobs).toHaveBeenCalledWith({
				status: JobStatus.PENDING
			});
		});

		it('should filter by job type when provided', async () => {
			const mockJobs = [
				{
					id: 'job-1',
					agent_id: 1,
					test_id: 100,
					status: JobStatus.PENDING,
					progress: 0,
					job_type: 'external_api'
				}
			];
			(dbQueries.listJobs as any).mockResolvedValue(mockJobs);

			await service.getAvailableJobs('external_api');

			expect(dbQueries.listJobs).toHaveBeenCalledWith({
				status: JobStatus.PENDING,
				job_type: 'external_api'
			});
		});

		it('should limit number of jobs returned', async () => {
			const mockJobs = Array.from({ length: 20 }, (_, i) => ({
				id: `job-${i}`,
				agent_id: 1,
				test_id: 100 + i,
				status: JobStatus.PENDING,
				progress: 0,
				job_type: 'crewai'
			}));
			(dbQueries.listJobs as any).mockResolvedValue(mockJobs);

			const result = await service.getAvailableJobs(undefined, 5);

			expect(result).toHaveLength(5);
		});
	});

	describe('claimJob', () => {
		it('should claim a pending job successfully', async () => {
			const mockJob = {
				id: 'job-1',
				agent_id: 1,
				test_id: 100,
				status: JobStatus.PENDING,
				progress: 0,
				job_type: 'crewai'
			};
			service['jobs'].set('job-1', mockJob);
			(dbQueries.updateJob as any).mockResolvedValue();

			const result = await service.claimJob('job-1', 'service-1');

			expect(result).toBe(true);
			expect(service['runningJobs'].has('job-1')).toBe(true);
			expect(dbQueries.updateJob).toHaveBeenCalledWith(
				'job-1',
				expect.objectContaining({
					status: JobStatus.RUNNING,
					progress: 10,
					claimed_by: 'service-1'
				})
			);
		});

		it('should not claim non-pending job', async () => {
			const mockJob = {
				id: 'job-1',
				agent_id: 1,
				test_id: 100,
				status: JobStatus.RUNNING,
				progress: 50,
				job_type: 'crewai'
			};
			service['jobs'].set('job-1', mockJob);

			const result = await service.claimJob('job-1', 'service-1');

			expect(result).toBe(false);
			expect(dbQueries.updateJob).not.toHaveBeenCalled();
		});
	});

	describe('listJobs', () => {
		it('should list all jobs when no filters provided', async () => {
			const mockJobs = [
				{
					id: 'job-1',
					agent_id: 1,
					test_id: 100,
					status: JobStatus.PENDING,
					progress: 0,
					job_type: 'crewai'
				}
			];
			(dbQueries.listJobs as any).mockResolvedValue(mockJobs);

			const result = await service.listJobs();

			expect(result).toEqual(mockJobs);
			expect(dbQueries.listJobs).toHaveBeenCalledWith({});
		});

		it('should update in-memory cache with fetched jobs', async () => {
			const mockJobs = [
				{
					id: 'job-new',
					agent_id: 1,
					test_id: 100,
					status: JobStatus.PENDING,
					progress: 0,
					job_type: 'crewai'
				}
			];
			(dbQueries.listJobs as any).mockResolvedValue(mockJobs);

			await service.listJobs();

			expect(service['jobs'].has('job-new')).toBe(true);
		});
	});

	describe('deleteJob', () => {
		it('should delete job from database and memory', async () => {
			const mockJob = {
				id: 'job-1',
				agent_id: 1,
				test_id: 100,
				status: JobStatus.COMPLETED,
				progress: 100,
				job_type: 'crewai'
			};
			service['jobs'].set('job-1', mockJob);
			(dbQueries.getJobById as any).mockResolvedValue(mockJob);
			(dbQueries.deleteJob as any).mockResolvedValue(true);

			const result = await service.deleteJob('job-1');

			expect(result).toBe(true);
			expect(service['jobs'].has('job-1')).toBe(false);
			expect(dbQueries.deleteJob).toHaveBeenCalledWith('job-1');
		});

		it('should return false if job not found', async () => {
			(dbQueries.getJobById as any).mockResolvedValue(null);

			const result = await service.deleteJob('nonexistent');

			expect(result).toBe(false);
		});
	});

	describe('createSuiteRun', () => {
		it('should create suite run with jobs for all tests', async () => {
			const mockLeaves = [
				{ agent_id: 1, test_id: 100 },
				{ agent_id: 1, test_id: 101 }
			];
			(suiteProcessingService.getFlattenedLeaves as any).mockReturnValue(mockLeaves);
			(dbQueries.createSuiteRun as any).mockResolvedValue({
				id: 10,
				suite_id: 1,
				agent_id: 1,
				status: JobStatus.PENDING,
				progress: 0,
				total_tests: 2,
				completed_tests: 0,
				successful_tests: 0,
				failed_tests: 0
			});
			(dbQueries.createJob as any).mockResolvedValue();
			(dbQueries.updateSuiteRun as any).mockResolvedValue();

			const suiteRunId = await service.createSuiteRun(1, 1);

			expect(suiteRunId).toBe(10);
			expect(suiteProcessingService.getFlattenedLeaves).toHaveBeenCalledWith(1, 1);
			expect(dbQueries.createSuiteRun).toHaveBeenCalledWith(
				expect.objectContaining({
					suite_id: 1,
					agent_id: 1,
					total_tests: 2
				})
			);
			expect(dbQueries.createJob).toHaveBeenCalledTimes(2);
		});

		it('should create empty suite run when no tests found', async () => {
			(suiteProcessingService.getFlattenedLeaves as any).mockReturnValue([]);
			(dbQueries.createSuiteRun as any).mockResolvedValue({
				id: 10,
				suite_id: 1,
				agent_id: 1,
				status: JobStatus.COMPLETED,
				progress: 100,
				total_tests: 0,
				completed_tests: 0,
				successful_tests: 0,
				failed_tests: 0
			});

			const suiteRunId = await service.createSuiteRun(1, 1);

			expect(suiteRunId).toBe(10);
			expect(dbQueries.createSuiteRun).toHaveBeenCalledWith(
				expect.objectContaining({
					status: JobStatus.COMPLETED,
					progress: 100,
					total_tests: 0
				})
			);
		});

		it('throws when created suite run lacks id', async () => {
			(suiteProcessingService.getFlattenedLeaves as any).mockReturnValue([{ agent_id: 1, test_id: 100 }]);
			(dbQueries.createSuiteRun as any).mockResolvedValue({});

			await expect(service.createSuiteRun(1, 1)).rejects.toThrow('Failed to create suite run');
		});

		it('creates external_api conversation jobs when configured', async () => {
			(suiteProcessingService.getFlattenedLeaves as any).mockReturnValue([{ agent_id: 1, conversation_id: 200 }]);
			(dbQueries.createSuiteRun as any).mockResolvedValue({ id: 20 });
			(dbQueries.updateSuiteRun as any).mockResolvedValue();
			(dbQueries.getAgentById as any).mockResolvedValue({ settings: JSON.stringify({ type: 'external_api' }) });
			(getAgentJobType as any).mockReturnValue('external_api');
			const conversationSpy = jest.spyOn(service, 'createConversationJob').mockResolvedValue('job-1');

			const result = await service.createSuiteRun(1, 1);

			expect(result).toBe(20);
			expect(conversationSpy).toHaveBeenCalledWith(1, 200, 20);
		});

		it('throws when external_api leaf lacks conversation id', async () => {
			(suiteProcessingService.getFlattenedLeaves as any).mockReturnValue([{ agent_id: 1 }]);
			(dbQueries.createSuiteRun as any).mockResolvedValue({ id: 21 });
			(dbQueries.getAgentById as any).mockResolvedValue({ settings: JSON.stringify({ type: 'external_api' }) });
			(getAgentJobType as any).mockReturnValue('external_api');

			await expect(service.createSuiteRun(1, 1)).rejects.toThrow(
				'Missing conversation identifier for external_api job'
			);
		});

		it('creates conversation jobs for crewai leaves with conversation_id', async () => {
			(suiteProcessingService.getFlattenedLeaves as any).mockReturnValue([{ agent_id: 1, conversation_id: 300 }]);
			(dbQueries.createSuiteRun as any).mockResolvedValue({ id: 22 });
			(dbQueries.updateSuiteRun as any).mockResolvedValue();
			(dbQueries.getAgentById as any).mockResolvedValue({ settings: JSON.stringify({ type: 'crewai' }) });
			(getAgentJobType as any).mockReturnValue('crewai');
			const conversationSpy = jest.spyOn(service, 'createConversationJob').mockResolvedValue('job-1');

			const result = await service.createSuiteRun(1, 1);

			expect(result).toBe(22);
			expect(conversationSpy).toHaveBeenCalledWith(1, 300, 22);
		});

		it('throws when leaf lacks test and conversation identifiers', async () => {
			(suiteProcessingService.getFlattenedLeaves as any).mockReturnValue([{ agent_id: 1 }]);
			(dbQueries.createSuiteRun as any).mockResolvedValue({ id: 23 });
			(dbQueries.getAgentById as any).mockResolvedValue({ settings: JSON.stringify({ type: 'crewai' }) });
			(getAgentJobType as any).mockReturnValue('crewai');

			await expect(service.createSuiteRun(1, 1)).rejects.toThrow('Leaf has neither test_id nor conversation_id');
		});

		it('throws when agent for suite run leaf is missing', async () => {
			(suiteProcessingService.getFlattenedLeaves as any).mockReturnValue([{ agent_id: 99, test_id: 100 }]);
			(dbQueries.createSuiteRun as any).mockResolvedValue({ id: 24 });
			(dbQueries.getAgentById as any).mockResolvedValue(null);

			await expect(service.createSuiteRun(1, 1)).rejects.toThrow('Agent 99 not found');
		});
	});

	describe('cleanupOldJobs', () => {
		it('should delete old completed jobs', async () => {
			const oldDate = new Date('2020-01-01');
			(dbQueries.deleteOldJobs as any).mockResolvedValue(5);

			await service.cleanupOldJobs(oldDate);

			expect(dbQueries.deleteOldJobs).toHaveBeenCalledWith(oldDate);
		});

		it('should remove old jobs from memory', async () => {
			const oldJob = {
				id: 'old-job',
				agent_id: 1,
				test_id: 100,
				status: JobStatus.COMPLETED,
				progress: 100,
				created_at: '2020-01-01T00:00:00Z',
				job_type: 'crewai'
			};
			service['jobs'].set('old-job', oldJob);
			(dbQueries.deleteOldJobs as any).mockResolvedValue(1);

			await service.cleanupOldJobs(new Date('2021-01-01'));

			expect(service['jobs'].has('old-job')).toBe(false);
		});
	});

	describe('processQueue', () => {
		it('resets stale running jobs to pending', async () => {
			const staleJob = {
				id: 'job-stale',
				agent_id: 1,
				test_id: 100,
				status: JobStatus.RUNNING,
				progress: 50,
				updated_at: new Date(Date.now() - 11 * 60 * 1000).toISOString(),
				job_type: 'crewai'
			};
			service['jobs'].set('job-stale', staleJob);
			const updateSpy = jest.spyOn(service, 'updateJob').mockResolvedValue();

			await service.processQueue();

			expect(updateSpy).toHaveBeenCalledWith(
				'job-stale',
				expect.objectContaining({
					status: JobStatus.PENDING
				})
			);
		});

		it('returns early when already processing', async () => {
			service['isProcessing'] = true;
			const updateSpy = jest.spyOn(service, 'updateJob').mockResolvedValue();

			await service.processQueue();

			expect(updateSpy).not.toHaveBeenCalled();
			service['isProcessing'] = false;
		});
	});

	describe('loadJobsFromDatabase', () => {
		it('resets running jobs to pending', async () => {
			(dbQueries.listJobs as any).mockResolvedValue([{ id: 'job-1', status: JobStatus.RUNNING }]);
			(dbQueries.updateJob as any).mockResolvedValue();

			await (service as any).loadJobsFromDatabase();

			expect(dbQueries.updateJob).toHaveBeenCalledWith('job-1', { status: JobStatus.PENDING });
		});
	});

	describe('getAvailableJobs error handling', () => {
		it('returns empty array on list error', async () => {
			(dbQueries.listJobs as any).mockRejectedValue(new Error('fail'));

			const result = await service.getAvailableJobs();

			expect(result).toEqual([]);
		});
	});

	describe('claimJob error handling', () => {
		it('returns false when claim throws', async () => {
			jest.spyOn(service, 'getJob').mockRejectedValue(new Error('boom'));

			const result = await service.claimJob('job-err', 'service-1');

			expect(result).toBe(false);
		});
	});

	describe('listJobs error handling', () => {
		it('returns empty array on list error', async () => {
			(dbQueries.listJobs as any).mockRejectedValue(new Error('fail'));

			const result = await service.listJobs();

			expect(result).toEqual([]);
		});
	});

	describe('cleanupOldJobs error handling', () => {
		it('handles delete errors gracefully', async () => {
			(dbQueries.deleteOldJobs as any).mockRejectedValue(new Error('fail'));

			await service.cleanupOldJobs(new Date('2021-01-01'));
		});
	});

	describe('deleteJob error handling', () => {
		it('returns false when delete fails', async () => {
			const mockJob = {
				id: 'job-delete',
				agent_id: 1,
				test_id: 100,
				status: JobStatus.COMPLETED,
				progress: 100,
				job_type: 'crewai'
			};
			service['jobs'].set('job-delete', mockJob);
			(dbQueries.getJobById as any).mockResolvedValue(mockJob);
			(dbQueries.deleteJob as any).mockResolvedValue(false);

			const result = await service.deleteJob('job-delete');

			expect(result).toBe(false);
			expect(service['jobs'].has('job-delete')).toBe(true);
		});
	});

	describe('createSuiteRun error handling', () => {
		it('throws when empty suite run creation fails', async () => {
			(suiteProcessingService.getFlattenedLeaves as any).mockReturnValue([]);
			(dbQueries.createSuiteRun as any).mockResolvedValue({});

			await expect(service.createSuiteRun(1, 1)).rejects.toThrow('Failed to create empty suite run');
		});
	});

	describe('updateSuiteRunProgress', () => {
		it('updates suite progress based on jobs', async () => {
			(dbQueries.getSuiteRunById as any).mockResolvedValue({
				id: 5,
				status: JobStatus.PENDING
			});
			(dbQueries.listJobs as any).mockResolvedValue([
				{ id: 'job-1', status: JobStatus.COMPLETED, session_id: 10 },
				{ id: 'job-2', status: JobStatus.RUNNING }
			]);
			(dbQueries.getExecutionSessionsByIds as any).mockReturnValue([
				{ started_at: '2024-01-01T00:00:00Z', completed_at: '2024-01-01T00:00:05Z' }
			]);
			(dbQueries.getSuiteRunTokenUsage as any).mockReturnValue({
				total_input_tokens: 5,
				total_output_tokens: 8
			});
			(dbQueries.updateSuiteRun as any).mockResolvedValue({});

			await service.updateSuiteRunProgress(5);

			expect(dbQueries.updateSuiteRun).toHaveBeenCalledWith(
				5,
				expect.objectContaining({
					progress: 50,
					status: JobStatus.RUNNING
				})
			);
		});

		it('throws when suite run is missing', async () => {
			(dbQueries.getSuiteRunById as any).mockResolvedValue(null);

			await expect(service.updateSuiteRunProgress(999)).rejects.toThrow('Suite run 999 not found');
		});

		it('marks suite run completed when all jobs done', async () => {
			(dbQueries.getSuiteRunById as any).mockResolvedValue({
				id: 6,
				status: JobStatus.PENDING
			});
			(dbQueries.listJobs as any).mockResolvedValue([
				{ id: 'job-1', status: JobStatus.COMPLETED, session_id: 10 },
				{ id: 'job-2', status: JobStatus.FAILED, session_id: 11 }
			]);
			(dbQueries.getExecutionSessionsByIds as any).mockReturnValue([]);
			(dbQueries.getSuiteRunTokenUsage as any).mockReturnValue({
				total_input_tokens: 0,
				total_output_tokens: 0
			});
			(dbQueries.updateSuiteRun as any).mockResolvedValue({});

			await service.updateSuiteRunProgress(6);

			expect(dbQueries.updateSuiteRun).toHaveBeenCalledWith(
				6,
				expect.objectContaining({
					status: JobStatus.COMPLETED,
					progress: 100
				})
			);
		});
	});
});

// Made with Bob
