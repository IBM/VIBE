'use client';

import { createContext, useContext, useState, useCallback, ReactNode, useMemo } from 'react';
import { api, Agent, Test, LLMConfig, TestResult } from './api';
import type { LLMRequestOptions, LLMResponse } from '@ibm-vibe/types';

// Define the context state shape
interface AppDataContextState {
	// Data
	agents: Agent[];
	tests: Test[];
	llmConfigs: LLMConfig[];
	results: TestResult[];

	// Loading states
	loading: {
		agents: boolean;
		tests: boolean;
		llmConfigs: boolean;
		results: boolean;
	};

	// Error states
	errors: {
		agents?: string | null;
		tests?: string | null;
		llmConfigs?: string | null;
		results?: string | null;
	};

	// Actions
	fetchAgents: () => Promise<void>;
	fetchTests: () => Promise<void>;
	fetchLLMConfigs: () => Promise<void>;
	fetchResults: () => Promise<void>;
	fetchAllData: () => Promise<void>;

	// Agent actions
	createAgent: (agent: Omit<Agent, 'id' | 'created_at'>) => Promise<Agent>;
	updateAgent: (id: number, agent: Partial<Agent>) => Promise<Agent>;
	deleteAgent: (id: number) => Promise<void>;

	// Test actions
	createTest: (test: Omit<Test, 'id' | 'created_at' | 'updated_at'>) => Promise<Test>;
	updateTest: (id: number, test: Partial<Test>) => Promise<Test>;
	deleteTest: (id: number) => Promise<void>;

	// LLM config actions
	createLLMConfig: (config: Omit<LLMConfig, 'id' | 'created_at' | 'updated_at'>) => Promise<LLMConfig>;
	updateLLMConfig: (id: number, config: Partial<LLMConfig>) => Promise<LLMConfig>;
	deleteLLMConfig: (id: number) => Promise<void>;
	callLLM: (id: number, options: LLMRequestOptions) => Promise<LLMResponse>;
	callLLMWithFallback: (options: LLMRequestOptions) => Promise<LLMResponse>;

	// Utility methods
	getAgentById: (id: number) => Agent | undefined;
	getTestById: (id: number) => Test | undefined;
	getLLMConfigById: (id: number) => LLMConfig | undefined;
	getResultById: (id: number) => TestResult | undefined;
}

// Create the context with initial undefined value
const AppDataContext = createContext<AppDataContextState | undefined>(undefined);

// Provider props
interface AppDataProviderProps {
	children: ReactNode;
}

