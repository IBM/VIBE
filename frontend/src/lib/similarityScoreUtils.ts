import { TestResult } from './api';

interface ScoredResult extends TestResult {
	similarity_score: number;
	similarity_scoring_status: 'completed';
}

interface SuiteRun {
	id: number;
	agent_id: number;
	started_at: string;
	completed_at?: string;
}

/**
 * Filters results to only include those with completed similarity scoring
 */
export function filterScoredResults(results: TestResult[]): ScoredResult[] {
	return results.filter(
		(result): result is ScoredResult =>
			'similarity_score' in result &&
			result.similarity_score !== undefined &&
			result.similarity_score !== null &&
			'similarity_scoring_status' in result &&
			result.similarity_scoring_status === 'completed'
	);
}

/**
 * Calculates the average similarity score for all results
 * Returns a formatted string for display
 */
export function calculateOverallAverageSimilarityScore(results: TestResult[]): string {
	const scoredResults = filterScoredResults(results);

	if (scoredResults.length === 0) {
		return 'N/A';
	}

	const sum = scoredResults.reduce((acc, result) => acc + result.similarity_score, 0);
	const average = sum / scoredResults.length;

	return average.toFixed(1);
}

/**
 * Calculates the average similarity score for a specific suite run
 * Returns a number or null
 */
export function calculateSuiteRunAverageSimilarityScore(results: TestResult[], suiteRun: SuiteRun): number | null {
	// Filter results by suite run timing and agent
	const suiteStartTime = new Date(suiteRun.started_at).getTime();
	const suiteEndTime = suiteRun.completed_at ? new Date(suiteRun.completed_at).getTime() : Date.now();

	const suiteResults = results.filter((result) => {
		const resultTime = new Date(result.created_at || '').getTime();

		return result.agent_id === suiteRun.agent_id && resultTime >= suiteStartTime && resultTime <= suiteEndTime;
	});

	// Filter to only scored results
	const scoredResults = filterScoredResults(suiteResults);

	if (scoredResults.length === 0) {
		return null;
	}

	const sum = scoredResults.reduce((acc, result) => acc + result.similarity_score, 0);
	return sum / scoredResults.length;
}
