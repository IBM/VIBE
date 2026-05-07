import axios, { AxiosRequestConfig } from 'axios';
import {
	TestExecutionRequest,
	TestExecutionResponse,
	ConversationExecutionRequest,
	ConversationExecutionResponse,
	IntermediateStep
} from '@ibm-vibe/types';
import { DEFAULT_TIMEOUT } from '../config';
import { extractTokenUsage } from './token-extractor';
import {
	escapeForJsonTemplate as escapeTemplateValue,
	formatConversationRequestWithVars as formatConversationRequestWithTemplateVars,
	formatRequest as formatRequestPayload
} from './api-service-formatters';
import { ApiServiceResponseProcessor } from './api-service-response-processor';
import { executeConversationWithApi } from './api-service-conversation-executor';

export const serializeMetadata = (metadata?: Record<string, unknown>): string | undefined => {
	if (!metadata) {
		return undefined;
	}

	const entries = Object.entries(metadata).filter(([, value]) => value !== undefined && value !== null);
	if (!entries.length) {
		return undefined;
	}

	return JSON.stringify(Object.fromEntries(entries));
};

/**
 * Service for executing tests via external APIs.
 * This service handles communication with external AI APIs, including request formatting,
 * response processing, and result validation. It supports template-based requests,
 * configurable response mapping, and various success criteria.
 */
export class ApiService {
	private readonly responseProcessor = new ApiServiceResponseProcessor();

	private parseScriptMetadata(metadata: unknown): Record<string, any> {
		return this.responseProcessor.parseScriptMetadata(metadata);
	}

	/**
	 * Executes a test using an external API.
	 *
	 * @param request - The test execution request containing API configuration and test input
	 * @returns Promise<TestExecutionResponse> - The test execution result including output, success status, and metrics
	 *
	 * @description
	 * This method:
	 * 1. Formats the request using templates if provided
	 * 2. Sets up headers including authentication
	 * 3. Makes the API call with configured timeout
	 * 4. Logs intermediate steps
	 * 5. Processes the response
	 * 6. Returns formatted results with execution metrics
	 *
	 * The method includes comprehensive error handling and timing of the execution.
	 */
	async executeTest(request: TestExecutionRequest): Promise<TestExecutionResponse> {
		// Start timing execution
		const startTime = Date.now();

		try {
			// Format request using the template if provided
			const requestPayload = request.request_template
				? this.formatRequest(request.test_input, request.request_template)
				: { input: request.test_input };

			// Log the API call as an intermediate step
			const intermediateSteps: IntermediateStep[] = [
				{
					timestamp: new Date().toISOString(),
					action: 'API Call Initiated',
					output: `Calling ${request.api_endpoint}`
				}
			];

			// Make the API request
			const response = await this.makeApiRequest(
				request.api_endpoint,
				request.http_method || 'POST',
				requestPayload,
				request.headers,
				request.api_key
			);

			// Log the API response
			intermediateSteps.push({
				timestamp: new Date().toISOString(),
				action: 'API Response Received',
				output: 'Response received from external API'
			});

			// End timing
			const executionTime = Date.now() - startTime;

			// Process the response
			const { output, steps, success } = this.processResponse(response.data, request, intermediateSteps);

			// Extract token usage from response
			const { tokens, metadata } = extractTokenUsage(response.data, request.token_mapping);

			// Add token extraction step if we found tokens
			if (tokens.input_tokens !== undefined || tokens.output_tokens !== undefined) {
				steps.push({
					timestamp: new Date().toISOString(),
					action: 'Token usage extracted',
					output: `Input: ${tokens.input_tokens || 0}, Output: ${tokens.output_tokens || 0}, Method: ${metadata.extraction_method}`
				});
			}

			// Return formatted response
			return {
				test_id: request.test_id,
				output,
				success,
				execution_time: executionTime,
				intermediate_steps: steps,
				metrics: {
					execution_time: executionTime,
					input_tokens: tokens.input_tokens,
					output_tokens: tokens.output_tokens
				}
			};
		} catch (error: any) {
			// End timing for error case
			const executionTime = Date.now() - startTime;

			// Create error steps
			const errorSteps: IntermediateStep[] = [
				{
					timestamp: new Date().toISOString(),
					action: 'Error',
					output: `API call failed: ${error.message}`
				}
			];

			// Return error response
			return {
				test_id: request.test_id,
				output: `Error: ${error.message}`,
				success: false,
				execution_time: executionTime,
				intermediate_steps: errorSteps,
				metrics: {
					execution_time: executionTime,
					input_tokens: undefined,
					output_tokens: undefined
				}
			};
		}
	}

