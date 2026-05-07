/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState } from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AppDataProvider, useAgents, useTests, useLLMConfigs, useResultOperations } from '../AppDataContext';
import { api } from '../api';
import type { LLMRequestOptions } from '@ibm-vibe/types';

jest.mock('../api', () => ({
	api: {
		getAgents: jest.fn(),
		getTests: jest.fn(),
		getLLMConfigs: jest.fn(),
		getResults: jest.fn(),

		createAgent: jest.fn(),
		updateAgent: jest.fn(),
		deleteAgent: jest.fn(),

		createTest: jest.fn(),
		updateTest: jest.fn(),
		deleteTest: jest.fn(),

		createLLMConfig: jest.fn(),
		updateLLMConfig: jest.fn(),
		deleteLLMConfig: jest.fn(),

		callLLM: jest.fn(),
		callLLMWithFallback: jest.fn(),

		getResultById: jest.fn(),
		getResultsWithCount: jest.fn(),
		scoreResult: jest.fn()
	}
}));

const mockedApi = api as jest.Mocked<typeof api>;

function AgentsHarness() {
	const { agents, isLoading, error, fetchAgents, createAgent, updateAgent, deleteAgent } = useAgents();

	return (
		<div>
			<div data-testid="agents-loading">{String(isLoading)}</div>
			<div data-testid="agents-error">{error ?? ''}</div>
			<div data-testid="agents-count">{agents.length}</div>
			<div data-testid="agents-first-name">{agents[0]?.name ?? ''}</div>

			<button type="button" onClick={() => fetchAgents()}>
				Fetch agents
			</button>
			<button
				type="button"
				onClick={() => createAgent({ name: 'New agent', version: '1', prompt: 'p', settings: '{}' } as any)}
			>
				Create agent
			</button>
			<button type="button" onClick={() => updateAgent(1, { name: 'Updated agent' } as any)}>
				Update agent
			</button>
			<button type="button" onClick={() => deleteAgent(1)}>
				Delete agent
			</button>
		</div>
	);
}

function TestsHarness() {
	const { tests, isLoading, error, fetchTests, createTest, updateTest, deleteTest } = useTests();

	return (
		<div>
			<div data-testid="tests-loading">{String(isLoading)}</div>
			<div data-testid="tests-error">{error ?? ''}</div>
			<div data-testid="tests-count">{tests.length}</div>
			<div data-testid="tests-first-name">{tests[0]?.name ?? ''}</div>

			<button type="button" onClick={() => fetchTests()}>
				Fetch tests
			</button>
			<button
				type="button"
				onClick={() =>
					createTest({ name: 'New test', description: '', input: 'i', expected_output: 'o' } as any)
				}
			>
				Create test
			</button>
			<button type="button" onClick={() => updateTest(1, { name: 'Updated test' } as any)}>
				Update test
			</button>
			<button type="button" onClick={() => deleteTest(1)}>
				Delete test
			</button>
		</div>
	);
}

function LLMConfigsHarness() {
	const {
		llmConfigs,
		loading,
		error,
		fetchLLMConfigs,
		createLLMConfig,
		updateLLMConfig,
		deleteLLMConfig,
		callLLM,
		callLLMWithFallback
	} = useLLMConfigs();
	const [llmResult, setLlmResult] = useState<string>('');

	const options: LLMRequestOptions = { prompt: 'Hello' } as any;

	return (
		<div>
			<div data-testid="llm-loading">{String(loading)}</div>
			<div data-testid="llm-error">{error ?? ''}</div>
			<div data-testid="llm-count">{llmConfigs.length}</div>
			<div data-testid="llm-first-name">{llmConfigs[0]?.name ?? ''}</div>
			<div data-testid="llm-result">{llmResult}</div>

			<button type="button" onClick={() => fetchLLMConfigs()}>
				Fetch llm configs
			</button>
			<button
				type="button"
				onClick={() => createLLMConfig({ name: 'New config', provider: 'x', config: '{}', priority: 1 } as any)}
			>
				Create llm config
			</button>
			<button type="button" onClick={() => updateLLMConfig(1, { name: 'Updated config' } as any)}>
				Update llm config
			</button>
			<button type="button" onClick={() => deleteLLMConfig(1)}>
				Delete llm config
			</button>
			<button type="button" onClick={async () => setLlmResult(JSON.stringify(await callLLM(1, options)))}>
				Call llm
			</button>
			<button
				type="button"
				onClick={async () => setLlmResult(JSON.stringify(await callLLMWithFallback(options)))}
			>
				Call llm fallback
			</button>
		</div>
	);
}

