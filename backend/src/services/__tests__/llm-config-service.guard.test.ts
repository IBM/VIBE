import { LLMConfigService } from '../llm-config-service';
import * as dbQueries from '../../db/queries';
import axios from 'axios';

jest.mock('../../db/queries');
jest.mock('axios');

describe('LLMConfigService outbound guard', () => {
	let service: LLMConfigService;
	const mockedAxios = axios as jest.Mocked<typeof axios>;

	const ollamaConfig = (baseUrl: string) => ({
		id: 7,
		provider: 'ollama',
		config: JSON.stringify({ model: 'llama2', base_url: baseUrl }),
		priority: 1
	});

	beforeEach(() => {
		jest.clearAllMocks();
		service = new LLMConfigService();
	});

	it('refuses a blocked base_url before making any request', async () => {
		(dbQueries.getLLMConfigById as jest.Mock).mockReturnValue(ollamaConfig('http://169.254.169.254'));

		const result = await service.callLLM(7, { prompt: 'hi' });

		expect(mockedAxios.post).not.toHaveBeenCalled();
		expect(result.error).toContain('Outbound request to this address is not allowed');
		expect(result.error).not.toContain('169.254');
	});

	it('refuses a mapped IPv6 metadata base_url before making any request', async () => {
		(dbQueries.getLLMConfigById as jest.Mock).mockReturnValue(ollamaConfig('http://[::ffff:a9fe:a9fe]'));

		const result = await service.callLLM(7, { prompt: 'hi' });

		expect(mockedAxios.post).not.toHaveBeenCalled();
		expect(result.error).toContain('Outbound request to this address is not allowed');
	});

	it('applies guarded axios options to a permitted loopback base_url', async () => {
		(dbQueries.getLLMConfigById as jest.Mock).mockReturnValue(ollamaConfig('http://127.0.0.1:11434'));
		mockedAxios.post.mockResolvedValue({ data: { response: 'ok' } } as any);

		const result = await service.callLLM(7, { prompt: 'hi' });

		expect(result.text).toBe('ok');
		expect(mockedAxios.post).toHaveBeenCalledWith(
			'http://127.0.0.1:11434/api/generate',
			expect.any(Object),
			expect.objectContaining({ maxRedirects: 0, proxy: false, lookup: expect.any(Function) })
		);
	});
});
