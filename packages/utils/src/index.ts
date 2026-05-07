import type { TokenMapping, TokenUsage } from '@ibm-vibe/types';

export type PathToken = string | number;

/**
 * Tokenizes a path string into property names and numeric indices.
 * Supports dot notation (a.b.c) and bracket notation (a[0]["key"]).
 */
export const tokenizePath = (path: string): PathToken[] => {
	const tokens: PathToken[] = [];
	const dotParts = path.split('.');

	for (const part of dotParts) {
		const regex = /([^\[\]]+)|\[(\d+|'.*?'|".*?")\]/g;
		let match: RegExpExecArray | null;

		while ((match = regex.exec(part)) !== null) {
			if (match[1]) {
				tokens.push(match[1]);
			} else if (match[2]) {
				const raw = match[2];
				if (/^\d+$/.test(raw)) {
					tokens.push(Number(raw));
				} else {
					tokens.push(String(raw).slice(1, -1));
				}
			}
		}
	}

	return tokens;
};

/**
 * Traverses an object using pre-tokenized path segments.
 */
export const traverseByTokens = (obj: unknown, tokens: PathToken[]): unknown => {
	let current: unknown = obj;
	for (const token of tokens) {
		if (current === null || current === undefined) {
			return undefined;
		}
		if (typeof token === 'number') {
			if (Array.isArray(current)) {
				current = current[token];
			} else if (typeof current === 'object') {
				current = (current as Record<string, unknown>)[String(token)];
			} else {
				return undefined;
			}
		} else {
			if (typeof current === 'object' && current !== null) {
				current = (current as Record<string, unknown>)[token];
			} else {
				return undefined;
			}
		}
	}
	return current;
};

/**
 * Extracts a nested value by dot/bracket path.
 */
export const extractByPath = (obj: unknown, path: string): unknown => {
	try {
		if (!path || typeof path !== 'string') {
			return undefined;
		}
		return traverseByTokens(obj, tokenizePath(path));
	} catch {
		return undefined;
	}
};

export const parseTokenMapping = (tokenMapping?: string | TokenMapping): TokenMapping | undefined => {
	if (!tokenMapping) {
		return undefined;
	}

	if (typeof tokenMapping === 'string') {
		return JSON.parse(tokenMapping) as TokenMapping;
	}

	return tokenMapping;
};

const toValidTokenNumber = (value: unknown, parseNumericStrings: boolean): number | undefined => {
	const raw = parseNumericStrings && typeof value === 'string' ? Number.parseFloat(value) : value;
	if (typeof raw !== 'number' || Number.isNaN(raw) || raw < 0) {
		return undefined;
	}
	return Math.floor(raw);
};

export interface TokenExtractionOptions {
	parseNumericStrings?: boolean;
	includeTotalTokens?: boolean;
	computeTotalTokens?: boolean;
}

/**
 * Extract tokens from an API response using a configured path mapping.
 */
export const extractTokensWithMapping = (
	responseData: unknown,
	mapping: TokenMapping,
	options: TokenExtractionOptions = {}
): TokenUsage => {
	const parseNumericStrings = options.parseNumericStrings ?? false;
	const includeTotalTokens = options.includeTotalTokens ?? true;
	const computeTotalTokens = options.computeTotalTokens ?? true;
	const result: TokenUsage = {};

	if (mapping.input_tokens) {
		const value = extractByPath(responseData, mapping.input_tokens);
		const token = toValidTokenNumber(value, parseNumericStrings);
		if (token !== undefined) {
			result.input_tokens = token;
		}
	}

	if (mapping.output_tokens) {
		const value = extractByPath(responseData, mapping.output_tokens);
		const token = toValidTokenNumber(value, parseNumericStrings);
		if (token !== undefined) {
			result.output_tokens = token;
		}
	}

	if (includeTotalTokens && mapping.total_tokens) {
		const value = extractByPath(responseData, mapping.total_tokens);
		const token = toValidTokenNumber(value, parseNumericStrings);
		if (token !== undefined) {
			result.total_tokens = token;
		}
	}

	if (
		computeTotalTokens &&
		result.total_tokens === undefined &&
		result.input_tokens !== undefined &&
		result.output_tokens !== undefined
	) {
		result.total_tokens = result.input_tokens + result.output_tokens;
	}

	return result;
};

