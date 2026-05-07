import axios from 'axios';
import { LLMConfig } from '@ibm-vibe/types';

export interface LLMRequestOptions {
	prompt: string;
	max_tokens?: number;
	temperature?: number;
	stop?: string[];
}

export interface LLMResponse {
	text: string;
	provider: string;
	model: string;
	config_id: number;
	error?: string;
}
import { getLLMConfigs, getLLMConfigById } from '../db/queries';

const shouldLog = process.env.NODE_ENV !== 'test';
const logError = (...args: unknown[]) => {
	/* istanbul ignore next */
	if (shouldLog) console.error(...args);
};

/**
 * Service for managing LLM configs and making LLM requests
 */
export class LLMConfigService {
	/**
	 * Get all LLM configs in priority order
	 */
	getConfigs(): LLMConfig[] {
		return getLLMConfigs();
	}

	/**
	 * Get a specific LLM config by ID
	 */
	getConfigById(id: number): LLMConfig {
		return getLLMConfigById(id);
	}

	/**
	 * Call a specific LLM config by ID
	 */
	async callLLM(configId: number, options: LLMRequestOptions): Promise<LLMResponse> {
		const config = this.getConfigById(configId);
		if (!config) {
			throw new Error(`LLM config with ID ${configId} not found`);
		}

		try {
			return await this.makeLLMRequest(config, options);
		} catch (error: any) {
			return {
				text: '',
				provider: config.provider,
				model: JSON.parse(config.config).model || 'unknown',
				config_id: config.id || 0,
				error: error.message || 'Unknown error'
			};
		}
	}

	/**
	 * Call LLMs in priority order until one succeeds
	 */
	async callLLMWithFallback(options: LLMRequestOptions): Promise<LLMResponse> {
		const configs = this.getConfigs();

		if (configs.length === 0) {
			throw new Error('No LLM configs available');
		}

		// Try each config in priority order
		const errors: string[] = [];

		for (const config of configs) {
			try {
				return await this.makeLLMRequest(config, options);
			} catch (error: any) {
				errors.push(`${config.provider} (${config.id}): ${error.message}`);
			}
		}

		throw new Error(`All LLM requests failed: ${errors.join('; ')}`);
	}

	/**
	 * Make a request to a specific LLM provider based on config
	 */
	private async makeLLMRequest(config: LLMConfig, options: LLMRequestOptions): Promise<LLMResponse> {
		const configData = JSON.parse(config.config);

		switch (config.provider.toLowerCase()) {
			case 'ollama':
				return this.callOllama(configData, options);
			case 'openai':
				return this.callOpenAI(configData, options);
			case 'anthropic':
				return this.callAnthropic(configData, options);
			case 'watsonx':
				return this.callWatsonx(configData, options);
			default:
				throw new Error(`Unsupported LLM provider: ${config.provider}`);
		}
	}

	/**
	 * Call Ollama API
	 */
	private async callOllama(configData: any, options: LLMRequestOptions): Promise<LLMResponse> {
		const baseUrl = configData.base_url || 'http://localhost:11434';
		const model = configData.model || 'llama2';

		try {
			const response = await axios.post(`${baseUrl}/api/generate`, {
				model,
				prompt: options.prompt,
				stream: false,
				options: {
					temperature: options.temperature || 0.7,
					num_predict: options.max_tokens || 1000,
					stop: options.stop || []
				}
			});

			return {
				text: response.data.response,
				provider: 'ollama',
				model,
				config_id: configData.id || 0
			};
		} catch (error: any) {
			logError('Ollama request failed:', error.message);
			throw new Error(`Ollama request failed: ${error.message}`);
		}
	}

