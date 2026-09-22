/**
 * Runs the compiled vibe CLI as a child process and returns its output.
 * Always passes --json so output is machine-parseable.
 */
import { spawnSync } from 'child_process';
import * as path from 'path';

const CLI_BIN = path.resolve(__dirname, '../../../dist/index.js');

export interface CliResult {
	stdout: string;
	stderr: string;
	exitCode: number;
	/** Parsed JSON output, or null if stdout wasn't valid JSON */
	json: unknown;
}

export function vibe(
	args: string[],
	opts: { backend: string; env?: Record<string, string> } = { backend: '' }
): CliResult {
	const result = spawnSync('node', [CLI_BIN, ...args, '--json'], {
		encoding: 'utf8',
		env: {
			...process.env,
			VIBE_BACKEND: opts.backend,
			// Disable colour codes and TTY detection in tests
			FORCE_COLOR: '0',
			NO_COLOR: '1',
			...opts.env
		},
		timeout: 15000
	});

	const stdout = result.stdout ?? '';
	const stderr = result.stderr ?? '';
	const exitCode = result.status ?? 1;

	let json: unknown = null;
	try {
		json = JSON.parse(stdout.trim());
	} catch {
		// not JSON — that's fine for some commands
	}

	return { stdout, stderr, exitCode, json };
}

/** Assert exit 0, parse JSON, return it */
export function vibeOk(args: string[], opts: { backend: string }): unknown {
	const r = vibe(args, opts);
	if (r.exitCode !== 0) {
		throw new Error(
			`CLI exited ${r.exitCode} for: vibe ${args.join(' ')}\nstdout: ${r.stdout}\nstderr: ${r.stderr}`
		);
	}
	return r.json;
}
