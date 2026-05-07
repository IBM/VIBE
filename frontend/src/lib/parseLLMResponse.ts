export function parseLLMVariations(raw: string): string[] {
	let str = raw.trim();
	// Strip markdown fences if present
	str = str
		.replace(/^```(?:json)?\s*/, '')
		.replace(/\s*```$/, '')
		.trim();
	// Extract first [ ... ] block if exists
	const firstBracket = str.indexOf('[');
	const lastBracket = str.lastIndexOf(']');
	if (firstBracket !== -1 && lastBracket !== -1) {
		str = str.substring(firstBracket, lastBracket + 1);
	}
	// Try JSON parse
	try {
		const parsed = JSON.parse(str);
		if (Array.isArray(parsed) && parsed.every((item) => typeof item === 'string')) {
			return parsed;
		}
		throw new Error('Parsed result is not an array of strings');
	} catch {
		// Fallback: split by comma
		const inner = str.replace(/^\[|\]$/g, '');
		return inner
			.split(',')
			.map((s) => s.trim().replace(/^['"]|['"]$/g, ''))
			.filter((s) => s.length > 0);
	}
}
