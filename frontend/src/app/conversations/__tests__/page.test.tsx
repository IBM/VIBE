import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ConversationsPage from '../page';
import { api } from '../../../lib/api';

const mockPush = jest.fn();

jest.mock('next/navigation', () => ({
	useRouter: () => ({ push: mockPush })
}));

jest.mock('../../../lib/api', () => ({
	api: {
		getConversations: jest.fn(),
		getConversationById: jest.fn(),
		deleteConversation: jest.fn()
	}
}));

jest.mock('../../components/TableRenderer', () => ({
	__esModule: true,
	default: ({
		rows,
		onView,
		onEdit,
		onDelete
	}: {
		rows: Array<{ id: string }>;
		onView: (id: number) => void;
		onEdit: (id: number) => void;
		onDelete: (id: number) => void;
	}) => (
		<div>
			<span>TableRenderer</span>
			{rows.length > 0 && (
				<div>
					<button type="button" onClick={() => onView(Number(rows[0].id))}>
						View
					</button>
					<button type="button" onClick={() => onEdit(Number(rows[0].id))}>
						Edit
					</button>
					<button type="button" onClick={() => onDelete(Number(rows[0].id))}>
						Delete
					</button>
				</div>
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

jest.mock('../../components/ConversationFormModal', () => ({
	__esModule: true,
	default: ({ isOpen }: { isOpen: boolean }) => (isOpen ? <div>ConversationFormModal</div> : null)
}));

jest.mock('../../components/DeleteConfirmationModal', () => ({
	__esModule: true,
	default: ({ isOpen }: { isOpen: boolean }) => (isOpen ? <div>DeleteConfirmationModal</div> : null)
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

describe('ConversationsPage', () => {
	it('shows empty state when no conversations exist', async () => {
		mockedApi.getConversations.mockResolvedValue({ data: [], total: 0 });

		render(<ConversationsPage />);

		expect(await screen.findByText('Conversations')).toBeInTheDocument();
		expect(
			await screen.findByText('Create your first conversation script for multi-turn testing.')
		).toBeInTheDocument();
	});

	it('renders table and navigates to conversation detail', async () => {
		const user = userEvent.setup();
		mockedApi.getConversations.mockResolvedValue({
			data: [{ id: 3, name: 'Conv', description: '', tags: '[]', created_at: '2024-01-01' }],
			total: 1
		});

		render(<ConversationsPage />);

		await waitFor(() => {
			expect(screen.getByText('TableRenderer')).toBeInTheDocument();
		});

		await user.click(screen.getByRole('button', { name: 'View' }));
		expect(mockPush).toHaveBeenCalledWith('/conversations/3');
	});

	it('loads full conversation when editing', async () => {
		const user = userEvent.setup();
		mockedApi.getConversations.mockResolvedValue({
			data: [{ id: 3, name: 'Conv', description: '', tags: '[]', created_at: '2024-01-01' }],
			total: 1
		});
		mockedApi.getConversationById.mockResolvedValue({ id: 3, name: 'Conv' } as any);

		render(<ConversationsPage />);

		await waitFor(() => {
			expect(screen.getByText('TableRenderer')).toBeInTheDocument();
		});

		await user.click(screen.getByRole('button', { name: 'Edit' }));
		await waitFor(() => {
			expect(mockedApi.getConversationById).toHaveBeenCalledWith(3);
		});
		expect(screen.getByText('ConversationFormModal')).toBeInTheDocument();
	});
});
