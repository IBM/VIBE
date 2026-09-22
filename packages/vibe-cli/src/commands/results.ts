import type { VibeClient } from '../lib/client';
import type { Output } from '../lib/output';
import { bold, green, red } from '../lib/output';

export async function cmdResults(
	sub: string | undefined,
	args: Record<string, unknown>,
	client: VibeClient,
	out: Output
): Promise<void> {
	switch (sub) {
		case 'session':
			return resultsSession(args, client, out);
		case 'conversation':
			return resultsConversation(args, client, out);
		case 'suite-run':
			return resultsSuiteRun(args, client, out);
		case 'runs':
			return resultsSuiteRuns(args, client, out);
		default:
			out.error(`Unknown subcommand: vibe results ${sub ?? ''}`);
			out.line('Usage: vibe results <session|conversation|suite-run|runs>');
			process.exit(1);
	}
}

async function resultsSession(args: Record<string, unknown>, client: VibeClient, out: Output): Promise<void> {
	const id = requireId(args, 'session');
	const { session, messages } = await client.getSessionTranscript(id);

	out.json({ session, messages });
	out.line();
	out.line(`Session ${bold(String(session.id))}  status=${session.status}  success=${session.success}`);
	out.line(`  started: ${session.started_at ?? '—'}  completed: ${session.completed_at ?? '—'}`);
	out.line();

	for (const msg of messages.sort((a, b) => a.sequence - b.sequence)) {
		const score = msg.similarity_score != null ? `  [score=${msg.similarity_score}]` : '';
		const scoreColoured =
			msg.similarity_score != null
				? msg.similarity_score >= (msg.metadata ? 65 : 65)
					? green(score)
					: red(score)
				: '';
		out.line(`  [${msg.role}]${scoreColoured}`);
		const preview = (msg.content ?? '').slice(0, 300);
		out.line(`    ${preview}${msg.content.length > 300 ? '…' : ''}`);
		out.line();
	}
}

async function resultsConversation(args: Record<string, unknown>, client: VibeClient, out: Output): Promise<void> {
	const id = requireId(args, 'conversation');
	const sessions = await client.listSessions({ conversation_id: id });

	if (sessions.length === 0) {
		out.line(`No sessions found for conversation ${id}.`);
		out.json([]);
		return;
	}

	// Latest session first
	const latest = sessions.sort((a, b) => (b.id ?? 0) - (a.id ?? 0))[0];
	out.line(`Latest session for conversation ${id}: session ${latest.id}`);
	out.line();

	// Delegate to resultsSession with the found id
	await resultsSession({ ...args, id: latest.id }, client, out);
}

async function resultsSuiteRun(args: Record<string, unknown>, client: VibeClient, out: Output): Promise<void> {
	const id = requireId(args, 'suite-run');
	const run = await client.getSuiteRun(id);

	out.json(run);
	out.line();
	out.line(`Suite run ${bold(String(run.id))}  suite=${run.suite_id}  agent=${run.agent_id}`);
	out.line(`  Status:     ${run.status}`);
	out.line(`  Tests:      ${run.completed_tests}/${run.total_tests}`);
	out.line(`  ${green('Passed')}: ${run.successful_tests}  ${red('Failed')}: ${run.failed_tests}`);
	out.line(`  Avg score:  ${run.avg_similarity_score != null ? run.avg_similarity_score.toFixed(1) : 'n/a'}`);
	out.line(`  Tokens:     ${(run.total_input_tokens ?? 0) + (run.total_output_tokens ?? 0)}`);
	out.line(`  Started:    ${run.started_at ?? '—'}`);
	out.line(`  Completed:  ${run.completed_at ?? '—'}`);
	out.line();
}

async function resultsSuiteRuns(args: Record<string, unknown>, client: VibeClient, out: Output): Promise<void> {
	const suiteId = args['suite'] ? parseInt(String(args['suite']), 10) : undefined;
	const limit = args['limit'] ? parseInt(String(args['limit']), 10) : 10;

	const { data: runs } = await client.listSuiteRuns({ suite_id: suiteId, limit });
	out.json(runs);

	if (runs.length === 0) {
		out.line('No suite runs found.');
		return;
	}

	out.line();
	out.table([
		[
			bold('Run ID'),
			bold('Suite'),
			bold('Agent'),
			bold('Status'),
			bold('Pass'),
			bold('Fail'),
			bold('Score'),
			bold('Started')
		],
		...runs
			.sort((a, b) => (b.id ?? 0) - (a.id ?? 0))
			.map((r) => [
				String(r.id),
				String(r.suite_id),
				String(r.agent_id),
				r.status,
				String(r.successful_tests ?? '?'),
				String(r.failed_tests ?? '?'),
				r.avg_similarity_score != null ? r.avg_similarity_score.toFixed(1) : '—',
				r.started_at ? r.started_at.slice(0, 16) : '—'
			])
	]);
	out.line();
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function requireId(args: Record<string, unknown>, label: string): number {
	const raw = (args._as_array as string[])?.[2] ?? args['id'];
	const id = parseInt(String(raw ?? ''), 10);
	if (isNaN(id)) {
		process.stderr.write(`Error: ${label} ID is required.\n`);
		process.exit(1);
	}
	return id;
}
