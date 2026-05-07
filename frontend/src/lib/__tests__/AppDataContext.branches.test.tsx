import { useState } from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AppDataProvider, useAppData } from '../AppDataContext';
import { api } from '../api';
import type { LLMRequestOptions } from '@ibm-vibe/types';

jest.mock('../api', () => ({
	api: {
		getAgents: jest.fn(),
		getTests: jest.fn(),
		getLLMConfigs: jest.fn(),
		getResults: jest.fn(),
		getResultsWithCount: jest.fn(),
		getResultById: jest.fn(),
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
		scoreResult: jest.fn()
	}
}));

const mockedApi = api as jest.Mocked<typeof api>;

// Test harnesses for different scenarios
function FullContextHarness() {
	const {
		agents,
		tests,
		llmConfigs,
		results,
		loading,
		errors,
		fetchAgents,
		fetchTests,
		fetchLLMConfigs,
		fetchResults,
		fetchAllData,
		createAgent,
		updateAgent,
		deleteAgent,
		createTest,
		updateTest,
		deleteTest,
		createLLMConfig,
		updateLLMConfig,
		deleteLLMConfig,
		callLLM,
		callLLMWithFallback,
		getAgentById,
		getTestById,
		getLLMConfigById,
		getResultById
	} = useAppData();

	return (
		<div>
			<div data-testid="agents-count">{agents.length}</div>
			<div data-testid="tests-count">{tests.length}</div>
			<div data-testid="llm-count">{llmConfigs.length}</div>
			<div data-testid="results-count">{results.length}</div>
			<div data-testid="agents-loading">{String(loading.agents)}</div>
			<div data-testid="tests-loading">{String(loading.tests)}</div>
			<div data-testid="llm-loading">{String(loading.llmConfigs)}</div>
			<div data-testid="results-loading">{String(loading.results)}</div>
			<div data-testid="agents-error">{errors.agents || ''}</div>
			<div data-testid="tests-error">{errors.tests || ''}</div>
			<div data-testid="llm-error">{errors.llmConfigs || ''}</div>
			<div data-testid="results-error">{errors.results || ''}</div>
			<div data-testid="agent-by-id">{getAgentById(1)?.name || ''}</div>
			<div data-testid="test-by-id">{getTestById(1)?.name || ''}</div>
			<div data-testid="llm-by-id">{getLLMConfigById(1)?.name || ''}</div>
			<div data-testid="result-by-id">{getResultById(1)?.id || ''}</div>

			<button type="button" onClick={() => fetchAgents()}>
				Fetch agents
			</button>
			<button type="button" onClick={() => fetchTests()}>
				Fetch tests
			</button>
			<button type="button" onClick={() => fetchLLMConfigs()}>
				Fetch llm
			</button>
			<button type="button" onClick={() => fetchResults()}>
				Fetch results
			</button>
			<button type="button" onClick={() => fetchAllData()}>
				Fetch all
			</button>
			<button
				type="button"
				onClick={() => createAgent({ name: 'New', version: '1', prompt: 'p', settings: '{}' } as any)}
			>
				Create agent
			</button>
			<button type="button" onClick={() => updateAgent(1, { name: 'Updated' } as any)}>
				Update agent
			</button>
			<button type="button" onClick={() => deleteAgent(1)}>
				Delete agent
			</button>
			<button
				type="button"
				onClick={() => createTest({ name: 'New', description: '', input: 'i', expected_output: 'o' } as any)}
			>
				Create test
			</button>
			<button type="button" onClick={() => updateTest(1, { name: 'Updated' } as any)}>
				Update test
			</button>
			<button type="button" onClick={() => deleteTest(1)}>
				Delete test
			</button>
			<button
				type="button"
				onClick={() => createLLMConfig({ name: 'New', provider: 'x', config: '{}', priority: 1 } as any)}
			>
				Create llm
			</button>
			<button type="button" onClick={() => updateLLMConfig(1, { name: 'Updated' } as any)}>
				Update llm
			</button>
			<button type="button" onClick={() => deleteLLMConfig(1)}>
				Delete llm
			</button>
			<button type="button" onClick={() => callLLM(1, { prompt: 'test' } as LLMRequestOptions)}>
				Call llm
			</button>
			<button type="button" onClick={() => callLLMWithFallback({ prompt: 'test' } as LLMRequestOptions)}>
				Call llm fallback
			</button>
		</div>
	);
}