	/**
	 * Call OpenAI API
	 */
	private async callOpenAI(configData: any, options: LLMRequestOptions): Promise<LLMResponse> {
		const apiKey = configData.api_key;
		if (!apiKey) {
			throw new Error('OpenAI API key is required');
		}

		const model = configData.model || 'gpt-4o';
		const baseUrl = configData.base_url || 'https://api.openai.com/v1';

		try {
			const response = await axios.post(
				`${baseUrl}/chat/completions`,
				{
					model,
					messages: [{ role: 'user', content: options.prompt }],
					max_tokens: options.max_tokens,
					temperature: options.temperature,
					stop: options.stop
				},
				{
					headers: {
						'Content-Type': 'application/json',
						Authorization: `Bearer ${apiKey}`
					}
				}
			);

			return {
				text: response.data.choices[0].message.content,
				provider: 'openai',
				model,
				config_id: configData.id || 0
			};
		} catch (error: any) {
			logError('OpenAI request failed:', error.message);
			throw new Error(`OpenAI request failed: ${error.message}`);
		}
	}

	/**
	 * Call Anthropic API
	 */
	private async callAnthropic(configData: any, options: LLMRequestOptions): Promise<LLMResponse> {
		const apiKey = configData.api_key;
		if (!apiKey) {
			throw new Error('Anthropic API key is required');
		}

		const model = configData.model || 'claude-3-5-sonnet-20240620';
		const baseUrl = configData.base_url || 'https://api.anthropic.com/v1';

		try {
			const response = await axios.post(
				`${baseUrl}/messages`,
				{
					model,
					messages: [{ role: 'user', content: options.prompt }],
					max_tokens: options.max_tokens || 1000,
					temperature: options.temperature || 0.7,
					stop_sequences: options.stop || []
				},
				{
					headers: {
						'Content-Type': 'application/json',
						'x-api-key': apiKey,
						'anthropic-version': '2023-06-01'
					}
				}
			);

			return {
				text: response.data.content[0].text,
				provider: 'anthropic',
				model,
				config_id: configData.id || 0
			};
		} catch (error: any) {
			logError('Anthropic request failed:', error.message);
			throw new Error(`Anthropic request failed: ${error.message}`);
		}
	}

	/**
	 * Call watsonx API
	 */
	private async callWatsonx(configData: any, options: LLMRequestOptions): Promise<LLMResponse> {
		const apiKey = configData.api_key;
		const projectId = configData.project_id;

		if (!apiKey) {
			throw new Error('watsonx API key is required');
		}
		if (!projectId) {
			throw new Error('watsonx project ID is required');
		}

		const model = configData.model || 'ibm/granite-13b-instruct-v2';
		const baseUrl = configData.base_url || 'https://us-south.ml.cloud.ibm.com';

		try {
			const tokenParams = new URLSearchParams();
			tokenParams.append('grant_type', 'urn:ibm:params:oauth:grant-type:apikey');
			tokenParams.append('apikey', apiKey);

			const tokenResponse = await axios.post('https://iam.cloud.ibm.com/identity/token', tokenParams, {
				headers: {
					'Content-Type': 'application/x-www-form-urlencoded',
					Accept: 'application/json'
				}
			});

			const accessToken = tokenResponse.data.access_token;

			const response = await axios.post(
				`${baseUrl}/ml/v1/text/generation?version=2023-05-29`,
				{
					input: options.prompt,
					model_id: model,
					project_id: projectId,
					parameters: {
						decoding_method: 'greedy',
						max_new_tokens: options.max_tokens || 1000,
						temperature: options.temperature || 0.7,
						stop_sequences: options.stop || []
					}
				},
				{
					headers: {
						'Content-Type': 'application/json',
						Authorization: `Bearer ${accessToken}`,
						Accept: 'application/json'
					}
				}
			);

			return {
				text: response.data.results[0].generated_text,
				provider: 'watsonx',
				model,
				config_id: configData.id || 0
			};
		} catch (error: any) {
			logError('watsonx request failed:', error.message);
			throw new Error(`watsonx request failed: ${error.message}`);
		}
	}
}

// Export a singleton instance
export const llmConfigService = new LLMConfigService();
