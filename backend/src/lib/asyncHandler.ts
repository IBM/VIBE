import type { NextFunction, Request, RequestHandler, Response } from 'express';
import type { ParamsDictionary } from 'express-serve-static-core';
import type { ParsedQs } from 'qs';

type MaybePromise<T> = T | Promise<T>;

export function asyncHandler<
	P = ParamsDictionary,
	ResBody = unknown,
	ReqBody = unknown,
	ReqQuery = ParsedQs,
	Locals extends Record<string, unknown> = Record<string, unknown>
>(
	fn: (
		req: Request<P, ResBody, ReqBody, ReqQuery, Locals>,
		res: Response<ResBody, Locals>,
		next: NextFunction
	) => MaybePromise<unknown>
): RequestHandler<P, ResBody, ReqBody, ReqQuery, Locals> {
	return (req, res, next) =>
		Promise.resolve(fn(req, res, next)).catch((err: unknown) => {
			// If no `next` is provided (e.g. direct unit calls), rethrow so tests fail loudly.
			if (typeof next !== 'function') {
				throw err;
			}
			next(err);
		});
}
