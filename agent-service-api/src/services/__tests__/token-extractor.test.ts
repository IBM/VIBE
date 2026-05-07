import { extractTokenUsage } from '../token-extractor';

describe('token-extractor', () => {
	it('extracts tokens using explicit mapping', () => {
		const responseData = {
			usage: { prompt_tokens: 10, completion_tokens: 5 }
		};
		const mapping = JSON.stringify({
			input_tokens: 'usage.prompt_tokens',
			output_tokens: 'usage.completion_tokens'
		});

		const { tokens, metadata } = extractTokenUsage(responseData, mapping);

		expect(tokens.input_tokens).toBe(10);
		expect(tokens.output_tokens).toBe(5);
		expect(metadata.extraction_method).toBe('explicit_mapping');
		expect(metadata.success).toBe(true);
	});

	it('falls back to popular formats when mapping is invalid', () => {
		const responseData = {
			usage: { prompt_tokens: 4, completion_tokens: 2 }
		};

		const { tokens, metadata } = extractTokenUsage(responseData, '{invalid');

		expect(metadata.explicit_mapping_error).toBeDefined();
		expect(tokens.input_tokens).toBe(4);
		expect(tokens.output_tokens).toBe(2);
		expect(metadata.extraction_method).toBe('popular_format_1');
	});

	it('returns failed metadata when no tokens are found', () => {
		const { tokens, metadata } = extractTokenUsage({ other: 'data' });

		expect(tokens).toEqual({});
		expect(metadata.extraction_method).toBe('failed');
	});

	it('ignores negative token values', () => {
		const responseData = {
			usage: { prompt_tokens: -1, completion_tokens: 3 }
		};

		const { tokens } = extractTokenUsage(responseData);

		expect(tokens.input_tokens).toBeUndefined();
		expect(tokens.output_tokens).toBe(3);
	});

	it('handles extraction errors for invalid paths', () => {
		const responseData = { usage: { prompt_tokens: 5 } };
		const mapping = JSON.stringify({ input_tokens: 123 });

		const { tokens } = extractTokenUsage(responseData, mapping);

		expect(tokens.input_tokens).toBe(5);
	});

	it('handles non-error mapping parse failures', () => {
		const parseSpy = jest.spyOn(JSON, 'parse').mockImplementation(() => {
			throw 'bad';
		});

		const { metadata } = extractTokenUsage(
			{ usage: { prompt_tokens: 1 } },
			'{"input_tokens":"usage.prompt_tokens"}'
		);

		expect(metadata.explicit_mapping_error).toBe('Unknown error');

		parseSpy.mockRestore();
	});
});
