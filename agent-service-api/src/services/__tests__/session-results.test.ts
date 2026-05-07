import axios from 'axios';
import { saveSessionResults } from '../session-results';

jest.mock('axios');

const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('session-results', () => {
	beforeEach(() => {
		jest.clearAllMocks();
	});

	it('creates a session and saves transcript messages', async () => {
		mockedAxios.post.mockResolvedValueOnce({ data: { id: 77 } } as any).mockResolvedValue({ data: {} } as any);

		const sessionId = await saveSessionResults(
			'http://backend',
			5,
			9,
			'2026-01-01T00:00:00.000Z',
			'2026-01-01T00:00:02.000Z',
			{
				conversation_id: 5,
				transcript: [
					{
						sequence: 1,
						role: 'user',
						content: 'Hello',
						timestamp: '2026-01-01T00:00:00.000Z',
						metadata: '{}'
					},
					{
						sequence: 2,
						role: 'assistant',
						content: 'Hi',
						timestamp: '2026-01-01T00:00:01.000Z',
						metadata: '{}'
					}
				],
				success: true,
				execution_time: 2000,
				intermediate_steps: [],
				variables: {},
				metrics: {
					execution_time: 2000,
					input_tokens: 11,
					output_tokens: 13
				}
			}
		);

		expect(sessionId).toBe(77);
		expect(mockedAxios.post).toHaveBeenCalledWith(
			'http://backend/api/sessions',
			expect.objectContaining({
				conversation_id: 5,
				agent_id: 9,
				success: true
			})
		);
		expect(mockedAxios.post).toHaveBeenCalledTimes(3);
	});
});
