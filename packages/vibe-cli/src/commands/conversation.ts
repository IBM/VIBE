import * as fs from 'fs';
import * as readline from 'readline';
import type { ConversationMessageDraft } from '@ibm-vibe/types';
import type { VibeClient } from '../lib/client';
import type { Output } from '../lib/output';
import { bold, dim } from '../lib/output';

export async function cmdConversation(
	sub: string | undefined,
	args: Record<string, unknown>,
	client: VibeClient,
	out: Output
): Promise<void> {
	switch (sub) {
		case 'list':
			return conversationList(args, client, out);
		case 'show':
			return conversationShow(args, client, out);
		case 'create':
			return conversationCreate(args, client, out);
		case 'delete':
			return conversationDelete(args, client, out);
		case 'add-message':
			return conversationAddMessage(args, client, out);
		case 'set-target':
			return conversationSetTarget(args, client, out);
		case 'record':
			return conversationRecord(args, client, out);
		default:
			out.error(`Unknown subcommand: vibe conversation ${sub ?? ''}`);
			out.line('Usage: vibe conversation <list|show|create|delete|add-message|set-target|record>');
			process.exit(1);
	}
}

async function conversationList(args: Record<string, unknown>, client: VibeClient, out: Output): Promise<void> {
	const conversations = await client.listConversations();
	out.json(conversations);
	if (conversations.length === 0) {
		out.line('No conversations found.');
		return;
	}
	out.line();
	out.table([
		[bold('ID'), bold('Name'), bold('Tags')],
		...conversations.map((c) => [String(c.id), c.name, c.tags ?? ''])
	]);
	out.line();
}

async function conversationShow(args: Record<string, unknown>, client: VibeClient, out: Output): Promise<void> {
	const id = requireId(args);
	const [conv, targets] = await Promise.all([client.getConversation(id), client.listTurnTargets(id)]);
	out.json({ conversation: conv, targets });
	out.line();
	out.line(`${bold(conv.name)}  (id=${conv.id})`);
	if (conv.description) out.line(`  ${dim(conv.description)}`);
	out.line();
	const messages = conv.messages ?? [];
	for (const msg of messages.sort(
		(a: ConversationMessageDraft, b: ConversationMessageDraft) => a.sequence - b.sequence
	)) {
		const target = targets.find((t) => t.user_sequence === msg.sequence);
		out.line(`  [${msg.role}] seq=${msg.sequence}`);
		out.line(`    ${msg.content.slice(0, 200)}${msg.content.length > 200 ? '…' : ''}`);
		if (target) {
			out.line(`    → target (threshold=${target.threshold ?? '—'}): ${target.target_reply.slice(0, 120)}`);
		}
		out.line();
	}
}

async function conversationCreate(args: Record<string, unknown>, client: VibeClient, out: Output): Promise<void> {
	const name = requireArg(args, 'name', 'vibe conversation create --name <name>');
	const description = args['description'] as string | undefined;
	const tags = args['tags'] as string | undefined;
	const stopOnFailure = args['stop-on-failure'] === true;

	// Optionally accept messages from a JSON file: --messages turns.json
	// Format: [{ role, content, sequence? }, ...]
	let messages: Array<{ role: 'user' | 'system'; content: string; sequence: number }> | undefined;
	const messagesFile = args['messages'] as string | undefined;
	if (messagesFile) {
		const raw = fs.readFileSync(messagesFile, 'utf8');
		const parsed = JSON.parse(raw) as Array<{ role: 'user' | 'system'; content: string; sequence?: number }>;
		messages = parsed.map((m, i) => ({ ...m, sequence: m.sequence ?? i + 1 }));
	}

	const conv = await client.createConversation({
		name,
		description,
		tags,
		stop_on_failure: stopOnFailure,
		messages
	});

	out.ok(`Conversation created: id=${conv.id}  name="${conv.name}"`);
	out.json(conv);
}

async function conversationDelete(args: Record<string, unknown>, client: VibeClient, out: Output): Promise<void> {
	const id = requireId(args);
	await client.deleteConversation(id);
	out.ok(`Conversation ${id} deleted.`);
	out.json({ deleted: true, id });
}

async function conversationAddMessage(args: Record<string, unknown>, client: VibeClient, out: Output): Promise<void> {
	const convId = requireNamedId(
		args,
		'conversation',
		'vibe conversation add-message --conversation <id> --role <user|system> --content <text>'
	);
	const role = requireArg(
		args,
		'role',
		'vibe conversation add-message --conversation <id> --role <user|system> --content <text>'
	) as 'user' | 'system';
	const content = requireArg(
		args,
		'content',
		'vibe conversation add-message --conversation <id> --role <user|system> --content <text>'
	);
	const sequence = args['sequence'] !== undefined ? parseInt(String(args['sequence']), 10) : undefined;

	const msg = await client.addMessage(convId, { role, content, sequence: sequence ?? 1 });
	out.ok(`Message added: seq=${msg.sequence}  role=${msg.role}`);
	out.json(msg);
}

async function conversationSetTarget(args: Record<string, unknown>, client: VibeClient, out: Output): Promise<void> {
	const convId = requireNamedId(
		args,
		'conversation',
		'vibe conversation set-target --conversation <id> --target <text>'
	);
	const targetReply = requireArg(args, 'target', 'vibe conversation set-target --conversation <id> --target <text>');
	const sequence = args['sequence'] !== undefined ? parseInt(String(args['sequence']), 10) : 1;
	const threshold = args['threshold'] !== undefined ? parseInt(String(args['threshold']), 10) : undefined;
	const weight = args['weight'] !== undefined ? parseFloat(String(args['weight'])) : undefined;

	const result = await client.upsertTurnTarget({
		conversation_id: convId,
		user_sequence: sequence,
		target_reply: targetReply,
		threshold,
		weight
	});

	out.ok(`Turn target set: conversation=${convId} seq=${sequence} threshold=${result.threshold ?? '—'}`);
	out.json(result);
}