/**
 * Popular token usage formats for automatic detection.
 */
export const POPULAR_TOKEN_FORMATS: TokenMapping[] = [
	// OpenAI & Mistral format
	{
		input_tokens: 'usage.prompt_tokens',
		output_tokens: 'usage.completion_tokens',
		total_tokens: 'usage.total_tokens'
	},
	// Anthropic Claude format
	{
		input_tokens: 'usage.input_tokens',
		output_tokens: 'usage.output_tokens'
	},
	// Google Gemini format
	{
		input_tokens: 'usageMetadata.promptTokenCount',
		output_tokens: 'usageMetadata.candidatesTokenCount',
		total_tokens: 'usageMetadata.totalTokenCount'
	},
	// Cohere format
	{
		input_tokens: 'meta.tokens.input_tokens',
		output_tokens: 'meta.tokens.output_tokens'
	},
	// Ollama format
	{
		input_tokens: 'prompt_eval_count',
		output_tokens: 'eval_count'
	},
	// LangChain format
	{
		input_tokens: 'llm_output.token_usage.prompt_tokens',
		output_tokens: 'llm_output.token_usage.completion_tokens',
		total_tokens: 'llm_output.token_usage.total_tokens'
	},
	// Alternative LangChain format
	{
		input_tokens: 'token_usage.prompt_tokens',
		output_tokens: 'token_usage.completion_tokens',
		total_tokens: 'token_usage.total_tokens'
	}
];

export interface TokenExtractionMetadata {
	extraction_method: string;
	attempted_formats: TokenMapping[];
	success: boolean;
	mapping_used?: TokenMapping;
	successful_format?: TokenMapping;
	explicit_mapping_error?: string;
}

export interface ExtractTokenUsageOptions extends TokenExtractionOptions {
	popularFormats?: TokenMapping[];
}

const hasInputOrOutputTokens = (tokens: TokenUsage): boolean =>
	tokens.input_tokens !== undefined || tokens.output_tokens !== undefined;

/**
 * Extract token usage using an explicit mapping first, then popular known formats.
 * Returns extraction metadata that callers can use for diagnostics.
 */
export const extractTokenUsage = (
	responseData: unknown,
	tokenMapping?: string | TokenMapping,
	options: ExtractTokenUsageOptions = {}
): { tokens: TokenUsage; metadata: TokenExtractionMetadata } => {
	let tokens: TokenUsage = {};
	const metadata: TokenExtractionMetadata = {
		extraction_method: 'none',
		attempted_formats: [],
		success: false
	};
	const parseNumericStrings = options.parseNumericStrings ?? false;
	const includeTotalTokens = options.includeTotalTokens ?? false;
	const computeTotalTokens = options.computeTotalTokens ?? false;

	// Try explicit token mapping first
	if (tokenMapping) {
		try {
			const mapping = parseTokenMapping(tokenMapping);
			if (mapping) {
				tokens = extractTokensWithMapping(responseData, mapping, {
					parseNumericStrings,
					includeTotalTokens,
					computeTotalTokens
				});
				metadata.extraction_method = 'explicit_mapping';
				metadata.mapping_used = mapping;

				if (hasInputOrOutputTokens(tokens)) {
					metadata.success = true;
					return { tokens, metadata };
				}
			}
		} catch (error) {
			metadata.explicit_mapping_error = error instanceof Error ? error.message : 'Unknown error';
		}
	}

	const formats = options.popularFormats ?? POPULAR_TOKEN_FORMATS;
	for (let i = 0; i < formats.length; i++) {
		const format = formats[i];
		metadata.attempted_formats.push(format);

		tokens = extractTokensWithMapping(responseData, format, {
			parseNumericStrings,
			includeTotalTokens,
			computeTotalTokens
		});

		if (hasInputOrOutputTokens(tokens)) {
			metadata.extraction_method = `popular_format_${i + 1}`;
			metadata.successful_format = format;
			metadata.success = true;
			return { tokens, metadata };
		}
	}

	metadata.extraction_method = 'failed';
	return { tokens: {}, metadata };
};