// Provider component
export function AppDataProvider({ children }: AppDataProviderProps) {
	// Data state
	const [agents, setAgents] = useState<Agent[]>([]);
	const [tests, setTests] = useState<Test[]>([]);
	const [llmConfigs, setLLMConfigs] = useState<LLMConfig[]>([]);
	const [results, setResults] = useState<TestResult[]>([]);

	// Loading states
	const [loading, setLoading] = useState<AppDataContextState['loading']>({
		agents: false,
		tests: false,
		llmConfigs: false,
		results: false
	});

	// Error states
	const [errors, setErrors] = useState<AppDataContextState['errors']>({});

	// Fetch agents
	const fetchAgents = useCallback(async () => {
		setLoading((prev) => ({ ...prev, agents: true }));
		try {
			const data = await api.getAgents();
			setAgents(data);
			setErrors((prev) => ({ ...prev, agents: null }));
		} catch (error) {
			setErrors((prev) => ({
				...prev,
				agents: error instanceof Error ? error.message : 'Failed to fetch agents'
			}));
		} finally {
			setLoading((prev) => ({ ...prev, agents: false }));
		}
	}, []);

	// Fetch tests
	const fetchTests = useCallback(async () => {
		setLoading((prev) => ({ ...prev, tests: true }));
		try {
			const data = await api.getTests();
			setTests(data);
			setErrors((prev) => ({ ...prev, tests: null }));
		} catch (error) {
			setErrors((prev) => ({
				...prev,
				tests: error instanceof Error ? error.message : 'Failed to fetch tests'
			}));
		} finally {
			setLoading((prev) => ({ ...prev, tests: false }));
		}
	}, []);

	// Fetch LLM configs
	const fetchLLMConfigs = useCallback(async () => {
		setLoading((prev) => ({ ...prev, llmConfigs: true }));
		try {
			const data = await api.getLLMConfigs();
			setLLMConfigs(data);
			setErrors((prev) => ({ ...prev, llmConfigs: null }));
		} catch (error) {
			setErrors((prev) => ({
				...prev,
				llmConfigs: error instanceof Error ? error.message : 'Failed to fetch LLM configs'
			}));
		} finally {
			setLoading((prev) => ({ ...prev, llmConfigs: false }));
		}
	}, []);

	// Fetch results
	const fetchResults = useCallback(async () => {
		setLoading((prev) => ({ ...prev, results: true }));
		try {
			const data = await api.getResults();
			setResults(data);
			setErrors((prev) => ({ ...prev, results: null }));
		} catch (error) {
			setErrors((prev) => ({
				...prev,
				results: error instanceof Error ? error.message : 'Failed to fetch results'
			}));
		} finally {
			setLoading((prev) => ({ ...prev, results: false }));
		}
	}, []);

	// Fetch all data
	const fetchAllData = useCallback(async () => {
		await Promise.all([fetchAgents(), fetchTests(), fetchLLMConfigs(), fetchResults()]);
	}, [fetchAgents, fetchTests, fetchLLMConfigs, fetchResults]);

	// Create agent
	const createAgent = useCallback(async (agentData: Omit<Agent, 'id' | 'created_at'>) => {
		setLoading((prev) => ({ ...prev, agents: true }));
		try {
			const newAgent = await api.createAgent(agentData);
			setAgents((prev) => [...prev, newAgent]);
			setErrors((prev) => ({ ...prev, agents: null }));
			return newAgent;
		} catch (error) {
			setErrors((prev) => ({
				...prev,
				agents: error instanceof Error ? error.message : 'Failed to create agent'
			}));
			throw error;
		} finally {
			setLoading((prev) => ({ ...prev, agents: false }));
		}
	}, []);

	// Update agent
	const updateAgent = useCallback(async (id: number, agentData: Partial<Agent>) => {
		setLoading((prev) => ({ ...prev, agents: true }));
		try {
			const updatedAgent = await api.updateAgent(id, agentData);
			setAgents((prev) => prev.map((agent) => (agent.id === id ? { ...agent, ...updatedAgent } : agent)));
			setErrors((prev) => ({ ...prev, agents: null }));
			return updatedAgent;
		} catch (error) {
			setErrors((prev) => ({
				...prev,
				agents: error instanceof Error ? error.message : 'Failed to update agent'
			}));
			throw error;
		} finally {
			setLoading((prev) => ({ ...prev, agents: false }));
		}
	}, []);

	// Delete agent
	const deleteAgent = useCallback(async (id: number) => {
		setLoading((prev) => ({ ...prev, agents: true }));
		try {
			await api.deleteAgent(id);
			setAgents((prev) => prev.filter((agent) => agent.id !== id));
			setErrors((prev) => ({ ...prev, agents: null }));
		} catch (error) {
			setErrors((prev) => ({
				...prev,
				agents: error instanceof Error ? error.message : 'Failed to delete agent'
			}));
			throw error;
		} finally {
			setLoading((prev) => ({ ...prev, agents: false }));
		}
	}, []);

	// Create test
	const createTest = useCallback(async (testData: Omit<Test, 'id' | 'created_at' | 'updated_at'>) => {
		setLoading((prev) => ({ ...prev, tests: true }));
		try {
			const newTest = await api.createTest(testData);
			setTests((prev) => [...prev, newTest]);
			setErrors((prev) => ({ ...prev, tests: null }));
			return newTest;
		} catch (error) {
			setErrors((prev) => ({
				...prev,
				tests: error instanceof Error ? error.message : 'Failed to create test'
			}));
			throw error;
		} finally {
			setLoading((prev) => ({ ...prev, tests: false }));
		}
	}, []);

	// Update test
	const updateTest = useCallback(async (id: number, testData: Partial<Test>) => {
		setLoading((prev) => ({ ...prev, tests: true }));
		try {
			const updatedTest = await api.updateTest(id, testData);
			setTests((prev) => prev.map((test) => (test.id === id ? { ...test, ...updatedTest } : test)));
			setErrors((prev) => ({ ...prev, tests: null }));
			return updatedTest;
		} catch (error) {
			setErrors((prev) => ({
				...prev,
				tests: error instanceof Error ? error.message : 'Failed to update test'
			}));
			throw error;
		} finally {
			setLoading((prev) => ({ ...prev, tests: false }));
		}
	}, []);

	// Delete test
	const deleteTest = useCallback(async (id: number) => {
		setLoading((prev) => ({ ...prev, tests: true }));
		try {
			await api.deleteTest(id);
			setTests((prev) => prev.filter((test) => test.id !== id));
			setErrors((prev) => ({ ...prev, tests: null }));
		} catch (error) {
			setErrors((prev) => ({
				...prev,
				tests: error instanceof Error ? error.message : 'Failed to delete test'
			}));
			throw error;
		} finally {
			setLoading((prev) => ({ ...prev, tests: false }));
		}
	}, []);

	// Create LLM config
	const createLLMConfig = useCallback(async (configData: Omit<LLMConfig, 'id' | 'created_at' | 'updated_at'>) => {
		setLoading((prev) => ({ ...prev, llmConfigs: true }));
		try {
			const newConfig = await api.createLLMConfig(configData);
			setLLMConfigs((prev) => [...prev, newConfig]);
			setErrors((prev) => ({ ...prev, llmConfigs: null }));
			return newConfig;
		} catch (error) {
			setErrors((prev) => ({
				...prev,
				llmConfigs: error instanceof Error ? error.message : 'Failed to create LLM config'
			}));
			throw error;
		} finally {
			setLoading((prev) => ({ ...prev, llmConfigs: false }));
		}
	}, []);

	// Update LLM config
	const updateLLMConfig = useCallback(async (id: number, configData: Partial<LLMConfig>) => {
		setLoading((prev) => ({ ...prev, llmConfigs: true }));
		try {
			const updatedConfig = await api.updateLLMConfig(id, configData);
			setLLMConfigs((prev) =>
				prev.map((config) => (config.id === id ? { ...config, ...updatedConfig } : config))
			);
			setErrors((prev) => ({ ...prev, llmConfigs: null }));
			return updatedConfig;
		} catch (error) {
			setErrors((prev) => ({
				...prev,
				llmConfigs: error instanceof Error ? error.message : 'Failed to update LLM config'
			}));
			throw error;
		} finally {
			setLoading((prev) => ({ ...prev, llmConfigs: false }));
		}
	}, []);

	// Delete LLM config
	const deleteLLMConfig = useCallback(async (id: number) => {
		setLoading((prev) => ({ ...prev, llmConfigs: true }));
		try {
			await api.deleteLLMConfig(id);
			setLLMConfigs((prev) => prev.filter((config) => config.id !== id));
			setErrors((prev) => ({ ...prev, llmConfigs: null }));
		} catch (error) {
			setErrors((prev) => ({
				...prev,
				llmConfigs: error instanceof Error ? error.message : 'Failed to delete LLM config'
			}));
			throw error;
		} finally {
			setLoading((prev) => ({ ...prev, llmConfigs: false }));
		}
	}, []);

	// Call specific LLM
	const callLLM = useCallback(async (id: number, options: LLMRequestOptions) => {
		return await api.callLLM(id, options);
	}, []);

	// Call LLM with fallback
	const callLLMWithFallback = useCallback(async (options: LLMRequestOptions) => {
		return await api.callLLMWithFallback(options);
	}, []);

	// Utility methods
	const getAgentById = (id: number) => agents.find((agent) => agent.id === id);
	const getTestById = (id: number) => tests.find((test) => test.id === id);
	const getLLMConfigById = (id: number) => llmConfigs.find((config) => config.id === id);
	const getResultById = (id: number) => results.find((result) => result.id === id);

	const contextValue: AppDataContextState = useMemo(
		() => ({
			// Data
			agents,
			tests,
			llmConfigs,
			results,

			// Loading states
			loading,

			// Error states
			errors,

			// Actions
			fetchAgents,
			fetchTests,
			fetchLLMConfigs,
			fetchResults,
			fetchAllData,

			// Agent actions
			createAgent,
			updateAgent,
			deleteAgent,

			// Test actions
			createTest,
			updateTest,
			deleteTest,

			// LLM config actions
			createLLMConfig,
			updateLLMConfig,
			deleteLLMConfig,
			callLLM,
			callLLMWithFallback,

			// Utility methods
			getAgentById,
			getTestById,
			getLLMConfigById,
			getResultById
			// eslint-disable-next-line react-hooks/exhaustive-deps
		}),
		[agents, tests, llmConfigs, results, loading, errors]
	);

	return <AppDataContext.Provider value={contextValue}>{children}</AppDataContext.Provider>;
}

