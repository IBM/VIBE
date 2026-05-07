import { JobQueueService, JobStatus } from '../job-queue';
import * as dbQueries from '../../db/queries';
import { suiteProcessingService } from '../suite-processing-service';
import { getAgentJobType } from '../../utils/agent-utils';

jest.mock('../../db/queries');
jest.mock('../suite-processing-service');
jest.mock('../../utils/agent-utils');

describe('JobQueueService additional coverage', () => {
	let service: JobQueueService | undefined;

	beforeEach(() => {
		jest.clearAllMocks();

		(dbQueries.listJobs as any).mockResolvedValue([]);
		(dbQueries.getAgentById as any).mockResolvedValue({
			id: 1,
			name: 'Test Agent',
			settings: JSON.stringify({ type: 'crewai' }),
			created_at: new Date().toISOString()
		});
		(getAgentJobType as any).mockReturnValue('crewai');

		service = new JobQueueService(3);
	});

	afterEach(async () => {
		if (service) {
			await service.cleanup();
			service = undefined;
		}
		jest.useRealTimers();
	});

	it('removes jobs from running set on TIMEOUT status updates', async () => {
		const mockJob = {
			id: 'job-timeout',
			agent_id: 1,
			test_id: 100,
			status: JobStatus.RUNNING,
			progress: 50,
			job_type: 'crewai'
		};
		service!['jobs'].set(mockJob.id, mockJob);
		service!['runningJobs'].add(mockJob.id);
		(dbQueries.updateJob as any).mockResolvedValue();

		await service!.updateJob(mockJob.id, { status: JobStatus.TIMEOUT });

		expect(service!['runningJobs'].has(mockJob.id)).toBe(false);
	});

	it('updates suite run progress for FAILED jobs, but not for TIMEOUT jobs', async () => {
		const suiteJob = {
			id: 'job-suite-branch',
			agent_id: 1,
			test_id: 100,
			status: JobStatus.PENDING,
			progress: 0,
			job_type: 'crewai',
			suite_run_id: 99
		};
		service!['jobs'].set(suiteJob.id, suiteJob);
		(dbQueries.updateJob as any).mockResolvedValue();

		const updateSuiteSpy = jest.spyOn(service!, 'updateSuiteRunProgress').mockResolvedValue();

		await service!.updateJob(suiteJob.id, { status: JobStatus.FAILED });
		expect(updateSuiteSpy).toHaveBeenCalledWith(99);

		updateSuiteSpy.mockClear();
		await service!.updateJob(suiteJob.id, { status: JobStatus.TIMEOUT });
		expect(updateSuiteSpy).not.toHaveBeenCalled();
	});

	it('claimJob returns false when job is missing', async () => {
		(dbQueries.getJobById as any).mockResolvedValue(null);

		const result = await service!.claimJob('missing-job', 'service-1');

		expect(result).toBe(false);
	});

	it('claimJob returns false when update fails, without adding to running set', async () => {
		const job = {
			id: 'job-claim-fail',
			agent_id: 1,
			test_id: 100,
			status: JobStatus.PENDING,
			progress: 0,
			job_type: 'crewai'
		};
		service!['jobs'].set(job.id, job);

		jest.spyOn(service!, 'updateJob').mockRejectedValue(new Error('db down'));

		const result = await service!.claimJob(job.id, 'service-1');

		expect(result).toBe(false);
		expect(service!['runningJobs'].has(job.id)).toBe(false);
	});

	it('processQueue skips running jobs without updated_at', async () => {
		const runningJobNoTimestamp = {
			id: 'job-running-no-updated-at',
			agent_id: 1,
			test_id: 100,
			status: JobStatus.RUNNING,
			progress: 25,
			job_type: 'crewai'
		};
		service!['jobs'].set(runningJobNoTimestamp.id, runningJobNoTimestamp);
		const updateSpy = jest.spyOn(service!, 'updateJob').mockResolvedValue();

		await service!.processQueue();

		expect(updateSpy).not.toHaveBeenCalled();
	});

	it('processQueue clears processing flag even if resetting stale job throws', async () => {
		const staleJob = {
			id: 'job-stale-throw',
			agent_id: 1,
			test_id: 100,
			status: JobStatus.RUNNING,
			progress: 50,
			updated_at: new Date(Date.now() - 11 * 60 * 1000).toISOString(),
			job_type: 'crewai'
		};
		service!['jobs'].set(staleJob.id, staleJob);

		jest.spyOn(service!, 'updateJob').mockRejectedValue(new Error('boom'));

		await expect(service!.processQueue()).rejects.toThrow('boom');
		expect(service!['isProcessing']).toBe(false);
	});

	it('cleanup waits for in-flight processing to finish', async () => {
		jest.useFakeTimers();

		// Make sure there is an interval to clear
		expect(service!['processingInterval']).toBeDefined();

		service!['isProcessing'] = true;
		setTimeout(() => {
			service!['isProcessing'] = false;
		}, 25);

		const cleanupPromise = service!.cleanup();

		await jest.advanceTimersByTimeAsync(50);
		await cleanupPromise;

		expect(service!['processingInterval']).toBeUndefined();
		expect(service!['isProcessing']).toBe(false);
	});

	it('loadJobsFromDatabase swallows list errors', async () => {
		(dbQueries.listJobs as any).mockRejectedValue(new Error('db fail'));

		await expect((service as any).loadJobsFromDatabase()).resolves.toBeUndefined();
	});

	it('cleanupOldJobs keeps completed jobs with missing created_at when not older than threshold', async () => {
		const completedNoCreatedAt = {
			id: 'job-no-created-at',
			agent_id: 1,
			test_id: 100,
			status: JobStatus.COMPLETED,
			progress: 100,
			job_type: 'crewai'
		};
		service!['jobs'].set(completedNoCreatedAt.id, completedNoCreatedAt);
		(dbQueries.deleteOldJobs as any).mockResolvedValue(0);

		await service!.cleanupOldJobs(new Date(Date.now() - 24 * 60 * 60 * 1000)); // 1 day ago

		expect(service!['jobs'].has(completedNoCreatedAt.id)).toBe(true);
	});

	it('deleteJob removes deleted job from running set as well', async () => {
		const completedJob = {
			id: 'job-delete-running',
			agent_id: 1,
			test_id: 100,
			status: JobStatus.COMPLETED,
			progress: 100,
			job_type: 'crewai'
		};
		service!['jobs'].set(completedJob.id, completedJob);
		service!['runningJobs'].add(completedJob.id);
		(dbQueries.getJobById as any).mockResolvedValue(completedJob);
		(dbQueries.deleteJob as any).mockResolvedValue(true);

		const result = await service!.deleteJob(completedJob.id);

		expect(result).toBe(true);
		expect(service!['jobs'].has(completedJob.id)).toBe(false);
		expect(service!['runningJobs'].has(completedJob.id)).toBe(false);
	});

	it('createSuiteRun uses external_api leaf test_id as fallback conversation id', async () => {
		(suiteProcessingService.getFlattenedLeaves as any).mockReturnValue([{ agent_id: 1, test_id: 123 }]);
		(dbQueries.createSuiteRun as any).mockResolvedValue({ id: 50 });
		(dbQueries.updateSuiteRun as any).mockResolvedValue();
		(dbQueries.getAgentById as any).mockResolvedValue({ settings: JSON.stringify({ type: 'external_api' }) });
		(getAgentJobType as any).mockReturnValue('external_api');

		const conversationSpy = jest.spyOn(service!, 'createConversationJob').mockResolvedValue('job-1');

		const result = await service!.createSuiteRun(1, 1);

		expect(result).toBe(50);
		expect(conversationSpy).toHaveBeenCalledWith(1, 123, 50);
		expect(dbQueries.updateSuiteRun).toHaveBeenCalledWith(50, { status: JobStatus.RUNNING });
	});

	it('createSuiteRun throws when createJobForSuiteRun cannot re-load agent', async () => {
		(suiteProcessingService.getFlattenedLeaves as any).mockReturnValue([{ agent_id: 1, test_id: 100 }]);
		(dbQueries.createSuiteRun as any).mockResolvedValue({ id: 60 });
		(getAgentJobType as any).mockReturnValue('crewai');

		// First call (jobType decision in createSuiteRun) succeeds, second (inside createJobForSuiteRun) fails
		(dbQueries.getAgentById as any)
			.mockResolvedValueOnce({ settings: JSON.stringify({ type: 'crewai' }) })
			.mockResolvedValueOnce(null);

		await expect(service!.createSuiteRun(1, 1)).rejects.toThrow('Agent 1 not found');
	});

	it('updateSuiteRunProgress keeps suite run status when there are no RUNNING jobs', async () => {
		(dbQueries.getSuiteRunById as any).mockResolvedValue({
			id: 77,
			status: JobStatus.PENDING
		});
		(dbQueries.listJobs as any).mockResolvedValue([
			{ id: 'job-1', status: JobStatus.COMPLETED }, // no session_id -> sessionIds empty
			{ id: 'job-2', status: JobStatus.PENDING }
		]);
		(dbQueries.getExecutionSessionsByIds as any).mockReturnValue([]);
		(dbQueries.getSuiteRunTokenUsage as any).mockReturnValue({
			total_input_tokens: 0,
			total_output_tokens: 0
		});
		(dbQueries.updateSuiteRun as any).mockResolvedValue({});

		await service!.updateSuiteRunProgress(77);

		expect(dbQueries.getExecutionSessionsByIds).toHaveBeenCalledWith([]);
		expect(dbQueries.updateSuiteRun).toHaveBeenCalledWith(
			77,
			expect.objectContaining({
				progress: 50,
				status: JobStatus.PENDING,
				average_execution_time: undefined
			})
		);
	});
});
