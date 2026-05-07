/* eslint-disable @typescript-eslint/no-explicit-any, comma-dangle */
import {
	filterScoredResults,
	calculateOverallAverageSimilarityScore,
	calculateSuiteRunAverageSimilarityScore
} from '../similarityScoreUtils';
import type { TestResult } from '../api';

describe('similarityScoreUtils', () => {
	describe('filterScoredResults', () => {
		it('filters results with completed similarity scoring', () => {
			const results: TestResult[] = [
				{ id: 1, similarity_score: 0.9, similarity_scoring_status: 'completed' } as any,
				{ id: 2, similarity_score: 0.8, similarity_scoring_status: 'completed' } as any,
				{ id: 3, similarity_scoring_status: 'pending' } as any
			];

			const scored = filterScoredResults(results);
			expect(scored).toHaveLength(2);
			expect(scored[0].id).toBe(1);
			expect(scored[1].id).toBe(2);
		});

		it('excludes results without similarity_score', () => {
			const results: TestResult[] = [
				{ id: 1, similarity_scoring_status: 'completed' } as any,
				{ id: 2, similarity_score: 0.8, similarity_scoring_status: 'completed' } as any
			];

			const scored = filterScoredResults(results);
			expect(scored).toHaveLength(1);
			expect(scored[0].id).toBe(2);
		});

		it('excludes results with null similarity_score', () => {
			const results: TestResult[] = [
				{ id: 1, similarity_score: null, similarity_scoring_status: 'completed' } as any,
				{ id: 2, similarity_score: 0.8, similarity_scoring_status: 'completed' } as any
			];

			const scored = filterScoredResults(results);
			expect(scored).toHaveLength(1);
			expect(scored[0].id).toBe(2);
		});

		it('excludes results with undefined similarity_score', () => {
			const results: TestResult[] = [
				{ id: 1, similarity_score: undefined, similarity_scoring_status: 'completed' } as any,
				{ id: 2, similarity_score: 0.8, similarity_scoring_status: 'completed' } as any
			];

			const scored = filterScoredResults(results);
			expect(scored).toHaveLength(1);
			expect(scored[0].id).toBe(2);
		});

		it('excludes results with non-completed status', () => {
			const results: TestResult[] = [
				{ id: 1, similarity_score: 0.9, similarity_scoring_status: 'pending' } as any,
				{ id: 2, similarity_score: 0.8, similarity_scoring_status: 'running' } as any,
				{ id: 3, similarity_score: 0.7, similarity_scoring_status: 'failed' } as any,
				{ id: 4, similarity_score: 0.6, similarity_scoring_status: 'completed' } as any
			];

			const scored = filterScoredResults(results);
			expect(scored).toHaveLength(1);
			expect(scored[0].id).toBe(4);
		});

		it('returns empty array for empty input', () => {
			const scored = filterScoredResults([]);
			expect(scored).toEqual([]);
		});

		it('returns empty array when no results have completed scoring', () => {
			const results: TestResult[] = [
				{ id: 1, similarity_scoring_status: 'pending' } as any,
				{ id: 2, similarity_scoring_status: 'running' } as any
			];

			const scored = filterScoredResults(results);
			expect(scored).toEqual([]);
		});
	});

	describe('calculateOverallAverageSimilarityScore', () => {
		it('calculates average for multiple scored results', () => {
			const results: TestResult[] = [
				{ id: 1, similarity_score: 0.9, similarity_scoring_status: 'completed' } as any,
				{ id: 2, similarity_score: 0.8, similarity_scoring_status: 'completed' } as any,
				{ id: 3, similarity_score: 0.7, similarity_scoring_status: 'completed' } as any
			];

			const average = calculateOverallAverageSimilarityScore(results);
			expect(average).toBe('0.8'); // (0.9 + 0.8 + 0.7) / 3 = 0.8
		});

		it('returns N/A for empty results', () => {
			const average = calculateOverallAverageSimilarityScore([]);
			expect(average).toBe('N/A');
		});

		it('returns N/A when no results have completed scoring', () => {
			const results: TestResult[] = [
				{ id: 1, similarity_scoring_status: 'pending' } as any,
				{ id: 2, similarity_scoring_status: 'running' } as any
			];

			const average = calculateOverallAverageSimilarityScore(results);
			expect(average).toBe('N/A');
		});

		it('ignores unscored results in calculation', () => {
			const results: TestResult[] = [
				{ id: 1, similarity_score: 0.9, similarity_scoring_status: 'completed' } as any,
				{ id: 2, similarity_scoring_status: 'pending' } as any,
				{ id: 3, similarity_score: 0.7, similarity_scoring_status: 'completed' } as any
			];

			const average = calculateOverallAverageSimilarityScore(results);
			expect(average).toBe('0.8'); // (0.9 + 0.7) / 2 = 0.8
		});

		it('formats result to one decimal place', () => {
			const results: TestResult[] = [
				{ id: 1, similarity_score: 0.95, similarity_scoring_status: 'completed' } as any,
				{ id: 2, similarity_score: 0.85, similarity_scoring_status: 'completed' } as any
			];

			const average = calculateOverallAverageSimilarityScore(results);
			expect(average).toBe('0.9'); // (0.95 + 0.85) / 2 = 0.9
		});

		it('handles single result', () => {
			const results: TestResult[] = [
				{ id: 1, similarity_score: 0.75, similarity_scoring_status: 'completed' } as any
			];

			const average = calculateOverallAverageSimilarityScore(results);
			expect(average).toBe('0.8'); // 0.75 rounded to 1 decimal
		});
	});

	describe('calculateSuiteRunAverageSimilarityScore', () => {
		const baseDate = new Date('2024-01-01T10:00:00Z');

		it('calculates average for results within suite run timeframe', () => {
			const suiteRun = {
				id: 1,
				agent_id: 1,
				started_at: baseDate.toISOString(),
				completed_at: new Date(baseDate.getTime() + 3600000).toISOString() // +1 hour
			};

			const results: TestResult[] = [
				{
					id: 1,
					agent_id: 1,
					similarity_score: 0.9,
					similarity_scoring_status: 'completed',
					created_at: new Date(baseDate.getTime() + 1800000).toISOString() // +30 min
				} as any,
				{
					id: 2,
					agent_id: 1,
					similarity_score: 0.7,
					similarity_scoring_status: 'completed',
					created_at: new Date(baseDate.getTime() + 2700000).toISOString() // +45 min
				} as any
			];

			const average = calculateSuiteRunAverageSimilarityScore(results, suiteRun);
			expect(average).toBe(0.8); // (0.9 + 0.7) / 2
		});

		it('returns null when no results match suite run', () => {
			const suiteRun = {
				id: 1,
				agent_id: 1,
				started_at: baseDate.toISOString(),
				completed_at: new Date(baseDate.getTime() + 3600000).toISOString()
			};

			const results: TestResult[] = [
				{
					id: 1,
					agent_id: 2, // Different agent
					similarity_score: 0.9,
					similarity_scoring_status: 'completed',
					created_at: new Date(baseDate.getTime() + 1800000).toISOString()
				} as any
			];

			const average = calculateSuiteRunAverageSimilarityScore(results, suiteRun);
			expect(average).toBeNull();
		});

		it('excludes results before suite start time', () => {
			const suiteRun = {
				id: 1,
				agent_id: 1,
				started_at: baseDate.toISOString(),
				completed_at: new Date(baseDate.getTime() + 3600000).toISOString()
			};

			const results: TestResult[] = [
				{
					id: 1,
					agent_id: 1,
					similarity_score: 0.5,
					similarity_scoring_status: 'completed',
					created_at: new Date(baseDate.getTime() - 1000).toISOString() // Before start
				} as any,
				{
					id: 2,
					agent_id: 1,
					similarity_score: 0.9,
					similarity_scoring_status: 'completed',
					created_at: new Date(baseDate.getTime() + 1800000).toISOString()
				} as any
			];

			const average = calculateSuiteRunAverageSimilarityScore(results, suiteRun);
			expect(average).toBe(0.9); // Only includes result 2
		});

		it('excludes results after suite end time', () => {
			const suiteRun = {
				id: 1,
				agent_id: 1,
				started_at: baseDate.toISOString(),
				completed_at: new Date(baseDate.getTime() + 3600000).toISOString()
			};

			const results: TestResult[] = [
				{
					id: 1,
					agent_id: 1,
					similarity_score: 0.9,
					similarity_scoring_status: 'completed',
					created_at: new Date(baseDate.getTime() + 1800000).toISOString()
				} as any,
				{
					id: 2,
					agent_id: 1,
					similarity_score: 0.5,
					similarity_scoring_status: 'completed',
					created_at: new Date(baseDate.getTime() + 3600001).toISOString() // After end
				} as any
			];

			const average = calculateSuiteRunAverageSimilarityScore(results, suiteRun);
			expect(average).toBe(0.9); // Only includes result 1
		});

		it('uses current time as end time when suite is not completed', () => {
			const suiteRun = {
				id: 1,
				agent_id: 1,
				started_at: baseDate.toISOString()
				// No completed_at
			};

			const results: TestResult[] = [
				{
					id: 1,
					agent_id: 1,
					similarity_score: 0.9,
					similarity_scoring_status: 'completed',
					created_at: new Date(baseDate.getTime() + 1800000).toISOString()
				} as any
			];

			const average = calculateSuiteRunAverageSimilarityScore(results, suiteRun);
			expect(average).toBe(0.9);
		});

		it('filters by agent_id', () => {
			const suiteRun = {
				id: 1,
				agent_id: 1,
				started_at: baseDate.toISOString(),
				completed_at: new Date(baseDate.getTime() + 3600000).toISOString()
			};

			const results: TestResult[] = [
				{
					id: 1,
					agent_id: 1,
					similarity_score: 0.9,
					similarity_scoring_status: 'completed',
					created_at: new Date(baseDate.getTime() + 1800000).toISOString()
				} as any,
				{
					id: 2,
					agent_id: 2,
					similarity_score: 0.5,
					similarity_scoring_status: 'completed',
					created_at: new Date(baseDate.getTime() + 1800000).toISOString()
				} as any
			];

			const average = calculateSuiteRunAverageSimilarityScore(results, suiteRun);
			expect(average).toBe(0.9); // Only includes agent 1
		});

		it('ignores unscored results', () => {
			const suiteRun = {
				id: 1,
				agent_id: 1,
				started_at: baseDate.toISOString(),
				completed_at: new Date(baseDate.getTime() + 3600000).toISOString()
			};

			const results: TestResult[] = [
				{
					id: 1,
					agent_id: 1,
					similarity_score: 0.9,
					similarity_scoring_status: 'completed',
					created_at: new Date(baseDate.getTime() + 1800000).toISOString()
				} as any,
				{
					id: 2,
					agent_id: 1,
					similarity_scoring_status: 'pending',
					created_at: new Date(baseDate.getTime() + 1800000).toISOString()
				} as any
			];

			const average = calculateSuiteRunAverageSimilarityScore(results, suiteRun);
			expect(average).toBe(0.9); // Only includes scored result
		});

		it('returns null for empty results', () => {
			const suiteRun = {
				id: 1,
				agent_id: 1,
				started_at: baseDate.toISOString(),
				completed_at: new Date(baseDate.getTime() + 3600000).toISOString()
			};

			const average = calculateSuiteRunAverageSimilarityScore([], suiteRun);
			expect(average).toBeNull();
		});

		it('handles results with missing created_at', () => {
			const suiteRun = {
				id: 1,
				agent_id: 1,
				started_at: baseDate.toISOString(),
				completed_at: new Date(baseDate.getTime() + 3600000).toISOString()
			};

			const results: TestResult[] = [
				{
					id: 1,
					agent_id: 1,
					similarity_score: 0.9,
					similarity_scoring_status: 'completed'
					// No created_at
				} as any
			];

			const average = calculateSuiteRunAverageSimilarityScore(results, suiteRun);
			// Result with invalid date will be filtered out
			expect(average).toBeNull();
		});
	});
});

// Made with Bob