/**
 * Interactive recorder: chat with an external agent, then save the transcript
 * as a VIBE conversation with per-turn targets.
 */
async function conversationRecord(args: Record<string, unknown>, client: VibeClient, out: Output): Promise<void> {
	const agentUrl = (args['agent-url'] as string | undefined) ?? process.env['VIBE_AGENT_URL'];
	if (!agentUrl) {
		out.error('--agent-url <url> or VIBE_AGENT_URL is required for record mode.');
		process.exit(1);
	}
	const suiteId = args['suite'] ? parseInt(String(args['suite']), 10) : undefined;
	const defaultThreshold = args['threshold'] ? parseInt(String(args['threshold']), 10) : 65;
	const noSave = args['no-save'] === true;

	const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

	const prompt = (q: string): Promise<string> => new Promise((resolve) => rl.question(q, resolve));

	out.line('\n┌─────────────────────────────────────────────────────────┐');
	out.line('│  VIBE record — live conversation recorder               │');
	out.line('│    /done   stop and save   /drop  discard last turn     │');
	out.line('│    /abort  exit without saving                          │');
	out.line('└─────────────────────────────────────────────────────────┘\n');

	const turns: Array<{ role: 'user' | 'assistant'; content: string; seq: number }> = [];
	let userSeq = 0;

	while (true) {
		let input: string;
		try {
			input = (await prompt('You: ')).trim();
		} catch {
			break;
		}
		if (!input) continue;
		if (input === '/abort') {
			out.line('\nAborted.');
			rl.close();
			return;
		}
		if (input === '/drop') {
			if (turns.length < 2) {
				out.line('(nothing to drop)');
				continue;
			}
			turns.pop();
			turns.pop();
			userSeq--;
			out.line('(last turn dropped)');
			continue;
		}
		if (input === '/done') break;

		userSeq++;
		turns.push({ role: 'user', content: input, seq: userSeq });
		process.stdout.write('Agent: ');

		let reply: string;
		try {
			const res = await fetch(agentUrl, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ message: input, config: null })
			});
			if (!res.ok) throw new Error(`Agent returned ${res.status}`);
			const data = (await res.json()) as { message?: string; output?: string };
			reply = data.message ?? data.output ?? JSON.stringify(data);
		} catch (err) {
			out.line(`\n(agent error: ${(err as Error).message})`);
			turns.pop();
			userSeq--;
			continue;
		}

		out.line(reply + '\n');
		turns.push({ role: 'assistant', content: reply, seq: userSeq });
	}

	rl.close();

	const userTurns = turns.filter((t) => t.role === 'user');
	if (userTurns.length === 0) {
		out.line('No turns recorded.');
		return;
	}
	if (noSave) {
		out.line('(--no-save: skipping)');
		return;
	}

	// Collect name + per-turn targets
	const rl2 = readline.createInterface({ input: process.stdin, output: process.stdout });
	const p = (q: string): Promise<string> => new Promise((resolve) => rl2.question(q, resolve));

	const name = (await p('Conversation name: ')).trim() || `Recorded ${new Date().toISOString().slice(0, 16)}`;

	const targets: Array<{ user_sequence: number; target_reply: string; threshold: number }> = [];
	for (let i = 0; i < turns.length; i++) {
		const t = turns[i];
		if (t.role !== 'user') continue;
		const assistantReply = turns[i + 1]?.content ?? '';
		out.line(`\nTurn ${t.seq}: "${t.content.slice(0, 80)}"`);
		out.line(`  Agent: "${assistantReply.slice(0, 100)}${assistantReply.length > 100 ? '…' : ''}"`);
		const useReply = (await p('  Use agent reply as target? [Y/n] ')).trim().toLowerCase();
		const targetReply = useReply === 'n' ? (await p('  Target reply: ')).trim() || assistantReply : assistantReply;
		const tRaw = (await p(`  Threshold [${defaultThreshold}]: `)).trim();
		targets.push({
			user_sequence: t.seq,
			target_reply: targetReply,
			threshold: tRaw ? parseInt(tRaw, 10) : defaultThreshold
		});
	}
	rl2.close();

	out.line('\nSaving…');
	const conv = await client.createConversation({ name, stop_on_failure: false });
	for (const t of userTurns) {
		await client.addMessage(conv.id!, { role: 'user', content: t.content, sequence: t.seq });
	}
	for (const tgt of targets) {
		await client.upsertTurnTarget({ conversation_id: conv.id!, ...tgt, weight: 1.0 });
	}

	if (suiteId !== undefined) {
		await client.addSuiteEntry(suiteId, { conversation_id: conv.id! });
		out.ok(`Saved as conversation ${conv.id} and added to suite ${suiteId}`);
	} else {
		out.ok(`Saved as conversation ${conv.id}`);
	}

	out.json(conv);
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function requireId(args: Record<string, unknown>): number {
	const raw = (args._as_array as string[])?.[2] ?? args['id'];
	const id = parseInt(String(raw), 10);
	if (isNaN(id)) {
		process.stderr.write('Error: conversation ID is required.\n');
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