function ResultOpsHarness() {
	const { loading, error, getResults, getResultById, scoreResult } = useResultOperations();
	const [value, setValue] = useState<string>('');
	const [caught, setCaught] = useState<string>('');

	return (
		<div>
			<div data-testid="resultsops-loading">{String(loading)}</div>
			<div data-testid="resultsops-error">{error ?? ''}</div>
			<div data-testid="resultsops-value">{value}</div>
			<div data-testid="resultsops-caught">{caught}</div>

			<button
				type="button"
				onClick={async () => {
					try {
						const res = await getResults({ limit: 5 });
						setValue(JSON.stringify(res));
					} catch (err) {
						setCaught(err instanceof Error ? err.message : String(err));
					}
				}}
			>
				Get results
			</button>
			<button
				type="button"
				onClick={async () => {
					try {
						const res = await getResultById(1);
						setValue(JSON.stringify(res));
					} catch (err) {
						setCaught(err instanceof Error ? err.message : String(err));
					}
				}}
			>
				Get result by id
			</button>
			<button
				type="button"
				onClick={async () => {
					try {
						const res = await scoreResult(1, 2);
						setValue(JSON.stringify(res));
					} catch (err) {
						setCaught(err instanceof Error ? err.message : String(err));
					}
				}}
			>
				Score result
			</button>
		</div>
	);
}

