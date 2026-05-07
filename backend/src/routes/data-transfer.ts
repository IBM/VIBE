import { Router } from 'express';
import type { Request, Response } from 'express';
import { ExportableDataType } from '@ibm-vibe/types';
import {
	isSupportedExportBundleVersion,
	parseAnalyzeImportRequest,
	parseExecuteImportRequest
} from '@ibm-vibe/types/data-transfer';
import { asyncHandler } from '../lib/asyncHandler';
import { logError } from '../lib/logger';
import { buildExportBundle } from '../services/data-transfer/export';
import { executeImportBundle, ImportValidationError } from '../services/data-transfer/execute';
import { buildImportPlan } from '../services/data-transfer/import-plan';
import { validateBundleSemantics } from '../services/data-transfer/validate';

const router = Router();

const exportTypeValues = Object.values(ExportableDataType);

const parseExportTypes = (typesQuery: unknown): { types?: ExportableDataType[]; invalid?: string[] } => {
	if (typeof typesQuery !== 'string' || !typesQuery.trim()) {
		return {};
	}

	const parsed = typesQuery
		.split(',')
		.map((value) => value.trim())
		.filter((value) => value.length > 0);

	const invalid = parsed.filter((value) => !exportTypeValues.includes(value as ExportableDataType));
	if (invalid.length > 0) {
		return { invalid };
	}

	return { types: parsed as ExportableDataType[] };
};

const isImportValidationError = (error: unknown): error is ImportValidationError =>
	error instanceof ImportValidationError || (error instanceof Error && error.name === 'ImportValidationError');

router.get(
	'/export',
	asyncHandler(async (req: Request, res: Response) => {
		try {
			const parsed = parseExportTypes(req.query.types);
			if (parsed.invalid && parsed.invalid.length > 0) {
				return res.status(400).json({ error: `Invalid export types: ${parsed.invalid.join(', ')}` });
			}
			if (!parsed.types || parsed.types.length === 0) {
				return res.status(400).json({ error: 'At least one export type must be provided' });
			}

			const instanceName = process.env.NEXT_PUBLIC_INSTANCE_NAME || process.env.INSTANCE_NAME || 'backend';
			const bundle = buildExportBundle(parsed.types, instanceName);
			return res.json(bundle);
		} catch (error) {
			logError('Error exporting data:', error);
			return res.status(500).json({ error: 'Failed to export data' });
		}
	})
);

router.post(
	'/analyze',
	asyncHandler(async (req: Request, res: Response) => {
		try {
			const parsedRequest = parseAnalyzeImportRequest(req.body);
			if (!parsedRequest.success) {
				return res.status(400).json({ error: 'Invalid analyze payload' });
			}
			if (!isSupportedExportBundleVersion(parsedRequest.data.bundle)) {
				return res
					.status(400)
					.json({ error: `Unsupported bundle version: ${parsedRequest.data.bundle.version}` });
			}
			const bundleValidationError = validateBundleSemantics(parsedRequest.data.bundle);
			if (bundleValidationError) {
				return res.status(400).json({ error: bundleValidationError });
			}

			const plan = buildImportPlan({
				bundle: parsedRequest.data.bundle,
				resolutions: parsedRequest.data.resolutions || {}
			});
			return res.json(plan);
		} catch (error) {
			logError('Error analyzing import bundle:', error);
			return res.status(500).json({ error: 'Failed to analyze import bundle' });
		}
	})
);

router.post(
	'/import',
	asyncHandler(async (req: Request, res: Response) => {
		try {
			const parsedRequest = parseExecuteImportRequest(req.body);
			if (!parsedRequest.success) {
				return res.status(400).json({ error: 'Invalid import payload' });
			}
			if (!isSupportedExportBundleVersion(parsedRequest.data.bundle)) {
				return res
					.status(400)
					.json({ error: `Unsupported bundle version: ${parsedRequest.data.bundle.version}` });
			}
			const bundleValidationError = validateBundleSemantics(parsedRequest.data.bundle);
			if (bundleValidationError) {
				return res.status(400).json({ error: bundleValidationError });
			}

			const summary = executeImportBundle(parsedRequest.data);
			return res.json(summary);
		} catch (error) {
			if (isImportValidationError(error)) {
				return res.status(400).json({ error: error.message });
			}
			logError('Error executing import bundle:', error);
			return res.status(500).json({ error: 'Failed to execute import bundle' });
		}
	})
);

export default router;
