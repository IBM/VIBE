import { api } from '../api';
import { ExportableDataType, ExportBundle } from '@ibm-vibe/types';

describe('data transfer API', () => {
	const originalFetch = global.fetch;

	afterEach(() => {
		if (originalFetch) {
			global.fetch = originalFetch;
		}
		jest.resetAllMocks();
	});

	it('exportData requests selected types and returns bundle payload', async () => {
		const bundle = {
			version: 1,
			exported_at: '2026-03-03T12:00:00.000Z',
			data: {}
		} as ExportBundle;
		global.fetch = jest.fn().mockResolvedValue({
			ok: true,
			json: async () => bundle
		} as Response);

		await expect(api.exportData([ExportableDataType.AGENTS, ExportableDataType.CONVERSATIONS])).resolves.toEqual(
			bundle
		);
		expect(global.fetch).toHaveBeenCalledWith(
			'http://localhost:5000/api/data-transfer/export?types=agents,conversations'
		);
	});

	it('exportData throws backend error when request fails', async () => {
		global.fetch = jest.fn().mockResolvedValue({
			ok: false,
			status: 400,
			json: async () => ({ error: 'Invalid export types: bad' })
		} as Response);

		await expect(api.exportData([ExportableDataType.AGENTS])).rejects.toThrow('Invalid export types: bad');
	});

	it('analyzeImport posts bundle and returns report', async () => {
		const report = {
			items: [],
			totals: { new: 0, conflict: 0, dependency_missing: 0 },
			has_issues: false
		};
		const bundle: ExportBundle = {
			version: 1,
			exported_at: '2026-03-03T12:00:00.000Z',
			data: {}
		};

		global.fetch = jest.fn().mockResolvedValue({
			ok: true,
			json: async () => report
		} as Response);

		await expect(api.analyzeImport(bundle)).resolves.toEqual(report);
		expect(global.fetch).toHaveBeenCalledWith(
			'http://localhost:5000/api/data-transfer/analyze',
			expect.objectContaining({
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ bundle })
			})
		);
	});

	it('analyzeImport includes optional resolutions when provided', async () => {
		const bundle: ExportBundle = {
			version: 1,
			exported_at: '2026-03-03T12:00:00.000Z',
			data: {}
		};
		const resolutions = {
			'agents:Bot@1.0.0': {
				item_key: 'agents:Bot@1.0.0',
				decision: 'skip' as const
			}
		};
		global.fetch = jest.fn().mockResolvedValue({
			ok: true,
			json: async () => ({ items: [], totals: { new: 0, conflict: 0, dependency_missing: 0 }, has_issues: false })
		} as Response);

		await api.analyzeImport(bundle, resolutions);
		expect(global.fetch).toHaveBeenCalledWith(
			'http://localhost:5000/api/data-transfer/analyze',
			expect.objectContaining({
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ bundle, resolutions })
			})
		);
	});

	it('executeImport posts import request and returns summary', async () => {
		const request = {
			bundle: {
				version: 1,
				exported_at: '2026-03-03T12:00:00.000Z',
				data: {}
			},
			resolutions: {}
		};
		const summary = {
			created: 1,
			updated: 0,
			skipped: 0,
			items: []
		};

		global.fetch = jest.fn().mockResolvedValue({
			ok: true,
			json: async () => summary
		} as Response);

		await expect(api.executeImport(request as any)).resolves.toEqual(summary);
		expect(global.fetch).toHaveBeenCalledWith(
			'http://localhost:5000/api/data-transfer/import',
			expect.objectContaining({
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(request)
			})
		);
	});

	it('executeImport throws backend error on failure', async () => {
		global.fetch = jest.fn().mockResolvedValue({
			ok: false,
			status: 400,
			json: async () => ({ error: 'Invalid import payload' })
		} as Response);

		await expect(
			api.executeImport({
				bundle: {
					version: 1,
					exported_at: '2026-03-03T12:00:00.000Z',
					data: {}
				},
				resolutions: {}
			} as any)
		).rejects.toThrow('Invalid import payload');
	});
});
