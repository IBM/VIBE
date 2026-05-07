import type { Conversation, ConversationMessage, Job, AgentSettings, Agent, Test } from '@ibm-vibe/types';
import { JobStatus } from '@ibm-vibe/types';
import axios from 'axios';
import { JobPollerService } from '../job-poller';
import { apiService } from '../api-service';

jest.mock('../api-service', () => ({
	apiService: {
		executeConversation: jest.fn(),
		executeTest: jest.fn()
	}
}));

jest.mock('../../config', () => ({
	BACKEND_CONFIG: { url: 'http://localhost:5000', timeout: 30000 },
	POLLER_CONFIG: {
		baseIntervalMs: 5000,
		maxIntervalMs: 60000,
		backoffMultiplier: 1.5,
		maxConcurrentJobs: 3
	}
}));

jest.mock('axios');

const mockedAxios = axios as jest.Mocked<typeof axios>;
const mockedApiService = apiService as jest.Mocked<typeof apiService>;

const buildConversation = (): Conversation & { messages: ConversationMessage[] } => ({
	id: 1,
	name: 'Test conversation',
	description: 'baseline',
	default_request_template_id: 2,
	default_response_map_id: 3,
	variables: JSON.stringify({ global: 'value' }),
	created_at: '',
	updated_at: '',
	stop_on_failure: false,
	messages: [
		{
			id: 10,
			conversation_id: 1,
			sequence: 1,
			role: 'user',
			content: 'Hello',
			request_template_id: 4,
			response_map_id: 5,
			set_variables: JSON.stringify({ local: 'scope' })
		}
	]
});

const agentConfig = {
	templates: [
		{ id: 4, body: '{"input":"{{content}}"}', is_default: 0 },
		{ id: 2, body: '{"input":"default"}', is_default: 1 }
	],
	maps: [
		{ id: 5, spec: '{"output":"$.result"}', is_default: 0 },
		{ id: 3, spec: '{"output":"$.default"}', is_default: 1 }
	],
	defaultTemplate: { id: 2, body: '{"input":"default"}', is_default: 1 },
	defaultMap: { id: 3, spec: '{"output":"$.default"}', is_default: 1 }
};

describe('JobPollerService conversation script resolution', () => {
	it('merges templates, response maps, and variables', () => {
		const poller = new JobPollerService('http://example.com', 'test-service');
		const conversation = buildConversation();

		const resolvedScript = (poller as unknown as { resolveConversationScript: Function }).resolveConversationScript(
			conversation,
			agentConfig
		);

		expect(resolvedScript).toHaveLength(1);
		const [message] = resolvedScript;
		expect(message.metadata?.request_template).toContain('{{content}}');
		expect(message.metadata?.response_mapping).toContain('$.result');
		expect(message.metadata?.variables).toMatchObject({ global: 'value', local: 'scope' });
	});
});

describe('JobPollerService job execution guards', () => {
	beforeEach(() => {
		jest.clearAllMocks();
	});

	it('marks job failed when agent type is not external_api', async () => {
		const poller = new JobPollerService('http://example.com', 'test-service') as any;
		poller.updateJobStatus = jest.fn();

		mockedAxios.post.mockResolvedValue({ status: 200 } as any);
		mockedAxios.get.mockResolvedValueOnce({
			data: { id: 1, settings: JSON.stringify({ type: 'crewai' }) }
		} as any);

		const job: Job = { id: 'job-1', agent_id: 1, test_id: 2, status: 'pending' } as any;

		await poller.executeJob(job);

		expect(poller.updateJobStatus).toHaveBeenCalledWith(
			job.id,
			JobStatus.FAILED,
			0,
			undefined,
			expect.stringContaining('not for external API agent')
		);
	});

	it('fails jobs missing both test_id and conversation_id', async () => {
		const poller = new JobPollerService('http://example.com', 'test-service') as any;
		poller.updateJobStatus = jest.fn();

		mockedAxios.post.mockResolvedValue({ status: 200 } as any);
		mockedAxios.get.mockResolvedValueOnce({
			data: { id: 1, settings: JSON.stringify({ type: 'external_api' }) }
		} as any);

		const job: Job = { id: 'job-2', agent_id: 1, status: 'pending' } as any;

		await poller.executeJob(job);

		expect(poller.updateJobStatus).toHaveBeenCalledWith(
			job.id,
			JobStatus.FAILED,
			0,
			undefined,
			expect.stringContaining('neither conversation_id nor test_id')
		);
	});
});

