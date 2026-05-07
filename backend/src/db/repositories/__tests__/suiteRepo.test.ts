import { TestSuite, SuiteEntry, SuiteRun, JobStatus } from '@ibm-vibe/types';

describe('suiteRepo', () => {
	let mockDb: any;
	let suiteRepo: any;

	beforeEach(() => {
		jest.clearAllMocks();
		jest.isolateModules(() => {
			// Mock database
			mockDb = {
				prepare: jest.fn(),
				transaction: jest.fn()
			};

			jest.doMock('../../database', () => ({
				__esModule: true,
				default: mockDb
			}));

			// Mock normalizers
			jest.doMock('../../normalizers', () => ({
				normalizeSuiteEntryInsert: jest.fn((entry) => entry)
			}));

			suiteRepo = require('../suiteRepo');
		});
	});

	describe('TestSuite operations', () => {
		describe('createTestSuite', () => {
			it('creates test suite with all fields', () => {
				const mockSuite: TestSuite = {
					id: 1,
					name: 'Test Suite 1',
					description: 'Test description',
					tags: 'tag1,tag2',
					created_at: '2024-01-01T00:00:00Z',
					updated_at: '2024-01-01T00:00:00Z'
				};

				const mockStmt = { get: jest.fn().mockReturnValue(mockSuite) };
				(mockDb.prepare as any).mockReturnValue(mockStmt);

				const result = suiteRepo.createTestSuite(mockSuite);

				expect(mockStmt.get).toHaveBeenCalledWith(
					expect.objectContaining({
						name: 'Test Suite 1',
						description: 'Test description',
						tags: 'tag1,tag2'
					})
				);
				expect(result).toEqual(mockSuite);
			});

			it('creates test suite with default values', () => {
				const mockSuite: TestSuite = {
					id: 1,
					name: 'Test Suite 1',
					description: '',
					tags: '',
					created_at: '2024-01-01T00:00:00Z',
					updated_at: '2024-01-01T00:00:00Z'
				};

				const mockStmt = { get: jest.fn().mockReturnValue(mockSuite) };
				(mockDb.prepare as any).mockReturnValue(mockStmt);

				const result = suiteRepo.createTestSuite({ name: 'Test Suite 1' } as TestSuite);

				expect(mockStmt.get).toHaveBeenCalledWith(
					expect.objectContaining({
						description: '',
						tags: ''
					})
				);
				expect(result).toEqual(mockSuite);
			});
		});

		describe('updateTestSuite', () => {
			it('updates test suite with provided fields', () => {
				const mockUpdated: TestSuite = {
					id: 1,
					name: 'Updated Suite',
					description: 'Updated description',
					tags: 'new-tag',
					created_at: '2024-01-01T00:00:00Z',
					updated_at: '2024-01-02T00:00:00Z'
				};

				const mockStmt = { get: jest.fn().mockReturnValue(mockUpdated) };
				(mockDb.prepare as any).mockReturnValue(mockStmt);

				const result = suiteRepo.updateTestSuite(1, {
					name: 'Updated Suite',
					description: 'Updated description'
				});

				expect(mockStmt.get).toHaveBeenCalledWith(
					expect.objectContaining({
						id: 1,
						name: 'Updated Suite',
						description: 'Updated description'
					})
				);
				expect(result).toEqual(mockUpdated);
			});

			it('returns existing suite when no fields to update', () => {
				const mockSuite: TestSuite = {
					id: 1,
					name: 'Test Suite',
					created_at: '2024-01-01T00:00:00Z',
					updated_at: '2024-01-01T00:00:00Z'
				} as TestSuite;

				const mockStmt = { get: jest.fn().mockReturnValue(mockSuite) };
				(mockDb.prepare as any).mockReturnValue(mockStmt);

				const result = suiteRepo.updateTestSuite(1, {});

				expect(mockDb.prepare).toHaveBeenCalledWith('SELECT * FROM test_suites WHERE id = ?');
				expect(result).toEqual(mockSuite);
			});
		});

		describe('deleteTestSuite', () => {
			it('deletes test suite and associated data in transaction', () => {
				const mockDeleteSuiteRunsStmt = { run: jest.fn() };
				const mockDeleteTestSuiteStmt = { run: jest.fn().mockReturnValue({ changes: 1 }) };

				(mockDb.prepare as any)
					.mockReturnValueOnce(mockDeleteSuiteRunsStmt)
					.mockReturnValueOnce(mockDeleteTestSuiteStmt);

				(mockDb.transaction as any).mockImplementation((fn: any) => {
					return () => fn();
				});

				const result = suiteRepo.deleteTestSuite(1);

				expect(mockDb.transaction).toHaveBeenCalled();
				expect(mockDeleteSuiteRunsStmt.run).toHaveBeenCalledWith(1);
				expect(mockDeleteTestSuiteStmt.run).toHaveBeenCalledWith(1);
				expect(result).toEqual({ changes: 1 });
			});
		});

		describe('getTestSuites', () => {
			it('returns all test suites ordered by created_at DESC', () => {
				const mockSuites = [
					{ id: 2, name: 'Suite 2', created_at: '2024-01-02T00:00:00Z' },
					{ id: 1, name: 'Suite 1', created_at: '2024-01-01T00:00:00Z' }
				];

				const mockStmt = { all: jest.fn().mockReturnValue(mockSuites) };
				(mockDb.prepare as any).mockReturnValue(mockStmt);

				const result = suiteRepo.getTestSuites();

				expect(mockDb.prepare).toHaveBeenCalledWith('SELECT * FROM test_suites ORDER BY created_at DESC');
				expect(result).toEqual(mockSuites);
			});
		});

		describe('getTestSuiteById', () => {
			it('returns test suite by id', () => {
				const mockSuite: TestSuite = {
					id: 1,
					name: 'Test Suite',
					created_at: '2024-01-01T00:00:00Z',
					updated_at: '2024-01-01T00:00:00Z'
				} as TestSuite;

				const mockStmt = { get: jest.fn().mockReturnValue(mockSuite) };
				(mockDb.prepare as any).mockReturnValue(mockStmt);

				const result = suiteRepo.getTestSuiteById(1);

				expect(mockStmt.get).toHaveBeenCalledWith(1);
				expect(result).toEqual(mockSuite);
			});
		});

		describe('getTestSuitesWithCount', () => {
			it('returns test suites with total count', () => {
				const mockSuites = [{ id: 1, name: 'Suite 1' }];
				const mockDataStmt = { all: jest.fn().mockReturnValue(mockSuites) };
				const mockCountStmt = { get: jest.fn().mockReturnValue({ count: 10 }) };

				(mockDb.prepare as any).mockReturnValueOnce(mockDataStmt).mockReturnValueOnce(mockCountStmt);

				const result = suiteRepo.getTestSuitesWithCount();

				expect(result).toEqual({ data: mockSuites, total: 10 });
			});

			it('applies limit and offset', () => {
				const mockDataStmt = { all: jest.fn().mockReturnValue([]) };
				const mockCountStmt = { get: jest.fn().mockReturnValue({ count: 0 }) };

				(mockDb.prepare as any).mockReturnValueOnce(mockDataStmt).mockReturnValueOnce(mockCountStmt);

				suiteRepo.getTestSuitesWithCount({ limit: 10, offset: 20 });

				expect(mockDataStmt.all).toHaveBeenCalledWith(10, 20);
			});
		});
	});

	describe('SuiteEntry operations', () => {
		describe('getEntriesInSuite', () => {
			it('returns entries ordered by sequence', () => {
				const mockEntries: SuiteEntry[] = [
					{
						id: 1,
						parent_suite_id: 1,
						sequence: 1,
						test_id: 10,
						created_at: '2024-01-01T00:00:00Z'
					} as SuiteEntry,
					{
						id: 2,
						parent_suite_id: 1,
						sequence: 2,
						conversation_id: 20,
						created_at: '2024-01-01T00:00:00Z'
					} as SuiteEntry
				];

				const mockStmt = { all: jest.fn().mockReturnValue(mockEntries) };
				(mockDb.prepare as any).mockReturnValue(mockStmt);

				const result = suiteRepo.getEntriesInSuite(1);

				expect(mockStmt.all).toHaveBeenCalledWith(1);
				expect(result).toEqual(mockEntries);
			});
		});

		describe('addSuiteEntry', () => {
			it('adds suite entry', () => {
				const mockEntry: SuiteEntry = {
					id: 1,
					parent_suite_id: 1,
					sequence: 1,
					test_id: 10,
					created_at: '2024-01-01T00:00:00Z'
				} as SuiteEntry;

				const mockStmt = { get: jest.fn().mockReturnValue(mockEntry) };
				(mockDb.prepare as any).mockReturnValue(mockStmt);

				const result = suiteRepo.addSuiteEntry({ parent_suite_id: 1, test_id: 10 });

				expect(mockStmt.get).toHaveBeenCalled();
				expect(result).toEqual(mockEntry);
			});
		});

		describe('updateSuiteEntryOrder', () => {
			it('updates entry sequence', () => {
				const mockStmt = { run: jest.fn() };
				(mockDb.prepare as any).mockReturnValue(mockStmt);

				suiteRepo.updateSuiteEntryOrder(1, 5);

				expect(mockStmt.run).toHaveBeenCalledWith(
					expect.objectContaining({
						id: 1,
						sequence: 5
					})
				);
			});

			it('updates agent_id_override', () => {
				const mockStmt = { run: jest.fn() };
				(mockDb.prepare as any).mockReturnValue(mockStmt);

				suiteRepo.updateSuiteEntryOrder(1, undefined, 10);

				expect(mockStmt.run).toHaveBeenCalledWith(
					expect.objectContaining({
						id: 1,
						agent_id_override: 10
					})
				);
			});

			it('does nothing when no fields to update', () => {
				suiteRepo.updateSuiteEntryOrder(1);

				expect(mockDb.prepare).not.toHaveBeenCalled();
			});
		});

		describe('deleteSuiteEntry', () => {
			it('deletes suite entry', () => {
				const mockStmt = { run: jest.fn() };
				(mockDb.prepare as any).mockReturnValue(mockStmt);

				suiteRepo.deleteSuiteEntry(1);

				expect(mockDb.prepare).toHaveBeenCalledWith('DELETE FROM suite_entries WHERE id = ?');
				expect(mockStmt.run).toHaveBeenCalledWith(1);
			});
		});

		describe('reorderSuiteEntries', () => {
			it('updates entry sequences in transaction', () => {
				const mockStmt = { run: jest.fn() };
				(mockDb.prepare as any).mockReturnValue(mockStmt);

				(mockDb.transaction as any).mockImplementation((fn: any) => {
					return () => fn();
				});

				const entryOrders = [
					{ entry_id: 1, sequence: 2 },
					{ entry_id: 2, sequence: 1 }
				];

				suiteRepo.reorderSuiteEntries(1, entryOrders);

				expect(mockDb.transaction).toHaveBeenCalled();
				expect(mockStmt.run).toHaveBeenCalledWith(2, 1, 1);
				expect(mockStmt.run).toHaveBeenCalledWith(1, 1, 2);
			});
		});
	});

	describe('SuiteRun operations', () => {
		describe('createSuiteRun', () => {
			it('creates suite run', () => {
				const mockRun: SuiteRun = {
					id: 1,
					suite_id: 1,
					agent_id: 1,
					status: JobStatus.PENDING,
					progress: 0,
					total_tests: 10,
					completed_tests: 0,
					successful_tests: 0,
					failed_tests: 0,
					started_at: '2024-01-01T00:00:00Z'
				};

				const mockStmt = { get: jest.fn().mockReturnValue(mockRun) };
				(mockDb.prepare as any).mockReturnValue(mockStmt);

				const result = suiteRepo.createSuiteRun(mockRun);

				expect(mockStmt.get).toHaveBeenCalledWith(mockRun);
				expect(result).toEqual(mockRun);
			});
		});

		describe('updateSuiteRun', () => {
			it('updates suite run with provided fields', () => {
				const mockUpdated: SuiteRun = {
					id: 1,
					suite_id: 1,
					agent_id: 1,
					status: JobStatus.RUNNING,
					progress: 50,
					total_tests: 10,
					completed_tests: 5,
					successful_tests: 4,
					failed_tests: 1,
					started_at: '2024-01-01T00:00:00Z'
				};

				const mockStmt = { get: jest.fn().mockReturnValue(mockUpdated) };
				(mockDb.prepare as any).mockReturnValue(mockStmt);

				const result = suiteRepo.updateSuiteRun(1, { status: JobStatus.RUNNING, progress: 50 });

				expect(mockStmt.get).toHaveBeenCalledWith(
					expect.objectContaining({
						id: 1,
						status: JobStatus.RUNNING,
						progress: 50
					})
				);
				expect(result).toEqual(mockUpdated);
			});

			it('sets completed_at when status is completed', () => {
				const mockUpdated: SuiteRun = {
					id: 1,
					suite_id: 1,
					agent_id: 1,
					status: JobStatus.COMPLETED,
					started_at: '2024-01-01T00:00:00Z',
					completed_at: '2024-01-01T01:00:00Z'
				} as SuiteRun;

				const mockStmt = { get: jest.fn().mockReturnValue(mockUpdated) };
				(mockDb.prepare as any).mockReturnValue(mockStmt);

				suiteRepo.updateSuiteRun(1, { status: JobStatus.COMPLETED });

				const query = (mockDb.prepare as any).mock.calls[0][0];
				expect(query).toContain('completed_at = CURRENT_TIMESTAMP');
			});

			it('returns existing run when no fields to update', () => {
				const mockRun: SuiteRun = {
					id: 1,
					suite_id: 1,
					agent_id: 1,
					status: JobStatus.PENDING,
					started_at: '2024-01-01T00:00:00Z'
				} as SuiteRun;

				const mockStmt = { get: jest.fn().mockReturnValue(mockRun) };
				(mockDb.prepare as any).mockReturnValue(mockStmt);

				const result = suiteRepo.updateSuiteRun(1, {});

				expect(mockDb.prepare).toHaveBeenCalledWith('SELECT * FROM suite_runs WHERE id = ?');
				expect(result).toEqual(mockRun);
			});
		});

		describe('getSuiteRunById', () => {
			it('returns suite run by id', () => {
				const mockRun: SuiteRun = {
					id: 1,
					suite_id: 1,
					agent_id: 1,
					status: JobStatus.COMPLETED,
					started_at: '2024-01-01T00:00:00Z'
				} as SuiteRun;

				const mockStmt = { get: jest.fn().mockReturnValue(mockRun) };
				(mockDb.prepare as any).mockReturnValue(mockStmt);

				const result = suiteRepo.getSuiteRunById(1);

				expect(mockStmt.get).toHaveBeenCalledWith(1);
				expect(result).toEqual(mockRun);
			});
		});

		describe('listSuiteRuns', () => {
			it('returns all suite runs', () => {
				const mockRuns = [
					{ id: 1, suite_id: 1, agent_name: 'Agent 1' },
					{ id: 2, suite_id: 2, agent_name: 'Agent 2' }
				];

				const mockStmt = { all: jest.fn().mockReturnValue(mockRuns) };
				(mockDb.prepare as any).mockReturnValue(mockStmt);

				const result = suiteRepo.listSuiteRuns();

				expect(result).toEqual(mockRuns);
			});

			it('filters by status', () => {
				const mockStmt = { all: jest.fn().mockReturnValue([]) };
				(mockDb.prepare as any).mockReturnValue(mockStmt);

				suiteRepo.listSuiteRuns({ status: JobStatus.COMPLETED });

				const query = (mockDb.prepare as any).mock.calls[0][0];
				expect(query).toContain('AND sr.status = ?');
			});

			it('filters by suite_id', () => {
				const mockStmt = { all: jest.fn().mockReturnValue([]) };
				(mockDb.prepare as any).mockReturnValue(mockStmt);

				suiteRepo.listSuiteRuns({ suite_id: 1 });

				const query = (mockDb.prepare as any).mock.calls[0][0];
				expect(query).toContain('AND sr.suite_id = ?');
			});

			it('filters by date range', () => {
				const mockStmt = { all: jest.fn().mockReturnValue([]) };
				(mockDb.prepare as any).mockReturnValue(mockStmt);

				const after = new Date('2024-01-01');
				const before = new Date('2024-12-31');

				suiteRepo.listSuiteRuns({ after, before });

				const query = (mockDb.prepare as any).mock.calls[0][0];
				expect(query).toContain('AND sr.started_at >= ?');
				expect(query).toContain('AND sr.started_at <= ?');
			});

			it('applies limit and offset', () => {
				const mockStmt = { all: jest.fn().mockReturnValue([]) };
				(mockDb.prepare as any).mockReturnValue(mockStmt);

				suiteRepo.listSuiteRuns({ limit: 10, offset: 20 });

				const query = (mockDb.prepare as any).mock.calls[0][0];
				expect(query).toContain('LIMIT ?');
				expect(query).toContain('OFFSET ?');
			});
		});

		describe('listSuiteRunsWithCount', () => {
			it('returns suite runs with total count', () => {
				const mockRuns = [{ id: 1 }];
				const mockCountStmt = { get: jest.fn().mockReturnValue({ count: 5 }) };
				const mockDataStmt = { all: jest.fn().mockReturnValue(mockRuns) };

				(mockDb.prepare as any).mockReturnValueOnce(mockCountStmt).mockReturnValueOnce(mockDataStmt);

				const result = suiteRepo.listSuiteRunsWithCount();

				expect(result).toEqual({ data: mockRuns, total: 5 });
			});
		});

		describe('getSuiteRunTokenUsage', () => {
			it('aggregates token usage from session metadata', () => {
				const mockSessions = [
					{ metadata: '{"input_tokens":100,"output_tokens":50}' },
					{ metadata: '{"input_tokens":200,"output_tokens":75}' }
				];

				const mockStmt = { all: jest.fn().mockReturnValue(mockSessions) };
				(mockDb.prepare as any).mockReturnValue(mockStmt);

				const result = suiteRepo.getSuiteRunTokenUsage(1);

				expect(result).toEqual({
					total_input_tokens: 300,
					total_output_tokens: 125
				});
			});

			it('handles null metadata', () => {
				const mockSessions = [{ metadata: null }, { metadata: '{"input_tokens":100,"output_tokens":50}' }];

				const mockStmt = { all: jest.fn().mockReturnValue(mockSessions) };
				(mockDb.prepare as any).mockReturnValue(mockStmt);

				const result = suiteRepo.getSuiteRunTokenUsage(1);

				expect(result).toEqual({
					total_input_tokens: 100,
					total_output_tokens: 50
				});
			});

			it('handles invalid JSON', () => {
				const mockSessions = [
					{ metadata: 'invalid json' },
					{ metadata: '{"input_tokens":100,"output_tokens":50}' }
				];

				const mockStmt = { all: jest.fn().mockReturnValue(mockSessions) };
				(mockDb.prepare as any).mockReturnValue(mockStmt);

				const result = suiteRepo.getSuiteRunTokenUsage(1);

				expect(result).toEqual({
					total_input_tokens: 100,
					total_output_tokens: 50
				});
			});
		});

		describe('deleteSuiteRun', () => {
			it('deletes suite run and associated jobs in transaction', () => {
				const mockDeleteJobsStmt = { run: jest.fn() };
				const mockDeleteSuiteRunStmt = { run: jest.fn().mockReturnValue({ changes: 1 }) };

				(mockDb.prepare as any)
					.mockReturnValueOnce(mockDeleteJobsStmt)
					.mockReturnValueOnce(mockDeleteSuiteRunStmt);

				(mockDb.transaction as any).mockImplementation((fn: any) => {
					return () => fn();
				});

				const result = suiteRepo.deleteSuiteRun(1);

				expect(mockDb.transaction).toHaveBeenCalled();
				expect(mockDeleteJobsStmt.run).toHaveBeenCalledWith(1);
				expect(mockDeleteSuiteRunStmt.run).toHaveBeenCalledWith(1);
				expect(result).toEqual({ changes: 1 });
			});
		});
	});
});

// Made with Bob
