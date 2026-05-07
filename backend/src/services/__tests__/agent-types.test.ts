import {
	BaseAgentSettings,
	CrewAISettings,
	ExternalAPISettings,
	isCrewAISettings,
	isExternalAPISettings
} from '../agent-types';

describe('agent-types', () => {
	describe('Type Guards', () => {
		describe('isCrewAISettings', () => {
			it('should return true for CrewAI settings', () => {
				const settings: CrewAISettings = {
					type: 'crewai',
					model: 'gpt-4',
					temperature: 0.7,
					max_tokens: 1000,
					base_url: 'https://api.openai.com',
					role: 'assistant',
					goal: 'help users',
					backstory: 'experienced AI',
					allow_delegation: false,
					allow_code_execution: false,
					memory: true,
					verbose: false,
					tools: []
				};

				expect(isCrewAISettings(settings)).toBe(true);
			});

			it('should return false for external API settings', () => {
				const settings: ExternalAPISettings = {
					type: 'external_api',
					api_endpoint: 'https://api.example.com'
				};

				expect(isCrewAISettings(settings)).toBe(false);
			});

			it('should return false for unknown type', () => {
				const settings: BaseAgentSettings = {
					type: 'unknown'
				};

				expect(isCrewAISettings(settings)).toBe(false);
			});

			it('should handle settings with additional properties', () => {
				const settings = {
					type: 'crewai',
					model: 'gpt-4',
					temperature: 0.7,
					max_tokens: 1000,
					base_url: 'https://api.openai.com',
					role: 'assistant',
					goal: 'help users',
					backstory: 'experienced AI',
					allow_delegation: false,
					allow_code_execution: false,
					memory: true,
					verbose: false,
					tools: [],
					extra_field: 'value'
				} as any;

				expect(isCrewAISettings(settings)).toBe(true);
			});
		});

		describe('isExternalAPISettings', () => {
			it('should return true for external API settings', () => {
				const settings: ExternalAPISettings = {
					type: 'external_api',
					api_endpoint: 'https://api.example.com'
				};

				expect(isExternalAPISettings(settings)).toBe(true);
			});

			it('should return true for external API settings with all optional fields', () => {
				const settings: ExternalAPISettings = {
					type: 'external_api',
					api_endpoint: 'https://api.example.com',
					api_key: 'secret-key',
					request_template: '{"input": "{{input}}"}',
					response_mapping: '{"output": "{{response.data}}"}',
					headers: {
						'Content-Type': 'application/json',
						Authorization: 'Bearer token'
					},
					http_method: 'POST'
				};

				expect(isExternalAPISettings(settings)).toBe(true);
			});

			it('should return false for CrewAI settings', () => {
				const settings: CrewAISettings = {
					type: 'crewai',
					model: 'gpt-4',
					temperature: 0.7,
					max_tokens: 1000,
					base_url: 'https://api.openai.com',
					role: 'assistant',
					goal: 'help users',
					backstory: 'experienced AI',
					allow_delegation: false,
					allow_code_execution: false,
					memory: true,
					verbose: false,
					tools: []
				};

				expect(isExternalAPISettings(settings)).toBe(false);
			});

			it('should return false for unknown type', () => {
				const settings: BaseAgentSettings = {
					type: 'unknown'
				};

				expect(isExternalAPISettings(settings)).toBe(false);
			});

			it('should handle different HTTP methods', () => {
				const methods: Array<'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'> = [
					'GET',
					'POST',
					'PUT',
					'PATCH',
					'DELETE'
				];

				methods.forEach((method) => {
					const settings: ExternalAPISettings = {
						type: 'external_api',
						api_endpoint: 'https://api.example.com',
						http_method: method
					};

					expect(isExternalAPISettings(settings)).toBe(true);
				});
			});
		});

		describe('Type narrowing', () => {
			it('should narrow type to CrewAISettings when guard returns true', () => {
				const settings: BaseAgentSettings = {
					type: 'crewai',
					model: 'gpt-4',
					temperature: 0.7,
					max_tokens: 1000,
					base_url: 'https://api.openai.com',
					role: 'assistant',
					goal: 'help users',
					backstory: 'experienced AI',
					allow_delegation: false,
					allow_code_execution: false,
					memory: true,
					verbose: false,
					tools: []
				} as CrewAISettings;

				if (isCrewAISettings(settings)) {
					// TypeScript should recognize this as CrewAISettings
					expect(settings.model).toBe('gpt-4');
					expect(settings.role).toBe('assistant');
					expect(settings.tools).toEqual([]);
				}
			});

			it('should narrow type to ExternalAPISettings when guard returns true', () => {
				const settings: BaseAgentSettings = {
					type: 'external_api',
					api_endpoint: 'https://api.example.com',
					api_key: 'secret'
				} as ExternalAPISettings;

				if (isExternalAPISettings(settings)) {
					// TypeScript should recognize this as ExternalAPISettings
					expect(settings.api_endpoint).toBe('https://api.example.com');
					expect(settings.api_key).toBe('secret');
				}
			});

			it('should handle conditional logic based on type guards', () => {
				const crewaiSettings: BaseAgentSettings = {
					type: 'crewai',
					model: 'gpt-4'
				} as CrewAISettings;

				const externalSettings: BaseAgentSettings = {
					type: 'external_api',
					api_endpoint: 'https://api.example.com'
				} as ExternalAPISettings;

				let result: string;

				if (isCrewAISettings(crewaiSettings)) {
					result = 'crewai';
				} else if (isExternalAPISettings(crewaiSettings)) {
					result = 'external';
				} else {
					result = 'unknown';
				}
				expect(result).toBe('crewai');

				if (isCrewAISettings(externalSettings)) {
					result = 'crewai';
				} else if (isExternalAPISettings(externalSettings)) {
					result = 'external';
				} else {
					result = 'unknown';
				}
				expect(result).toBe('external');
			});
		});
	});

	describe('Type Definitions', () => {
		it('should allow valid CrewAI settings', () => {
			const settings: CrewAISettings = {
				type: 'crewai',
				model: 'gpt-4',
				temperature: 0.7,
				max_tokens: 1000,
				base_url: 'https://api.openai.com',
				role: 'assistant',
				goal: 'help users',
				backstory: 'experienced AI',
				allow_delegation: true,
				allow_code_execution: true,
				memory: true,
				verbose: true,
				tools: ['search', 'calculator']
			};

			expect(settings.type).toBe('crewai');
			expect(settings.tools).toHaveLength(2);
		});

		it('should allow valid external API settings with minimal fields', () => {
			const settings: ExternalAPISettings = {
				type: 'external_api',
				api_endpoint: 'https://api.example.com'
			};

			expect(settings.type).toBe('external_api');
			expect(settings.api_endpoint).toBe('https://api.example.com');
		});

		it('should allow valid external API settings with all fields', () => {
			const settings: ExternalAPISettings = {
				type: 'external_api',
				api_endpoint: 'https://api.example.com',
				api_key: 'secret-key',
				request_template: '{"input": "{{input}}"}',
				response_mapping: '{"output": "{{response.data}}"}',
				headers: {
					'Content-Type': 'application/json',
					'X-Custom-Header': 'value'
				},
				http_method: 'POST'
			};

			expect(settings.headers).toHaveProperty('Content-Type');
			expect(settings.http_method).toBe('POST');
		});

		it('should allow base agent settings with any type', () => {
			const settings: BaseAgentSettings = {
				type: 'custom_type'
			};

			expect(settings.type).toBe('custom_type');
		});
	});
});

// Made with Bob
