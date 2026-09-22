import * as fs from 'fs';
import type { VibeClient } from '../lib/client';
import type { Output } from '../lib/output';
import type { ExportBundle, ImportResolution } from '@ibm-vibe/types';

const VALID_EXPORT_TYPES = ['conversations', 'test_suites', 'agents', 'templates', 'response_maps', 'llm_configs'];

export async function cmdTransfer(
	sub: string | undefined,
	args: Record<string, unknown>,
	client: VibeClient,
	out: Output
): Promise<void> {
	switch (sub) {
		case 'export':
			return transferExport(args, client, out);
		case 'import':
			return transferImport(args, client, out);
		default:
			out.error(`Unknown subcommand: vibe transfer ${sub ?? ''}`);
			out.line('Usage: vibe transfer <export|import>');
			out.line(`  export --types <${VALID_EXPORT_TYPES.join('|')},...> [--out bundle.json]`);
			out.line('  import --file bundle.json [--dry-run]');
			process.exit(1);
	}
}

async function transferExport(args: Record<string, unknown>, client: VibeClient, out: Output): Promise<void> {
	const typesRaw = args['types'] as string | undefined;
	if (!typesRaw) {
		out.error(`--types is required. Valid: ${VALID_EXPORT_TYPES.join(', ')}`);
		process.exit(1);
	}

	const types = typesRaw.split(',').map((t) => t.trim());
	const invalid = types.filter((t) => !VALID_EXPORT_TYPES.includes(t));
	if (invalid.length > 0) {
		out.error(`Invalid export types: ${invalid.join(', ')}`);
		process.exit(1);
	}

	const bundle = await client.exportData(types);
	const outFile = args['out'] as string | undefined;

	if (outFile) {
		fs.writeFileSync(outFile, JSON.stringify(bundle, null, 2) + '\n', 'utf8');
		out.ok(`Exported to ${outFile}`);
		out.json({ exported_to: outFile, version: bundle.version });
	} else {
		// In --json mode this goes to stdout cleanly; in human mode we also print it
		out.json(bundle);
		if (!out.jsonMode) {
			process.stdout.write(JSON.stringify(bundle, null, 2) + '\n');
		}
	}
}

async function transferImport(args: Record<string, unknown>, client: VibeClient, out: Output): Promise<void> {
	const file = args['file'] as string | undefined;
	if (!file) {
		out.error('--file <bundle.json> is required.');
		process.exit(1);
	}

	const bundle: ExportBundle = JSON.parse(fs.readFileSync(file, 'utf8'));
	const dryRun = args['dry-run'] === true;

	// Analyse first
	const analysis = await client.analyzeImport(bundle);

	out.line();
	out.line(`Import analysis:`);
	out.line(`  New:       ${analysis.totals.new}`);
	out.line(`  Conflicts: ${analysis.totals.conflict}`);
	out.line(`  Missing deps: ${analysis.totals.dependency_missing}`);
	out.line();

	if (dryRun) {
		out.json(analysis);
		out.line('Dry run — nothing imported.');
		return;
	}

	// Default resolution: overwrite conflicts
	const resolutions: Record<string, ImportResolution> = {};
	for (const item of analysis.items) {
		resolutions[item.item_key] = {
			item_key: item.item_key,
			decision: item.status === 'conflict' ? 'overwrite' : 'create_new'
		};
	}

	const result = await client.executeImport({ bundle, resolutions });

	out.json(result);
	out.line(`Import complete:`);
	out.line(`  Created: ${result.created}`);
	out.line(`  Updated: ${result.updated}`);
	out.line(`  Skipped: ${result.skipped}`);
	out.line();
}
