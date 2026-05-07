import { Test, TestResult, Agent } from '@ibm-vibe/types';
import { llmConfigService } from './llm-config-service';
import { parseScoringResponse } from '../lib/parseScoringResponse';
import { updateResult, getAgentById } from '../db/queries';
import db from '../db/database';

const shouldLog = process.env.NODE_ENV !== 'test';
const logError = (...args: unknown[]) => {
	/* istanbul ignore next */
	if (shouldLog) console.error(...args);
};

/**
 * Generate scoring prompt for similarity evaluation
 */
function generateScoringPrompt(expectedOutput: string, actualOutput: string): string {
	return `{"role": "system", "content": "${JSON.stringify(`You are an AI assistant tasked with evaluating how similar two text outputs are.

Expected Output:
${expectedOutput}

Actual Output:
${actualOutput}

Please evaluate the similarity between the expected and actual outputs on a scale of 0-100:
- 100: Outputs are functionally identical or convey the exact same meaning
- 80-99: Outputs are very similar with minor differences in wording or formatting
- 60-79: Outputs are similar but have some notable differences in content or approach
- 40-59: Outputs are somewhat related but have significant differences
- 20-39: Outputs are loosely related but mostly different
- 0-19: Outputs are completely different or unrelated

Consider:
- Semantic meaning and intent
- Factual accuracy and completeness
- Overall structure and organization
- Key information preservation

Provide your analysis and reasoning, then return your evaluation as a JSON object with this exact format:
{
	"reasoning": "<detailed explanation of your evaluation>",
	"score": <number between 0 and 100>
}`)}"}
`;
}

// Exported helper for turn-level similarity prompts
export function generateTurnSimilarityPrompt(targetReply: string, actualReply: string): string {
	return generateScoringPrompt(targetReply, actualReply);
}

// Lightweight similarity scorer for arbitrary expected/actual pairs
export async function scoreSimilarityText(
	expected: string,
	actual: string,
	llmConfigId?: number
): Promise<{
	score: number;
	metadata: {
		provider: string;
		model: string;
		config_id: number | undefined;
		execution_time_ms: number;
		raw_response: string;
		reasoning?: string;
	};
}> {
	const startTime = Date.now();
	const prompt = generateTurnSimilarityPrompt(expected, actual);
	const llmResponse = llmConfigId
		? await llmConfigService.callLLM(llmConfigId, { prompt })
		: await llmConfigService.callLLMWithFallback({ prompt });

	if (llmResponse.error) {
		throw new Error(`LLM call failed: ${llmResponse.error}`);
	}

	const scoringResult = parseScoringResponse(llmResponse.text);
	const endTime = Date.now();

	return {
		score: scoringResult.score,
		metadata: {
			provider: llmResponse.provider,
			model: llmResponse.model,
			config_id: llmResponse.config_id,
			execution_time_ms: endTime - startTime,
			raw_response: llmResponse.text,
			reasoning: scoringResult.reasoning
		}
	};
}

/**
 * Check if an external API agent has explicit success criteria configured
 */
function hasExplicitSuccessCriteria(agent: Agent): boolean {
	try {
		const settings = JSON.parse(agent.settings);
		if (settings.type !== 'external_api') {
			return false;
		}

		if (!settings.response_mapping) {
			return false;
		}

		const responseMapping = JSON.parse(settings.response_mapping);
		return !!responseMapping.success_criteria;
	} catch (error) {
		logError('Error parsing agent settings or response mapping:', error);
		return false;
	}
}

/**
 * Service for evaluating similarity between test expected outputs and actual results
 */
export class ScoringService {
	/**
	 * Score a test result against its expected output
	 * @param result The test result to score
	 * @param test The test containing the expected output
	 * @param llmConfigId Optional LLM config ID to use (defaults to priority order)
	 */
	async scoreTestResult(result: TestResult, test: Test, llmConfigId?: number): Promise<void> {
		if (!result.id) {
			throw new Error('Test result must have an ID');
		}

		// Deprecated path - kept for legacy compatibility only
		if (!test.expected_output) {
			throw new Error('Test must have expected_output to enable scoring');
		}

		const startTime = Date.now();

		try {
			// Set status to running in legacy result (if table exists) and in session metadata
			await updateResult(result.id, { similarity_scoring_status: 'running' });

			const prompt = generateScoringPrompt(test.expected_output, result.output);

			// Call LLM
			const llmResponse = llmConfigId
				? await llmConfigService.callLLM(llmConfigId, { prompt })
				: await llmConfigService.callLLMWithFallback({ prompt });

			if (llmResponse.error) {
				throw new Error(`LLM call failed: ${llmResponse.error}`);
			}

			const scoringResult = parseScoringResponse(llmResponse.text);

			const endTime = Date.now();
			const scoringMetadata = {
				provider: llmResponse.provider,
				model: llmResponse.model,
				config_id: llmResponse.config_id,
				execution_time_ms: endTime - startTime,
				raw_response: llmResponse.text,
				reasoning: scoringResult.reasoning
			};

			// Check if we should update success based on similarity score
			let shouldUpdateSuccess = false;
			const agent = await getAgentById(result.agent_id);
			if (agent && !hasExplicitSuccessCriteria(agent)) {
				shouldUpdateSuccess = true;
			}

			// Update legacy result for compatibility if results table exists
			try {
				const hasResults = db
					.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='results'")
					.all() as { name: string }[];
				if (hasResults.length > 0) {
					const updateData: Partial<TestResult> = {
						similarity_score: scoringResult.score,
						similarity_scoring_status: 'completed',
						similarity_scoring_metadata: JSON.stringify(scoringMetadata),
						similarity_scoring_error: undefined
					};
					if (shouldUpdateSuccess) {
						const threshold = 70;
						updateData.success = scoringResult.score >= threshold ? 1 : (0 as any);
					}
					await updateResult(result.id, updateData);
				}
			} catch {}
		} catch (error) {
			const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred during scoring';

			// Attempt to update legacy result with failure (compatibility only)
			try {
				const hasResults = db
					.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='results'")
					.all() as { name: string }[];
				if (hasResults.length > 0) {
					await updateResult(result.id, {
						similarity_scoring_status: 'failed',
						similarity_scoring_error: errorMessage
					});
				}
			} catch {}

			logError(`Scoring failed for result ${result.id}:`, error);
		}
	}
}

export const scoringService = new ScoringService();
