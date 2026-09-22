import type { VibeClient } from './client';
import type { Output } from './output';

const POLL_INTERVAL_MS = 3000;
const POLL_TIMEOUT_MS = 180_000;

async function sleep(ms: number): Promise<void> {
	return new Promise((r) => setTimeout(r, ms));
}

/**
 * Poll a single conversation job until it completes or times out.
 * Returns the final job object.
 */
export async function pollJob(
	client: VibeClient,
	jobId: string,
	out: Output
): Promise<{ status: string; session_id?: number; error?: string }> {
	const start = Date.now();
	while (Date.now() - start < POLL_TIMEOUT_MS) {
		await sleep(POLL_INTERVAL_MS);
		const job = await client.getJob(jobId);
		const elapsed = ((Date.now() - start) / 1000).toFixed(1);
		if (!out.jsonMode) {
			process.stdout.write(`\r  status=${job.status} progress=${job.progress ?? 0}% ${elapsed}s…`);
		}
		if (job.status === 'completed' || job.status === 'failed' || job.status === 'timeout') {
			if (!out.jsonMode) process.stdout.write('\n');
			return job as { status: string; session_id?: number; error?: string };
		}
	}
	if (!out.jsonMode) process.stdout.write('\n');
	throw new Error('Job timed out');
}

/**
 * Poll a suite run until it completes or times out.
 * Returns the final suite run object.
 */
export async function pollSuiteRun(
	client: VibeClient,
	suiteRunId: number,
	out: Output
): Promise<{
	status: string;
	completed_tests: number;
	total_tests: number;
	successful_tests: number;
	failed_tests: number;
	avg_similarity_score?: number;
	total_input_tokens?: number;
	total_output_tokens?: number;
}> {
	const start = Date.now();
	while (Date.now() - start < POLL_TIMEOUT_MS) {
		await sleep(POLL_INTERVAL_MS);
		const run = await client.getSuiteRun(suiteRunId);
		const elapsed = ((Date.now() - start) / 1000).toFixed(1);
		if (!out.jsonMode) {
			process.stdout.write(`\r  ${run.status} ${run.completed_tests}/${run.total_tests} ${elapsed}s…`);
		}
		if (run.status === 'completed' || run.status === 'failed') {
			if (!out.jsonMode) process.stdout.write('\n');
			return run as typeof run & { status: string };
		}
	}
	if (!out.jsonMode) process.stdout.write('\n');
	throw new Error('Suite run timed out');
}