function ErrorHarness() {
	const {
		errors,
		fetchAgents,
		fetchTests,
		fetchLLMConfigs,
		fetchResults,
		createAgent,
		updateAgent,
		deleteAgent,
		createTest,
		updateTest,
		deleteTest,
		createLLMConfig,
		updateLLMConfig,
		deleteLLMConfig
	} = useAppData();
	const [caught, setCaught] = useState<string>('');

	const handleError = async (fn: () => Promise<any>) => {
		try {
			await fn();
		} catch (err) {
			setCaught(err instanceof Error ? err.message : String(err));
		}
	};

	return (
		<div>
			<div data-testid="agents-error-state">{errors.agents || ''}</div>
			<div data-testid="tests-error-state">{errors.tests || ''}</div>
			<div data-testid="llm-error-state">{errors.llmConfigs || ''}</div>
			<div data-testid="results-error-state">{errors.results || ''}</div>
			<div data-testid="caught-error">{caught}</div>
			<button type="button" onClick={() => fetchAgents()}>
				Fetch agents error
			</button>
			<button type="button" onClick={() => fetchTests()}>
				Fetch tests error
			</button>
			<button type="button" onClick={() => fetchLLMConfigs()}>
				Fetch llm error
			</button>
			<button type="button" onClick={() => fetchResults()}>
				Fetch results error
			</button>
			<button
				type="button"
				onClick={() =>
					handleError(() => createAgent({ name: 'New', version: '1', prompt: 'p', settings: '{}' } as any))
				}
			>
				Create agent error
			</button>
			<button type="button" onClick={() => handleError(() => updateAgent(1, { name: 'Updated' } as any))}>
				Update agent error
			</button>
			<button type="button" onClick={() => handleError(() => deleteAgent(1))}>
				Delete agent error
			</button>
			<button
				type="button"
				onClick={() =>
					handleError(() =>
						createTest({ name: 'New', description: '', input: 'i', expected_output: 'o' } as any)
					)
				}
			>
				Create test error
			</button>
			<button type="button" onClick={() => handleError(() => updateTest(1, { name: 'Updated' } as any))}>
				Update test error
			</button>
			<button type="button" onClick={() => handleError(() => deleteTest(1))}>
				Delete test error
			</button>
			<button
				type="button"
				onClick={() =>
					handleError(() => createLLMConfig({ name: 'New', provider: 'x', config: '{}', priority: 1 } as any))
				}
			>
				Create llm error
			</button>
			<button type="button" onClick={() => handleError(() => updateLLMConfig(1, { name: 'Updated' } as any))}>
				Update llm error
			</button>
			<button type="button" onClick={() => handleError(() => deleteLLMConfig(1))}>
				Delete llm error
			</button>
		</div>
	);
}

function NonErrorHarness() {
	const {
		errors,
		fetchAgents,
		fetchTests,
		fetchLLMConfigs,
		fetchResults,
		createAgent,
		updateAgent,
		deleteAgent,
		createTest,
		updateTest,
		deleteTest,
		createLLMConfig,
		updateLLMConfig,
		deleteLLMConfig
	} = useAppData();
	const [caught, setCaught] = useState<string>('');

	const handleError = async (fn: () => Promise<any>) => {
		try {
			await fn();
		} catch (err) {
			setCaught(err instanceof Error ? err.message : String(err));
		}
	};

	return (
		<div>
			<div data-testid="agents-error-state">{errors.agents || ''}</div>
			<div data-testid="tests-error-state">{errors.tests || ''}</div>
			<div data-testid="llm-error-state">{errors.llmConfigs || ''}</div>
			<div data-testid="results-error-state">{errors.results || ''}</div>
			<div data-testid="caught-error">{caught}</div>
			<button type="button" onClick={() => fetchAgents()}>
				Fetch agents non-error
			</button>
			<button type="button" onClick={() => fetchTests()}>
				Fetch tests non-error
			</button>
			<button type="button" onClick={() => fetchLLMConfigs()}>
				Fetch llm non-error
			</button>
			<button type="button" onClick={() => fetchResults()}>
				Fetch results non-error
			</button>
			<button
				type="button"
				onClick={() =>
					handleError(() => createAgent({ name: 'New', version: '1', prompt: 'p', settings: '{}' } as any))
				}
			>
				Create agent non-error
			</button>
			<button type="button" onClick={() => handleError(() => updateAgent(1, { name: 'Updated' } as any))}>
				Update agent non-error
			</button>
			<button type="button" onClick={() => handleError(() => deleteAgent(1))}>
				Delete agent non-error
			</button>
			<button
				type="button"
				onClick={() =>
					handleError(() =>
						createTest({ name: 'New', description: '', input: 'i', expected_output: 'o' } as any)
					)
				}
			>
				Create test non-error
			</button>
			<button type="button" onClick={() => handleError(() => updateTest(1, { name: 'Updated' } as any))}>
				Update test non-error
			</button>
			<button type="button" onClick={() => handleError(() => deleteTest(1))}>
				Delete test non-error
			</button>
			<button
				type="button"
				onClick={() =>
					handleError(() => createLLMConfig({ name: 'New', provider: 'x', config: '{}', priority: 1 } as any))
				}
			>
				Create llm non-error
			</button>
			<button type="button" onClick={() => handleError(() => updateLLMConfig(1, { name: 'Updated' } as any))}>
				Update llm non-error
			</button>
			<button type="button" onClick={() => handleError(() => deleteLLMConfig(1))}>
				Delete llm non-error
			</button>
		</div>
	);
}

