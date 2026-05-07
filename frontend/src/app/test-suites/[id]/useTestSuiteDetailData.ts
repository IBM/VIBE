import { useCallback, useEffect, useState } from 'react';
import { api, type Agent, type SuiteEntry, type SuiteRun, type Test, type TestSuite } from '../../../lib/api';

export function useTestSuiteDetailData(suiteId: number) {
	const [suite, setSuite] = useState<TestSuite | null>(null);
	const [agents, setAgents] = useState<Agent[]>([]);
	const [selectedAgentId, setSelectedAgentId] = useState<number | null>(null);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);
	const [allTests, setAllTests] = useState<Test[]>([]);
	const [allSuites, setAllSuites] = useState<TestSuite[]>([]);
	const [entries, setEntries] = useState<SuiteEntry[]>([]);
	const [suiteRuns, setSuiteRuns] = useState<SuiteRun[]>([]);

	const loadSuiteMeta = useCallback(async () => {
		const allSuitesData = await api.getTestSuites();
		const found = allSuitesData.find((s) => s.id === suiteId);
		if (!found) {
			throw new Error('Test suite not found');
		}
		setSuite(found);
		setAllSuites(allSuitesData.filter((s) => s.id !== suiteId));
	}, [suiteId]);

	const reloadAll = useCallback(async () => {
		setLoading(true);
		try {
			await loadSuiteMeta();

			const [agentsData, allTestsData, entriesData, runsData] = await Promise.all([
				api.getAgents(),
				api.getTests(),
				api.getSuiteEntries(suiteId),
				api.getSuiteRuns({ suite_id: suiteId, limit: 250 })
			]);

			setAgents(agentsData);
			setAllTests(allTestsData);
			setEntries(entriesData);
			setSuiteRuns(runsData);
			setSelectedAgentId((prev) => prev ?? agentsData[0]?.id ?? null);
			setError(null);
		} catch (err: unknown) {
			if (err instanceof Error) {
				setError(err.message);
			} else {
				setError(String(err));
			}
		} finally {
			setLoading(false);
		}
	}, [loadSuiteMeta, suiteId]);

	useEffect(() => {
		void reloadAll();
	}, [reloadAll]);

	return {
		suite,
		agents,
		selectedAgentId,
		loading,
		error,
		allTests,
		allSuites,
		entries,
		suiteRuns,
		setSelectedAgentId,
		setError,
		setEntries,
		reloadAll,
		reloadSuiteMeta: loadSuiteMeta
	};
}
