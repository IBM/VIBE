import type { TokenUsage } from '@ibm-vibe/types';
import { extractTokenUsage as extractTokenUsageShared } from '@ibm-vibe/utils';

/**
 * Main function to extract token usage from API response
 */
export function extractTokenUsage(responseData: any, tokenMapping?: string): { tokens: TokenUsage; metadata: any } {
	return extractTokenUsageShared(responseData, tokenMapping, {
		parseNumericStrings: false,
		includeTotalTokens: false,
		computeTotalTokens: false
	});
}
