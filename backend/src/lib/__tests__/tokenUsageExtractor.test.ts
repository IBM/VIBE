import { extractTokenUsage, validateTokenUsage, getTokenUsageSummary } from '../tokenUsageExtractor';

describe('tokenUsageExtractor', () => {
	describe('extractTokenUsage', () => {
		describe('explicit token mapping', () => {
			it('extracts tokens using explicit mapping object', () => {
				const responseData = {
					usage: {
						prompt_tokens: 100,
						completion_tokens: 50
					}
				};
				const mapping = {
					input_tokens: 'usage.prompt_tokens',
					output_tokens: 'usage.completion_tokens'
				};

				const { tokens, metadata } = extractTokenUsage(responseData, mapping);

				expect(tokens.input_tokens).toBe(100);
				expect(tokens.output_tokens).toBe(50);
				expect(metadata.extraction_method).toBe('explicit_mapping');
				expect(metadata.success).toBe(true);
			});

			it('extracts tokens using explicit mapping JSON string', () => {
				const responseData = {
					usage: {
						prompt_tokens: 100,
						completion_tokens: 50
					}
				};
				const mapping = JSON.stringify({
					input_tokens: 'usage.prompt_tokens',
					output_tokens: 'usage.completion_tokens'
				});

				const { tokens, metadata } = extractTokenUsage(responseData, mapping);

				expect(tokens.input_tokens).toBe(100);
				expect(tokens.output_tokens).toBe(50);
				expect(metadata.extraction_method).toBe('explicit_mapping');
			});

			it('computes total_tokens when not provided', () => {
				const responseData = {
					usage: {
						prompt_tokens: 100,
						completion_tokens: 50
					}
				};
				const mapping = {
					input_tokens: 'usage.prompt_tokens',
					output_tokens: 'usage.completion_tokens'
				};

				const { tokens } = extractTokenUsage(responseData, mapping);

				expect(tokens.total_tokens).toBe(150);
			});

			it('uses provided total_tokens', () => {
				const responseData = {
					usage: {
						prompt_tokens: 100,
						completion_tokens: 50,
						total_tokens: 200
					}
				};
				const mapping = {
					input_tokens: 'usage.prompt_tokens',
					output_tokens: 'usage.completion_tokens',
					total_tokens: 'usage.total_tokens'
				};

				const { tokens } = extractTokenUsage(responseData, mapping);

				expect(tokens.total_tokens).toBe(200);
			});

			it('falls back to popular formats when explicit mapping yields no data', () => {
				const responseData = {
					usage: {
						prompt_tokens: 12,
						completion_tokens: 8
					}
				};
				const mapping = {
					input_tokens: 'usage.nonexistent'
				};

				const { tokens, metadata } = extractTokenUsage(responseData, mapping);

				expect(tokens.input_tokens).toBe(12);
				expect(tokens.output_tokens).toBe(8);
				expect(metadata.extraction_method).toBe('popular_format_1');
			});
		});

		describe('popular formats detection', () => {
			it('detects OpenAI format', () => {
				const responseData = {
					usage: {
						prompt_tokens: 100,
						completion_tokens: 50,
						total_tokens: 150
					}
				};

				const { tokens, metadata } = extractTokenUsage(responseData);

				expect(tokens.input_tokens).toBe(100);
				expect(tokens.output_tokens).toBe(50);
				expect(tokens.total_tokens).toBe(150);
				expect(metadata.extraction_method).toBe('popular_format_1');
				expect(metadata.success).toBe(true);
			});

			it('detects Anthropic Claude format', () => {
				const responseData = {
					usage: {
						input_tokens: 100,
						output_tokens: 50
					}
				};

				const { tokens, metadata } = extractTokenUsage(responseData);

				expect(tokens.input_tokens).toBe(100);
				expect(tokens.output_tokens).toBe(50);
				expect(metadata.extraction_method).toBe('popular_format_2');
			});

			it('detects Google Gemini format', () => {
				const responseData = {
					usageMetadata: {
						promptTokenCount: 100,
						candidatesTokenCount: 50,
						totalTokenCount: 150
					}
				};

				const { tokens, metadata } = extractTokenUsage(responseData);

				expect(tokens.input_tokens).toBe(100);
				expect(tokens.output_tokens).toBe(50);
				expect(tokens.total_tokens).toBe(150);
				expect(metadata.extraction_method).toBe('popular_format_3');
			});

			it('detects Cohere format', () => {
				const responseData = {
					meta: {
						tokens: {
							input_tokens: 100,
							output_tokens: 50
						}
					}
				};

				const { tokens, metadata } = extractTokenUsage(responseData);

				expect(tokens.input_tokens).toBe(100);
				expect(tokens.output_tokens).toBe(50);
				expect(metadata.extraction_method).toBe('popular_format_4');
			});

			it('detects Ollama format', () => {
				const responseData = {
					prompt_eval_count: 100,
					eval_count: 50
				};

				const { tokens, metadata } = extractTokenUsage(responseData);

				expect(tokens.input_tokens).toBe(100);
				expect(tokens.output_tokens).toBe(50);
				expect(metadata.extraction_method).toBe('popular_format_5');
			});

			it('detects LangChain format', () => {
				const responseData = {
					llm_output: {
						token_usage: {
							prompt_tokens: 100,
							completion_tokens: 50,
							total_tokens: 150
						}
					}
				};

				const { tokens, metadata } = extractTokenUsage(responseData);

				expect(tokens.input_tokens).toBe(100);
				expect(tokens.output_tokens).toBe(50);
				expect(metadata.extraction_method).toBe('popular_format_6');
			});
		});

		describe('intermediate steps extraction', () => {
			it('extracts from CrewAI metrics format', () => {
				const intermediateSteps = JSON.stringify({
					metrics: {
						token_usage: 150
					}
				});

				const { tokens, metadata } = extractTokenUsage({}, undefined, intermediateSteps);

				expect(tokens.total_tokens).toBe(150);
				expect(metadata.extraction_method).toBe('intermediate_steps');
				expect(metadata.success).toBe(true);
			});

			it('extracts from step array with metrics', () => {
				const intermediateSteps = [
					{
						metrics: {
							token_usage: 150
						}
					}
				];

				const { tokens, metadata } = extractTokenUsage({}, undefined, intermediateSteps);

				expect(tokens.total_tokens).toBe(150);
				expect(metadata.extraction_method).toBe('intermediate_steps');
			});

			it('extracts from step output text pattern', () => {
				const intermediateSteps = [
					{
						output: 'Some text. Total tokens used: 150'
					}
				];

				const { tokens, metadata } = extractTokenUsage({}, undefined, intermediateSteps);

				expect(tokens.total_tokens).toBe(150);
				expect(metadata.extraction_method).toBe('intermediate_steps');
			});

			it('extracts from estimated tokens pattern', () => {
				const intermediateSteps = [
					{
						output: 'Processing complete. Estimated tokens: 200'
					}
				];

				const { tokens, metadata } = extractTokenUsage({}, undefined, intermediateSteps);

				expect(tokens.total_tokens).toBe(200);
				expect(metadata.extraction_method).toBe('intermediate_steps');
			});

			it('handles invalid JSON in intermediate steps string', () => {
				const { tokens, metadata } = extractTokenUsage({}, undefined, '{invalid');

				expect(tokens).toEqual({});
				expect(metadata.extraction_method).toBe('failed');
				expect(metadata.success).toBe(false);
			});
		});

		describe('edge cases', () => {
			it('handles nested paths with array notation', () => {
				const responseData = {
					choices: [
						{
							usage: {
								tokens: 100
							}
						}
					]
				};
				const mapping = {
					input_tokens: 'choices[0].usage.tokens'
				};

				const { tokens } = extractTokenUsage(responseData, mapping);

				expect(tokens.input_tokens).toBe(100);
			});

			it('handles string numeric values', () => {
				const responseData = {
					usage: {
						prompt_tokens: '100',
						completion_tokens: '50'
					}
				};

				const { tokens } = extractTokenUsage(responseData);

				expect(tokens.input_tokens).toBe(100);
				expect(tokens.output_tokens).toBe(50);
			});

			it('ignores negative token values', () => {
				const responseData = {
					usage: {
						prompt_tokens: -100,
						completion_tokens: 50
					}
				};

				const { tokens } = extractTokenUsage(responseData);

				expect(tokens.input_tokens).toBeUndefined();
				expect(tokens.output_tokens).toBe(50);
			});

			it('ignores NaN token values', () => {
				const responseData = {
					usage: {
						prompt_tokens: NaN,
						completion_tokens: 50
					}
				};

				const { tokens } = extractTokenUsage(responseData);

				expect(tokens.input_tokens).toBeUndefined();
				expect(tokens.output_tokens).toBe(50);
			});

			it('floors decimal token values', () => {
				const responseData = {
					usage: {
						prompt_tokens: 100.7,
						completion_tokens: 50.3
					}
				};

				const { tokens } = extractTokenUsage(responseData);

				expect(tokens.input_tokens).toBe(100);
				expect(tokens.output_tokens).toBe(50);
			});

			it('returns empty tokens when no extraction succeeds', () => {
				const responseData = {
					other: 'data'
				};

				const { tokens, metadata } = extractTokenUsage(responseData);

				expect(tokens).toEqual({});
				expect(metadata.extraction_method).toBe('failed');
				expect(metadata.success).toBe(false);
			});

			it('handles invalid JSON in mapping string', () => {
				const responseData = {
					usage: {
						prompt_tokens: 100
					}
				};

				const { metadata } = extractTokenUsage(responseData, '{invalid');

				expect(metadata.explicit_mapping_error).toBeDefined();
			});

			it('handles null response data', () => {
				const { tokens, metadata } = extractTokenUsage(null);

				expect(tokens).toEqual({});
				expect(metadata.success).toBe(false);
			});

			it('handles undefined paths gracefully', () => {
				const responseData = {
					usage: {}
				};
				const mapping = {
					input_tokens: 'usage.nonexistent.path'
				};

				const { tokens } = extractTokenUsage(responseData, mapping);

				expect(tokens.input_tokens).toBeUndefined();
			});
		});
	});

	describe('validateTokenUsage', () => {
		it('validates and returns valid token usage', () => {
			const tokens = {
				input_tokens: 100,
				output_tokens: 50
			};

			const result = validateTokenUsage(tokens);

			expect(result.input_tokens).toBe(100);
			expect(result.output_tokens).toBe(50);
			expect(result.total_tokens).toBe(150);
		});

		it('floors decimal values', () => {
			const tokens = {
				input_tokens: 100.9,
				output_tokens: 50.1
			};

			const result = validateTokenUsage(tokens);

			expect(result.input_tokens).toBe(100);
			expect(result.output_tokens).toBe(50);
		});

		it('filters out negative values', () => {
			const tokens = {
				input_tokens: -100,
				output_tokens: 50
			};

			const result = validateTokenUsage(tokens);

			expect(result.input_tokens).toBeUndefined();
			expect(result.output_tokens).toBe(50);
		});

		it('filters out non-numeric values', () => {
			const tokens = {
				input_tokens: 'invalid' as any,
				output_tokens: 50
			};

			const result = validateTokenUsage(tokens);

			expect(result.input_tokens).toBeUndefined();
			expect(result.output_tokens).toBe(50);
		});

		it('computes total from input and output', () => {
			const tokens = {
				input_tokens: 100,
				output_tokens: 50
			};

			const result = validateTokenUsage(tokens);

			expect(result.total_tokens).toBe(150);
		});

		it('uses provided total when input/output missing', () => {
			const tokens = {
				total_tokens: 200
			};

			const result = validateTokenUsage(tokens);

			expect(result.total_tokens).toBe(200);
		});

		it('handles empty token object', () => {
			const result = validateTokenUsage({});

			expect(result).toEqual({});
		});

		it('handles zero values', () => {
			const tokens = {
				input_tokens: 0,
				output_tokens: 0
			};

			const result = validateTokenUsage(tokens);

			expect(result.input_tokens).toBe(0);
			expect(result.output_tokens).toBe(0);
			expect(result.total_tokens).toBe(0);
		});
	});

	describe('getTokenUsageSummary', () => {
		it('formats complete token usage', () => {
			const tokens = {
				input_tokens: 100,
				output_tokens: 50,
				total_tokens: 150
			};

			const summary = getTokenUsageSummary(tokens);

			expect(summary).toBe('100 input, 50 output, 150 total tokens');
		});

		it('formats with only input tokens', () => {
			const tokens = {
				input_tokens: 100
			};

			const summary = getTokenUsageSummary(tokens);

			expect(summary).toBe('100 input tokens');
		});

		it('formats with only output tokens', () => {
			const tokens = {
				output_tokens: 50
			};

			const summary = getTokenUsageSummary(tokens);

			expect(summary).toBe('50 output tokens');
		});

		it('formats with only total tokens', () => {
			const tokens = {
				total_tokens: 150
			};

			const summary = getTokenUsageSummary(tokens);

			expect(summary).toBe('150 total tokens');
		});

		it('returns no data message for empty tokens', () => {
			const summary = getTokenUsageSummary({});

			expect(summary).toBe('No token data');
		});

		it('formats with input and output only', () => {
			const tokens = {
				input_tokens: 100,
				output_tokens: 50
			};

			const summary = getTokenUsageSummary(tokens);

			expect(summary).toBe('100 input, 50 output tokens');
		});

		it('handles zero values', () => {
			const tokens = {
				input_tokens: 0,
				output_tokens: 0,
				total_tokens: 0
			};

			const summary = getTokenUsageSummary(tokens);

			expect(summary).toBe('0 input, 0 output, 0 total tokens');
		});
	});
});

// Made with Bob