function EmptyDataHarness() {
	const { agents, tests, llmConfigs, results, getAgentById, getTestById, getLLMConfigById, getResultById } =
		useAppData();

	return (
		<div>
			<div data-testid="empty-agent">{getAgentById(999) ? 'found' : 'not-found'}</div>
			<div data-testid="empty-test">{getTestById(999) ? 'found' : 'not-found'}</div>
			<div data-testid="empty-llm">{getLLMConfigById(999) ? 'found' : 'not-found'}</div>
			<div data-testid="empty-result">{getResultById(999) ? 'found' : 'not-found'}</div>
			<div data-testid="agents-empty">{agents.length}</div>
			<div data-testid="tests-empty">{tests.length}</div>
			<div data-testid="llm-empty">{llmConfigs.length}</div>
			<div data-testid="results-empty">{results.length}</div>
		</div>
	);
}

describe('AppDataContext branch coverage', () => {
	beforeEach(() => {
		jest.clearAllMocks();
	});

	describe('fetchResults and fetchAllData', () => {
		it('fetches results successfully', async () => {
			const user = userEvent.setup();
			mockedApi.getResults.mockResolvedValue([{ id: 1, test_id: 1, agent_id: 1 }] as any);

			render(
				<AppDataProvider>
					<FullContextHarness />
				</AppDataProvider>
			);

			await user.click(screen.getByRole('button', { name: 'Fetch results' }));

			await waitFor(() => {
				expect(screen.getByTestId('results-count').textContent).toBe('1');
			});
		});

		it('handles fetchResults error', async () => {
			const user = userEvent.setup();
			mockedApi.getResults.mockRejectedValueOnce(new Error('Results fetch failed'));

			render(
				<AppDataProvider>
					<ErrorHarness />
				</AppDataProvider>
			);

			await user.click(screen.getByRole('button', { name: 'Fetch results error' }));

			await waitFor(() => {
				expect(screen.getByTestId('results-error-state').textContent).toBe('Results fetch failed');
			});
		});

		it('handles fetchResults non-Error exception', async () => {
			const user = userEvent.setup();
			mockedApi.getResults.mockRejectedValueOnce('String error');

			render(
				<AppDataProvider>
					<NonErrorHarness />
				</AppDataProvider>
			);

			await user.click(screen.getByRole('button', { name: 'Fetch results non-error' }));

			await waitFor(() => {
				expect(screen.getByTestId('results-error-state').textContent).toBe('Failed to fetch results');
			});
		});

		it('fetches all data successfully', async () => {
			const user = userEvent.setup();
			mockedApi.getAgents.mockResolvedValue([{ id: 1, name: 'Agent' }] as any);
			mockedApi.getTests.mockResolvedValue([{ id: 1, name: 'Test' }] as any);
			mockedApi.getLLMConfigs.mockResolvedValue([
				{ id: 1, name: 'LLM', provider: 'x', config: '{}', priority: 1 }
			] as any);
			mockedApi.getResults.mockResolvedValue([{ id: 1 }] as any);

			render(
				<AppDataProvider>
					<FullContextHarness />
				</AppDataProvider>
			);

			await user.click(screen.getByRole('button', { name: 'Fetch all' }));

			await waitFor(() => {
				expect(screen.getByTestId('agents-count').textContent).toBe('1');
				expect(screen.getByTestId('tests-count').textContent).toBe('1');
				expect(screen.getByTestId('llm-count').textContent).toBe('1');
				expect(screen.getByTestId('results-count').textContent).toBe('1');
			});
		});
	});

	describe('Error handling branches - non-Error exceptions', () => {
		it('handles non-Error exception in fetchAgents', async () => {
			const user = userEvent.setup();
			mockedApi.getAgents.mockRejectedValueOnce('String error');

			render(
				<AppDataProvider>
					<NonErrorHarness />
				</AppDataProvider>
			);

			await user.click(screen.getByRole('button', { name: 'Fetch agents non-error' }));

			await waitFor(() => {
				expect(screen.getByTestId('agents-error-state').textContent).toBe('Failed to fetch agents');
			});
		});

		it('handles non-Error exception in fetchTests', async () => {
			const user = userEvent.setup();
			mockedApi.getTests.mockRejectedValueOnce({ message: 'Object error' });

			render(
				<AppDataProvider>
					<NonErrorHarness />
				</AppDataProvider>
			);

			await user.click(screen.getByRole('button', { name: 'Fetch tests non-error' }));

			await waitFor(() => {
				expect(screen.getByTestId('tests-error-state').textContent).toBe('Failed to fetch tests');
			});
		});

		it('handles non-Error exception in fetchLLMConfigs', async () => {
			const user = userEvent.setup();
			mockedApi.getLLMConfigs.mockRejectedValueOnce(null);

			render(
				<AppDataProvider>
					<NonErrorHarness />
				</AppDataProvider>
			);

			await user.click(screen.getByRole('button', { name: 'Fetch llm non-error' }));

			await waitFor(() => {
				expect(screen.getByTestId('llm-error-state').textContent).toBe('Failed to fetch LLM configs');
			});
		});

		it('handles non-Error exception in createAgent', async () => {
			const user = userEvent.setup();
			mockedApi.createAgent.mockRejectedValueOnce('Create failed');

			render(
				<AppDataProvider>
					<NonErrorHarness />
				</AppDataProvider>
			);

			await user.click(screen.getByRole('button', { name: 'Create agent non-error' }));

			await waitFor(() => {
				expect(screen.getByTestId('caught-error').textContent).toBe('Create failed');
			});
		});

		it('handles non-Error exception in updateAgent', async () => {
			const user = userEvent.setup();
			mockedApi.updateAgent.mockRejectedValueOnce(123);

			render(
				<AppDataProvider>
					<NonErrorHarness />
				</AppDataProvider>
			);

			await user.click(screen.getByRole('button', { name: 'Update agent non-error' }));

			await waitFor(() => {
				expect(screen.getByTestId('caught-error').textContent).toBe('123');
			});
		});

		it('handles non-Error exception in deleteAgent', async () => {
			const user = userEvent.setup();
			mockedApi.deleteAgent.mockRejectedValueOnce(false);

			render(
				<AppDataProvider>
					<NonErrorHarness />
				</AppDataProvider>
			);

			await user.click(screen.getByRole('button', { name: 'Delete agent non-error' }));

			await waitFor(() => {
				expect(screen.getByTestId('caught-error').textContent).toBe('false');
			});
		});

		it('handles non-Error exception in createTest', async () => {
			const user = userEvent.setup();
			mockedApi.createTest.mockRejectedValueOnce('Test create failed');

			render(
				<AppDataProvider>
					<NonErrorHarness />
				</AppDataProvider>
			);

			await user.click(screen.getByRole('button', { name: 'Create test non-error' }));

			await waitFor(() => {
				expect(screen.getByTestId('caught-error').textContent).toBe('Test create failed');
			});
		});

		it('handles non-Error exception in updateTest', async () => {
			const user = userEvent.setup();
			mockedApi.updateTest.mockRejectedValueOnce({});

			render(
				<AppDataProvider>
					<NonErrorHarness />
				</AppDataProvider>
			);

			await user.click(screen.getByRole('button', { name: 'Update test non-error' }));

			await waitFor(() => {
				expect(screen.getByTestId('caught-error').textContent).toBe('[object Object]');
			});
		});

		it('handles non-Error exception in deleteTest', async () => {
			const user = userEvent.setup();
			mockedApi.deleteTest.mockRejectedValueOnce([]);

			render(
				<AppDataProvider>
					<NonErrorHarness />
				</AppDataProvider>
			);

			await user.click(screen.getByRole('button', { name: 'Delete test non-error' }));

			await waitFor(() => {
				expect(screen.getByTestId('caught-error').textContent).toBe('');
			});
		});

		it('handles non-Error exception in createLLMConfig', async () => {
			const user = userEvent.setup();
			mockedApi.createLLMConfig.mockRejectedValueOnce('LLM create failed');

			render(
				<AppDataProvider>
					<NonErrorHarness />
				</AppDataProvider>
			);

			await user.click(screen.getByRole('button', { name: 'Create llm non-error' }));

			await waitFor(() => {
				expect(screen.getByTestId('caught-error').textContent).toBe('LLM create failed');
			});
		});

		it('handles non-Error exception in updateLLMConfig', async () => {
			const user = userEvent.setup();
			mockedApi.updateLLMConfig.mockRejectedValueOnce(undefined);

			render(
				<AppDataProvider>
					<NonErrorHarness />
				</AppDataProvider>
			);

			await user.click(screen.getByRole('button', { name: 'Update llm non-error' }));

			await waitFor(() => {
				expect(screen.getByTestId('caught-error').textContent).toBe('undefined');
			});
		});

		it('handles non-Error exception in deleteLLMConfig', async () => {
			const user = userEvent.setup();
			mockedApi.deleteLLMConfig.mockRejectedValueOnce('LLM delete failed');

			render(
				<AppDataProvider>
					<NonErrorHarness />
				</AppDataProvider>
			);

			await user.click(screen.getByRole('button', { name: 'Delete llm non-error' }));

			await waitFor(() => {
				expect(screen.getByTestId('caught-error').textContent).toBe('LLM delete failed');
			});
		});
	});

	describe('Error handling branches - Error exceptions', () => {
		it('handles Error exception in fetchAgents', async () => {
			const user = userEvent.setup();
			mockedApi.getAgents.mockRejectedValueOnce(new Error('Agent fetch error'));

			render(
				<AppDataProvider>
					<ErrorHarness />
				</AppDataProvider>
			);

			await user.click(screen.getByRole('button', { name: 'Fetch agents error' }));

			await waitFor(() => {
				expect(screen.getByTestId('agents-error-state').textContent).toBe('Agent fetch error');
			});
		});

		it('handles Error exception in fetchTests', async () => {
			const user = userEvent.setup();
			mockedApi.getTests.mockRejectedValueOnce(new Error('Test fetch error'));

			render(
				<AppDataProvider>
					<ErrorHarness />
				</AppDataProvider>
			);

			await user.click(screen.getByRole('button', { name: 'Fetch tests error' }));

			await waitFor(() => {
				expect(screen.getByTestId('tests-error-state').textContent).toBe('Test fetch error');
			});
		});

		it('handles Error exception in fetchLLMConfigs', async () => {
			const user = userEvent.setup();
			mockedApi.getLLMConfigs.mockRejectedValueOnce(new Error('LLM fetch error'));

			render(
				<AppDataProvider>
					<ErrorHarness />
				</AppDataProvider>
			);

			await user.click(screen.getByRole('button', { name: 'Fetch llm error' }));

			await waitFor(() => {
				expect(screen.getByTestId('llm-error-state').textContent).toBe('LLM fetch error');
			});
		});

		it('handles Error exception in createAgent', async () => {
			const user = userEvent.setup();
			mockedApi.createAgent.mockRejectedValueOnce(new Error('Create agent error'));

			render(
				<AppDataProvider>
					<ErrorHarness />
				</AppDataProvider>
			);

			await user.click(screen.getByRole('button', { name: 'Create agent error' }));

			await waitFor(() => {
				expect(screen.getByTestId('caught-error').textContent).toBe('Create agent error');
			});
		});

		it('handles Error exception in updateAgent', async () => {
			const user = userEvent.setup();
			mockedApi.updateAgent.mockRejectedValueOnce(new Error('Update agent error'));

			render(
				<AppDataProvider>
					<ErrorHarness />
				</AppDataProvider>
			);

			await user.click(screen.getByRole('button', { name: 'Update agent error' }));

			await waitFor(() => {
				expect(screen.getByTestId('caught-error').textContent).toBe('Update agent error');
			});
		});

		it('handles Error exception in deleteAgent', async () => {
			const user = userEvent.setup();
			mockedApi.deleteAgent.mockRejectedValueOnce(new Error('Delete agent error'));

			render(
				<AppDataProvider>
					<ErrorHarness />
				</AppDataProvider>
			);

			await user.click(screen.getByRole('button', { name: 'Delete agent error' }));

			await waitFor(() => {
				expect(screen.getByTestId('caught-error').textContent).toBe('Delete agent error');
			});
		});

		it('handles Error exception in createTest', async () => {
			const user = userEvent.setup();
			mockedApi.createTest.mockRejectedValueOnce(new Error('Create test error'));

			render(
				<AppDataProvider>
					<ErrorHarness />
				</AppDataProvider>
			);

			await user.click(screen.getByRole('button', { name: 'Create test error' }));

			await waitFor(() => {
				expect(screen.getByTestId('caught-error').textContent).toBe('Create test error');
			});
		});

		it('handles Error exception in updateTest', async () => {
			const user = userEvent.setup();
			mockedApi.updateTest.mockRejectedValueOnce(new Error('Update test error'));

			render(
				<AppDataProvider>
					<ErrorHarness />
				</AppDataProvider>
			);

			await user.click(screen.getByRole('button', { name: 'Update test error' }));

			await waitFor(() => {
				expect(screen.getByTestId('caught-error').textContent).toBe('Update test error');
			});
		});

		it('handles Error exception in deleteTest', async () => {
			const user = userEvent.setup();
			mockedApi.deleteTest.mockRejectedValueOnce(new Error('Delete test error'));

			render(
				<AppDataProvider>
					<ErrorHarness />
				</AppDataProvider>
			);

			await user.click(screen.getByRole('button', { name: 'Delete test error' }));

			await waitFor(() => {
				expect(screen.getByTestId('caught-error').textContent).toBe('Delete test error');
			});
		});

		it('handles Error exception in createLLMConfig', async () => {
			const user = userEvent.setup();
			mockedApi.createLLMConfig.mockRejectedValueOnce(new Error('Create LLM error'));

			render(
				<AppDataProvider>
					<ErrorHarness />
				</AppDataProvider>
			);

			await user.click(screen.getByRole('button', { name: 'Create llm error' }));

			await waitFor(() => {
				expect(screen.getByTestId('caught-error').textContent).toBe('Create LLM error');
			});
		});

		it('handles Error exception in updateLLMConfig', async () => {
			const user = userEvent.setup();
			mockedApi.updateLLMConfig.mockRejectedValueOnce(new Error('Update LLM error'));

			render(
				<AppDataProvider>
					<ErrorHarness />
				</AppDataProvider>
			);

			await user.click(screen.getByRole('button', { name: 'Update llm error' }));

			await waitFor(() => {
				expect(screen.getByTestId('caught-error').textContent).toBe('Update LLM error');
			});
		});

		it('handles Error exception in deleteLLMConfig', async () => {
			const user = userEvent.setup();
			mockedApi.deleteLLMConfig.mockRejectedValueOnce(new Error('Delete LLM error'));

			render(
				<AppDataProvider>
					<ErrorHarness />
				</AppDataProvider>
			);

			await user.click(screen.getByRole('button', { name: 'Delete llm error' }));

			await waitFor(() => {
				expect(screen.getByTestId('caught-error').textContent).toBe('Delete LLM error');
			});
		});
	});

	describe('Empty data scenarios', () => {
		it('handles empty arrays and undefined lookups', () => {
			render(
				<AppDataProvider>
					<EmptyDataHarness />
				</AppDataProvider>
			);

			expect(screen.getByTestId('empty-agent').textContent).toBe('not-found');
			expect(screen.getByTestId('empty-test').textContent).toBe('not-found');
			expect(screen.getByTestId('empty-llm').textContent).toBe('not-found');
			expect(screen.getByTestId('empty-result').textContent).toBe('not-found');
			expect(screen.getByTestId('agents-empty').textContent).toBe('0');
			expect(screen.getByTestId('tests-empty').textContent).toBe('0');
			expect(screen.getByTestId('llm-empty').textContent).toBe('0');
			expect(screen.getByTestId('results-empty').textContent).toBe('0');
		});
	});

	describe('CRUD operations with empty initial state', () => {
		it('creates agent when list is empty', async () => {
			const user = userEvent.setup();
			mockedApi.createAgent.mockResolvedValue({
				id: 1,
				name: 'First Agent',
				version: '1',
				prompt: 'p',
				settings: '{}'
			} as any);

			render(
				<AppDataProvider>
					<FullContextHarness />
				</AppDataProvider>
			);

			await user.click(screen.getByRole('button', { name: 'Create agent' }));

			await waitFor(() => {
				expect(screen.getByTestId('agents-count').textContent).toBe('1');
			});
		});

		it('updates agent when list has items', async () => {
			const user = userEvent.setup();
			mockedApi.getAgents.mockResolvedValue([
				{ id: 1, name: 'Original', version: '1', prompt: 'p', settings: '{}' }
			] as any);
			mockedApi.updateAgent.mockResolvedValue({
				id: 1,
				name: 'Updated',
				version: '1',
				prompt: 'p',
				settings: '{}'
			} as any);

			render(
				<AppDataProvider>
					<FullContextHarness />
				</AppDataProvider>
			);

			await user.click(screen.getByRole('button', { name: 'Fetch agents' }));
			await waitFor(() => expect(screen.getByTestId('agents-count').textContent).toBe('1'));

			await user.click(screen.getByRole('button', { name: 'Update agent' }));
			await waitFor(() => expect(screen.getByTestId('agent-by-id').textContent).toBe('Updated'));
		});

		it('deletes agent when list has items', async () => {
			const user = userEvent.setup();
			mockedApi.getAgents.mockResolvedValue([
				{ id: 1, name: 'Agent 1', version: '1', prompt: 'p', settings: '{}' },
				{ id: 2, name: 'Agent 2', version: '1', prompt: 'p', settings: '{}' }
			] as any);
			mockedApi.deleteAgent.mockResolvedValue(undefined as any);

			render(
				<AppDataProvider>
					<FullContextHarness />
				</AppDataProvider>
			);

			await user.click(screen.getByRole('button', { name: 'Fetch agents' }));
			await waitFor(() => expect(screen.getByTestId('agents-count').textContent).toBe('2'));

			await user.click(screen.getByRole('button', { name: 'Delete agent' }));
			await waitFor(() => expect(screen.getByTestId('agents-count').textContent).toBe('1'));
		});

		it('creates test when list is empty', async () => {
			const user = userEvent.setup();
			mockedApi.createTest.mockResolvedValue({
				id: 1,
				name: 'First Test',
				description: '',
				input: 'i',
				expected_output: 'o'
			} as any);

			render(
				<AppDataProvider>
					<FullContextHarness />
				</AppDataProvider>
			);

			await user.click(screen.getByRole('button', { name: 'Create test' }));

			await waitFor(() => {
				expect(screen.getByTestId('tests-count').textContent).toBe('1');
			});
		});

		it('updates test when list has items', async () => {
			const user = userEvent.setup();
			mockedApi.getTests.mockResolvedValue([{ id: 1, name: 'Original' }] as any);
			mockedApi.updateTest.mockResolvedValue({ id: 1, name: 'Updated' } as any);

			render(
				<AppDataProvider>
					<FullContextHarness />
				</AppDataProvider>
			);

			await user.click(screen.getByRole('button', { name: 'Fetch tests' }));
			await waitFor(() => expect(screen.getByTestId('tests-count').textContent).toBe('1'));

			await user.click(screen.getByRole('button', { name: 'Update test' }));
			await waitFor(() => expect(screen.getByTestId('test-by-id').textContent).toBe('Updated'));
		});

		it('deletes test when list has items', async () => {
			const user = userEvent.setup();
			mockedApi.getTests.mockResolvedValue([
				{ id: 1, name: 'Test 1' },
				{ id: 2, name: 'Test 2' }
			] as any);
			mockedApi.deleteTest.mockResolvedValue(undefined as any);

			render(
				<AppDataProvider>
					<FullContextHarness />
				</AppDataProvider>
			);

			await user.click(screen.getByRole('button', { name: 'Fetch tests' }));
			await waitFor(() => expect(screen.getByTestId('tests-count').textContent).toBe('2'));

			await user.click(screen.getByRole('button', { name: 'Delete test' }));
			await waitFor(() => expect(screen.getByTestId('tests-count').textContent).toBe('1'));
		});

		it('creates LLM config when list is empty', async () => {
			const user = userEvent.setup();
			mockedApi.createLLMConfig.mockResolvedValue({
				id: 1,
				name: 'First LLM',
				provider: 'x',
				config: '{}',
				priority: 1
			} as any);

			render(
				<AppDataProvider>
					<FullContextHarness />
				</AppDataProvider>
			);

			await user.click(screen.getByRole('button', { name: 'Create llm' }));

			await waitFor(() => {
				expect(screen.getByTestId('llm-count').textContent).toBe('1');
			});
		});

		it('updates LLM config when list has items', async () => {
			const user = userEvent.setup();
			mockedApi.getLLMConfigs.mockResolvedValue([
				{ id: 1, name: 'Original', provider: 'x', config: '{}', priority: 1 }
			] as any);
			mockedApi.updateLLMConfig.mockResolvedValue({
				id: 1,
				name: 'Updated',
				provider: 'x',
				config: '{}',
				priority: 1
			} as any);

			render(
				<AppDataProvider>
					<FullContextHarness />
				</AppDataProvider>
			);

			await user.click(screen.getByRole('button', { name: 'Fetch llm' }));
			await waitFor(() => expect(screen.getByTestId('llm-count').textContent).toBe('1'));

			await user.click(screen.getByRole('button', { name: 'Update llm' }));
			await waitFor(() => expect(screen.getByTestId('llm-by-id').textContent).toBe('Updated'));
		});

		it('deletes LLM config when list has items', async () => {
			const user = userEvent.setup();
			mockedApi.getLLMConfigs.mockResolvedValue([
				{ id: 1, name: 'LLM 1', provider: 'x', config: '{}', priority: 1 },
				{ id: 2, name: 'LLM 2', provider: 'x', config: '{}', priority: 2 }
			] as any);
			mockedApi.deleteLLMConfig.mockResolvedValue(undefined as any);

			render(
				<AppDataProvider>
					<FullContextHarness />
				</AppDataProvider>
			);

			await user.click(screen.getByRole('button', { name: 'Fetch llm' }));
			await waitFor(() => expect(screen.getByTestId('llm-count').textContent).toBe('2'));

			await user.click(screen.getByRole('button', { name: 'Delete llm' }));
			await waitFor(() => expect(screen.getByTestId('llm-count').textContent).toBe('1'));
		});
	});

	describe('LLM call operations', () => {
		it('calls LLM successfully', async () => {
			const user = userEvent.setup();
			mockedApi.callLLM.mockResolvedValue({ output: 'Response' } as any);

			render(
				<AppDataProvider>
					<FullContextHarness />
				</AppDataProvider>
			);

			await user.click(screen.getByRole('button', { name: 'Call llm' }));

			await waitFor(() => {
				expect(mockedApi.callLLM).toHaveBeenCalledWith(1, { prompt: 'test' });
			});
		});

		it('calls LLM with fallback successfully', async () => {
			const user = userEvent.setup();
			mockedApi.callLLMWithFallback.mockResolvedValue({ output: 'Fallback response' } as any);

			render(
				<AppDataProvider>
					<FullContextHarness />
				</AppDataProvider>
			);

			await user.click(screen.getByRole('button', { name: 'Call llm fallback' }));

			await waitFor(() => {
				expect(mockedApi.callLLMWithFallback).toHaveBeenCalledWith({ prompt: 'test' });
			});
		});
	});

	describe('Loading states', () => {
		it('sets loading states during fetch operations', async () => {
			const user = userEvent.setup();
			let resolveAgents: (value: any) => void;
			const agentsPromise = new Promise((resolve) => {
				resolveAgents = resolve;
			});
			mockedApi.getAgents.mockReturnValue(agentsPromise as any);

			render(
				<AppDataProvider>
					<FullContextHarness />
				</AppDataProvider>
			);

			await user.click(screen.getByRole('button', { name: 'Fetch agents' }));

			await waitFor(() => {
				expect(screen.getByTestId('agents-loading').textContent).toBe('true');
			});

			resolveAgents!([{ id: 1, name: 'Agent' }]);

			await waitFor(() => {
				expect(screen.getByTestId('agents-loading').textContent).toBe('false');
			});
		});
	});
});
