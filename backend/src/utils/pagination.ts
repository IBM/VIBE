import type { Request, Response } from 'express';

export interface PaginationParams {
	limit?: number;
	offset?: number;
}

export type ParsedPaginationResult =
	| {
			success: true;
			params: PaginationParams;
	  }
	| {
			success: false;
			error: string;
	  };

/**
 * Parses and validates limit/offset query parameters
 * Returns parsed numbers or validation error
 */
export function parsePaginationParams(req: Request): ParsedPaginationResult {
	const { limit, offset } = req.query as { limit?: string; offset?: string };

	const params: PaginationParams = {};

	if (limit !== undefined) {
		const limitNum = parseInt(limit, 10);
		if (Number.isNaN(limitNum)) {
			return { success: false, error: 'Invalid limit parameter' };
		}
		params.limit = limitNum;
	}

	if (offset !== undefined) {
		const offsetNum = parseInt(offset, 10);
		if (Number.isNaN(offsetNum)) {
			return { success: false, error: 'Invalid offset parameter' };
		}
		params.offset = offsetNum;
	}

	return { success: true, params };
}

/**
 * Checks if pagination parameters were provided in the request
 */
export function hasPaginationParams(req: Request): boolean {
	const { limit, offset } = req.query;
	return limit !== undefined || offset !== undefined;
}

/**
 * Middleware-style helper that validates pagination and sends error response if invalid
 * Returns the parsed params if valid, or sends error response and returns null
 */
export function validatePaginationOrError(req: Request, res: Response): PaginationParams | null {
	const result = parsePaginationParams(req);

	if (!result.success) {
		res.status(400).json({ error: result.error });
		return null;
	}

	return result.params;
}
