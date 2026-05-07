/**
 * Token usage extraction utility
 *
 * This module provides functions to extract token usage information from API responses.
 * It supports both explicit token mapping and automatic detection using popular formats.
 */

import type { TokenUsage, TokenMapping } from '@ibm-vibe/types';
import { extractTokenUsage as extractTokenUsageShared } from '@ibm-vibe/utils';

/**
 * Extracts token usage from intermediate steps (for CrewAI/existing results)
 * @param intermediateSteps - JSON string or array of intermediate steps
 * @returns TokenUsage object
 */
function extractTokensFromIntermediateSteps(intermediateSteps: string | any[]): TokenUsage {
	try {
		let steps: any[];

		if (typeof intermediateSteps === 'string') {
			const parsed = JSON.parse(intermediateSteps);

			// Check if this is a direct metrics object (CrewAI format)
			if (parsed.metrics) {
				const metrics = parsed.metrics;

				return {
					input_tokens: undefined,
					output_tokens: undefined,
					total_tokens: metrics.token_usage || 0
				};
			}

			steps = Array.isArray(parsed) ? parsed : [parsed];
		} else {
			steps = Array.isArray(intermediateSteps) ? intermediateSteps : [intermediateSteps];
		}

		// Look for token usage in individual steps
		for (const step of steps) {
			if (step.metrics && typeof step.metrics.token_usage === 'number') {
				return {
					input_tokens: undefined,
					output_tokens: undefined,
					total_tokens: step.metrics.token_usage
				};
			}

			// Check for token usage information in step output
			if (step.output && typeof step.output === 'string') {
				// Look for patterns like "Total tokens used: 123"
				const tokenMatch = step.output.match(/Total tokens used:\s*(\d+)/i);
				if (tokenMatch) {
					return {
						input_tokens: undefined,
						output_tokens: undefined,
						total_tokens: parseInt(tokenMatch[1])
					};
				}

				// Look for patterns like "Estimated tokens: 123"
				const estimatedMatch = step.output.match(/Estimated tokens:\s*(\d+)/i);
				if (estimatedMatch) {
					return {
						input_tokens: undefined,
						output_tokens: undefined,
						total_tokens: parseInt(estimatedMatch[1])
					};
				}
			}
		}

		return {};
	} catch {
		return {};
	}
}

/**
 * Main function to extract token usage from API response
 * @param responseData - The API response data
 * @param tokenMapping - Optional explicit token mapping
 * @param intermediateSteps - Optional intermediate steps for fallback
 * @returns TokenUsage object and metadata
 */
export function extractTokenUsage(
	responseData: any,
	tokenMapping?: string | TokenMapping,
	intermediateSteps?: string | any[]
): { tokens: TokenUsage; metadata: any } {
	const { tokens, metadata } = extractTokenUsageShared(responseData, tokenMapping, {
		parseNumericStrings: true,
		includeTotalTokens: true,
		computeTotalTokens: true
	});

	if (tokens.input_tokens !== undefined || tokens.output_tokens !== undefined) {
		return { tokens, metadata };
	}

	// Try extracting from intermediate steps as fallback
	if (intermediateSteps) {
		const fallbackTokens = extractTokensFromIntermediateSteps(intermediateSteps);
		if (
			fallbackTokens.input_tokens !== undefined ||
			fallbackTokens.output_tokens !== undefined ||
			fallbackTokens.total_tokens !== undefined
		) {
			metadata.extraction_method = 'intermediate_steps';
			metadata.success = true;
			return { tokens: fallbackTokens, metadata };
		}
	}

	metadata.extraction_method = 'failed';

	return { tokens: {}, metadata };
}

/**
 * Validates and sanitizes token usage values
 * @param tokens - Token usage object to validate
 * @returns Validated token usage object
 */
export function validateTokenUsage(tokens: TokenUsage): TokenUsage {
	const result: TokenUsage = {};

	if (tokens.input_tokens !== undefined && typeof tokens.input_tokens === 'number' && tokens.input_tokens >= 0) {
		result.input_tokens = Math.floor(tokens.input_tokens);
	}

	if (tokens.output_tokens !== undefined && typeof tokens.output_tokens === 'number' && tokens.output_tokens >= 0) {
		result.output_tokens = Math.floor(tokens.output_tokens);
	}

	// Compute total if we have both input and output
	if (result.input_tokens !== undefined && result.output_tokens !== undefined) {
		result.total_tokens = result.input_tokens + result.output_tokens;
	} else if (
		tokens.total_tokens !== undefined &&
		typeof tokens.total_tokens === 'number' &&
		tokens.total_tokens >= 0
	) {
		result.total_tokens = Math.floor(tokens.total_tokens);
	}

	return result;
}

/**
 * Helper function to get a summary of token usage for display
 * @param tokens - Token usage object
 * @returns Human-readable summary
 */
export function getTokenUsageSummary(tokens: TokenUsage): string {
	const parts: string[] = [];

	if (tokens.input_tokens !== undefined) {
		parts.push(`${tokens.input_tokens} input`);
	}

	if (tokens.output_tokens !== undefined) {
		parts.push(`${tokens.output_tokens} output`);
	}

	if (tokens.total_tokens !== undefined) {
		parts.push(`${tokens.total_tokens} total`);
	}

	return parts.length > 0 ? `${parts.join(', ')} tokens` : 'No token data';
}
