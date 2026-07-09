import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import ConversationFormModal from '../ConversationFormModal';
import { api } from '../../../lib/api';

jest.mock('../../../lib/api', () => ({
	api: {
		getRequestTemplateCapabilityNames: jest.fn(),
		getResponseMapCapabilityNames: jest.fn(),
		createConversation: jest.fn(),
		updateConversation: jest.fn(),
		getConversationTurnTargets: jest.fn(),
		saveConversationTurnTarget: jest.fn()
	}
}));

jest.mock('../TemplateSelector', () => ({
	TemplatePreviewSelector: () => <div data-testid="template-preview" />
}));

jest.mock('../TemplateInfoPanel', () => ({
	CapabilityInfoPanel: () => <div data-testid="capability-info" />
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
	mockedApi.getRequestTemplateCapabilityNames.mockResolvedValue([]);
	mockedApi.getResponseMapCapabilityNames.mockResolvedValue([]);
	mockedApi.getConversationTurnTargets.mockResolvedValue([]);
});

describe('ConversationFormModal', () => {
	it('shows validation error when name is missing', async () => {
		render(<ConversationFormModal isOpen onClose={jest.fn()} onSave={jest.fn()} />);

		fireEvent.click(screen.getByRole('button', { name: 'Save' }));

		expect(await screen.findByText('Name is required')).toBeInTheDocument();
	});

	it('creates a conversation and closes on success', async () => {
		const onSave = jest.fn();
		const onClose = jest.fn();

		mockedApi.createConversation.mockResolvedValue({
			id: 1,
			name: 'New conversation',
			description: '',
			tags: '[]',
			variables: '',
			stop_on_failure: false
		} as any);

		render(<ConversationFormModal isOpen onClose={onClose} onSave={onSave} />);

		fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'New conversation' } });
		fireEvent.click(screen.getByRole('button', { name: /Add message/i }));
		const contentFields = await screen.findAllByLabelText('Content');
		fireEvent.change(contentFields[0], { target: { value: 'Hello world' } });
		fireEvent.click(screen.getByRole('button', { name: 'Save' }));

		await waitFor(() => {
			expect(mockedApi.createConversation).toHaveBeenCalled();
		});

		const payload = mockedApi.createConversation.mock.calls[0][0] as any;
		expect(payload.name).toBe('New conversation');
		expect(payload.messages).toHaveLength(1);
		expect(payload.messages[0].sequence).toBe(1);
		expect(mockedApi.saveConversationTurnTarget).not.toHaveBeenCalled();
		expect(onSave).toHaveBeenCalled();
		expect(onClose).toHaveBeenCalled();
	});
});
