import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import SessionsPage from '../page';
import { api } from '../../../lib/api';

const mockPush = jest.fn();

jest.mock('next/navigation', () => ({
	useRouter: () => ({ push: mockPush })
}));

jest.mock('../../../lib/api', () => ({
	api: {
		getResultsWithCount: jest.fn(),
		getAgents: jest.fn(),
		getConversations: jest.fn()
	}
}));

jest.mock('../../components/TableRenderer', () => ({
	__esModule: true,
	default: ({ rows, onView }: { rows: Array<{ id: string }>; onView: (id: number) => void }) => (
		<div>
			<span>TableRenderer</span>
			{rows.length > 0 && (
				<button type="button" onClick={() => onView(Number(rows[0].id))}>
					View
				</button>
			)}
		</div>
	)
}));

jest.mock('../../components/EmptyState', () => ({
	__esModule: true,
	default: ({ title, description, onAddClick }: { title: string; description: string; onAddClick: () => void }) => (
		<div>
			<h3>{title}</h3>
			<p>{description}</p>
			<button type="button" onClick={onAddClick}>
				Add
			</button>
		</div>
	)
}));

const mockedApi = api as jest.Mocked<typeof api>;

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
	mockPush.mockReset();
});

describe('SessionsPage', () => {
	it('shows empty state when there are no sessions', async () => {
		mockedApi.getResultsWithCount.mockResolvedValue({ data: [], total: 0 });
		mockedApi.getAgents.mockResolvedValue([]);
		mockedApi.getConversations.mockResolvedValue({ data: [], total: 0 });

		render(<SessionsPage />);

		expect(await screen.findByText('Sessions')).toBeInTheDocument();
		expect(await screen.findByText('Execute conversations to see session transcripts here.')).toBeInTheDocument();
	});

	it('renders table and navigates to session detail', async () => {
		const user = userEvent.setup();
		mockedApi.getResultsWithCount.mockResolvedValue({
			data: [
				{
					id: 1,
					agent_id: 2,
					test_id: 3,
					output: 'OK',
					success: true,
					input_tokens: 5,
					output_tokens: 5,
					created_at: '2024-01-01T00:00:00Z'
				}
			],
			total: 1
		});
		mockedApi.getAgents.mockResolvedValue([
			{
				id: 2,
				name: 'Agent A',
				version: '1',
				prompt: '',
				settings: '{}'
			}
		]);
		mockedApi.getConversations.mockResolvedValue({ data: [{ id: 3, name: 'Conv' }], total: 1 });

		render(<SessionsPage />);

		await waitFor(() => {
			expect(screen.getByText('TableRenderer')).toBeInTheDocument();
		});

		await user.click(screen.getByRole('button', { name: 'View' }));
		expect(mockPush).toHaveBeenCalledWith('/sessions/1');
	});
});
