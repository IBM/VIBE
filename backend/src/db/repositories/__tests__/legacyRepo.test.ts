import { Test, TestResult } from '@ibm-vibe/types';

describe('legacyRepo', () => {
	let mockDb: any;
	let legacyRepo: any;

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

			legacyRepo = require('../legacyRepo');
		});
	});

	describe('Test operations', () => {
		describe('createTest', () => {
			it('creates test with all fields', () => {
				const mockTest: Test = {
					id: 1,
					name: 'Test 1',
					description: 'Test description',
					input: 'Test input',
					expected_output: 'Expected output',
					created_at: '2024-01-01T00:00:00Z',
					updated_at: '2024-01-01T00:00:00Z'
				};

				const mockStmt = { get: jest.fn().mockReturnValue(mockTest) };
				(mockDb.prepare as any).mockReturnValue(mockStmt);

				const result = legacyRepo.createTest(mockTest);

				expect(mockStmt.get).toHaveBeenCalledWith(
					expect.objectContaining({
						name: 'Test 1',
						description: 'Test description',
						input: 'Test input',
						expected_output: 'Expected output'
					})
				);
				expect(result).toEqual(mockTest);
			});

			it('creates test with default values', () => {
				const mockTest: Test = {
					id: 1,
					name: 'Test 1',
					description: '',
					input: 'Test input',
					expected_output: '',
					created_at: '2024-01-01T00:00:00Z',
					updated_at: '2024-01-01T00:00:00Z'
				};

				const mockStmt = { get: jest.fn().mockReturnValue(mockTest) };
				(mockDb.prepare as any).mockReturnValue(mockStmt);

				const result = legacyRepo.createTest({ name: 'Test 1', input: 'Test input' } as Test);

				expect(mockStmt.get).toHaveBeenCalledWith(
					expect.objectContaining({
						description: '',
						expected_output: ''
					})
				);
				expect(result).toEqual(mockTest);
			});
		});

		describe('updateTest', () => {
			it('updates test with provided fields', () => {
				const mockUpdated: Test = {
					id: 1,
					name: 'Updated Test',
					description: 'Updated description',
					input: 'Test input',
					expected_output: 'Expected output',
					created_at: '2024-01-01T00:00:00Z',
					updated_at: '2024-01-02T00:00:00Z'
				};

				const mockStmt = { get: jest.fn().mockReturnValue(mockUpdated) };
				(mockDb.prepare as any).mockReturnValue(mockStmt);

				const result = legacyRepo.updateTest(1, { name: 'Updated Test', description: 'Updated description' });

				expect(mockStmt.get).toHaveBeenCalledWith(
					expect.objectContaining({
						id: 1,
						name: 'Updated Test',
						description: 'Updated description'
					})
				);
				expect(result).toEqual(mockUpdated);
			});

			it('returns existing test when no fields to update', () => {
				const mockTest: Test = {
					id: 1,
					name: 'Test 1',
					input: 'Test input',
					created_at: '2024-01-01T00:00:00Z',
					updated_at: '2024-01-01T00:00:00Z'
				} as Test;

				const mockStmt = { get: jest.fn().mockReturnValue(mockTest) };
				(mockDb.prepare as any).mockReturnValue(mockStmt);

				const result = legacyRepo.updateTest(1, {});

				expect(mockDb.prepare).toHaveBeenCalledWith('SELECT * FROM tests WHERE id = ?');
				expect(result).toEqual(mockTest);
			});

			it('filters out undefined values', () => {
				const mockUpdated: Test = {
					id: 1,
					name: 'Test 1',
					input: 'Test input',
					created_at: '2024-01-01T00:00:00Z',
					updated_at: '2024-01-02T00:00:00Z'
				} as Test;

				const mockStmt = { get: jest.fn().mockReturnValue(mockUpdated) };
				(mockDb.prepare as any).mockReturnValue(mockStmt);

				legacyRepo.updateTest(1, { name: 'Test 1', description: undefined });

				expect(mockStmt.get).toHaveBeenCalledWith(
					expect.objectContaining({
						name: 'Test 1'
					})
				);
				expect(mockStmt.get).toHaveBeenCalledWith(
					expect.not.objectContaining({
						description: expect.anything()
					})
				);
			});
		});

		describe('deleteTest', () => {
			it('deletes test and associated data in transaction', () => {
				const mockDeleteJobsStmt = { run: jest.fn() };
				const mockDeleteResultsStmt = { run: jest.fn() };
				const mockDeleteSuiteEntriesStmt = { run: jest.fn() };
				const mockDeleteTestStmt = { run: jest.fn().mockReturnValue({ changes: 1 }) };

				(mockDb.prepare as any)
					.mockReturnValueOnce(mockDeleteJobsStmt)
					.mockReturnValueOnce(mockDeleteResultsStmt)
					.mockReturnValueOnce(mockDeleteSuiteEntriesStmt)
					.mockReturnValueOnce(mockDeleteTestStmt);

				(mockDb.transaction as any).mockImplementation((fn: any) => {
					return () => fn();
				});

				const result = legacyRepo.deleteTest(1);

				expect(mockDb.transaction).toHaveBeenCalled();
				expect(mockDeleteJobsStmt.run).toHaveBeenCalledWith(1);
				expect(mockDeleteResultsStmt.run).toHaveBeenCalledWith(1);
				expect(mockDeleteSuiteEntriesStmt.run).toHaveBeenCalledWith(1);
				expect(mockDeleteTestStmt.run).toHaveBeenCalledWith(1);
				expect(result).toEqual({ changes: 1 });
			});
		});

		describe('getTests', () => {
			it('returns all tests ordered by created_at DESC', () => {
				const mockTests = [
					{ id: 2, name: 'Test 2', created_at: '2024-01-02T00:00:00Z' },
					{ id: 1, name: 'Test 1', created_at: '2024-01-01T00:00:00Z' }
				];

				const mockStmt = { all: jest.fn().mockReturnValue(mockTests) };
				(mockDb.prepare as any).mockReturnValue(mockStmt);

				const result = legacyRepo.getTests();

				expect(mockDb.prepare).toHaveBeenCalledWith('SELECT * FROM tests ORDER BY created_at DESC');
				expect(result).toEqual(mockTests);
			});
		});

		describe('getTestById', () => {
			it('returns test by id', () => {
				const mockTest: Test = {
					id: 1,
					name: 'Test 1',
					input: 'Test input',
					created_at: '2024-01-01T00:00:00Z',
					updated_at: '2024-01-01T00:00:00Z'
				} as Test;

				const mockStmt = { get: jest.fn().mockReturnValue(mockTest) };
				(mockDb.prepare as any).mockReturnValue(mockStmt);

				const result = legacyRepo.getTestById(1);

				expect(mockStmt.get).toHaveBeenCalledWith(1);
				expect(result).toEqual(mockTest);
			});
		});

		describe('getTestsWithCount', () => {
			it('returns tests with total count', () => {
				const mockTests = [{ id: 1, name: 'Test 1' }];
				const mockDataStmt = { all: jest.fn().mockReturnValue(mockTests) };
				const mockCountStmt = { get: jest.fn().mockReturnValue({ count: 10 }) };

				(mockDb.prepare as any).mockReturnValueOnce(mockDataStmt).mockReturnValueOnce(mockCountStmt);

				const result = legacyRepo.getTestsWithCount();

				expect(result).toEqual({ data: mockTests, total: 10 });
			});

			it('applies limit and offset', () => {
				const mockDataStmt = { all: jest.fn().mockReturnValue([]) };
				const mockCountStmt = { get: jest.fn().mockReturnValue({ count: 0 }) };

				(mockDb.prepare as any).mockReturnValueOnce(mockDataStmt).mockReturnValueOnce(mockCountStmt);

				legacyRepo.getTestsWithCount({ limit: 10, offset: 20 });

				expect(mockDataStmt.all).toHaveBeenCalledWith(10, 20);
			});
		});
	});

	describe('Result operations', () => {
		describe('createResult', () => {
			it('creates result with all fields', () => {
				const mockResult: TestResult = {
					id: 1,
					agent_id: 1,
					test_id: 1,
					output: 'Test output',
					intermediate_steps: '[]',
					success: true,
					execution_time: 100,
					input_tokens: 50,
					output_tokens: 30,
					token_mapping_metadata: '{}',
					created_at: '2024-01-01T00:00:00Z'
				};

				const mockStmt = { get: jest.fn().mockReturnValue({ ...mockResult, success: 1 }) };
				(mockDb.prepare as any).mockReturnValue(mockStmt);

				const result = legacyRepo.createResult(mockResult);

				expect(mockStmt.get).toHaveBeenCalled();
				expect(result.success).toBe(true);
			});

			it('throws error for invalid agent_id', () => {
				expect(() =>
					legacyRepo.createResult({ agent_id: 0, test_id: 1, output: 'test', success: true })
				).toThrow('Invalid agent_id: must be a positive number');
			});

			it('throws error for invalid test_id', () => {
				expect(() =>
					legacyRepo.createResult({ agent_id: 1, test_id: 0, output: 'test', success: true })
				).toThrow('Invalid test_id: must be a positive number');
			});

			it('throws error for invalid success', () => {
				expect(() =>
					legacyRepo.createResult({ agent_id: 1, test_id: 1, output: 'test', success: 'true' as any })
				).toThrow('Invalid success: must be a boolean');
			});

			it('serializes non-string output', () => {
				const mockStmt = {
					get: jest.fn().mockReturnValue({
						id: 1,
						agent_id: 1,
						test_id: 1,
						output: '{"key":"value"}',
						success: 1,
						created_at: '2024-01-01'
					})
				};
				(mockDb.prepare as any).mockReturnValue(mockStmt);

				legacyRepo.createResult({ agent_id: 1, test_id: 1, output: { key: 'value' } as any, success: true });

				expect(mockStmt.get).toHaveBeenCalledWith(
					expect.objectContaining({
						output: '{"key":"value"}'
					})
				);
			});

			it('handles default values', () => {
				const mockStmt = {
					get: jest.fn().mockReturnValue({
						id: 1,
						agent_id: 1,
						test_id: 1,
						output: 'test',
						success: 1,
						execution_time: 0,
						created_at: '2024-01-01'
					})
				};
				(mockDb.prepare as any).mockReturnValue(mockStmt);

				legacyRepo.createResult({ agent_id: 1, test_id: 1, output: 'test', success: true });

				expect(mockStmt.get).toHaveBeenCalledWith(
					expect.objectContaining({
						intermediate_steps: '',
						execution_time: 0
					})
				);
			});

			it('floors token values', () => {
				const mockStmt = {
					get: jest.fn().mockReturnValue({
						id: 1,
						agent_id: 1,
						test_id: 1,
						output: 'test',
						success: 1,
						input_tokens: 50,
						output_tokens: 30,
						created_at: '2024-01-01'
					})
				};
				(mockDb.prepare as any).mockReturnValue(mockStmt);

				legacyRepo.createResult({
					agent_id: 1,
					test_id: 1,
					output: 'test',
					success: true,
					input_tokens: 50.7,
					output_tokens: 30.3
				});

				expect(mockStmt.get).toHaveBeenCalledWith(
					expect.objectContaining({
						input_tokens: 50,
						output_tokens: 30
					})
				);
			});
		});

		describe('getResults', () => {
			it('returns all results', () => {
				const mockResults = [
					{ id: 1, agent_id: 1, test_id: 1 },
					{ id: 2, agent_id: 1, test_id: 2 }
				];

				const mockStmt = { all: jest.fn().mockReturnValue(mockResults) };
				(mockDb.prepare as any).mockReturnValue(mockStmt);

				const result = legacyRepo.getResults();

				expect(result).toEqual(mockResults);
			});

			it('filters by agent_id', () => {
				const mockStmt = { all: jest.fn().mockReturnValue([]) };
				(mockDb.prepare as any).mockReturnValue(mockStmt);

				legacyRepo.getResults({ agent_id: 1 });

				const query = (mockDb.prepare as any).mock.calls[0][0];
				expect(query).toContain('WHERE agent_id = ?');
			});

			it('filters by test_id', () => {
				const mockStmt = { all: jest.fn().mockReturnValue([]) };
				(mockDb.prepare as any).mockReturnValue(mockStmt);

				legacyRepo.getResults({ test_id: 1 });

				const query = (mockDb.prepare as any).mock.calls[0][0];
				expect(query).toContain('WHERE test_id = ?');
			});

			it('applies limit and offset', () => {
				const mockStmt = { all: jest.fn().mockReturnValue([]) };
				(mockDb.prepare as any).mockReturnValue(mockStmt);

				legacyRepo.getResults({ limit: 10, offset: 20 });

				const query = (mockDb.prepare as any).mock.calls[0][0];
				expect(query).toContain('LIMIT ?');
				expect(query).toContain('OFFSET ?');
			});
		});

		describe('getResultsWithCount', () => {
			it('returns results with total count', () => {
				const mockResults = [{ id: 1 }];
				const mockCountStmt = { get: jest.fn().mockReturnValue({ count: 5 }) };
				const mockDataStmt = { all: jest.fn().mockReturnValue(mockResults) };

				(mockDb.prepare as any).mockReturnValueOnce(mockCountStmt).mockReturnValueOnce(mockDataStmt);

				const result = legacyRepo.getResultsWithCount();

				expect(result).toEqual({ data: mockResults, total: 5 });
			});
		});

		describe('getResultById', () => {
			it('returns result by id', () => {
				const mockResult: TestResult = {
					id: 1,
					agent_id: 1,
					test_id: 1,
					output: 'Test output',
					success: true,
					created_at: '2024-01-01T00:00:00Z'
				} as TestResult;

				const mockStmt = { get: jest.fn().mockReturnValue(mockResult) };
				(mockDb.prepare as any).mockReturnValue(mockStmt);

				const result = legacyRepo.getResultById(1);

				expect(mockStmt.get).toHaveBeenCalledWith(1);
				expect(result).toEqual(mockResult);
			});
		});

		describe('updateResult', () => {
			it('updates result with provided fields', () => {
				const mockStmt = { run: jest.fn() };
				(mockDb.prepare as any).mockReturnValue(mockStmt);

				legacyRepo.updateResult(1, { similarity_score: 95 });

				expect(mockStmt.run).toHaveBeenCalledWith(
					expect.objectContaining({
						id: 1,
						similarity_score: 95
					})
				);
			});

			it('does nothing when no fields to update', () => {
				legacyRepo.updateResult(1, {});

				expect(mockDb.prepare).not.toHaveBeenCalled();
			});

			it('excludes id and created_at from updates', () => {
				const mockStmt = { run: jest.fn() };
				(mockDb.prepare as any).mockReturnValue(mockStmt);

				legacyRepo.updateResult(1, { similarity_score: 95, id: 999 as any, created_at: '2025-01-01' as any });

				const query = (mockDb.prepare as any).mock.calls[0][0];
				// The WHERE clause contains "id = @id" which is expected
				// We're checking that the SET clause doesn't update id or created_at
				expect(query).toContain('SET similarity_score = @similarity_score');
				expect(query).not.toContain('SET id = @id');
				expect(query).not.toContain('created_at = @created_at');
			});
		});
	});
});

// Made with Bob