	/**
	 * Escapes a string value for safe JSON insertion into a template.
	 * Removes surrounding quotes from JSON.stringify output for embedding in strings.
	 *
	 * @param value - The value to escape
	 * @returns Escaped string without surrounding quotes
	 */
	public escapeForJsonTemplate(value: string): string {
		return escapeTemplateValue(value);
	}

	/**
	 * Formats the request payload using a template.
	 *
	 * @param input - The test input string to be formatted
	 * @param template - The template string containing placeholders
	 * @returns any - The formatted request payload as a JSON object
	 *
	 * @description
	 * This method:
	 * 1. Properly escapes the input for JSON insertion
	 * 2. Replaces {{input}} placeholders in the template with the escaped input
	 * 3. Parses the resulting string as JSON
	 * 4. Falls back to a simple {input: input} object if parsing fails
	 *
	 * The template should be a valid JSON string with {{input}} placeholders.
	 */
	private formatRequest(input: string, template: string): any {
		return formatRequestPayload(input, template);
	}

	/**
	 * Processes the API response and determines test success.
	 *
	 * @param responseData - The raw response data from the API
	 * @param request - The original test execution request
	 * @param steps - Array of intermediate steps to be updated
	 * @returns { output: string, steps: IntermediateStep[], success: boolean } - Processed response data
	 *
	 * @description
	 * This method:
	 * 1. Extracts output based on response mapping configuration
	 * 2. Processes intermediate steps if available in the response
	 * 3. Determines test success based on configurable criteria
	 * 4. Supports multiple success criteria types:
	 *    - contains: Checks if output contains a specific value
	 *    - exact_match: Checks for exact string matching
	 *    - json_match: Compares specific JSON paths with operators
	 * 5. Adds processing completion step to the steps array
	 */
	private processResponse(
		responseData: any,
		request: TestExecutionRequest,
		steps: IntermediateStep[]
	): { output: string; steps: IntermediateStep[]; success: boolean; extractedVariables?: Record<string, any> } {
		return this.responseProcessor.processResponse(responseData, request, steps);
	}

	/**
	 * Tokenizes a path string into an array of property names and array indices.
	 * Supports dot notation (a.b.c) and bracket notation (a[0]['key']).
	 *
	 * @param path - Path string (e.g., "data.items[0].name" or "choices.0.message.content")
	 * @returns Array of tokens (strings or numbers) representing the path segments
	 */
	public tokenizePath(path: string): (string | number)[] {
		return this.responseProcessor.tokenizePath(path);
	}

	/**
	 * Traverses an object using an array of tokens to extract a nested value.
	 *
	 * @param obj - The source object to traverse
	 * @param tokens - Array of property names and indices
	 * @returns The extracted value or undefined if not found
	 */
	public traverseByTokens(obj: any, tokens: (string | number)[]): any {
		return this.responseProcessor.traverseByTokens(obj, tokens);
	}

	/**
	 * Extracts a value from an object using dot/bracket notation path.
	 *
	 * @param obj - The source object to extract from
	 * @param path - Path (e.g., "data.items[0].name" or "choices.0.message.content")
	 * @returns any - The extracted value or undefined if not found
	 *
	 * @description
	 * This method:
	 * 1. Parses the path into tokens supporting '.' and '[idx]' access
	 * 2. Traverses the object following the tokens
	 * 3. Returns undefined if any part of the path is not found
	 * 4. Handles nested object traversal safely
	 */
	public extractByPath(obj: any, path: string): any {
		try {
			if (!path || typeof path !== 'string') return undefined;
			const tokens = this.tokenizePath(path);
			return this.traverseByTokens(obj, tokens);
		} catch {
			return undefined;
		}
	}

