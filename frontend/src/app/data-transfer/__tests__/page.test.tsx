import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import DataTransferPage from '../page';
import { api } from '../../../lib/api';

jest.mock('../../../lib/api', () => ({
	api: {
		exportData: jest.fn(),
		analyzeImport: jest.fn(),
		executeImport: jest.fn()
	}
}));

const mockedApi = api as jest.Mocked<typeof api>;
const createBundle = (data: Record<string, unknown> = {}) => ({
	version: 1,
	exported_at: '2026-03-03T12:00:00.000Z',
	data
});
const createDeferred = <T,>() => {
	let resolve!: (value: T) => void;
	let reject!: (reason?: unknown) => void;
	const promise = new Promise<T>((res, rej) => {
		resolve = res;
		reject = rej;
	});
	return { promise, resolve, reject };
};

describe('DataTransferPage', () => {
	beforeAll(() => {
		Object.defineProperty(window, 'matchMedia', {
			writable: true,
			value: jest.fn().mockImplementation((query: string) => ({
				matches: false,
				media: query,
				onchange: null,
				addListener: jest.fn(),
				removeListener: jest.fn(),
				addEventListener: jest.fn(),
				removeEventListener: jest.fn(),
				dispatchEvent: jest.fn()
			}))
		});
	});

	beforeEach(() => {
		jest.clearAllMocks();
		window.localStorage.clear();
		mockedApi.exportData.mockResolvedValue({
			...createBundle()
		} as any);
		mockedApi.analyzeImport.mockResolvedValue({
			items: [],
			totals: { new: 0, conflict: 0, dependency_missing: 0 },
			has_issues: false
		} as any);
		mockedApi.executeImport.mockResolvedValue({
			created: 0,
			updated: 0,
			skipped: 0,
			items: []
		} as any);
	});

	it('renders export checkboxes and persists selections in localStorage', async () => {
		const user = userEvent.setup();
		render(<DataTransferPage />);

		const agentsCheckbox = await screen.findByRole('checkbox', { name: /agents/i });
		expect(agentsCheckbox).toBeChecked();

		await user.click(agentsCheckbox);
		expect(agentsCheckbox).not.toBeChecked();

		const saved = window.localStorage.getItem('vibe:export-preferences');
		expect(saved).toContain('conversations');
		expect(saved).not.toContain('agents');
	});

	it('loads saved export selections after mount', async () => {
		window.localStorage.setItem('vibe:export-preferences', JSON.stringify(['conversations']));

		render(<DataTransferPage />);

		await waitFor(() => {
			expect(screen.getByRole('checkbox', { name: /agents/i })).not.toBeChecked();
		});
		expect(screen.getByRole('checkbox', { name: /conversations/i })).toBeChecked();
		expect(screen.getByRole('checkbox', { name: /test suites/i })).not.toBeChecked();
	});

	it('uses saved export selections for the first export action', async () => {
		const user = userEvent.setup();
		window.localStorage.setItem('vibe:export-preferences', JSON.stringify(['conversations']));

		render(<DataTransferPage />);

		await user.click(screen.getByRole('button', { name: /export selected/i }));

		expect(mockedApi.exportData).toHaveBeenCalledWith(['conversations']);
	});

	it('uploads bundle, renders review rows, allows resolution changes, and imports with selected resolutions', async () => {
		const user = userEvent.setup();
		mockedApi.executeImport.mockResolvedValue({
			created: 0,
			updated: 1,
			skipped: 0,
			items: [
				{
					item_key: 'agents:Bot@1.0',
					entity_type: 'agents',
					entity_name: 'Bot@1.0',
					action: 'updated'
				}
			]
		} as any);
		mockedApi.analyzeImport.mockResolvedValue({
			items: [
				{
					item_key: 'agents:Bot@1.0',
					entity_type: 'agents',
					entity_name: 'Bot@1.0',
					status: 'conflict',
					existing_id: 2,
					issues: []
				}
			],
			totals: { new: 0, conflict: 1, dependency_missing: 0 },
			has_issues: true
		} as any);

		render(<DataTransferPage />);
		await user.click(screen.getByRole('tab', { name: 'Import' }));

		const fileInput = await screen.findByLabelText(/import file/i);
		const file = new File(
			[
				JSON.stringify(createBundle({
					agents: [{ name: 'Bot', version: '1.0', prompt: 'test', settings: '{}' }]
				}))
			],
			'bundle.json',
			{ type: 'application/json' }
		);

		await user.upload(fileInput, file);

		await waitFor(() => {
			expect(mockedApi.analyzeImport).toHaveBeenCalledTimes(2);
		});
		expect(await screen.findByText('Bot@1.0')).toBeInTheDocument();

		const resolutionSelect = screen.getByLabelText('Resolution for agents Bot@1.0');
		await user.selectOptions(resolutionSelect, 'overwrite');
		await waitFor(() => {
			expect(mockedApi.analyzeImport).toHaveBeenCalledTimes(3);
		});
		expect(mockedApi.analyzeImport).toHaveBeenLastCalledWith(
			expect.objectContaining({ version: 1 }),
			{
				'agents:Bot@1.0': {
					item_key: 'agents:Bot@1.0',
					decision: 'overwrite'
				}
			}
		);

		await user.click(screen.getByRole('button', { name: /import selected/i }));

		await waitFor(() => {
			expect(mockedApi.executeImport).toHaveBeenCalledWith({
				bundle: expect.objectContaining({ version: 1 }),
				resolutions: {
					'agents:Bot@1.0': {
						item_key: 'agents:Bot@1.0',
						decision: 'overwrite'
					}
				}
			});
		});
		expect(screen.queryByLabelText('Resolution for agents Bot@1.0')).not.toBeInTheDocument();
		expect(screen.getByText(/created 0, updated 1, skipped 0/i)).toBeInTheDocument();
		expect(screen.getByText('updated')).toBeInTheDocument();
	});

	it('renders dependency-missing items with issue details and only allows skip', async () => {
		const user = userEvent.setup();
		mockedApi.analyzeImport.mockResolvedValue({
			items: [
				{
					item_key: 'conversations:conversation:abc123',
					entity_type: 'conversations',
					entity_name: 'Broken flow [abc123]',
					status: 'dependency_missing',
					issues: ['Missing request template dependency in message #1: missing-template']
				}
			],
			totals: { new: 0, conflict: 0, dependency_missing: 1 },
			has_issues: true
		} as any);

		render(<DataTransferPage />);
		await user.click(screen.getByRole('tab', { name: 'Import' }));

		const fileInput = await screen.findByLabelText(/import file/i);
		const file = new File([JSON.stringify(createBundle())], 'bundle.json', { type: 'application/json' });
		await user.upload(fileInput, file);
		await waitFor(() => {
			expect(mockedApi.analyzeImport).toHaveBeenCalledTimes(2);
		});

		expect(await screen.findByText('Broken flow [abc123]')).toBeInTheDocument();
		expect(screen.getByText(/items with dependency issues can only be skipped/i)).toBeInTheDocument();
		expect(screen.getByText(/missing request template dependency in message #1: missing-template/i)).toBeInTheDocument();

		const resolutionSelect = screen.getByLabelText('Resolution for conversations Broken flow [abc123]');
		expect(resolutionSelect).toBeDisabled();
		const options = within(resolutionSelect).getAllByRole('option');
		expect(options).toHaveLength(1);
		expect(options[0]).toHaveValue('skip');
	});

	it('shows inline error when import fails', async () => {
		const user = userEvent.setup();
		mockedApi.analyzeImport.mockResolvedValue({
			items: [
				{
					item_key: 'agents:Bot@1.0',
					entity_type: 'agents',
					entity_name: 'Bot@1.0',
					status: 'conflict',
					existing_id: 2,
					issues: []
				}
			],
			totals: { new: 0, conflict: 1, dependency_missing: 0 },
			has_issues: true
		} as any);
		mockedApi.executeImport.mockRejectedValue(new Error('Invalid decision "overwrite" for agents "Bot@1.0"'));

		render(<DataTransferPage />);
		await user.click(screen.getByRole('tab', { name: 'Import' }));

		const fileInput = await screen.findByLabelText(/import file/i);
		const file = new File([JSON.stringify(createBundle())], 'bundle.json', { type: 'application/json' });
		await user.upload(fileInput, file);
		await waitFor(() => {
			expect(mockedApi.analyzeImport).toHaveBeenCalledTimes(2);
		});

		const resolutionSelect = await screen.findByLabelText('Resolution for agents Bot@1.0');
		await user.selectOptions(resolutionSelect, 'overwrite');
		await waitFor(() => {
			expect(mockedApi.analyzeImport).toHaveBeenCalledTimes(3);
		});
		await user.click(screen.getByRole('button', { name: /import selected/i }));

		expect(await screen.findByText(/invalid decision "overwrite" for agents "bot@1.0"/i)).toBeInTheDocument();
	});

	it('keeps the latest analysis response when earlier requests resolve later', async () => {
		const user = userEvent.setup();
		const initialReport = {
			items: [
				{
					item_key: 'agents:Bot@1.0',
					entity_type: 'agents',
					entity_name: 'Bot@1.0',
					status: 'conflict',
					existing_id: 2,
					issues: []
				}
			],
			totals: { new: 0, conflict: 1, dependency_missing: 0 },
			has_issues: true
		};
		const staleAnalysis = createDeferred<any>();
		const latestAnalysis = createDeferred<any>();

		mockedApi.analyzeImport
			.mockResolvedValueOnce(initialReport as any)
			.mockResolvedValueOnce(initialReport as any)
			.mockImplementationOnce(() => staleAnalysis.promise)
			.mockImplementationOnce(() => latestAnalysis.promise);

		render(<DataTransferPage />);
		await user.click(screen.getByRole('tab', { name: 'Import' }));

		const fileInput = await screen.findByLabelText(/import file/i);
		const file = new File(
			[
				JSON.stringify(createBundle({
					agents: [{ name: 'Bot', version: '1.0', prompt: 'test', settings: '{}' }]
				}))
			],
			'bundle.json',
			{ type: 'application/json' }
		);

		await user.upload(fileInput, file);
		await waitFor(() => {
			expect(mockedApi.analyzeImport).toHaveBeenCalledTimes(2);
		});

		const resolutionSelect = await screen.findByLabelText('Resolution for agents Bot@1.0');
		await user.selectOptions(resolutionSelect, 'overwrite');
		await user.selectOptions(resolutionSelect, 'create_new');
		await waitFor(() => {
			expect(mockedApi.analyzeImport).toHaveBeenCalledTimes(4);
		});

		await act(async () => {
			latestAnalysis.resolve({
				items: [
					{
						item_key: 'agents:Bot@1.0',
						entity_type: 'agents',
						entity_name: 'Bot latest',
						status: 'conflict',
						existing_id: 2,
						issues: []
					}
				],
				totals: { new: 0, conflict: 1, dependency_missing: 0 },
				has_issues: true
			} as any);
		});

		expect(await screen.findByText('Bot latest')).toBeInTheDocument();
		expect(screen.getByLabelText('Resolution for agents Bot latest')).toHaveValue('create_new');

		await act(async () => {
			staleAnalysis.resolve({
				items: [
					{
						item_key: 'agents:Bot@1.0',
						entity_type: 'agents',
						entity_name: 'Bot stale',
						status: 'conflict',
						existing_id: 2,
						issues: []
					}
				],
				totals: { new: 0, conflict: 1, dependency_missing: 0 },
				has_issues: true
			} as any);
		});

		await waitFor(() => {
			expect(screen.queryByText('Bot stale')).not.toBeInTheDocument();
		});
		expect(screen.getByText('Bot latest')).toBeInTheDocument();
		expect(screen.getByLabelText('Resolution for agents Bot latest')).toHaveValue('create_new');
	});

	it('allows uploading the same file again after analysis completes', async () => {
		const user = userEvent.setup();
		render(<DataTransferPage />);
		await user.click(screen.getByRole('tab', { name: 'Import' }));

		const fileInput = await screen.findByLabelText(/import file/i);
		const file = new File([JSON.stringify(createBundle())], 'bundle.json', { type: 'application/json' });

		await user.upload(fileInput, file);
		await waitFor(() => {
			expect(mockedApi.analyzeImport).toHaveBeenCalledTimes(2);
		});

		await user.upload(fileInput, file);
		await waitFor(() => {
			expect(mockedApi.analyzeImport).toHaveBeenCalledTimes(4);
		});
	});
});

