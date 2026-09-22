import type { VibeClient } from '../lib/client';
import type { VibeProfile } from '../lib/config';
import type { Output } from '../lib/output';
import { bold, green, red } from '../lib/output';
import { pollJob, pollSuiteRun } from '../lib/poll';

export async function cmdRun(
	sub: string | undefined,
	args: Record<string, unknown>,
	client: VibeClient,
	profile: VibeProfile,
	out: Output
): Promise<void> {
	switch (sub) {
		case 'conversation':
			return runConversation(args, client, profile, out);
		case 'suite':
			return runSuite(args, client, profile, out);
		default:
			out.error(`Unknown subcommand: vibe run ${sub ?? ''}`);
			out.line('Usage: vibe run <conversation|suite> [--agent <id>] [--conversation|--suite <id>]');
			process.exit(1);
	}
}

async function runConversation(
	args: Record<string, unknown>,
	client: VibeClient,
	profile: VibeProfile,
	out: Output
): Promise<void> {
	const convId = resolveId(
		args,
		'conversation',
		profile.defaultSuite,
		'vibe run conversation --conversation <id> [--agent <id>]'
	);
	const agentId = resolveId(
		args,
		'agent',
		profile.defaultAgent,
		'vibe run conversation --conversation <id> --agent <id>'
	);

	out.line(`\nRunning conversation ${convId} with agent ${agentId}…`);

	const { job_id } = await client.executeConversation(agentId, convId);
	out.line(`  Job id: ${job_id}`);

	const job = await pollJob(client, job_id, out);

	if (job.status === 'completed' && job.session_id) {
		const transcript = await client.getSessionTranscript(job.session_id);
		const assistantMsg = transcript.messages.find((m) => m.role === 'assistant');
		const score = assistantMsg?.similarity_score;

		const result = {
			status: 'completed',
			job_id,
			session_id: job.session_id,
			similarity_score: score ?? null,
			agent_reply: assistantMsg?.content ?? null
		};

		out.json(result);
		out.line(`\n${green('✓')} Completed  session=${job.session_id}  score=${score ?? 'n/a'}`);
		if (assistantMsg) {
			out.line(
				`\nAgent reply:\n  ${assistantMsg.content.slice(0, 400)}${assistantMsg.content.length > 400 ? '…' : ''}`
			);
		}
		out.line();
	} else {
		const result = { status: job.status, job_id, error: job.error };
		out.json(result);
		out.line(`\n${red('✗')} ${job.status}: ${job.error ?? 'unknown error'}`);
		out.line();
		process.exit(1);
	}
}

async function runSuite(
	args: Record<string, unknown>,
	client: VibeClient,
	profile: VibeProfile,
	out: Output
): Promise<void> {
	const suiteId = resolveId(args, 'suite', profile.defaultSuite, 'vibe run suite --suite <id> [--agent <id>]');
	const agentId = resolveId(args, 'agent', profile.defaultAgent, 'vibe run suite --suite <id> --agent <id>');

	out.line(`\nRunning suite ${suiteId} with agent ${agentId}…`);

	const { suite_run_id } = await client.executeSuite(suiteId, agentId);
	out.line(`  Suite run id: ${suite_run_id}`);

	const run = await pollSuiteRun(client, suite_run_id, out);

	const result = {
		status: run.status,
		suite_run_id,
		total: run.total_tests,
		passed: run.successful_tests,
		failed: run.failed_tests,
		avg_score: run.avg_similarity_score ?? null,
		total_tokens: (run.total_input_tokens ?? 0) + (run.total_output_tokens ?? 0)
	};

	out.json(result);
	out.line(`\n${'═'.repeat(50)}`);
	out.line(`  ${bold('Status')}:     ${run.status}`);
	out.line(`  ${bold('Tests')}:      ${run.completed_tests}/${run.total_tests}`);
	out.line(`  ${green('Passed')}:     ${run.successful_tests}  ${red('Failed')}: ${run.failed_tests}`);
	out.line(
		`  ${bold('Avg score')}: ${run.avg_similarity_score != null ? run.avg_similarity_score.toFixed(1) : 'n/a'}`
	);
	out.line(`  ${bold('Tokens')}:     ${(run.total_input_tokens ?? 0) + (run.total_output_tokens ?? 0)}`);
	out.line(`${'═'.repeat(50)}\n`);

	if (run.failed_tests > 0) process.exit(1);
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function resolveId(
	args: Record<string, unknown>,
	key: string,
	defaultValue: number | undefined,
	usage: string
): number {
	const raw = args[key] ?? defaultValue;
	const id = parseInt(String(raw ?? ''), 10);
	if (isNaN(id)) {
		process.stderr.write(
			`Error: --${key} <id> is required (or set defaultAgent/defaultSuite in vibe.config.json).\nUsage: ${usage}\n`
		);
		process.exit(1);
	}
	return id;
}
