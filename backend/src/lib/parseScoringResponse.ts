export interface ScoringResult {
	score: number;
	reasoning: string;
}

/**
 * Parse LLM response for similarity scoring
 * Expects JSON with { "score": number, "reasoning"?: string }
 * Handles markdown code fences and clamps score to 0-100 range
 */
export function parseScoringResponse(rawResponse: string): ScoringResult {
	if (!rawResponse || typeof rawResponse !== 'string') {
		throw new Error('Empty or invalid response from LLM');
	}

	let jsonText = rawResponse.trim();

	// Remove markdown code fences if present
	const codeBlockMatch = jsonText.match(/```(?:json)?\s*\n?([\s\S]*?)\n?\s*```/);
	if (codeBlockMatch) {
		jsonText = codeBlockMatch[1].trim();
	}

	// Try to parse JSON
	let parsed: any;
	try {
		parsed = JSON.parse(jsonText);
	} catch (error) {
		throw new Error(
			`Failed to parse JSON from LLM response: ${error instanceof Error ? error.message : 'Unknown error'}`
		);
	}

	// Validate structure
	if (!parsed || typeof parsed !== 'object') {
		throw new Error('LLM response is not a valid JSON object');
	}

	if (typeof parsed.score !== 'number') {
		throw new Error('Missing or invalid "score" field in LLM response');
	}

	// Clamp score to 0-100 range
	let score = parsed.score;
	if (score < 0) {
		score = 0;
	} else if (score > 100) {
		score = 100;
	}

	score = Math.round(score);

	const reasoning = typeof parsed.reasoning === 'string' ? parsed.reasoning.trim() : '';

	return {
		score,
		reasoning
	};
}
