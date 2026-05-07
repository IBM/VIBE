import type { Request, Response } from 'express';
import { parsePaginationParams, hasPaginationParams, validatePaginationOrError } from '../pagination';

describe('pagination utilities', () => {
	describe('parsePaginationParams', () => {
		it('parses valid limit and offset', () => {
			const req = {
				query: { limit: '10', offset: '20' }
			} as unknown as Request;

			const result = parsePaginationParams(req);

			expect(result.success).toBe(true);
			if (result.success) {
				expect(result.params.limit).toBe(10);
				expect(result.params.offset).toBe(20);
			}
		});

		it('parses only limit', () => {
			const req = {
				query: { limit: '50' }
			} as unknown as Request;

			const result = parsePaginationParams(req);

			expect(result.success).toBe(true);
			if (result.success) {
				expect(result.params.limit).toBe(50);
				expect(result.params.offset).toBeUndefined();
			}
		});

		it('parses only offset', () => {
			const req = {
				query: { offset: '100' }
			} as unknown as Request;

			const result = parsePaginationParams(req);

			expect(result.success).toBe(true);
			if (result.success) {
				expect(result.params.limit).toBeUndefined();
				expect(result.params.offset).toBe(100);
			}
		});

		it('returns empty params when no pagination provided', () => {
			const req = {
				query: {}
			} as unknown as Request;

			const result = parsePaginationParams(req);

			expect(result.success).toBe(true);
			if (result.success) {
				expect(result.params).toEqual({});
			}
		});

		it('returns error for invalid limit', () => {
			const req = {
				query: { limit: 'not-a-number' }
			} as unknown as Request;

			const result = parsePaginationParams(req);

			expect(result.success).toBe(false);
			expect(result).toHaveProperty('error', 'Invalid limit parameter');
		});

		it('returns error for invalid offset', () => {
			const req = {
				query: { offset: 'invalid' }
			} as unknown as Request;

			const result = parsePaginationParams(req);

			expect(result.success).toBe(false);
			expect(result).toHaveProperty('error', 'Invalid offset parameter');
		});

		it('parses zero values correctly', () => {
			const req = {
				query: { limit: '0', offset: '0' }
			} as unknown as Request;

			const result = parsePaginationParams(req);

			expect(result.success).toBe(true);
			if (result.success) {
				expect(result.params.limit).toBe(0);
				expect(result.params.offset).toBe(0);
			}
		});

		it('parses negative numbers', () => {
			const req = {
				query: { limit: '-10', offset: '-5' }
			} as unknown as Request;

			const result = parsePaginationParams(req);

			expect(result.success).toBe(true);
			if (result.success) {
				expect(result.params.limit).toBe(-10);
				expect(result.params.offset).toBe(-5);
			}
		});
	});

	describe('hasPaginationParams', () => {
		it('returns true when limit is provided', () => {
			const req = {
				query: { limit: '10' }
			} as unknown as Request;

			expect(hasPaginationParams(req)).toBe(true);
		});

		it('returns true when offset is provided', () => {
			const req = {
				query: { offset: '20' }
			} as unknown as Request;

			expect(hasPaginationParams(req)).toBe(true);
		});

		it('returns true when both are provided', () => {
			const req = {
				query: { limit: '10', offset: '20' }
			} as unknown as Request;

			expect(hasPaginationParams(req)).toBe(true);
		});

		it('returns false when neither is provided', () => {
			const req = {
				query: {}
			} as unknown as Request;

			expect(hasPaginationParams(req)).toBe(false);
		});

		it('returns false when only other params are provided', () => {
			const req = {
				query: { search: 'test', filter: 'active' }
			} as unknown as Request;

			expect(hasPaginationParams(req)).toBe(false);
		});
	});

	describe('validatePaginationOrError', () => {
		it('returns parsed params for valid input', () => {
			const req = {
				query: { limit: '10', offset: '20' }
			} as unknown as Request;
			const res = {
				status: jest.fn().mockReturnThis(),
				json: jest.fn()
			} as unknown as Response;

			const result = validatePaginationOrError(req, res);

			expect(result).toEqual({ limit: 10, offset: 20 });
			expect(res.status).not.toHaveBeenCalled();
			expect(res.json).not.toHaveBeenCalled();
		});

		it('sends 400 error and returns null for invalid limit', () => {
			const req = {
				query: { limit: 'invalid' }
			} as unknown as Request;
			const res = {
				status: jest.fn().mockReturnThis(),
				json: jest.fn()
			} as unknown as Response;

			const result = validatePaginationOrError(req, res);

			expect(result).toBeNull();
			expect(res.status).toHaveBeenCalledWith(400);
			expect(res.json).toHaveBeenCalledWith({ error: 'Invalid limit parameter' });
		});

		it('sends 400 error and returns null for invalid offset', () => {
			const req = {
				query: { offset: 'bad' }
			} as unknown as Request;
			const res = {
				status: jest.fn().mockReturnThis(),
				json: jest.fn()
			} as unknown as Response;

			const result = validatePaginationOrError(req, res);

			expect(result).toBeNull();
			expect(res.status).toHaveBeenCalledWith(400);
			expect(res.json).toHaveBeenCalledWith({ error: 'Invalid offset parameter' });
		});

		it('returns empty params when no pagination provided', () => {
			const req = {
				query: {}
			} as unknown as Request;
			const res = {
				status: jest.fn().mockReturnThis(),
				json: jest.fn()
			} as unknown as Response;

			const result = validatePaginationOrError(req, res);

			expect(result).toEqual({});
			expect(res.status).not.toHaveBeenCalled();
		});
	});
});

// Made with Bob
