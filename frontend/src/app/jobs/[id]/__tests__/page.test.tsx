import { render, screen, waitFor } from '@testing-library/react'; // waitFor used in re-run test
import userEvent from '@testing-library/user-event';
import JobDetailPage from '../page';
import { api } from '../../../../lib/api';

const mockPush = jest.fn();

jest.mock('next/navigation', () => ({
	useParams: () => ({ id: 'job-abc-123' }),
	useRouter: () => ({ push: mockPush })
}));

jest.mock('../../../../lib/api', () => ({
	api: {
		getJobStatus: jest.fn(),
		createJob: jest.fn(),
		executeConversation: jest.fn(),
		cancelJob: jest.fn(),
		deleteJob: jest.fn()
	}
}));

jest.mock('../../../../lib/AppDataContext', () => ({
	useAgents: () => ({ agents: [{ id: 1, name: 'Agent A', version: '2' }] }),
	useTests: () => ({ tests: [{ id: 5, name: 'Test A' }] })
}));

// Carbon Modal uses ResizeObserver internally
beforeAll(() => {
	class ResizeObserver {
		observe() {}
		unobserve() {}
		disconnect() {}
	}
	(window as unknown as { ResizeObserver?: typeof ResizeObserver }).ResizeObserver = ResizeObserver;
});

const mockedApi = api as jest.Mocked<typeof api>;

const baseJob = {
	id: 'job-abc-123',
	agent_id: 1,
	conversation_id: 10,
	status: 'completed' as const,
	progress: 100,
	created_at: '2024-06-01T10:00:00Z',
	updated_at: '2024-06-01T10:01:00Z'
};

beforeEach(() => {
	jest.clearAllMocks();
	mockPush.mockReset();
});

describe('JobDetailPage', () => {
	it('renders loading state initially', () => {
		mockedApi.getJobStatus.mockReturnValue(new Promise(() => {}));
		render(<JobDetailPage />);
		expect(screen.getByText(/Loading job/i)).toBeInTheDocument();
	});

	it('renders job details after load', async () => {
		mockedApi.getJobStatus.mockResolvedValue(baseJob as any);
		render(<JobDetailPage />);

		// Full ID appears in the details table (heading shows truncated version)
		await screen.findByText('job-abc-123');
		expect(screen.getAllByText('Completed').length).toBeGreaterThan(0);
		expect(screen.getByText(/Agent A \(v2\)/i)).toBeInTheDocument();
	});

	it('shows error notification on load failure', async () => {
		mockedApi.getJobStatus.mockRejectedValue(new Error('Network error'));
		render(<JobDetailPage />);

		await screen.findByText(/Network error/i);
	});

	it('navigates back to jobs list', async () => {
		const user = userEvent.setup();
		mockedApi.getJobStatus.mockResolvedValue(baseJob as any);
		render(<JobDetailPage />);

		await screen.findByText('job-abc-123');
		await user.click(screen.getByRole('button', { name: /Back to jobs/i }));
		expect(mockPush).toHaveBeenCalledWith('/jobs');
	});

	it('shows View session button when session_id is present and navigates', async () => {
		const user = userEvent.setup();
		mockedApi.getJobStatus.mockResolvedValue({ ...baseJob, session_id: 99 } as any);
		render(<JobDetailPage />);

		await screen.findByText('job-abc-123');
		const viewSession = screen.getByRole('button', { name: /View session/i });
		await user.click(viewSession);
		expect(mockPush).toHaveBeenCalledWith('/sessions/99');
	});

	it('navigates to new job after re-run for conversation job', async () => {
		const user = userEvent.setup();
		mockedApi.getJobStatus.mockResolvedValue(baseJob as any);
		mockedApi.executeConversation.mockResolvedValue({ job_id: 'job-new-456', message: 'Started' });
		render(<JobDetailPage />);

		await screen.findByText('job-abc-123');
		await user.click(screen.getByRole('button', { name: /Re-run/i }));

		await waitFor(() => {
			expect(mockPush).toHaveBeenCalledWith('/jobs/job-new-456');
		});
	});

	it('calls deleteJob API and navigates back after delete', async () => {
		const user = userEvent.setup();
		mockedApi.getJobStatus.mockResolvedValue(baseJob as any);
		mockedApi.deleteJob.mockResolvedValue(undefined);
		render(<JobDetailPage />);

		await screen.findByText('job-abc-123');

		// Click the action bar Delete button (danger--ghost kind)
		const deleteButtons = screen.getAllByRole('button', { name: /Delete/i });
		await user.click(deleteButtons[0]);

		// Body gets the modal-open class when modal opens
		await waitFor(() => {
			expect(document.body.classList.contains('cds--body--with-modal-open')).toBe(true);
		});
	});
});
