import * as fs from 'fs';
import type { VibeClient } from '../lib/client';
import type { Output } from '../lib/output';
import { bold, dim } from '../lib/output';

export async function cmdAgent(
	sub: string | undefined,
	args: Record<string, unknown>,
	client: VibeClient,
	out: Output
): Promise<void> {
	switch (sub) {
		case 'list':
			return agentList(client, out);
		case 'show':
			return agentShow(args, client, out);
		case 'create':
			return agentCreate(args, client, out);
		case 'delete':
			return agentDelete(args, client, out);
		default:
			out.error(`Unknown subcommand: vibe agent ${sub ?? ''}`);
			out.line('Usage: vibe agent <list|show|create|delete>');
			process.exit(1);
	}
}

async function agentList(client: VibeClient, out: Output): Promise<void> {
	const agents = await client.listAgents();
	out.json(agents);
	if (agents.length === 0) {
		out.line('No agents found.');
		return;
	}
	out.line();
	out.table([[bold('ID'), bold('Name'), bold('Version')], ...agents.map((a) => [String(a.id), a.name, a.version])]);
	out.line();
}

async function agentShow(args: Record<string, unknown>, client: VibeClient, out: Output): Promise<void> {
	const id = requireId(args, 'agent');
	const agent = await client.getAgent(id);
	out.json(agent);
	out.line();
	out.line(`${bold(agent.name)}  ${dim('v' + agent.version)}  (id=${agent.id})`);
	out.line();
	let settings: Record<string, unknown> = {};
	try {
		settings = JSON.parse(agent.settings);
	} catch {
		/* not valid JSON — show raw */
	}
	const type = (settings['type'] as string) ?? 'unknown';
	out.line(`  Type:     ${type}`);
	out.line(`  Created:  ${agent.created_at ?? '—'}`);
	out.line();
}

async function agentCreate(args: Record<string, unknown>, client: VibeClient, out: Output): Promise<void> {
	const name = requireArg(args, 'name', 'vibe agent create --name <name> --version <v> --settings <file>');
	const version = requireArg(args, 'version', 'vibe agent create --name <name> --version <v> --settings <file>');
	const settingsPath = args['settings'] as string | undefined;
	const prompt = (args['prompt'] as string | undefined) ?? '';

	let settings: string;
	if (settingsPath) {
		settings = fs.readFileSync(settingsPath, 'utf8').trim();
		// Validate JSON
		JSON.parse(settings);
	} else {
		settings = JSON.stringify({ type: 'external_api' });
	}

	const agent = await client.createAgent({ name, version, prompt, settings });
	out.ok(`Agent created: id=${agent.id}  name="${agent.name}"  version=${agent.version}`);
	out.json(agent);
}

async function agentDelete(args: Record<string, unknown>, client: VibeClient, out: Output): Promise<void> {
	const id = requireId(args, 'agent');
	await client.deleteAgent(id);
	out.ok(`Agent ${id} deleted.`);
	out.json({ deleted: true, id });
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function requireId(args: Record<string, unknown>, resource: string): number {
	const raw = (args._as_array as string[])?.[2] ?? args['id'];
	const id = parseInt(String(raw), 10);
	if (isNaN(id)) {
		process.stderr.write(`Error: ${resource} ID is required.\n`);
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
