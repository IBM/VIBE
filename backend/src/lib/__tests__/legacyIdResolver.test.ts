import { testIdToConversationId } from '../legacyIdResolver';
import db from '../../db/database';

jest.mock('../../db/database');

const mockedDb = db as jest.Mocked<typeof db>;

describe('legacyIdResolver', () => {
	beforeEach(() => {
		jest.clearAllMocks();
	});

	describe('testIdToConversationId', () => {
		it('returns conversation id when direct match exists', () => {
			mockedDb.prepare = jest.fn().mockReturnValue({
				get: jest.fn().mockReturnValue({ id: 5 })
			} as any);

			const result = testIdToConversationId(5);

			expect(result).toBe(5);
		});

		it('returns undefined when no direct match exists and no legacy table', () => {
			mockedDb.prepare = jest
				.fn()
				.mockReturnValueOnce({
					get: jest.fn().mockReturnValue(undefined)
				} as any)
				.mockReturnValueOnce({
					all: jest.fn().mockReturnValue([])
				} as any);

			const result = testIdToConversationId(999);

			expect(result).toBeUndefined();
		});

		it('falls back to legacy mapping when direct match fails', () => {
			mockedDb.prepare = jest
				.fn()
				.mockReturnValueOnce({
					get: jest.fn().mockReturnValue(undefined)
				} as any)
				.mockReturnValueOnce({
					all: jest.fn().mockReturnValue([{ name: 'tests' }])
				} as any)
				.mockReturnValueOnce({
					get: jest.fn().mockReturnValue({ conversation_id: 10 })
				} as any);

			const result = testIdToConversationId(5);

			expect(result).toBe(10);
		});

		it('returns undefined when legacy mapping fails', () => {
			mockedDb.prepare = jest
				.fn()
				.mockReturnValueOnce({
					get: jest.fn().mockReturnValue(undefined)
				} as any)
				.mockReturnValueOnce({
					all: jest.fn().mockReturnValue([{ name: 'tests' }])
				} as any)
				.mockReturnValueOnce({
					get: jest.fn().mockReturnValue(undefined)
				} as any);

			const result = testIdToConversationId(999);

			expect(result).toBeUndefined();
		});

		it('returns undefined for non-finite input', () => {
			const result = testIdToConversationId(NaN);

			expect(result).toBeUndefined();
			expect(mockedDb.prepare).not.toHaveBeenCalled();
		});

		it('returns undefined for Infinity', () => {
			const result = testIdToConversationId(Infinity);

			expect(result).toBeUndefined();
			expect(mockedDb.prepare).not.toHaveBeenCalled();
		});

		it('returns undefined for negative Infinity', () => {
			const result = testIdToConversationId(-Infinity);

			expect(result).toBeUndefined();
			expect(mockedDb.prepare).not.toHaveBeenCalled();
		});

		it('handles database errors gracefully', () => {
			mockedDb.prepare = jest.fn().mockImplementation(() => {
				throw new Error('Database error');
			});

			const result = testIdToConversationId(5);

			expect(result).toBeUndefined();
		});

		it('handles errors in legacy table check', () => {
			mockedDb.prepare = jest
				.fn()
				.mockReturnValueOnce({
					get: jest.fn().mockReturnValue(undefined)
				} as any)
				.mockImplementationOnce(() => {
					throw new Error('Table check error');
				});

			const result = testIdToConversationId(5);

			expect(result).toBeUndefined();
		});

		it('handles errors in legacy mapping query', () => {
			mockedDb.prepare = jest
				.fn()
				.mockReturnValueOnce({
					get: jest.fn().mockReturnValue(undefined)
				} as any)
				.mockReturnValueOnce({
					all: jest.fn().mockReturnValue([{ name: 'tests' }])
				} as any)
				.mockImplementationOnce(() => {
					throw new Error('Mapping query error');
				});

			const result = testIdToConversationId(5);

			expect(result).toBeUndefined();
		});

		it('returns undefined for zero id (falsy check in implementation)', () => {
			mockedDb.prepare = jest
				.fn()
				.mockReturnValueOnce({
					get: jest.fn().mockReturnValue({ id: 0 })
				} as any)
				.mockReturnValueOnce({
					all: jest.fn().mockReturnValue([])
				} as any);

			const result = testIdToConversationId(0);

			// Zero is falsy, so the implementation skips it
			expect(result).toBeUndefined();
		});

		it('handles negative test ids', () => {
			mockedDb.prepare = jest.fn().mockReturnValue({
				get: jest.fn().mockReturnValue(undefined)
			} as any);

			const result = testIdToConversationId(-5);

			expect(result).toBeUndefined();
		});

		it('prefers direct conversation match over legacy mapping', () => {
			mockedDb.prepare = jest.fn().mockReturnValue({
				get: jest.fn().mockReturnValue({ id: 5 })
			} as any);

			const result = testIdToConversationId(5);

			expect(result).toBe(5);
			// Should only call prepare once for direct match
			expect(mockedDb.prepare).toHaveBeenCalledTimes(1);
		});

		it('handles null return from direct match', () => {
			mockedDb.prepare = jest
				.fn()
				.mockReturnValueOnce({
					get: jest.fn().mockReturnValue(null)
				} as any)
				.mockReturnValueOnce({
					all: jest.fn().mockReturnValue([])
				} as any);

			const result = testIdToConversationId(5);

			expect(result).toBeUndefined();
		});

		it('handles object without id property', () => {
			mockedDb.prepare = jest.fn().mockReturnValue({
				get: jest.fn().mockReturnValue({ other: 'field' })
			} as any);

			const result = testIdToConversationId(5);

			expect(result).toBeUndefined();
		});

		it('handles legacy mapping with null conversation_id', () => {
			mockedDb.prepare = jest
				.fn()
				.mockReturnValueOnce({
					get: jest.fn().mockReturnValue(undefined)
				} as any)
				.mockReturnValueOnce({
					all: jest.fn().mockReturnValue([{ name: 'tests' }])
				} as any)
				.mockReturnValueOnce({
					get: jest.fn().mockReturnValue({ conversation_id: null })
				} as any);

			const result = testIdToConversationId(5);

			expect(result).toBeUndefined();
		});

		it('handles legacy mapping with missing conversation_id property', () => {
			mockedDb.prepare = jest
				.fn()
				.mockReturnValueOnce({
					get: jest.fn().mockReturnValue(undefined)
				} as any)
				.mockReturnValueOnce({
					all: jest.fn().mockReturnValue([{ name: 'tests' }])
				} as any)
				.mockReturnValueOnce({
					get: jest.fn().mockReturnValue({ other: 'field' })
				} as any);

			const result = testIdToConversationId(5);

			expect(result).toBeUndefined();
		});
	});
});

// Made with Bob
