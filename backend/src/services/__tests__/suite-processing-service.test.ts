import { SuiteEntry, Agent } from '@ibm-vibe/types';

type DbQueries = typeof import('../../db/queries');

describe('SuiteProcessingService', () => {
	let SuiteProcessingService: typeof import('../suite-processing-service').SuiteProcessingService;
	let service: import('../suite-processing-service').SuiteProcessingService;
	let dbQueries: DbQueries;
	let mockGetEntriesInSuite: jest.MockedFunction<DbQueries['getEntriesInSuite']>;
	let mockGetAgentById: jest.MockedFunction<DbQueries['getAgentById']>;

	const loadServiceWithMocks = () => {
		jest.resetModules();
		jest.doMock('../../db/database', () => ({
			__esModule: true,
			default: {
				prepare: jest.fn()
			}
		}));
		jest.doMock('../../db/queries', () => ({
			getEntriesInSuite: jest.fn(),
			getAgentById: jest.fn(),
			getAgents: jest.fn(),
			createAgent: jest.fn(),
			updateAgent: jest.fn(),
			deleteAgent: jest.fn(),
			getAgentsWithCount: jest.fn()
		}));

		jest.isolateModules(() => {
			// eslint-disable-next-line @typescript-eslint/no-var-requires
			SuiteProcessingService = require('../suite-processing-service').SuiteProcessingService;
			// eslint-disable-next-line @typescript-eslint/no-var-requires
			dbQueries = require('../../db/queries') as DbQueries;
		});

		mockGetEntriesInSuite = dbQueries.getEntriesInSuite as jest.MockedFunction<DbQueries['getEntriesInSuite']>;
		mockGetAgentById = dbQueries.getAgentById as jest.MockedFunction<DbQueries['getAgentById']>;
	};

	beforeEach(() => {
		loadServiceWithMocks();
		jest.clearAllMocks();
		service = new SuiteProcessingService();

		// Setup default mock for getAgentById
		mockGetAgentById.mockReturnValue({
			id: 1,
			name: 'Test Agent',
			settings: JSON.stringify({ type: 'crewai' }),
			version: '1',
			prompt: 'Test prompt',
			created_at: '2024-01-01',
			updated_at: '2024-01-01'
		} as Agent);
	});

	describe('countLeafTests', () => {
		it('should count direct test entries', () => {
			mockGetEntriesInSuite.mockReturnValue([
				{ id: 1, parent_suite_id: 1, sequence: 1, test_id: 100 } as SuiteEntry,
				{ id: 2, parent_suite_id: 1, sequence: 2, test_id: 101 } as SuiteEntry,
				{ id: 3, parent_suite_id: 1, sequence: 3, conversation_id: 200 } as SuiteEntry
			]);

			const count = service.countLeafTests(1);

			expect(count).toBe(3);
		});

		it('should count tests in nested suites', () => {
			mockGetEntriesInSuite
				.mockReturnValueOnce([
					{ id: 1, parent_suite_id: 1, sequence: 1, test_id: 100 } as SuiteEntry,
					{ id: 2, parent_suite_id: 1, sequence: 2, child_suite_id: 2 } as SuiteEntry
				])
				.mockReturnValueOnce([
					{ id: 3, parent_suite_id: 2, sequence: 1, test_id: 101 } as SuiteEntry,
					{ id: 4, parent_suite_id: 2, sequence: 2, test_id: 102 } as SuiteEntry
				]);

			const count = service.countLeafTests(1);

			expect(count).toBe(3); // 1 from parent + 2 from child
		});

		it('should handle empty suites', () => {
			mockGetEntriesInSuite.mockReturnValue([]);

			const count = service.countLeafTests(1);

			expect(count).toBe(0);
		});

		it('should detect and prevent circular references', () => {
			mockGetEntriesInSuite
				.mockReturnValueOnce([{ id: 1, parent_suite_id: 1, sequence: 1, child_suite_id: 2 } as SuiteEntry])
				.mockReturnValueOnce([{ id: 2, parent_suite_id: 2, sequence: 1, child_suite_id: 1 } as SuiteEntry]);

			const count = service.countLeafTests(1);

			expect(count).toBe(0); // Should stop recursion
		});

		it('should handle deeply nested suites', () => {
			mockGetEntriesInSuite
				.mockReturnValueOnce([{ id: 1, parent_suite_id: 1, sequence: 1, child_suite_id: 2 } as SuiteEntry])
				.mockReturnValueOnce([{ id: 2, parent_suite_id: 2, sequence: 1, child_suite_id: 3 } as SuiteEntry])
				.mockReturnValueOnce([{ id: 3, parent_suite_id: 3, sequence: 1, test_id: 100 } as SuiteEntry]);

			const count = service.countLeafTests(1);

			expect(count).toBe(1);
		});
	});

	describe('getFlattenedLeaves', () => {
		it('should flatten direct test entries', () => {
			mockGetEntriesInSuite.mockReturnValue([
				{ id: 1, parent_suite_id: 1, sequence: 1, test_id: 100 } as SuiteEntry,
				{ id: 2, parent_suite_id: 1, sequence: 2, test_id: 101 } as SuiteEntry
			]);

			const result = service.getFlattenedLeaves(1, 1);

			expect(result).toEqual([
				{ agent_id: 1, test_id: 100 },
				{ agent_id: 1, test_id: 101 }
			]);
		});

		it('should flatten conversation entries', () => {
			mockGetEntriesInSuite.mockReturnValue([
				{ id: 1, parent_suite_id: 1, sequence: 1, conversation_id: 200 } as SuiteEntry,
				{ id: 2, parent_suite_id: 1, sequence: 2, conversation_id: 201 } as SuiteEntry
			]);

			const result = service.getFlattenedLeaves(1, 1);

			expect(result).toEqual([
				{ agent_id: 1, conversation_id: 200 },
				{ agent_id: 1, conversation_id: 201 }
			]);
		});

		it('should use agent_id_override when provided', () => {
			mockGetEntriesInSuite.mockReturnValue([
				{ id: 1, parent_suite_id: 1, sequence: 1, test_id: 100, agent_id_override: 2 } as SuiteEntry,
				{ id: 2, parent_suite_id: 1, sequence: 2, test_id: 101 } as SuiteEntry
			]);

			const result = service.getFlattenedLeaves(1, 1);

			expect(result).toEqual([
				{ agent_id: 2, test_id: 100 },
				{ agent_id: 1, test_id: 101 }
			]);
		});

		it('should flatten nested suites', () => {
			mockGetEntriesInSuite
				.mockReturnValueOnce([{ id: 1, parent_suite_id: 1, sequence: 1, child_suite_id: 2 } as SuiteEntry])
				.mockReturnValueOnce([
					{ id: 2, parent_suite_id: 2, sequence: 1, test_id: 100 } as SuiteEntry,
					{ id: 3, parent_suite_id: 2, sequence: 2, test_id: 101 } as SuiteEntry
				]);

			const result = service.getFlattenedLeaves(1, 1);

			expect(result).toEqual([
				{ agent_id: 1, test_id: 100 },
				{ agent_id: 1, test_id: 101 }
			]);
		});

		it('should handle agent_id_override in child suites', () => {
			mockGetEntriesInSuite
				.mockReturnValueOnce([
					{ id: 1, parent_suite_id: 1, sequence: 1, child_suite_id: 2, agent_id_override: 2 } as SuiteEntry
				])
				.mockReturnValueOnce([{ id: 2, parent_suite_id: 2, sequence: 1, test_id: 100 } as SuiteEntry]);

			const result = service.getFlattenedLeaves(1, 1);

			expect(result).toEqual([{ agent_id: 2, test_id: 100 }]);
		});

		it('should detect and prevent circular references', () => {
			mockGetEntriesInSuite
				.mockReturnValueOnce([{ id: 1, parent_suite_id: 1, sequence: 1, child_suite_id: 2 } as SuiteEntry])
				.mockReturnValueOnce([{ id: 2, parent_suite_id: 2, sequence: 1, child_suite_id: 1 } as SuiteEntry]);

			const result = service.getFlattenedLeaves(1, 1);

			expect(result).toEqual([]);
		});

		it('should handle empty suites', () => {
			mockGetEntriesInSuite.mockReturnValue([]);

			const result = service.getFlattenedLeaves(1, 1);

			expect(result).toEqual([]);
		});

		it('should handle missing agent gracefully', () => {
			mockGetEntriesInSuite.mockReturnValue([
				{ id: 1, parent_suite_id: 1, sequence: 1, test_id: 100 } as SuiteEntry
			]);
			mockGetAgentById.mockReturnValue(undefined as any);

			const result = service.getFlattenedLeaves(1, 999);

			// Should still return results even with invalid agent
			expect(result).toEqual([{ agent_id: 999, test_id: 100 }]);
		});

		it('should handle agent with invalid settings JSON', () => {
			mockGetEntriesInSuite.mockReturnValue([
				{ id: 1, parent_suite_id: 1, sequence: 1, test_id: 100 } as SuiteEntry
			]);
			mockGetAgentById.mockReturnValue({
				id: 1,
				name: 'Test Agent',
				settings: 'invalid json{',
				version: '1',
				prompt: 'Test prompt',
				created_at: '2024-01-01',
				updated_at: '2024-01-01'
			} as Agent);

			const result = service.getFlattenedLeaves(1, 1);

			// Should still return results
			expect(result).toEqual([{ agent_id: 1, test_id: 100 }]);
		});

		it('should warn about agent without type field', () => {
			mockGetEntriesInSuite.mockReturnValue([
				{ id: 1, parent_suite_id: 1, sequence: 1, test_id: 100 } as SuiteEntry
			]);
			mockGetAgentById.mockReturnValue({
				id: 1,
				name: 'Test Agent',
				settings: JSON.stringify({ other: 'field' }),
				version: '1',
				prompt: 'Test prompt',
				created_at: '2024-01-01',
				updated_at: '2024-01-01'
			} as Agent);

			const result = service.getFlattenedLeaves(1, 1);

			expect(result).toEqual([{ agent_id: 1, test_id: 100 }]);
		});

		it('should warn about unexpected agent types', () => {
			mockGetEntriesInSuite.mockReturnValue([
				{ id: 1, parent_suite_id: 1, sequence: 1, test_id: 100 } as SuiteEntry
			]);
			mockGetAgentById.mockReturnValue({
				id: 1,
				name: 'Test Agent',
				settings: JSON.stringify({ type: 'unknown_type' }),
				version: '1',
				prompt: 'Test prompt',
				created_at: '2024-01-01',
				updated_at: '2024-01-01'
			} as Agent);

			const result = service.getFlattenedLeaves(1, 1);

			expect(result).toEqual([{ agent_id: 1, test_id: 100 }]);
		});

		it('should skip invalid entries without test_id or child_suite_id', () => {
			mockGetEntriesInSuite.mockReturnValue([
				{ id: 1, parent_suite_id: 1, sequence: 1, test_id: 100 } as SuiteEntry,
				{ id: 2, parent_suite_id: 1, sequence: 2 } as SuiteEntry, // Invalid - no test_id or child_suite_id
				{ id: 3, parent_suite_id: 1, sequence: 3, test_id: 101 } as SuiteEntry
			]);

			const result = service.getFlattenedLeaves(1, 1);

			expect(result).toEqual([
				{ agent_id: 1, test_id: 100 },
				{ agent_id: 1, test_id: 101 }
			]);
		});

		it('should handle deeply nested suites', () => {
			mockGetEntriesInSuite
				.mockReturnValueOnce([{ id: 1, parent_suite_id: 1, sequence: 1, child_suite_id: 2 } as SuiteEntry])
				.mockReturnValueOnce([{ id: 2, parent_suite_id: 2, sequence: 1, child_suite_id: 3 } as SuiteEntry])
				.mockReturnValueOnce([{ id: 3, parent_suite_id: 3, sequence: 1, test_id: 100 } as SuiteEntry]);

			const result = service.getFlattenedLeaves(1, 1);

			expect(result).toEqual([{ agent_id: 1, test_id: 100 }]);
		});

		it('should handle mixed test and conversation entries', () => {
			mockGetEntriesInSuite.mockReturnValue([
				{ id: 1, parent_suite_id: 1, sequence: 1, test_id: 100 } as SuiteEntry,
				{ id: 2, parent_suite_id: 1, sequence: 2, conversation_id: 200 } as SuiteEntry,
				{ id: 3, parent_suite_id: 1, sequence: 3, test_id: 101 } as SuiteEntry
			]);

			const result = service.getFlattenedLeaves(1, 1);

			expect(result).toEqual([
				{ agent_id: 1, test_id: 100 },
				{ agent_id: 1, conversation_id: 200 },
				{ agent_id: 1, test_id: 101 }
			]);
		});

		it('should prefer conversation_id over test_id when both present', () => {
			mockGetEntriesInSuite.mockReturnValue([
				{ id: 1, parent_suite_id: 1, sequence: 1, test_id: 100, conversation_id: 200 } as SuiteEntry
			]);

			const result = service.getFlattenedLeaves(1, 1);

			expect(result).toEqual([{ agent_id: 1, conversation_id: 200 }]);
		});

		it('should handle complex nested structure with overrides', () => {
			mockGetEntriesInSuite
				.mockReturnValueOnce([
					{ id: 1, parent_suite_id: 1, sequence: 1, test_id: 100 } as SuiteEntry,
					{ id: 2, parent_suite_id: 1, sequence: 2, child_suite_id: 2, agent_id_override: 2 } as SuiteEntry,
					{ id: 3, parent_suite_id: 1, sequence: 3, test_id: 101 } as SuiteEntry
				])
				.mockReturnValueOnce([
					{ id: 4, parent_suite_id: 2, sequence: 1, test_id: 102 } as SuiteEntry,
					{ id: 5, parent_suite_id: 2, sequence: 2, child_suite_id: 3, agent_id_override: 3 } as SuiteEntry
				])
				.mockReturnValueOnce([{ id: 6, parent_suite_id: 3, sequence: 1, test_id: 103 } as SuiteEntry]);

			const result = service.getFlattenedLeaves(1, 1);

			expect(result).toEqual([
				{ agent_id: 1, test_id: 100 },
				{ agent_id: 2, test_id: 102 },
				{ agent_id: 3, test_id: 103 },
				{ agent_id: 1, test_id: 101 }
			]);
		});
	});
});

// Made with Bob
