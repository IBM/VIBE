import { ScoringService, scoreSimilarityText, generateTurnSimilarityPrompt } from '../scoring-service';
import { llmConfigService } from '../llm-config-service';
import { parseScoringResponse } from '../../lib/parseScoringResponse';
import * as dbQueries from '../../db/queries';
import db from '../../db/database';

// Mock dependencies
jest.mock('../llm-config-service');
jest.mock('../../lib/parseScoringResponse');
jest.mock('../../db/queries');
jest.mock('../../db/database', () => ({
	__esModule: true,
	default: {
		prepare: jest.fn()
	}
}));

describe('ScoringService', () => {
	let service: ScoringService;
	const mockLLMConfigService = llmConfigService as jest.Mocked<typeof llmConfigService>;

	beforeEach(() => {
		jest.clearAllMocks();
		service = new ScoringService();
	});

	describe('generateTurnSimilarityPrompt', () => {
		it('should generate a scoring prompt with expected and actual outputs', () => {
			const expected = 'Expected output';
			const actual = 'Actual output';

			const prompt = generateTurnSimilarityPrompt(expected, actual);

			expect(prompt).toContain('Expected Output:');
			expect(prompt).toContain(expected);
			expect(prompt).toContain('Actual Output:');
			expect(prompt).toContain(actual);
			expect(prompt).toContain('scale of 0-100');
		});
	});

	describe('scoreSimilarityText', () => {
		it('should score similarity using specified LLM config', async () => {
			mockLLMConfigService.callLLM.mockResolvedValue({
				text: 'Response with score',
				provider: 'openai',
				model: 'gpt-4',
				config_id: 1
			});
			(parseScoringResponse as jest.Mock).mockReturnValue({
				score: 85,
				reasoning: 'Very similar outputs'
			});

			const result = await scoreSimilarityText('expected', 'actual', 1);

			expect(result.score).toBe(85);
			expect(result.metadata.provider).toBe('openai');
			expect(result.metadata.model).toBe('gpt-4');
			expect(result.metadata.config_id).toBe(1);
			expect(result.metadata.reasoning).toBe('Very similar outputs');
			expect(result.metadata.execution_time_ms).toBeGreaterThanOrEqual(0);
			expect(mockLLMConfigService.callLLM).toHaveBeenCalledWith(1, expect.any(Object));
		});

		it('should score similarity using fallback when no config specified', async () => {
			mockLLMConfigService.callLLMWithFallback.mockResolvedValue({
				text: 'Response with score',
				provider: 'ollama',
				model: 'llama2',
				config_id: 2
			});
			(parseScoringResponse as jest.Mock).mockReturnValue({
				score: 75,
				reasoning: 'Similar with differences'
			});

			const result = await scoreSimilarityText('expected', 'actual');

			expect(result.score).toBe(75);
			expect(result.metadata.provider).toBe('ollama');
			expect(mockLLMConfigService.callLLMWithFallback).toHaveBeenCalled();
		});

		it('should throw error when LLM call fails', async () => {
			mockLLMConfigService.callLLMWithFallback.mockResolvedValue({
				text: '',
				provider: 'openai',
				model: 'gpt-4',
				config_id: 1,
				error: 'API error'
			});

			await expect(scoreSimilarityText('expected', 'actual')).rejects.toThrow('LLM call failed: API error');
		});

		it('should include execution time in metadata', async () => {
			mockLLMConfigService.callLLMWithFallback.mockImplementation(async () => {
				await new Promise((resolve) => setTimeout(resolve, 10));
				return {
					text: 'Response',
					provider: 'openai',
					model: 'gpt-4',
					config_id: 1
				};
			});
			(parseScoringResponse as jest.Mock).mockReturnValue({
				score: 90,
				reasoning: 'Test'
			});

			const result = await scoreSimilarityText('expected', 'actual');

			expect(result.metadata.execution_time_ms).toBeGreaterThanOrEqual(0);
		});
	});

	describe('scoreTestResult', () => {
		const mockResult = {
			id: 1,
			agent_id: 1,
			test_id: 100,
			output: 'Actual output',
			success: false,
			created_at: new Date().toISOString()
		};

		const mockTest = {
			id: 100,
			name: 'Test',
			input: 'Input',
			expected_output: 'Expected output',
			created_at: new Date().toISOString()
		};

		beforeEach(() => {
			// Mock database table check
			(db.prepare as jest.Mock).mockReturnValue({
				all: jest.fn().mockReturnValue([{ name: 'results' }])
			});
		});

		it('should score test result successfully', async () => {
			mockLLMConfigService.callLLMWithFallback.mockResolvedValue({
				text: 'Scoring response',
				provider: 'openai',
				model: 'gpt-4',
				config_id: 1
			});
			(parseScoringResponse as jest.Mock).mockReturnValue({
				score: 85,
				reasoning: 'Very similar'
			});
			(dbQueries.getAgentById as jest.Mock).mockResolvedValue({
				id: 1,
				name: 'Test Agent',
				settings: JSON.stringify({ type: 'crewai' })
			});
			(dbQueries.updateResult as jest.Mock).mockResolvedValue(undefined);

			await service.scoreTestResult(mockResult, mockTest);

			expect(dbQueries.updateResult).toHaveBeenCalledWith(1, {
				similarity_scoring_status: 'running'
			});
			expect(dbQueries.updateResult).toHaveBeenCalledWith(
				1,
				expect.objectContaining({
					similarity_score: 85,
					similarity_scoring_status: 'completed',
					success: 1
				})
			);
		});

		it('should use specified LLM config when provided', async () => {
			mockLLMConfigService.callLLM.mockResolvedValue({
				text: 'Response',
				provider: 'openai',
				model: 'gpt-4',
				config_id: 5
			});
			(parseScoringResponse as jest.Mock).mockReturnValue({
				score: 80,
				reasoning: 'Similar'
			});
			(dbQueries.getAgentById as jest.Mock).mockResolvedValue({
				id: 1,
				name: 'Test Agent',
				settings: JSON.stringify({ type: 'crewai' })
			});
			(dbQueries.updateResult as jest.Mock).mockResolvedValue(undefined);

			await service.scoreTestResult(mockResult, mockTest, 5);

			expect(mockLLMConfigService.callLLM).toHaveBeenCalledWith(5, expect.any(Object));
		});

		it('should throw error when result has no ID', async () => {
			const resultWithoutId = { ...mockResult, id: undefined };

			await expect(service.scoreTestResult(resultWithoutId as any, mockTest)).rejects.toThrow(
				'Test result must have an ID'
			);
		});

		it('should throw error when test has no expected output', async () => {
			const testWithoutExpected = { ...mockTest, expected_output: undefined };

			await expect(service.scoreTestResult(mockResult, testWithoutExpected as any)).rejects.toThrow(
				'Test must have expected_output to enable scoring'
			);
		});

		it('should update success based on score threshold for agents without explicit criteria', async () => {
			mockLLMConfigService.callLLMWithFallback.mockResolvedValue({
				text: 'Response',
				provider: 'openai',
				model: 'gpt-4',
				config_id: 1
			});
			(parseScoringResponse as jest.Mock).mockReturnValue({
				score: 75,
				reasoning: 'Above threshold'
			});
			(dbQueries.getAgentById as jest.Mock).mockResolvedValue({
				id: 1,
				name: 'Test Agent',
				settings: JSON.stringify({ type: 'crewai' })
			});
			(dbQueries.updateResult as jest.Mock).mockResolvedValue(undefined);

			await service.scoreTestResult(mockResult, mockTest);

			expect(dbQueries.updateResult).toHaveBeenCalledWith(
				1,
				expect.objectContaining({
					success: 1 // Score 75 >= threshold 70
				})
			);
		});

		it('should set success to 0 when score is below threshold and response mapping is missing', async () => {
			mockLLMConfigService.callLLMWithFallback.mockResolvedValue({
				text: 'Response',
				provider: 'openai',
				model: 'gpt-4',
				config_id: 1
			});
			(parseScoringResponse as jest.Mock).mockReturnValue({
				score: 50,
				reasoning: 'Below threshold'
			});
			(dbQueries.getAgentById as jest.Mock).mockResolvedValue({
				id: 1,
				name: 'External Agent',
				settings: JSON.stringify({
					type: 'external_api'
				})
			});
			(dbQueries.updateResult as jest.Mock).mockResolvedValue(undefined);

			await service.scoreTestResult(mockResult, mockTest);

			const updateCalls = (dbQueries.updateResult as jest.Mock).mock.calls;
			const finalUpdate = updateCalls[updateCalls.length - 1][1];
			expect(finalUpdate.success).toBe(0);
		});

		it('should not update success for agents with explicit success criteria', async () => {
			mockLLMConfigService.callLLMWithFallback.mockResolvedValue({
				text: 'Response',
				provider: 'openai',
				model: 'gpt-4',
				config_id: 1
			});
			(parseScoringResponse as jest.Mock).mockReturnValue({
				score: 85,
				reasoning: 'Similar'
			});
			(dbQueries.getAgentById as jest.Mock).mockResolvedValue({
				id: 1,
				name: 'External Agent',
				settings: JSON.stringify({
					type: 'external_api',
					response_mapping: JSON.stringify({
						success_criteria: { field: 'status', value: 'success' }
					})
				})
			});
			(dbQueries.updateResult as jest.Mock).mockResolvedValue(undefined);

			await service.scoreTestResult(mockResult, mockTest);

			const updateCalls = (dbQueries.updateResult as jest.Mock).mock.calls;
			const finalUpdate = updateCalls[updateCalls.length - 1][1];
			expect(finalUpdate.success).toBeUndefined();
		});

		it('should handle LLM call failure gracefully', async () => {
			mockLLMConfigService.callLLMWithFallback.mockResolvedValue({
				text: '',
				provider: 'openai',
				model: 'gpt-4',
				config_id: 1,
				error: 'API timeout'
			});
			(dbQueries.updateResult as jest.Mock).mockResolvedValue(undefined);

			await service.scoreTestResult(mockResult, mockTest);

			expect(dbQueries.updateResult).toHaveBeenCalledWith(
				1,
				expect.objectContaining({
					similarity_scoring_status: 'failed',
					similarity_scoring_error: expect.stringContaining('API timeout')
				})
			);
		});

		it('should skip failure update when results table is missing on error', async () => {
			(db.prepare as jest.Mock).mockReturnValue({
				all: jest.fn().mockReturnValue([])
			});
			mockLLMConfigService.callLLMWithFallback.mockResolvedValue({
				text: '',
				provider: 'openai',
				model: 'gpt-4',
				config_id: 1,
				error: 'API timeout'
			});
			(dbQueries.updateResult as jest.Mock).mockResolvedValue(undefined);

			await service.scoreTestResult(mockResult, mockTest);

			const updateCalls = (dbQueries.updateResult as jest.Mock).mock.calls;
			expect(updateCalls).toHaveLength(1);
			expect(updateCalls[0][1]).toEqual({
				similarity_scoring_status: 'running'
			});
		});

		it('should handle parsing errors gracefully', async () => {
			mockLLMConfigService.callLLMWithFallback.mockResolvedValue({
				text: 'Invalid response',
				provider: 'openai',
				model: 'gpt-4',
				config_id: 1
			});
			(parseScoringResponse as jest.Mock).mockImplementation(() => {
				throw new Error('Parse error');
			});
			(dbQueries.updateResult as jest.Mock).mockResolvedValue(undefined);

			await service.scoreTestResult(mockResult, mockTest);

			expect(dbQueries.updateResult).toHaveBeenCalledWith(
				1,
				expect.objectContaining({
					similarity_scoring_status: 'failed',
					similarity_scoring_error: expect.stringContaining('Parse error')
				})
			);
		});

		it('should handle missing results table gracefully', async () => {
			(db.prepare as jest.Mock).mockReturnValue({
				all: jest.fn().mockReturnValue([]) // No results table
			});
			mockLLMConfigService.callLLMWithFallback.mockResolvedValue({
				text: 'Response',
				provider: 'openai',
				model: 'gpt-4',
				config_id: 1
			});
			(parseScoringResponse as jest.Mock).mockReturnValue({
				score: 85,
				reasoning: 'Similar'
			});
			(dbQueries.getAgentById as jest.Mock).mockResolvedValue({
				id: 1,
				name: 'Test Agent',
				settings: JSON.stringify({ type: 'crewai' })
			});

			// Should not throw error
			await service.scoreTestResult(mockResult, mockTest);

			// Should still call updateResult for status update
			expect(dbQueries.updateResult).toHaveBeenCalledWith(1, {
				similarity_scoring_status: 'running'
			});
		});

		it('should include scoring metadata in result', async () => {
			mockLLMConfigService.callLLMWithFallback.mockResolvedValue({
				text: 'Full LLM response text',
				provider: 'anthropic',
				model: 'claude-3',
				config_id: 3
			});
			(parseScoringResponse as jest.Mock).mockReturnValue({
				score: 92,
				reasoning: 'Excellent match'
			});
			(dbQueries.getAgentById as jest.Mock).mockResolvedValue({
				id: 1,
				name: 'Test Agent',
				settings: JSON.stringify({ type: 'crewai' })
			});
			(dbQueries.updateResult as jest.Mock).mockResolvedValue(undefined);

			await service.scoreTestResult(mockResult, mockTest);

			const updateCalls = (dbQueries.updateResult as jest.Mock).mock.calls;
			const finalUpdate = updateCalls[updateCalls.length - 1][1];
			const metadata = JSON.parse(finalUpdate.similarity_scoring_metadata);

			expect(metadata.provider).toBe('anthropic');
			expect(metadata.model).toBe('claude-3');
			expect(metadata.config_id).toBe(3);
			expect(metadata.raw_response).toBe('Full LLM response text');
			expect(metadata.reasoning).toBe('Excellent match');
			expect(metadata.execution_time_ms).toBeGreaterThanOrEqual(0);
		});
	});
});

// Made with Bob
