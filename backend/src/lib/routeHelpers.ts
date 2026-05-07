import type { Response } from 'express';

export const parseIdParam = (res: Response, rawValue: string, errorMessage: string): number | null => {
	const id = Number(rawValue);
	if (Number.isNaN(id)) {
		res.status(400).json({ error: errorMessage });
		return null;
	}
	return id;
};
