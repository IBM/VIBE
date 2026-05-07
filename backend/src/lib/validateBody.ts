import type { Request, Response } from 'express';
import { ZodError, type ZodSchema } from 'zod';

type ValidateBodyOptions = {
	status?: number;
	error: string;
	includeDetails?: boolean;
};

function formatZodError(error: ZodError): string {
	return error.issues
		.map((issue) => {
			const path = issue.path.join('.');
			return path ? `${path}: ${issue.message}` : issue.message;
		})
		.join('; ');
}

export function validateBody<T>(
	req: Request,
	res: Response,
	schema: ZodSchema<T>,
	options: ValidateBodyOptions
): T | null {
	const parsed = schema.safeParse(req.body);
	if (parsed.success) {
		return parsed.data;
	}

	const status = options.status ?? 400;
	const includeDetails = options.includeDetails ?? true;

	const payload: Record<string, unknown> = { error: options.error };
	if (includeDetails) {
		payload.details = formatZodError(parsed.error);
	}

	res.status(status).json(payload);
	return null;
}
