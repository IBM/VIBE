import { LLMConfigService } from '../llm-config-service';
import * as dbQueries from '../../db/queries';
import axios from 'axios';

// Mock dependencies
jest.mock('../../db/queries');
jest.mock('axios');

describe('LLMConfigService', () => {
	let service: LLMConfigService;
	const mockedAxios = axios as jest.Mocked<typeof axios>;

	beforeEach(() => {
		jest.clearAllMocks();
		service = new LLMConfigService();
	});

	describe('getConfigs', () => {
		it('should return all LLM configs', () => {
			const mockConfigs = [
				{ id: 1, provider: 'openai', config: '{"model":"gpt-4"}', priority: 1 },
				{ id: 2, provider: 'ollama', config: '{"model":"llama2"}', priority: 2 }
			];
			(dbQueries.getLLMConfigs as jest.Mock).mockReturnValue(mockConfigs);

			const result = service.getConfigs();

			expect(result).toEqual(mockConfigs);
			expect(dbQueries.getLLMConfigs).toHaveBeenCalled();
		});
	});

	describe('getConfigById', () => {
		it('should return a specific LLM config', () => {
			const mockConfig = { id: 1, provider: 'openai', config: '{"model":"gpt-4"}', priority: 1 };
			(dbQueries.getLLMConfigById as jest.Mock).mockReturnValue(mockConfig);

			const result = service.getConfigById(1);

			expect(result).toEqual(mockConfig);
			expect(dbQueries.getLLMConfigById).toHaveBeenCalledWith(1);
		});
	});

	describe('callLLM', () => {
		it('should successfully call LLM with valid config', async () => {
			const mockConfig = {
				id: 1,
				provider: 'ollama',
				config: JSON.stringify({ model: 'llama2', base_url: 'http://localhost:11434' }),
				priority: 1
			};
			(dbQueries.getLLMConfigById as jest.Mock).mockReturnValue(mockConfig);
			mockedAxios.post.mockResolvedValue({
				data: { response: 'Test response' }
			});

			const result = await service.callLLM(1, { prompt: 'Test prompt' });

			expect(result.text).toBe('Test response');
			expect(result.provider).toBe('ollama');
			expect(result.model).toBe('llama2');
		});

		it('should throw error when config not found', async () => {
			(dbQueries.getLLMConfigById as jest.Mock).mockReturnValue(null);

			await expect(service.callLLM(999, { prompt: 'Test' })).rejects.toThrow('LLM config with ID 999 not found');
		});

		it('should return error response when LLM request fails', async () => {
			const mockConfig = {
				id: 1,
				provider: 'ollama',
				config: JSON.stringify({ model: 'llama2' }),
				priority: 1
			};
			(dbQueries.getLLMConfigById as jest.Mock).mockReturnValue(mockConfig);
			mockedAxios.post.mockRejectedValue(new Error('Network error'));

			const result = await service.callLLM(1, { prompt: 'Test' });

			expect(result.text).toBe('');
			expect(result.error).toContain('Network error');
			expect(result.provider).toBe('ollama');
		});
	});

	describe('callLLMWithFallback', () => {
		it('should try configs in priority order until one succeeds', async () => {
			const mockConfigs = [
				{ id: 1, provider: 'ollama', config: '{"model":"llama2"}', priority: 1 },
				{ id: 2, provider: 'openai', config: '{"model":"gpt-4","api_key":"test"}', priority: 2 }
			];
			(dbQueries.getLLMConfigs as jest.Mock).mockReturnValue(mockConfigs);

			// First call fails, second succeeds
			mockedAxios.post.mockRejectedValueOnce(new Error('Ollama failed')).mockResolvedValueOnce({
				data: { choices: [{ message: { content: 'OpenAI response' } }] }
			});

			const result = await service.callLLMWithFallback({ prompt: 'Test' });

			expect(result.text).toBe('OpenAI response');
			expect(result.provider).toBe('openai');
			expect(mockedAxios.post).toHaveBeenCalledTimes(2);
		});

		it('should throw error when no configs available', async () => {
			(dbQueries.getLLMConfigs as jest.Mock).mockReturnValue([]);

			await expect(service.callLLMWithFallback({ prompt: 'Test' })).rejects.toThrow('No LLM configs available');
		});

		it('should throw error when all configs fail', async () => {
			const mockConfigs = [{ id: 1, provider: 'ollama', config: '{"model":"llama2"}', priority: 1 }];
			(dbQueries.getLLMConfigs as jest.Mock).mockReturnValue(mockConfigs);
			mockedAxios.post.mockRejectedValue(new Error('Connection failed'));

			await expect(service.callLLMWithFallback({ prompt: 'Test' })).rejects.toThrow('All LLM requests failed');
		});
	});

	describe('Ollama provider', () => {
		it('should call Ollama API with correct parameters', async () => {
			const mockConfig = {
				id: 1,
				provider: 'ollama',
				config: JSON.stringify({ model: 'llama2', base_url: 'http://localhost:11434' }),
				priority: 1
			};
			(dbQueries.getLLMConfigById as jest.Mock).mockReturnValue(mockConfig);
			mockedAxios.post.mockResolvedValue({
				data: { response: 'Ollama response' }
			});

			await service.callLLM(1, {
				prompt: 'Test prompt',
				max_tokens: 500,
				temperature: 0.8,
				stop: ['END']
			});

			expect(mockedAxios.post).toHaveBeenCalledWith(
				'http://localhost:11434/api/generate',
				expect.objectContaining({
					model: 'llama2',
					prompt: 'Test prompt',
					stream: false,
					options: {
						temperature: 0.8,
						num_predict: 500,
						stop: ['END']
					}
				})
			);
		});

		it('should use default values when not provided', async () => {
			const mockConfig = {
				id: 1,
				provider: 'ollama',
				config: '{}',
				priority: 1
			};
			(dbQueries.getLLMConfigById as jest.Mock).mockReturnValue(mockConfig);
			mockedAxios.post.mockResolvedValue({
				data: { response: 'Response' }
			});

			await service.callLLM(1, { prompt: 'Test' });

			expect(mockedAxios.post).toHaveBeenCalledWith(
				'http://localhost:11434/api/generate',
				expect.objectContaining({
					model: 'llama2',
					options: expect.objectContaining({
						temperature: 0.7,
						num_predict: 1000
					})
				})
			);
		});
	});

	describe('OpenAI provider', () => {
		it('should call OpenAI API with correct parameters', async () => {
			const mockConfig = {
				id: 1,
				provider: 'openai',
				config: JSON.stringify({
					model: 'gpt-4',
					api_key: 'test-key',
					base_url: 'https://api.openai.com/v1'
				}),
				priority: 1
			};
			(dbQueries.getLLMConfigById as jest.Mock).mockReturnValue(mockConfig);
			mockedAxios.post.mockResolvedValue({
				data: { choices: [{ message: { content: 'OpenAI response' } }] }
			});

			await service.callLLM(1, {
				prompt: 'Test prompt',
				max_tokens: 100,
				temperature: 0.5
			});

			expect(mockedAxios.post).toHaveBeenCalledWith(
				'https://api.openai.com/v1/chat/completions',
				{
					model: 'gpt-4',
					messages: [{ role: 'user', content: 'Test prompt' }],
					max_tokens: 100,
					temperature: 0.5,
					stop: undefined
				},
				{
					headers: {
						'Content-Type': 'application/json',
						Authorization: 'Bearer test-key'
					}
				}
			);
		});

		it('should throw error when API key is missing', async () => {
			const mockConfig = {
				id: 1,
				provider: 'openai',
				config: JSON.stringify({ model: 'gpt-4' }),
				priority: 1
			};
			(dbQueries.getLLMConfigById as jest.Mock).mockReturnValue(mockConfig);

			const result = await service.callLLM(1, { prompt: 'Test' });

			expect(result.error).toContain('OpenAI API key is required');
		});
	});

	describe('Anthropic provider', () => {
		it('should call Anthropic API with correct parameters', async () => {
			const mockConfig = {
				id: 1,
				provider: 'anthropic',
				config: JSON.stringify({
					model: 'claude-3-5-sonnet-20240620',
					api_key: 'test-key'
				}),
				priority: 1
			};
			(dbQueries.getLLMConfigById as jest.Mock).mockReturnValue(mockConfig);
			mockedAxios.post.mockResolvedValue({
				data: { content: [{ text: 'Claude response' }] }
			});

			await service.callLLM(1, { prompt: 'Test prompt' });

			expect(mockedAxios.post).toHaveBeenCalledWith(
				'https://api.anthropic.com/v1/messages',
				{
					model: 'claude-3-5-sonnet-20240620',
					messages: [{ role: 'user', content: 'Test prompt' }],
					max_tokens: 1000,
					temperature: 0.7,
					stop_sequences: []
				},
				{
					headers: {
						'Content-Type': 'application/json',
						'x-api-key': 'test-key',
						'anthropic-version': '2023-06-01'
					}
				}
			);
		});

		it('should throw error when API key is missing', async () => {
			const mockConfig = {
				id: 1,
				provider: 'anthropic',
				config: JSON.stringify({ model: 'claude-3' }),
				priority: 1
			};
			(dbQueries.getLLMConfigById as jest.Mock).mockReturnValue(mockConfig);

			const result = await service.callLLM(1, { prompt: 'Test' });

			expect(result.error).toContain('Anthropic API key is required');
		});
	});

	describe('Watsonx provider', () => {
		it('should call watsonx API with correct parameters', async () => {
			const mockConfig = {
				id: 1,
				provider: 'watsonx',
				config: JSON.stringify({
					model: 'ibm/granite-13b-instruct-v2',
					api_key: 'test-key',
					project_id: 'test-project'
				}),
				priority: 1
			};
			(dbQueries.getLLMConfigById as jest.Mock).mockReturnValue(mockConfig);

			// Mock token request
			mockedAxios.post
				.mockResolvedValueOnce({
					data: { access_token: 'test-token' }
				})
				// Mock generation request
				.mockResolvedValueOnce({
					data: { results: [{ generated_text: 'Watsonx response' }] }
				});

			const result = await service.callLLM(1, { prompt: 'Test prompt' });

			expect(result.text).toBe('Watsonx response');
			expect(mockedAxios.post).toHaveBeenCalledTimes(2);

			// Check token request
			expect(mockedAxios.post).toHaveBeenNthCalledWith(
				1,
				'https://iam.cloud.ibm.com/identity/token',
				expect.any(URLSearchParams),
				expect.objectContaining({
					headers: expect.objectContaining({
						'Content-Type': 'application/x-www-form-urlencoded'
					})
				})
			);

			// Check generation request
			expect(mockedAxios.post).toHaveBeenNthCalledWith(
				2,
				'https://us-south.ml.cloud.ibm.com/ml/v1/text/generation?version=2023-05-29',
				expect.objectContaining({
					input: 'Test prompt',
					model_id: 'ibm/granite-13b-instruct-v2',
					project_id: 'test-project'
				}),
				expect.objectContaining({
					headers: expect.objectContaining({
						Authorization: 'Bearer test-token'
					})
				})
			);
		});

		it('should throw error when API key is missing', async () => {
			const mockConfig = {
				id: 1,
				provider: 'watsonx',
				config: JSON.stringify({ project_id: 'test' }),
				priority: 1
			};
			(dbQueries.getLLMConfigById as jest.Mock).mockReturnValue(mockConfig);

			const result = await service.callLLM(1, { prompt: 'Test' });

			expect(result.error).toContain('watsonx API key is required');
		});

		it('should throw error when project ID is missing', async () => {
			const mockConfig = {
				id: 1,
				provider: 'watsonx',
				config: JSON.stringify({ api_key: 'test' }),
				priority: 1
			};
			(dbQueries.getLLMConfigById as jest.Mock).mockReturnValue(mockConfig);

			const result = await service.callLLM(1, { prompt: 'Test' });

			expect(result.error).toContain('watsonx project ID is required');
		});
	});

	describe('Unsupported provider', () => {
		it('should throw error for unsupported provider', async () => {
			const mockConfig = {
				id: 1,
				provider: 'unknown-provider',
				config: '{}',
				priority: 1
			};
			(dbQueries.getLLMConfigById as jest.Mock).mockReturnValue(mockConfig);

			const result = await service.callLLM(1, { prompt: 'Test' });

			expect(result.error).toContain('Unsupported LLM provider: unknown-provider');
		});
	});
});

// Made with Bob
