import type {
	ConversationExecutionRequest,
	ConversationExecutionResponse,
	IntermediateStep,
	SessionMessage,
	TestExecutionRequest
} from '@ibm-vibe/types';
import { extractTokenUsage } from './token-extractor';

export interface ConversationExecutorDependencies {
	makeApiRequest: (
		endpoint: string,
		method: string,
		payload: any,
		headers?: Record<string, string>,
		apiKey?: string
	) => Promise<any>;
	processResponse: (
		responseData: any,
		request: TestExecutionRequest,
		steps: IntermediateStep[]
	) => { output: string; steps: IntermediateStep[]; success: boolean; extractedVariables?: Record<string, any> };
	parseScriptMetadata: (metadata: unknown) => Record<string, any>;
	resolvePointer: (pointer: string, context: Record<string, any>) => any;
	formatConversationRequestWithVars: (
		currentInput: string,
		conversationHistory: string,
		template: string,
		variables: Record<string, any>
	) => any;
	serializeMetadata: (metadata?: Record<string, unknown>) => string | undefined;
}

export async function executeConversationWithApi(
	request: ConversationExecutionRequest,
	deps: ConversationExecutorDependencies
): Promise<ConversationExecutionResponse> {
	const startTime = Date.now();
	const transcript: SessionMessage[] = [];
	const intermediateSteps: IntermediateStep[] = [];
	let totalInputTokens = 0;
	let totalOutputTokens = 0;
	let conversationSuccess = true;
	let accumulatedVariables: Record<string, any> = {};
	let lastRequestPayload: any = undefined;
	let lastResponseData: any = undefined;

	try {
		intermediateSteps.push({
			timestamp: new Date().toISOString(),
			action: 'Conversation started',
			output: `Starting conversation with ${request.conversation_script.length} scripted messages`
		});

		let conversationHistory = '';

		for (const scriptMessage of request.conversation_script) {
			if (scriptMessage.role === 'system') {
				transcript.push({
					sequence: transcript.length + 1,
					role: 'system',
					content: scriptMessage.content,
					timestamp: new Date().toISOString(),
					metadata: deps.serializeMetadata({ type: 'system_instruction' })
				});

				conversationHistory += `System: ${scriptMessage.content}\n`;
				continue;
			}

			if (scriptMessage.role === 'user') {
				const scriptMetadata = deps.parseScriptMetadata((scriptMessage as any)?.metadata);
				const effectiveTemplateForMessage = scriptMetadata.request_template || request.request_template;
				const effectiveResponseMappingForMessage = scriptMetadata.response_mapping || request.response_mapping;
				const scriptRequestCapabilities = scriptMetadata.request_capabilities;
				const scriptResponseCapabilities = scriptMetadata.response_capabilities;
				const templateIncludesHistory =
					typeof effectiveTemplateForMessage === 'string'
						? /{{\s*conversation_history\s*}}/.test(effectiveTemplateForMessage)
						: false;
				const historyIncludingCurrent = `${conversationHistory}User: ${scriptMessage.content}\n`;
				const currentInput = templateIncludesHistory ? scriptMessage.content : historyIncludingCurrent;

				const messageStartTime = Date.now();

				intermediateSteps.push({
					timestamp: new Date().toISOString(),
					action: `API call for message ${scriptMessage.sequence}`,
					output: `Processing user message: "${scriptMessage.content.substring(0, 50)}${scriptMessage.content.length > 50 ? '...' : ''}"`
				});

				try {
					const varsForMessage = scriptMetadata.variables || {};
					const pointerContext = {
						lastRequest: lastRequestPayload,
						lastResponse: lastResponseData,
						variables: accumulatedVariables,
						conversation: {
							id: request.conversation_id,
							history: conversationHistory,
							script: request.conversation_script
						},
						message: scriptMessage,
						request,
						transcript
					};
					const resolvedMessageVars: Record<string, any> = {};
					for (const [key, value] of Object.entries(varsForMessage)) {
						if (typeof value === 'string' && value.startsWith('$.')) {
							const resolved = deps.resolvePointer(value, pointerContext);
							if (resolved !== undefined) {
								resolvedMessageVars[key] = resolved;
							}
						} else {
							resolvedMessageVars[key] = value;
						}
					}
					const mergedVars = { ...accumulatedVariables, ...resolvedMessageVars };

					transcript.push({
						sequence: transcript.length + 1,
						role: 'user',
						content: scriptMessage.content,
						timestamp: new Date().toISOString(),
						metadata: deps.serializeMetadata({
							script_sequence: scriptMessage.sequence,
							variables_before: Object.keys(mergedVars).length ? mergedVars : undefined,
							request_capabilities: scriptRequestCapabilities
						})
					});

					conversationHistory += `User: ${scriptMessage.content}\n`;
					const requestPayload = effectiveTemplateForMessage
						? deps.formatConversationRequestWithVars(
								currentInput,
								conversationHistory,
								effectiveTemplateForMessage,
								mergedVars
							)
						: { input: currentInput };
					lastRequestPayload = requestPayload;

					const response = await deps.makeApiRequest(
						request.api_endpoint,
						request.http_method || 'POST',
						requestPayload,
						request.headers,
						request.api_key
					);
					lastResponseData = response.data;

					const messageExecutionTime = Date.now() - messageStartTime;

					const { output, steps, success, extractedVariables } = deps.processResponse(
						response.data,
						{
							...request,
							test_input: scriptMessage.content,
							test_id: request.conversation_id,
							response_mapping: effectiveResponseMappingForMessage || request.response_mapping
						} as TestExecutionRequest,
						[]
					);

					let nextVariables = { ...mergedVars };
					if (extractedVariables && Object.keys(extractedVariables).length > 0) {
						nextVariables = { ...nextVariables, ...extractedVariables };
					}
					accumulatedVariables = nextVariables;

					steps.forEach((step) => {
						intermediateSteps.push({
							...step,
							action: `Message ${scriptMessage.sequence}: ${step.action}`
						});
					});

					const { tokens } = extractTokenUsage(response.data, request.token_mapping);
					if (tokens.input_tokens) totalInputTokens += tokens.input_tokens;
					if (tokens.output_tokens) totalOutputTokens += tokens.output_tokens;

					transcript.push({
						sequence: transcript.length + 1,
						role: 'assistant',
						content: output,
						timestamp: new Date().toISOString(),
						metadata: deps.serializeMetadata({
							script_sequence: scriptMessage.sequence,
							execution_time_ms: messageExecutionTime,
							success,
							request_template_used: effectiveTemplateForMessage ? 'custom' : undefined,
							response_mapping_used: effectiveResponseMappingForMessage ? 'custom' : undefined,
							variables_before: Object.keys(mergedVars || {}).length ? mergedVars : undefined,
							variables_after: Object.keys(accumulatedVariables || {}).length
								? accumulatedVariables
								: undefined,
							input_tokens: tokens.input_tokens,
							output_tokens: tokens.output_tokens,
							request_capabilities: scriptRequestCapabilities,
							response_capabilities: scriptResponseCapabilities
						})
					});

					conversationHistory += `Assistant: ${output}\n`;

					if (!success) {
						conversationSuccess = false;
					}

					intermediateSteps.push({
						timestamp: new Date().toISOString(),
						action: `Message ${scriptMessage.sequence} Completed`,
						output: `Response received: "${output.substring(0, 100)}${output.length > 100 ? '...' : ''}"`
					});

					if (request.stop_on_failure && !success) {
						intermediateSteps.push({
							timestamp: new Date().toISOString(),
							action: 'Conversation stopped',
							output: `Stopped after message ${scriptMessage.sequence} due to failure condition`
						});
						break;
					}
				} catch (messageError: any) {
					const errorMessage = `Error in message ${scriptMessage.sequence}: ${messageError.message}`;

					intermediateSteps.push({
						timestamp: new Date().toISOString(),
						action: `Message ${scriptMessage.sequence} Error`,
						output: errorMessage
					});

					transcript.push({
						sequence: transcript.length + 1,
						role: 'assistant',
						content: `Error: ${messageError.message}`,
						timestamp: new Date().toISOString(),
						metadata: deps.serializeMetadata({
							script_sequence: scriptMessage.sequence,
							error: true,
							error_message: messageError.message
						})
					});

					conversationSuccess = false;

					if (request.stop_on_failure) {
						intermediateSteps.push({
							timestamp: new Date().toISOString(),
							action: 'Conversation stopped',
							output: `Stopped after message ${scriptMessage.sequence} due to error`
						});
						break;
					}
				}
			}
		}

		const totalExecutionTime = Date.now() - startTime;

		intermediateSteps.push({
			timestamp: new Date().toISOString(),
			action: 'Conversation completed',
			output: `Conversation completed with ${transcript.length} messages. Success: ${conversationSuccess}`
		});

		return {
			conversation_id: request.conversation_id,
			transcript,
			success: conversationSuccess,
			execution_time: totalExecutionTime,
			intermediate_steps: intermediateSteps,
			variables: accumulatedVariables,
			metrics: {
				execution_time: totalExecutionTime,
				input_tokens: totalInputTokens,
				output_tokens: totalOutputTokens
			}
		};
	} catch (error: any) {
		const totalExecutionTime = Date.now() - startTime;

		intermediateSteps.push({
			timestamp: new Date().toISOString(),
			action: 'Conversation error',
			output: `Conversation failed: ${error.message}`
		});

		return {
			conversation_id: request.conversation_id,
			transcript,
			success: false,
			execution_time: totalExecutionTime,
			intermediate_steps: intermediateSteps,
			variables: accumulatedVariables,
			metrics: {
				execution_time: totalExecutionTime,
				input_tokens: totalInputTokens,
				output_tokens: totalOutputTokens
			}
		};
	}
}
