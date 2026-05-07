import axios from 'axios';
import { AgentService } from '../agent-service';

// Mock axios
jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

// Mock config
jest.mock('../../config', () => ({
	agentServiceConfig: {
		url: 'http://localhost:8000'
	}
}));

describe('AgentService', () => {
	let service: AgentService;

	beforeEach(() => {
		jest.clearAllMocks();
		service = new AgentService();
	});

	describe('constructor', () => {
		it('should initialize with base URL from config', () => {
			expect(service['baseUrl']).toBe('http://localhost:8000');
		});
	});

	describe('healthCheck', () => {
		it('should return true when health check succeeds', async () => {
			mockedAxios.get.mockResolvedValue({ status: 200, data: {} });

			const result = await service.healthCheck();

			expect(result).toBe(true);
			expect(mockedAxios.get).toHaveBeenCalledWith('http://localhost:8000/api/health', { timeout: 5000 });
		});

		it('should return false when health check fails with error', async () => {
			mockedAxios.get.mockRejectedValue(new Error('Connection refused'));

			const result = await service.healthCheck();

			expect(result).toBe(false);
		});

		it('should return false when health check returns non-200 status', async () => {
			mockedAxios.get.mockResolvedValue({ status: 500, data: {} });

			const result = await service.healthCheck();

			expect(result).toBe(false);
		});

		it('should return false when health check times out', async () => {
			mockedAxios.get.mockRejectedValue(new Error('timeout of 5000ms exceeded'));

			const result = await service.healthCheck();

			expect(result).toBe(false);
		});
	});

	describe('executeTest', () => {
		const mockAgent = {
			id: 1,
			name: 'Test Agent',
			settings: JSON.stringify({
				type: 'crewai',
				model: 'gpt-4',
				temperature: 0.7
			})
		};

		const mockTest = {
			id: 100,
			name: 'Test Case',
			input: 'Test input data'
		};

		it('should execute test successfully', async () => {
			const mockResponse = {
				status: 200,
				data: {
					output: 'Test output',
					success: true,
					execution_time: 1500
				}
			};
			mockedAxios.post.mockResolvedValue(mockResponse);

			const result = await service.executeTest(mockAgent, mockTest);

			expect(result).toEqual(mockResponse.data);
			expect(mockedAxios.post).toHaveBeenCalledWith(
				'http://localhost:8000/execute',
				{
					agent_settings: mockAgent.settings,
					test_input: mockTest.input,
					test_id: mockTest.id,
					agent_id: mockAgent.id
				},
				{ timeout: 300000 }
			);
		});

		it('should throw error when execution fails', async () => {
			mockedAxios.post.mockRejectedValue(new Error('Execution failed'));

			await expect(service.executeTest(mockAgent, mockTest)).rejects.toThrow(
				'Agent service execution failed: Execution failed'
			);
		});

		it('should throw error when agent service is unavailable', async () => {
			mockedAxios.post.mockRejectedValue(new Error('ECONNREFUSED'));

			await expect(service.executeTest(mockAgent, mockTest)).rejects.toThrow(
				'Agent service execution failed: ECONNREFUSED'
			);
		});

		it('should handle timeout errors', async () => {
			mockedAxios.post.mockRejectedValue(new Error('timeout of 300000ms exceeded'));

			await expect(service.executeTest(mockAgent, mockTest)).rejects.toThrow(
				'Agent service execution failed: timeout of 300000ms exceeded'
			);
		});

		it('should handle network errors', async () => {
			mockedAxios.post.mockRejectedValue(new Error('Network Error'));

			await expect(service.executeTest(mockAgent, mockTest)).rejects.toThrow(
				'Agent service execution failed: Network Error'
			);
		});

		it('should pass agent settings as string', async () => {
			const mockResponse = { status: 200, data: { output: 'result' } };
			mockedAxios.post.mockResolvedValue(mockResponse);

			await service.executeTest(mockAgent, mockTest);

			const callArgs = mockedAxios.post.mock.calls[0];
			expect(callArgs[1]).toHaveProperty('agent_settings', mockAgent.settings);
		});

		it('should include all required fields in request', async () => {
			const mockResponse = { status: 200, data: { output: 'result' } };
			mockedAxios.post.mockResolvedValue(mockResponse);

			await service.executeTest(mockAgent, mockTest);

			const callArgs = mockedAxios.post.mock.calls[0];
			const requestBody = callArgs[1];
			expect(requestBody).toHaveProperty('agent_settings');
			expect(requestBody).toHaveProperty('test_input');
			expect(requestBody).toHaveProperty('test_id');
			expect(requestBody).toHaveProperty('agent_id');
		});
	});

	describe('singleton instance', () => {
		it('should export a singleton instance', () => {
			const { agentService } = require('../agent-service');
			expect(agentService).toBeInstanceOf(AgentService);
		});
	});
});

// Made with Bob
