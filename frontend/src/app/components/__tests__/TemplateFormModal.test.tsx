import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import TemplateFormModal from '../TemplateFormModal';
import { api } from '../../../lib/api';

jest.mock('../../../lib/api', () => ({
	api: {
		getRequestTemplateCapabilityNames: jest.fn(),
		getResponseMapCapabilityNames: jest.fn(),
		createTemplate: jest.fn(),
		updateTemplate: jest.fn(),
		createResponseMap: jest.fn(),
		updateResponseMap: jest.fn()
	}
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
	mockedApi.getRequestTemplateCapabilityNames.mockResolvedValue(['openai-chat']);
	mockedApi.getResponseMapCapabilityNames.mockResolvedValue(['openai-chat']);
});

describe('TemplateFormModal', () => {
	it('shows error when name is missing', async () => {
		const user = userEvent.setup();
		render(<TemplateFormModal isOpen onClose={jest.fn()} onSave={jest.fn()} type="request" />);

		await user.click(screen.getByRole('button', { name: 'Create' }));
		expect(await screen.findByText('Name is required')).toBeInTheDocument();
	});

	it('creates a new request template', async () => {
		const user = userEvent.setup();
		const onSave = jest.fn();
		const onClose = jest.fn();

		mockedApi.createTemplate.mockResolvedValue({ id: 1, name: 'My Template' } as any);

		render(<TemplateFormModal isOpen onClose={onClose} onSave={onSave} type="request" />);

		await user.type(screen.getByLabelText('Name'), 'My Template');
		await user.click(screen.getByRole('button', { name: 'Create' }));

		await waitFor(() => {
			expect(mockedApi.createTemplate).toHaveBeenCalled();
		});
		expect(onSave).toHaveBeenCalled();
		expect(onClose).toHaveBeenCalled();
	});

	it('validates JSON for response map spec', async () => {
		const user = userEvent.setup();
		render(<TemplateFormModal isOpen onClose={jest.fn()} onSave={jest.fn()} type="response" />);

		await user.type(screen.getByLabelText('Name'), 'Response Map');
		const specInput = screen.getByLabelText('Spec (JSON)');
		fireEvent.change(specInput, { target: { value: '{invalid' } });
		await user.click(screen.getByRole('button', { name: 'Create' }));

		expect(await screen.findByText('Invalid JSON in spec')).toBeInTheDocument();
	});
});
