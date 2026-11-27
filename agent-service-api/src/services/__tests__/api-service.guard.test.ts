import axios from 'axios';
import { ApiService } from '../api-service';

jest.mock('axios');

jest.mock('@ibm-vibe/outbound-guard', () => {
	const actual = jest.requireActual('@ibm-vibe/outbound-guard');
	return {
		...actual,
		assertSafeOutboundUrl: jest.fn(actual.assertSafeOutboundUrl),
		guardedAxiosOptions: jest.fn(() => ({ lookup: jest.fn(), maxRedirects: 0, proxy: false }))
	};
});

const guard = jest.requireMock('@ibm-vibe/outbound-guard') as {
	assertSafeOutboundUrl: jest.Mock;
	guardedAxiosOptions: jest.Mock;
};
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('ApiService.makeApiRequest outbound guard', () => {
	beforeEach(() => {
		jest.clearAllMocks();
	});

	it('refuses a blocked literal before making any request', async () => {
		const service = new ApiService() as any;

		await expect(service.makeApiRequest('http://169.254.169.254/latest/', 'GET', {})).rejects.toMatchObject({
			code: 'OUTBOUND_BLOCKED'
		});
		await expect(service.makeApiRequest('http://169.254.169.254/', 'POST', {})).rejects.toMatchObject({
			code: 'OUTBOUND_BLOCKED'
		});

		expect(mockedAxios.get).not.toHaveBeenCalled();
		expect(mockedAxios).not.toHaveBeenCalled();
	});

	it('applies guarded axios options to GET requests', async () => {
		const service = new ApiService() as any;
		mockedAxios.get.mockResolvedValue({ data: {} } as any);

		await service.makeApiRequest('http://8.8.8.8/', 'GET', { q: 'x' });

		expect(guard.assertSafeOutboundUrl).toHaveBeenCalledWith('http://8.8.8.8/', expect.any(Object));
		expect(mockedAxios.get).toHaveBeenCalledWith(
			expect.stringContaining('q=x'),
			expect.objectContaining({ maxRedirects: 0, proxy: false, lookup: expect.any(Function) })
		);
	});

	it('applies guarded axios options to non-GET requests', async () => {
		const service = new ApiService() as any;
		(mockedAxios as any).mockResolvedValue({ data: {} });

		await service.makeApiRequest('http://8.8.8.8/', 'POST', { input: 'hi' });

		expect(mockedAxios).toHaveBeenCalledWith(
			expect.objectContaining({ maxRedirects: 0, proxy: false, lookup: expect.any(Function) })
		);
	});
});
