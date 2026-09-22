import type { SuiteEntry } from '@ibm-vibe/types';
import type { VibeClient } from '../lib/client';
import type { Output } from '../lib/output';
import { bold, dim } from '../lib/output';

export async function cmdSuite(
	sub: string | undefined,
	args: Record<string, unknown>,
	client: VibeClient,
	out: Output
): Promise<void> {
	switch (sub) {
		case 'list':
			return suiteList(client, out);
		case 'show':
			return suiteShow(args, client, out);
		case 'create':
			return suiteCreate(args, client, out);
		case 'delete':
			return suiteDelete(args, client, out);
		case 'add-conversation':
			return suiteAddConversation(args, client, out);
		case 'remove-entry':
			return suiteRemoveEntry(args, client, out);
		case 'entries':
			return suiteEntries(args, client, out);
		default:
			out.error(`Unknown subcommand: vibe suite ${sub ?? ''}`);
			out.line('Usage: vibe suite <list|show|create|delete|add-conversation|remove-entry|entries>');
			process.exit(1);
	}
}

async function suiteList(client: VibeClient, out: Output): Promise<void> {
	const suites = await client.listSuites();
	out.json(suites);
	if (suites.length === 0) {
		out.line('No test suites found.');
		return;
	}
	out.line();
	out.table([
		[bold('ID'), bold('Name'), bold('Tests'), bold('Tags')],
		...suites.map((s) => [
			String(s.id),
			s.name,
			String((s as typeof s & { test_count?: number }).test_count ?? '—'),
			s.tags ?? ''
		])
	]);
	out.line();
}

async function suiteShow(args: Record<string, unknown>, client: VibeClient, out: Output): Promise<void> {
	const id = requireId(args);
	const [suite, entries] = await Promise.all([client.getSuite(id), client.listSuiteEntries(id)]);
	out.json({ suite, entries });
	out.line();
	out.line(`${bold(suite.name)}  (id=${suite.id})`);
	if (suite.description) out.line(`  ${dim(suite.description)}`);
	out.line(`  ${entries.length} entr${entries.length === 1 ? 'y' : 'ies'}`);
	out.line();
	if (entries.length > 0) {
		out.table([
			[bold('Entry ID'), bold('Seq'), bold('Conversation ID'), bold('Child suite ID')],
			...entries.map((e: SuiteEntry) => [
				String(e.id),
				String(e.sequence ?? ''),
				e.conversation_id != null ? String(e.conversation_id) : '—',
				e.child_suite_id != null ? String(e.child_suite_id) : '—'
			])
		]);
		out.line();
	}
}

async function suiteCreate(args: Record<string, unknown>, client: VibeClient, out: Output): Promise<void> {
	const name = requireArg(args, 'name', 'vibe suite create --name <name>');
	const description = args['description'] as string | undefined;
	const tags = args['tags'] as string | undefined;
	const suite = await client.createSuite({ name, description, tags });
	out.ok(`Suite created: id=${suite.id}  name="${suite.name}"`);
	out.json(suite);
}

async function suiteDelete(args: Record<string, unknown>, client: VibeClient, out: Output): Promise<void> {
	const id = requireId(args);
	await client.deleteSuite(id);
	out.ok(`Suite ${id} deleted.`);
	out.json({ deleted: true, id });
}

async function suiteAddConversation(args: Record<string, unknown>, client: VibeClient, out: Output): Promise<void> {
	const suiteId = requireNamedId(args, 'suite', 'vibe suite add-conversation --suite <id> --conversation <id>');
	const conversationId = requireNamedId(
		args,
		'conversation',
		'vibe suite add-conversation --suite <id> --conversation <id>'
	);
	const agentOverride = args['agent'] ? parseInt(String(args['agent']), 10) : undefined;

	const entry = await client.addSuiteEntry(suiteId, {
		conversation_id: conversationId,
		...(agentOverride !== undefined ? { agent_id_override: agentOverride } : {})
	});

	out.ok(`Conversation ${conversationId} added to suite ${suiteId} as entry ${entry.id}`);
	out.json(entry);
}

async function suiteRemoveEntry(args: Record<string, unknown>, client: VibeClient, out: Output): Promise<void> {
	const suiteId = requireNamedId(args, 'suite', 'vibe suite remove-entry --suite <id> --entry <id>');
	const entryId = requireNamedId(args, 'entry', 'vibe suite remove-entry --suite <id> --entry <id>');
	await client.deleteSuiteEntry(suiteId, entryId);
	out.ok(`Entry ${entryId} removed from suite ${suiteId}.`);
	out.json({ deleted: true, suite_id: suiteId, entry_id: entryId });
}

async function suiteEntries(args: Record<string, unknown>, client: VibeClient, out: Output): Promise<void> {
	const suiteId = requireId(args);
	const entries = await client.listSuiteEntries(suiteId);
	out.json(entries);
	if (entries.length === 0) {
		out.line(`Suite ${suiteId} has no entries.`);
		return;
	}
	out.table([
		[bold('Entry ID'), bold('Seq'), bold('Conversation ID'), bold('Child suite ID'), bold('Agent override')],
		...entries.map((e: SuiteEntry) => [
			String(e.id),
			String(e.sequence ?? ''),
			e.conversation_id != null ? String(e.conversation_id) : '—',
			e.child_suite_id != null ? String(e.child_suite_id) : '—',
			e.agent_id_override != null ? String(e.agent_id_override) : '—'
		])
	]);
	out.line();
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function requireId(args: Record<string, unknown>): number {
	const raw = (args._as_array as string[])?.[2] ?? args['id'];
	const id = parseInt(String(raw), 10);
	if (isNaN(id)) {
		process.stderr.write('Error: suite ID is required (pass as positional arg or --id <n>).\n');
		process.exit(1);
	}
	return id;
}

function requireNamedId(args: Record<string, unknown>, key: string, usage: string): number {
	const id = parseInt(String(args[key] ?? ''), 10);
	if (isNaN(id)) {
		process.stderr.write(`Error: --${key} <id> is required.\nUsage: ${usage}\n`);
		process.exit(1);
	}
	return id;
}

function requireArg(args: Record<string, unknown>, key: string, usage: string): string {
	const val = args[key];
	if (!val || typeof val !== 'string') {
		process.stderr.write(`Error: --${key} is required.\nUsage: ${usage}\n`);
		process.exit(1);
	}
	return val;
}