	/**
	 * Makes an HTTP request to an external API with proper headers, authentication, and method handling.
	 *
	 * @param endpoint - The API endpoint URL
	 * @param method - HTTP method (GET, POST, PUT, PATCH, DELETE)
	 * @param payload - Request payload data
	 * @param headers - Additional headers to include
	 * @param apiKey - Optional API key for authentication
	 * @returns Promise with the axios response
	 */
	private async makeApiRequest(
		endpoint: string,
		method: string,
		payload: any,
		headers?: Record<string, string>,
		apiKey?: string
	): Promise<any> {
		const requestHeaders = {
			'Content-Type': 'application/json',
			...headers,
			...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {})
		};

		const config: AxiosRequestConfig = {
			headers: requestHeaders,
			timeout: DEFAULT_TIMEOUT
		};

		const httpMethod = method || 'POST';

		if (httpMethod === 'GET') {
			const url = new URL(endpoint);
			Object.entries(payload).forEach(([key, value]) => {
				url.searchParams.append(key, String(value));
			});
			return await axios.get(url.toString(), config);
		} else {
			return await axios({
				method: httpMethod.toLowerCase(),
				url: endpoint,
				data: payload,
				...config
			});
		}
	}

	/**
	 * Compares two values using the specified operator.
	 *
	 * @param left - The left-hand value to compare
	 * @param operator - The comparison operator to use
	 * @param right - The right-hand value to compare against
	 * @returns boolean - The result of the comparison
	 *
	 * @description
	 * Supported operators:
	 * - == : Loose equality
	 * - === : Strict equality
	 * - != : Loose inequality
	 * - !== : Strict inequality
	 * - > : Greater than
	 * - >= : Greater than or equal
	 * - < : Less than
	 * - <= : Less than or equal
	 */
	public compareValues(left: any, operator: string, right: any): boolean {
		return this.responseProcessor.compareValues(left, operator, right);
	}

	/**
	 * Resolves a pointer expression (e.g. "$.lastResponse.id") against a context object.
	 */
	private resolvePointer(pointer: string, context: Record<string, any>): any {
		try {
			if (typeof pointer !== 'string' || !pointer.startsWith('$.')) {
				return pointer;
			}

			const path = pointer.slice(2);
			const tokens = this.tokenizePath(path);

			return this.traverseByTokens(context, tokens);
		} catch {
			return undefined;
		}
	}

	/**
	 * Executes a conversation using an external API.
	 *
	 * @param request - The conversation execution request containing API configuration and conversation script
	 * @returns Promise<ConversationExecutionResponse> - The conversation execution result including transcript and metrics
	 *
	 * @description
	 * This method:
	 * 1. Iterates through the conversation script messages
	 * 2. For each user message, makes an API call and captures the response
	 * 3. Builds a full transcript of the conversation
	 * 4. Returns the complete conversation history with timing and token usage
	 */
	async executeConversation(request: ConversationExecutionRequest): Promise<ConversationExecutionResponse> {
		return executeConversationWithApi(request, {
			makeApiRequest: this.makeApiRequest.bind(this),
			processResponse: this.processResponse.bind(this),
			parseScriptMetadata: this.parseScriptMetadata.bind(this),
			resolvePointer: this.resolvePointer.bind(this),
			formatConversationRequestWithVars: this.formatConversationRequestWithVars.bind(this),
			serializeMetadata
		});
	}

	/**
	 * Formats a conversation request with variables, supporting {{input}}, {{conversation_history}}, and {{var}} placeholders.
	 * Variables are injected as strings unless the template author places the placeholder without quotes to embed JSON.
	 */
	private formatConversationRequestWithVars(
		currentInput: string,
		conversationHistory: string,
		template: string,
		variables: Record<string, any>
	): any {
		return formatConversationRequestWithTemplateVars(currentInput, conversationHistory, template, variables);
	}

	/**
	 * Performs a health check on the service.
	 *
	 * @returns Promise<boolean> - Always returns true as this is a stateless service
	 *
	 * @description
	 * This method is used to verify the service is operational.
	 * As this is a stateless service that makes external API calls,
	 * it simply returns true to indicate it's ready to process requests.
	 */
	async healthCheck(): Promise<boolean> {
		return true; // This service doesn't need a health check as it's stateless
	}
}

// Export a singleton instance
export const apiService = new ApiService();
