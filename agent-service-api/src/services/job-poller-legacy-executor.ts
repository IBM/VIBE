import axios from 'axios';
import {
	Agent,
	AgentSettings,
	Job,
	JobStatus,
	Test,
	TestExecutionRequest,
	TestExecutionResponse
} from '@ibm-vibe/types';
import type { AgentConfig } from './conversation-script-resolver';

export interface LegacyJobExecutorContext {
	backendUrl: string;
	job: Job;
	agent: Agent;
	settings: AgentSettings;
	getAgentConfig: (agentId: number) => Promise<AgentConfig>;
	executeTest: (request: TestExecutionRequest) => Promise<TestExecutionResponse>;
	updateJobStatus: (
		jobId: string,
		status: JobStatus,
		progress: number,
		resultId?: number,
		error?: string,
		sessionId?: number
	) => Promise<void>;
	logWarn: (...args: unknown[]) => void;
	logError: (...args: unknown[]) => void;
	getErrorMessage: (error: unknown) => string;
}

export async function executeLegacyTestJobWithApi(context: LegacyJobExecutorContext): Promise<void> {
	const {
		backendUrl,
		job,
		agent,
		settings,
		getAgentConfig,
		executeTest,
		updateJobStatus,
		logWarn,
		logError,
		getErrorMessage
	} = context;

	try {
		const testResponse = await axios.get<Test>(`${backendUrl}/api/tests/${job.test_id}`);
		const test: Test = testResponse.data;

		let requestTemplate = settings.request_template;
		let responseMapping = settings.response_mapping;

		if (!requestTemplate || !responseMapping) {
			try {
				const agentConfig = await getAgentConfig(job.agent_id);

				if (!requestTemplate) {
					requestTemplate = agentConfig.defaultTemplate?.body;
				}

				if (!responseMapping) {
					responseMapping = agentConfig.defaultMap?.spec;
				}
			} catch (err) {
				logWarn(`Failed to fetch default template/map for legacy test ${job.test_id}:`, err);
			}
		}

		const executionRequest: TestExecutionRequest = {
			test_id: test.id!,
			test_input: test.input,
			api_endpoint: settings.api_endpoint,
			http_method: settings.http_method,
			headers: settings.headers,
			api_key: settings.api_key,
			request_template: requestTemplate,
			response_mapping: responseMapping,
			token_mapping: settings.token_mapping
		};

		await updateJobStatus(job.id, JobStatus.RUNNING, 30);

		const result = await executeTest(executionRequest);

		await updateJobStatus(job.id, JobStatus.RUNNING, 80);

		const resultResponse = await axios.post(`${backendUrl}/api/results`, {
			test_id: test.id!,
			agent_id: agent.id!,
			output: result.output,
			success: result.success,
			execution_time: result.execution_time,
			intermediate_steps: result.intermediate_steps,
			input_tokens: result.metrics.input_tokens,
			output_tokens: result.metrics.output_tokens,
			token_mapping_metadata: JSON.stringify({
				extraction_method:
					result.metrics.input_tokens || result.metrics.output_tokens ? 'external_api' : 'none',
				agent_type: 'external_api'
			}),
			metrics: result.metrics
		});

		const savedResult = resultResponse.data;

		await updateJobStatus(job.id, JobStatus.COMPLETED, 100, savedResult.id);
	} catch (error: unknown) {
		const errorMessage = getErrorMessage(error);
		logError(`Error executing legacy test job ${job.id}:`, errorMessage);
		await updateJobStatus(job.id, JobStatus.FAILED, 0, undefined, errorMessage);
	}
}