// Custom hook for using the app data context
export function useAppData() {
	const context = useContext(AppDataContext);
	if (context === undefined) {
		throw new Error('useAppData must be used within an AppDataProvider');
	}
	return context;
}

// Specialized hooks for specific data types
export function useAgents() {
	const { agents, loading, errors, fetchAgents, createAgent, updateAgent, deleteAgent } = useAppData();
	return {
		agents,
		isLoading: loading.agents,
		error: errors.agents,
		fetchAgents,
		createAgent,
		updateAgent,
		deleteAgent
	};
}

export function useTests() {
	const { tests, loading, errors, fetchTests, createTest, updateTest, deleteTest } = useAppData();
	return {
		tests,
		isLoading: loading.tests,
		error: errors.tests,
		fetchTests,
		createTest,
		updateTest,
		deleteTest
	};
}

export function useLLMConfigs() {
	const context = useAppData();
	return {
		llmConfigs: context.llmConfigs,
		loading: context.loading.llmConfigs,
		error: context.errors.llmConfigs,
		fetchLLMConfigs: context.fetchLLMConfigs,
		createLLMConfig: context.createLLMConfig,
		updateLLMConfig: context.updateLLMConfig,
		deleteLLMConfig: context.deleteLLMConfig,
		callLLM: context.callLLM,
		callLLMWithFallback: context.callLLMWithFallback,
		getLLMConfigById: context.getLLMConfigById
	};
}

// Hook for result operations - doesn't use global state for better performance
export function useResultOperations() {
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const getResultById = useCallback(async (id: number) => {
		try {
			return await api.getResultById(id);
		} catch (err) {
			throw err;
		}
	}, []);

	const getResults = useCallback(
		async (filters?: { agent_id?: number; test_id?: number; limit?: number; offset?: number }) => {
			setLoading(true);
			setError(null);
			try {
				const data = await api.getResultsWithCount(filters);
				return data;
			} catch (err) {
				const errorMessage = err instanceof Error ? err.message : 'Failed to fetch results';
				setError(errorMessage);
				throw err;
			} finally {
				setLoading(false);
			}
		},
		[]
	);

	const scoreResult = useCallback(async (resultId: number, llmConfigId?: number) => {
		try {
			return await api.scoreResult(resultId, llmConfigId);
		} catch (err) {
			throw err;
		}
	}, []);

	return {
		loading,
		error,
		getResultById,
		getResults,
		scoreResult
	};
}