describe('AppDataContext (more coverage)', () => {
	beforeEach(() => {
		jest.clearAllMocks();
		mockedApi.getAgents.mockResolvedValue([
			{ id: 1, name: 'Agent A', version: '1', prompt: '', settings: '{}' }
		] as any);
		mockedApi.getTests.mockResolvedValue([{ id: 1, name: 'Test A' }] as any);
		mockedApi.getLLMConfigs.mockResolvedValue([
			{ id: 1, name: 'LLM A', provider: 'x', config: '{}', priority: 1 }
		] as any);
		mockedApi.getResults.mockResolvedValue([{ id: 1 }] as any);

		mockedApi.createAgent.mockResolvedValue({
			id: 2,
			name: 'Agent B',
			version: '1',
			prompt: '',
			settings: '{}'
		} as any);
		mockedApi.updateAgent.mockResolvedValue({
			id: 1,
			name: 'Agent A+',
			version: '1',
			prompt: '',
			settings: '{}'
		} as any);
		mockedApi.deleteAgent.mockResolvedValue(undefined as any);

		mockedApi.createTest.mockResolvedValue({ id: 2, name: 'Test B' } as any);
		mockedApi.updateTest.mockResolvedValue({ id: 1, name: 'Test A+' } as any);
		mockedApi.deleteTest.mockResolvedValue(undefined as any);

		mockedApi.createLLMConfig.mockResolvedValue({
			id: 2,
			name: 'LLM B',
			provider: 'x',
			config: '{}',
			priority: 2
		} as any);
		mockedApi.updateLLMConfig.mockResolvedValue({
			id: 1,
			name: 'LLM A+',
			provider: 'x',
			config: '{}',
			priority: 1
		} as any);
		mockedApi.deleteLLMConfig.mockResolvedValue(undefined as any);

		mockedApi.callLLM.mockResolvedValue({ output: 'ok' } as any);
		mockedApi.callLLMWithFallback.mockResolvedValue({ output: 'ok-fallback' } as any);

		mockedApi.getResultsWithCount.mockResolvedValue({ data: [{ id: 1 }], total: 1 } as any);
		mockedApi.getResultById.mockResolvedValue({ id: 1, status: 'completed' } as any);
		mockedApi.scoreResult.mockResolvedValue({ id: 1, status: 'completed', similarity_score: 0.9 } as any);
	});

	it('covers agent/test/llm hooks and CRUD flows', async () => {
		const user = userEvent.setup();

		render(
			<AppDataProvider>
				<AgentsHarness />
				<TestsHarness />
				<LLMConfigsHarness />
			</AppDataProvider>
		);

		// Agents
		await user.click(screen.getByRole('button', { name: 'Fetch agents' }));
		await waitFor(() => expect(screen.getByTestId('agents-count').textContent).toBe('1'));

		await user.click(screen.getByRole('button', { name: 'Create agent' }));
		await waitFor(() => expect(screen.getByTestId('agents-count').textContent).toBe('2'));

		await user.click(screen.getByRole('button', { name: 'Update agent' }));
		await waitFor(() => expect(screen.getByTestId('agents-first-name').textContent).toBe('Agent A+'));

		await user.click(screen.getByRole('button', { name: 'Delete agent' }));
		await waitFor(() => expect(screen.getByTestId('agents-count').textContent).toBe('1'));

		// Tests
		await user.click(screen.getByRole('button', { name: 'Fetch tests' }));
		await waitFor(() => expect(screen.getByTestId('tests-count').textContent).toBe('1'));

		await user.click(screen.getByRole('button', { name: 'Create test' }));
		await waitFor(() => expect(screen.getByTestId('tests-count').textContent).toBe('2'));

		await user.click(screen.getByRole('button', { name: 'Update test' }));
		await waitFor(() => expect(screen.getByTestId('tests-first-name').textContent).toBe('Test A+'));

		await user.click(screen.getByRole('button', { name: 'Delete test' }));
		await waitFor(() => expect(screen.getByTestId('tests-count').textContent).toBe('1'));

		// LLM configs + call actions
		await user.click(screen.getByRole('button', { name: 'Fetch llm configs' }));
		await waitFor(() => expect(screen.getByTestId('llm-count').textContent).toBe('1'));

		await user.click(screen.getByRole('button', { name: 'Create llm config' }));
		await waitFor(() => expect(screen.getByTestId('llm-count').textContent).toBe('2'));

		await user.click(screen.getByRole('button', { name: 'Update llm config' }));
		await waitFor(() => expect(screen.getByTestId('llm-first-name').textContent).toBe('LLM A+'));

		await user.click(screen.getByRole('button', { name: 'Call llm' }));
		await waitFor(() => expect(screen.getByTestId('llm-result').textContent).toContain('ok'));

		await user.click(screen.getByRole('button', { name: 'Call llm fallback' }));
		await waitFor(() => expect(screen.getByTestId('llm-result').textContent).toContain('ok-fallback'));

		await user.click(screen.getByRole('button', { name: 'Delete llm config' }));
		await waitFor(() => expect(screen.getByTestId('llm-count').textContent).toBe('1'));
	});

	it('sets errors when fetch fails', async () => {
		const user = userEvent.setup();
		mockedApi.getTests.mockRejectedValueOnce(new Error('No tests for you'));

		render(
			<AppDataProvider>
				<TestsHarness />
			</AppDataProvider>
		);

		await user.click(screen.getByRole('button', { name: 'Fetch tests' }));

		await waitFor(() => {
			expect(screen.getByTestId('tests-error').textContent).toBe('No tests for you');
		});
	});

	it('covers useResultOperations success and failure branches', async () => {
		const user = userEvent.setup();

		render(<ResultOpsHarness />);

		await user.click(screen.getByRole('button', { name: 'Get results' }));
		await waitFor(() => expect(screen.getByTestId('resultsops-value').textContent).toContain('"total":1'));

		mockedApi.getResultsWithCount.mockRejectedValueOnce(new Error('Results failed'));
		await user.click(screen.getByRole('button', { name: 'Get results' }));
		await waitFor(() => expect(screen.getByTestId('resultsops-error').textContent).toBe('Results failed'));

		mockedApi.getResultById.mockRejectedValueOnce(new Error('Missing result'));
		await user.click(screen.getByRole('button', { name: 'Get result by id' }));
		await waitFor(() => expect(screen.getByTestId('resultsops-caught').textContent).toBe('Missing result'));

		mockedApi.scoreResult.mockRejectedValueOnce(new Error('Score failed'));
		await user.click(screen.getByRole('button', { name: 'Score result' }));
		await waitFor(() => expect(screen.getByTestId('resultsops-caught').textContent).toBe('Score failed'));
	});
});
