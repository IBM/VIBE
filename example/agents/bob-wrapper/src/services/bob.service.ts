import { spawn } from 'child_process';
import type { Response } from 'express';
import type {
	BobEvent,
	BobInitEvent,
	BobResultEvent,
	BobToolUseEvent,
	ChatResponse,
	UsageStats
} from '../types/bob.types';
import { persistSessionId } from './session.service';
import { worktreePath } from './worktree.service';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function buildArgs(sessionId: string | null, message: string, mode?: string): { args: string[]; stdin: string | null } {
	if (!sessionId) {
		// Turn 1: stdin delivery
		const args = ['--output-format', 'stream-json', '--yolo'];
		if (mode && mode !== 'ask') {
			args.push('--chat-mode', mode);
		}
		return { args, stdin: message };
	}

	// Turn 2+: resume via -p
	return {
		args: ['--resume', sessionId, '-p', message, '--output-format', 'stream-json', '--yolo'],
		stdin: null
	};
}

function parseEvent(line: string): BobEvent | null {
	const trimmed = line.trim();
	if (!trimmed) return null;
	try {
		return JSON.parse(trimmed) as BobEvent;
	} catch {
		return null;
	}
}

// ─── Core runner ─────────────────────────────────────────────────────────────

/**
 * Runs BOB CLI and waits for the full response.
 * Returns the extracted content and usage stats.
 */
export async function runBob(
	conversationId: string,
	sessionId: string | null,
	message: string,
	mode?: string
): Promise<ChatResponse> {
	const startMs = Date.now();
	const cwd = worktreePath(conversationId);
	const { args, stdin } = buildArgs(sessionId, message, mode);

	return new Promise<ChatResponse>((resolve, reject) => {
		const proc = spawn('bob', args, {
			cwd,
			env: process.env,
			stdio: ['pipe', 'pipe', 'pipe']
		});

		if (stdin !== null) {
			proc.stdin.write(stdin);
			proc.stdin.end();
		} else {
			proc.stdin.end();
		}

		let buffer = '';
		let content = '';
		let usageStats: UsageStats | null = null;

		proc.stdout.on('data', (chunk: Buffer) => {
			buffer += chunk.toString();
			const lines = buffer.split('\n');
			buffer = lines.pop() ?? '';

			for (const line of lines) {
				const event = parseEvent(line);
				if (!event) continue;

				switch (event.type) {
					case 'init': {
						const init = event as BobInitEvent;
						if (!sessionId) {
							// Fire-and-forget: persist session_id from turn 1
							persistSessionId(conversationId, init.session_id).catch((err: unknown) =>
								console.error('Failed to persist session_id', err)
							);
						}
						break;
					}

					case 'tool_use': {
						const toolUse = event as BobToolUseEvent;
						if (toolUse.tool_name === 'attempt_completion') {
							const params = toolUse.parameters as { result?: string };
							if (typeof params.result === 'string') {
								content = params.result;
							}
						}
						break;
					}

					case 'result': {
						const result = event as BobResultEvent;
						const durationMs = Date.now() - startMs;
						usageStats = {
							inputTokens: result.stats.input_tokens ?? 0,
							outputTokens: result.stats.output_tokens ?? 0,
							totalTokens: result.stats.total_tokens ?? 0,
							cost: result.stats.session_costs ?? 0,
							durationMs
						};
						break;
					}
				}
			}
		});

		const stderrChunks: Buffer[] = [];
		proc.stderr.on('data', (chunk: Buffer) => stderrChunks.push(chunk));

		proc.on('close', (code) => {
			// Process any remaining buffered output
			if (buffer.trim()) {
				const event = parseEvent(buffer);
				if (event?.type === 'result') {
					const result = event as BobResultEvent;
					usageStats = {
						inputTokens: result.stats.input_tokens ?? 0,
						outputTokens: result.stats.output_tokens ?? 0,
						totalTokens: result.stats.total_tokens ?? 0,
						cost: result.stats.session_costs ?? 0,
						durationMs: Date.now() - startMs
					};
				}
			}

			if (code !== 0 && !content) {
				const stderr = Buffer.concat(stderrChunks).toString();
				return reject(new Error(`BOB exited with code ${code ?? 'null'}. stderr: ${stderr}`));
			}

			resolve({
				conversationId,
				content,
				usage: usageStats ?? {
					inputTokens: 0,
					outputTokens: 0,
					totalTokens: 0,
					cost: 0,
					durationMs: Date.now() - startMs
				}
			});
		});

		proc.on('error', (err) => {
			reject(new Error(`Failed to spawn BOB: ${err.message}`));
		});
	});
}

/**
 * Runs BOB CLI and streams SSE events to the response.
 * Writes delta, done, and error events.
 */
export async function runBobStreaming(
	conversationId: string,
	sessionId: string | null,
	message: string,
	res: Response,
	mode?: string
): Promise<void> {
	const startMs = Date.now();
	const cwd = worktreePath(conversationId);
	const { args, stdin } = buildArgs(sessionId, message, mode);

	const proc = spawn('bob', args, {
		cwd,
		env: process.env,
		stdio: ['pipe', 'pipe', 'pipe']
	});

	if (stdin !== null) {
		proc.stdin.write(stdin);
		proc.stdin.end();
	} else {
		proc.stdin.end();
	}

	let buffer = '';
	let content = '';
	let usageStats: UsageStats | null = null;

	const sendSse = (event: string, data: unknown): void => {
		res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
	};

	proc.stdout.on('data', (chunk: Buffer) => {
		buffer += chunk.toString();
		const lines = buffer.split('\n');
		buffer = lines.pop() ?? '';

		for (const line of lines) {
			const event = parseEvent(line);
			if (!event) continue;

			switch (event.type) {
				case 'init': {
					const init = event as BobInitEvent;
					if (!sessionId) {
						persistSessionId(conversationId, init.session_id).catch((err: unknown) =>
							console.error('Failed to persist session_id', err)
						);
					}
					break;
				}

				case 'message': {
					if (event.delta) {
						sendSse('delta', { content: event.content });
					}
					break;
				}

				case 'tool_use': {
					const toolUse = event as BobToolUseEvent;
					if (toolUse.tool_name === 'attempt_completion') {
						const params = toolUse.parameters as { result?: string };
						if (typeof params.result === 'string') {
							content = params.result;
						}
					}
					break;
				}

				case 'result': {
					const result = event as BobResultEvent;
					usageStats = {
						inputTokens: result.stats.input_tokens ?? 0,
						outputTokens: result.stats.output_tokens ?? 0,
						totalTokens: result.stats.total_tokens ?? 0,
						cost: result.stats.session_costs ?? 0,
						durationMs: Date.now() - startMs
					};
					break;
				}
			}
		}
	});

	await new Promise<void>((resolve) => {
		proc.on('close', () => {
			const donePayload = {
				conversationId,
				content,
				usage: usageStats ?? {
					inputTokens: 0,
					outputTokens: 0,
					totalTokens: 0,
					cost: 0,
					durationMs: Date.now() - startMs
				}
			};
			sendSse('done', donePayload);
			resolve();
		});

		proc.on('error', (err) => {
			sendSse('error', { message: `Failed to spawn BOB: ${err.message}` });
			resolve();
		});
	});
}
