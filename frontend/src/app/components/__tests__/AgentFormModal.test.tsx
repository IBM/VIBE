import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import AgentFormModal from '../AgentFormModal';

// Mock fetch for API calls
global.fetch = jest.fn().mockImplementation((url: string) => {
	// Mock capability names endpoints
	if (url.includes('templates/capability-names')) {
		return Promise.resolve({
			ok: true,
			json: () => Promise.resolve(['openai-chat', 'ollama-generate'])
		});
	}
	if (url.includes('response-maps/capability-names')) {
		return Promise.resolve({
			ok: true,
			json: () => Promise.resolve(['openai-chat', 'ollama-generate'])
		});
	}
	return Promise.resolve({
		ok: true,
		json: () => Promise.resolve([])
	});
}) as jest.Mock;

beforeAll(() => {
	class ResizeObserver {
		observe() {}
		unobserve() {}
		disconnect() {}
	}
	(window as unknown as { ResizeObserver?: typeof ResizeObserver }).ResizeObserver = ResizeObserver;
});

afterEach(() => {
	jest.clearAllMocks();
});

const baseProps = {
	isOpen: true,
	editingId: null,
	formData: {
		'agent-type': 'external_api'
	},
	onClose: jest.fn(),
	onSuccess: jest.fn()
};

describe('AgentFormModal capability inputs', () => {
	it('renders capability ComboBox for new template', async () => {
		render(<AgentFormModal {...baseProps} />);

		// Wait for capability names to load
		await waitFor(() => {
			expect(fetch).toHaveBeenCalledWith(expect.stringContaining('templates/capability-names'));
			expect(fetch).toHaveBeenCalledWith(expect.stringContaining('response-maps/capability-names'));
		});

		const addTemplateButton = screen
			.getAllByRole('button')
			.find((btn) => btn.textContent?.toLowerCase().includes('add new template'));
		expect(addTemplateButton).toBeDefined();
		fireEvent.click(addTemplateButton!);

		// Check that the capability ComboBox is rendered
		const capabilityInput = screen.getByPlaceholderText('Select or type a capability name');
		expect(capabilityInput).toBeInTheDocument();
	});

	it('shows error when advanced settings JSON is invalid', async () => {
		render(
			<AgentFormModal
				{...baseProps}
				formData={{
					'agent-type': 'crewai',
					'agent-settings': '{invalid'
				}}
			/>
		);

		fireEvent.click(screen.getByRole('button', { name: 'Save' }));

		expect(await screen.findByText('Invalid JSON in settings field')).toBeInTheDocument();
	});
});
