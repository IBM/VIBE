import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import JobsManager from '../JobsManager';
import { api } from '@/lib/api';
import { useAgents, useTests, useAppData } from '@/lib/AppDataContext';

jest.mock('@/lib/api', () => ({
	api: {
		getJobsWithCount: jest.fn(),
		createJob: jest.fn(),
		executeConversation: jest.fn(),
		deleteJob: jest.fn(),
		cancelJob: jest.fn()
	}
}));

jest.mock('@/lib/AppDataContext', () => ({
	useAgents: jest.fn(),
	useTests: jest.fn(),
	useAppData: jest.fn()
}));

jest.mock(
	'../SimilarityScoreDisplay',
	() =>
		function MockSimilarityScoreDisplay() {
			return <div data-testid="similarity-score" />;
		}
);

const mockedApi = api as jest.Mocked<typeof api>;
const mockedUseAgents = useAgents as jest.Mock;
const mockedUseTests = useTests as jest.Mock;
const mockedUseAppData = useAppData as jest.Mock;

beforeAll(() => {
	class ResizeObserver {
		observe() {}
		unobserve() {}
		disconnect() {}
	}
	(window as unknown as { ResizeObserver?: typeof ResizeObserver }).ResizeObserver = ResizeObserver;
});

beforeEach(() => {
	jest.clearAllMocks();
	mockedUseAgents.mockReturnValue({
		agents: [{ id: 1, name: 'Agent A', version: '1' }],
		fetchAgents: jest.fn()
	});
	mockedUseTests.mockReturnValue({
		tests: [{ id: 2, name: 'Test A' }],
		fetchTests: jest.fn()
	});
	mockedUseAppData.mockReturnValue({
		getResultById: jest.fn().mockReturnValue(null),
		fetchResults: jest.fn()
	});
});

describe('JobsManager', () => {
	it('shows empty state when no jobs exist', async () => {
		mockedApi.getJobsWithCount.mockResolvedValue({ data: [], total: 0 });

		render(<JobsManager onViewSession={jest.fn()} onViewConversation={jest.fn()} />);

		expect(await screen.findByText(/No jobs found/i)).toBeInTheDocument();
	});

	it('opens job details and allows rerun and view session', async () => {
		const user = userEvent.setup();
		const onViewSession = jest.fn();
		const onViewConversation = jest.fn();

		mockedApi.getJobsWithCount.mockResolvedValue({
			data: [
				{
					id: 'job-1',
					agent_id: 1,
					test_id: 2,
					session_id: 44,
					status: 'completed',
					progress: 100,
					created_at: '2024-01-01T00:00:00Z',
					updated_at: '2024-01-01T00:00:00Z'
				}
			],
			total: 1
		});
		mockedApi.createJob.mockResolvedValue({ id: 'job-2' } as any);

		render(<JobsManager onViewSession={onViewSession} onViewConversation={onViewConversation} />);

		await screen.findByText('Test Jobs');
		await user.click(screen.getByLabelText('View job details'));

		await user.click(screen.getByRole('button', { name: /Re-run Job/i }));
		await waitFor(() => {
			expect(mockedApi.createJob).toHaveBeenCalledWith(1, 2);
		});

		await user.click(screen.getByRole('button', { name: /View Session/i }));
		expect(onViewSession).toHaveBeenCalledWith(44);
		expect(onViewConversation).not.toHaveBeenCalled();
	}, 20000);
});