describe('JobPollerService helpers', () => {
	beforeEach(() => {
		jest.clearAllMocks();
	});

	it('returns default template/map from agent config', async () => {
		const poller = new JobPollerService('http://example.com', 'test-service') as any;
		mockedAxios.get
			.mockResolvedValueOnce({ data: [{ id: 1, body: '{}', is_default: 1 }] })
			.mockResolvedValueOnce({ data: [{ id: 2, spec: '{}', is_default: 1 }] });

		const config = await poller.getAgentConfig(1);

		expect(config.defaultTemplate?.id).toBe(1);
		expect(config.defaultMap?.id).toBe(2);
	});

	it('updates job status with result and session IDs', async () => {
		const poller = new JobPollerService('http://example.com', 'test-service') as any;
		mockedAxios.put.mockResolvedValue({} as any);

		await poller.updateJobStatus('job-3', JobStatus.COMPLETED, 100, 10, undefined, 99);

		expect(mockedAxios.put).toHaveBeenCalledWith(
			'http://example.com/api/jobs/job-3',
			expect.objectContaining({ status: JobStatus.COMPLETED, progress: 100, result_id: 10, session_id: 99 })
		);
	});

	it('returns health check status', async () => {
		const poller = new JobPollerService('http://example.com', 'test-service');
		mockedAxios.get.mockResolvedValueOnce({ status: 200 } as any);
		expect(await poller.healthCheck()).toBe(true);

		mockedAxios.get.mockRejectedValueOnce(new Error('fail'));
		expect(await poller.healthCheck()).toBe(false);
	});

	it('executes conversation jobs and updates status', async () => {
		const poller = new JobPollerService('http://example.com', 'test-service') as any;
		poller.getAgentConfig = jest.fn().mockResolvedValue({ templates: [], maps: [] });
		poller.saveSessionResults = jest.fn().mockResolvedValue(123);
		poller.updateJobStatus = jest.fn();
		mockedAxios.get.mockResolvedValueOnce({
			data: { id: 2, name: 'Conv', messages: [{ sequence: 1, role: 'user', content: 'hi' }] }
		} as any);
		mockedApiService.executeConversation.mockResolvedValue({
			success: true,
			intermediate_steps: [],
			transcript: [],
			metrics: { input_tokens: 1, output_tokens: 2 }
		} as any);

		const job: Job = { id: 'job-4', agent_id: 1, conversation_id: 2, status: 'pending' } as any;
		const agent: Agent = { id: 1 } as any;
		const settings: AgentSettings = { api_endpoint: 'http://example.test' } as any;

		await poller.executeConversationJob(job, agent, settings);

		expect(poller.updateJobStatus).toHaveBeenCalledWith(
			job.id,
			JobStatus.COMPLETED,
			100,
			undefined,
			undefined,
			123
		);
	});

	it('executes legacy test jobs and updates status', async () => {
		const poller = new JobPollerService('http://example.com', 'test-service') as any;
		poller.updateJobStatus = jest.fn();
		const test: Test = { id: 3, input: 'hello', agent_id: 1 } as any;
		mockedAxios.get.mockResolvedValueOnce({ data: test } as any);
		mockedAxios.post.mockResolvedValueOnce({ data: { id: 77 } } as any);
		mockedApiService.executeTest.mockResolvedValue({
			output: 'ok',
			success: true,
			metrics: { input_tokens: 1, output_tokens: 1 }
		} as any);

		const job: Job = { id: 'job-5', agent_id: 1, test_id: 3, status: 'pending' } as any;
		const agent: Agent = { id: 1 } as any;
		const settings: AgentSettings = {
			api_endpoint: 'http://example.test',
			request_template: '{"input":"{{input}}"}',
			response_mapping: '{"output":"$.result"}'
		} as any;

		await poller.executeLegacyTestJob(job, agent, settings);

		expect(poller.updateJobStatus).toHaveBeenCalledWith(job.id, JobStatus.COMPLETED, 100, 77);
	});

	it('uses default templates/maps when legacy job settings are missing', async () => {
		const poller = new JobPollerService('http://example.com', 'test-service') as any;
		poller.updateJobStatus = jest.fn();
		const test: Test = { id: 4, input: 'hello', agent_id: 1 } as any;
		mockedAxios.get
			.mockResolvedValueOnce({ data: test } as any)
			.mockResolvedValueOnce({ data: [{ id: 1, body: '{"input":"{{input}}"}', is_default: 1 }] } as any)
			.mockResolvedValueOnce({ data: [{ id: 2, spec: '{"output":"$.result"}', is_default: 1 }] } as any);
		mockedAxios.post.mockResolvedValueOnce({ data: { id: 88 } } as any);
		mockedApiService.executeTest.mockResolvedValue({
			output: 'ok',
			success: true,
			metrics: { input_tokens: 1, output_tokens: 1 }
		} as any);

		const job: Job = { id: 'job-6', agent_id: 1, test_id: 4, status: 'pending' } as any;
		const agent: Agent = { id: 1 } as any;
		const settings: AgentSettings = { api_endpoint: 'http://example.test' } as any;

		await poller.executeLegacyTestJob(job, agent, settings);

		expect(poller.updateJobStatus).toHaveBeenCalledWith(job.id, JobStatus.COMPLETED, 100, 88);
	});

	it('throws when conversation requirements are not met', () => {
		const poller = new JobPollerService('http://example.com', 'test-service') as any;
		const conversation = {
			required_request_template_capabilities: '{"name":"openai-chat"}',
			required_response_map_capabilities: undefined,
			messages: []
		} as any;
		const resolvedMessages = [{ role: 'user', metadata: { request_capabilities: { name: 'other' } } }];

		expect(() => poller.validateConversationRequirements(conversation, resolvedMessages)).toThrow(
			'Request template capabilities do not satisfy conversation requirements'
		);
	});

	it('starts and stops polling', () => {
		jest.useFakeTimers();
		const poller = new JobPollerService('http://example.com', 'test-service') as any;
		poller.pollAndExecuteJobs = jest.fn();

		poller.startPolling(1000);

		expect(poller.pollAndExecuteJobs).toHaveBeenCalledTimes(1);
		poller.isCurrentlyPolling = true;
		jest.advanceTimersByTime(1000);
		expect(poller.pollAndExecuteJobs).toHaveBeenCalledTimes(1);
		poller.isCurrentlyPolling = false;
		jest.advanceTimersByTime(1000);
		expect(poller.pollAndExecuteJobs).toHaveBeenCalledTimes(2);

		// Calling start again should be a no-op
		poller.startPolling(1000);
		expect(poller.pollAndExecuteJobs).toHaveBeenCalledTimes(2);

		poller.stopPolling();
		jest.useRealTimers();
	});

	it('does not start polling when already polling', () => {
		const poller = new JobPollerService('http://example.com', 'test-service') as any;
		poller.isPolling = true;
		poller.pollAndExecuteJobs = jest.fn();

		poller.startPolling(1000);

		expect(poller.pollAndExecuteJobs).not.toHaveBeenCalled();
	});

	it('starts polling with default interval', () => {
		jest.useFakeTimers();
		const poller = new JobPollerService('http://example.com', 'test-service') as any;
		poller.pollAndExecuteJobs = jest.fn();

		poller.startPolling();

		expect(poller.pollAndExecuteJobs).toHaveBeenCalledTimes(1);
		poller.stopPolling();
		jest.useRealTimers();
	});

	it('stops polling with no interval safely', () => {
		const poller = new JobPollerService('http://example.com', 'test-service') as any;
		poller.pollingInterval = null;

		poller.stopPolling();

		expect(poller.isPolling).toBe(false);
	});

	it('polls and executes jobs', async () => {
		const poller = new JobPollerService('http://example.com', 'test-service') as any;
		poller.executeJob = jest.fn();
		mockedAxios.get.mockResolvedValueOnce({ data: [{ id: 'job-7', agent_id: 1 }] } as any);

		await poller.pollAndExecuteJobs();

		expect(poller.executeJob).toHaveBeenCalledWith(expect.objectContaining({ id: 'job-7' }));
	});

	it('polls and returns early when no jobs', async () => {
		const poller = new JobPollerService('http://example.com', 'test-service') as any;
		mockedAxios.get.mockResolvedValueOnce({} as any);

		await poller.pollAndExecuteJobs();

		expect(mockedAxios.get).toHaveBeenCalled();
	});

	it('returns early if already polling', async () => {
		const poller = new JobPollerService('http://example.com', 'test-service') as any;
		poller.isCurrentlyPolling = true;

		await poller.pollAndExecuteJobs();

		expect(mockedAxios.get).not.toHaveBeenCalled();
	});

	it('handles poll errors with string and object errors', async () => {
		const poller = new JobPollerService('http://example.com', 'test-service') as any;
		mockedAxios.get.mockRejectedValueOnce('boom');
		await poller.pollAndExecuteJobs();

		mockedAxios.get.mockRejectedValueOnce({ code: 'oops' });
		await poller.pollAndExecuteJobs();
	});

	it('executes jobs with conversation and legacy branches', async () => {
		const poller = new JobPollerService('http://example.com', 'test-service') as any;
		poller.executeConversationJob = jest.fn();
		poller.executeLegacyTestJob = jest.fn();
		poller.updateJobStatus = jest.fn();

		mockedAxios.post.mockResolvedValue({ status: 200 } as any);
		mockedAxios.get.mockResolvedValueOnce({
			data: { id: 1, settings: JSON.stringify({ type: 'external_api' }) }
		} as any);

		await poller.executeJob({ id: 'job-9', agent_id: 1, conversation_id: 2 } as any);
		expect(poller.executeConversationJob).toHaveBeenCalled();

		mockedAxios.get.mockResolvedValueOnce({
			data: { id: 1, settings: JSON.stringify({ type: 'external_api' }) }
		} as any);
		await poller.executeJob({ id: 'job-10', agent_id: 1, test_id: 3 } as any);
		expect(poller.executeLegacyTestJob).toHaveBeenCalled();
	});

	it('handles job claim failures and execution errors', async () => {
		const poller = new JobPollerService('http://example.com', 'test-service') as any;
		poller.updateJobStatus = jest.fn();
		mockedAxios.post.mockResolvedValueOnce({ status: 500 } as any);

		await poller.executeJob({ id: 'job-11', agent_id: 1, test_id: 2 } as any);

		mockedAxios.post.mockRejectedValueOnce(new Error('boom'));
		await poller.executeJob({ id: 'job-12', agent_id: 1, test_id: 2 } as any);

		expect(poller.updateJobStatus).toHaveBeenCalledWith('job-12', JobStatus.FAILED, 0, undefined, 'boom');
	});

	it('handles invalid agent settings JSON', async () => {
		const poller = new JobPollerService('http://example.com', 'test-service') as any;
		poller.updateJobStatus = jest.fn();
		mockedAxios.post.mockResolvedValueOnce({ status: 200 } as any);
		mockedAxios.get.mockResolvedValueOnce({ data: { id: 1, settings: 'invalid-json' } } as any);

		await poller.executeJob({ id: 'job-13', agent_id: 1, test_id: 2 } as any);

		expect(poller.updateJobStatus).toHaveBeenCalledWith(
			'job-13',
			JobStatus.FAILED,
			0,
			undefined,
			expect.any(String)
		);
	});

	it('handles empty agent settings', async () => {
		const poller = new JobPollerService('http://example.com', 'test-service') as any;
		poller.updateJobStatus = jest.fn();
		mockedAxios.post.mockResolvedValueOnce({ status: 200 } as any);
		mockedAxios.get.mockResolvedValueOnce({ data: { id: 1, settings: '' } } as any);

		await poller.executeJob({ id: 'job-14', agent_id: 1, test_id: 2 } as any);

		expect(poller.updateJobStatus).toHaveBeenCalledWith(
			'job-14',
			JobStatus.FAILED,
			0,
			undefined,
			expect.any(String)
		);
	});

	it('handles conversation job errors', async () => {
		const poller = new JobPollerService('http://example.com', 'test-service') as any;
		poller.updateJobStatus = jest.fn();
		mockedAxios.get.mockResolvedValueOnce({ data: { id: 2, messages: [] } } as any);
		poller.getAgentConfig = jest.fn().mockResolvedValue({ templates: [], maps: [] });
		mockedApiService.executeConversation.mockRejectedValueOnce(new Error('fail'));

		await poller.executeConversationJob(
			{ id: 'job-15', agent_id: 1, conversation_id: 2 } as any,
			{ id: 1 } as any,
			{ api_endpoint: 'http://example.test' } as any
		);

		expect(poller.updateJobStatus).toHaveBeenCalledWith('job-15', JobStatus.FAILED, 0, undefined, 'fail');
	});

	it('handles legacy job errors and template fetch failures', async () => {
		const poller = new JobPollerService('http://example.com', 'test-service') as any;
		poller.updateJobStatus = jest.fn();
		const test: Test = { id: 6, input: 'hello', agent_id: 1 } as any;
		mockedAxios.get.mockResolvedValueOnce({ data: test } as any);
		poller.getAgentConfig = jest.fn().mockRejectedValue(new Error('no defaults'));
		mockedApiService.executeTest.mockRejectedValueOnce(new Error('fail'));

		await poller.executeLegacyTestJob(
			{ id: 'job-16', agent_id: 1, test_id: 6 } as any,
			{ id: 1 } as any,
			{ api_endpoint: 'http://example.test' } as any
		);

		expect(poller.updateJobStatus).toHaveBeenCalledWith('job-16', JobStatus.FAILED, 0, undefined, 'fail');
	});

	it('resolves scripts for non-user messages', () => {
		const poller = new JobPollerService('http://example.com', 'test-service') as any;
		const conversation = {
			variables: '{}',
			messages: [{ id: 1, role: 'system', content: 'sys', metadata: '{"note":"x"}' }]
		} as any;
		const script = poller.resolveConversationScript(conversation, { templates: [], maps: [] });

		expect(script[0].metadata).toEqual({ note: 'x' });
	});

	it('resolves scripts for user messages with overrides', () => {
		const poller = new JobPollerService('http://example.com', 'test-service') as any;
		const conversation = {
			id: 1,
			variables: '',
			default_request_template_id: 2,
			default_response_map_id: 3,
			messages: [
				{ id: 1, role: 'system', content: 'sys', metadata: { note: 'obj' } },
				{
					id: 2,
					role: 'user',
					content: 'first',
					request_template_id: 1,
					response_map_id: 1,
					set_variables: { ignored: true },
					metadata: { extra: true }
				},
				{
					id: 3,
					role: 'user',
					content: 'second',
					request_template_id: 99,
					response_map_id: 99,
					set_variables: '{"b":2}',
					metadata: '{"extra":"x"}'
				}
			]
		} as any;
		const agentConfig = {
			templates: [
				{ id: 1, body: 't1', capabilities: '{"name":"cap1"}' },
				{ id: 2, body: 't2' }
			],
			maps: [
				{ id: 1, spec: 'm1', capabilities: '{"name":"cap2"}' },
				{ id: 3, spec: 'm3' }
			],
			defaultTemplate: { id: 2, body: 't2' },
			defaultMap: { id: 3, spec: 'm3' }
		};

		const script = poller.resolveConversationScript(conversation, agentConfig as any);

		expect(script[1].metadata.request_template).toBe('t1');
		expect(script[2].metadata.response_mapping).toBe('m3');
	});

	it('uses defaults when only response mapping is missing', async () => {
		const poller = new JobPollerService('http://example.com', 'test-service') as any;
		poller.updateJobStatus = jest.fn();
		const test: Test = { id: 7, input: 'hello', agent_id: 1 } as any;
		mockedAxios.get
			.mockResolvedValueOnce({ data: test } as any)
			.mockResolvedValueOnce({ data: [{ id: 1, body: '{"input":"{{input}}"}', is_default: 1 }] } as any)
			.mockResolvedValueOnce({ data: [{ id: 2, spec: '{"output":"$.result"}', is_default: 1 }] } as any);
		mockedAxios.post.mockResolvedValueOnce({ data: { id: 99 } } as any);
		mockedApiService.executeTest.mockResolvedValue({
			output: 'ok',
			success: true,
			metrics: { input_tokens: 1, output_tokens: 1 }
		} as any);

		const job: Job = { id: 'job-17', agent_id: 1, test_id: 7, status: 'pending' } as any;
		const agent: Agent = { id: 1 } as any;
		const settings: AgentSettings = {
			api_endpoint: 'http://example.test',
			request_template: '{"input":"{{input}}"}'
		} as any;

		await poller.executeLegacyTestJob(job, agent, settings);

		expect(poller.updateJobStatus).toHaveBeenCalledWith(job.id, JobStatus.COMPLETED, 100, 99);
	});

	it('returns when no user messages in requirements validation', () => {
		const poller = new JobPollerService('http://example.com', 'test-service') as any;
		const conversation = {
			required_request_template_capabilities: '{"name":"req"}',
			required_response_map_capabilities: '{"name":"resp"}',
			messages: []
		} as any;

		expect(() => poller.validateConversationRequirements(conversation, [])).not.toThrow();
	});

	it('validates response capability requirements', () => {
		const poller = new JobPollerService('http://example.com', 'test-service') as any;
		const conversation = {
			required_request_template_capabilities: undefined,
			required_response_map_capabilities: '{"name":"response"}',
			messages: []
		} as any;
		const resolvedMessages = [{ role: 'user', metadata: { response_capabilities: { name: 'other' } } }];

		expect(() => poller.validateConversationRequirements(conversation, resolvedMessages)).toThrow(
			'Response map capabilities do not satisfy conversation requirements'
		);
	});

	it('saves session results and messages', async () => {
		const poller = new JobPollerService('http://example.com', 'test-service') as any;
		mockedAxios.post.mockResolvedValueOnce({ data: { id: 123 } } as any).mockResolvedValue({ data: {} } as any);

		const sessionId = await poller.saveSessionResults(1, 2, '2024-01-01T00:00:00Z', '2024-01-01T00:00:01Z', {
			success: true,
			metrics: { input_tokens: 1, output_tokens: 2 },
			intermediate_steps: [],
			transcript: [
				{ sequence: 1, role: 'user', content: 'hi', timestamp: 't1' },
				{ sequence: 2, role: 'assistant', content: 'ok', timestamp: 't2' }
			]
		} as any);

		expect(sessionId).toBe(123);
		expect(mockedAxios.post).toHaveBeenCalledWith(
			'http://example.com/api/sessions',
			expect.objectContaining({ conversation_id: 1, agent_id: 2 })
		);
	});

	it('handles update job status errors', async () => {
		const poller = new JobPollerService('http://example.com', 'test-service') as any;
		mockedAxios.put.mockRejectedValueOnce(new Error('fail'));

		await poller.updateJobStatus('job-8', JobStatus.FAILED, 0, undefined, 'err');

		expect(mockedAxios.put).toHaveBeenCalled();
	});
});
