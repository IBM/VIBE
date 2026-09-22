/** Minimal ANSI helpers — only used when stdout is a TTY */
const isTTY = process.stdout.isTTY === true;

const dim = (s: string) => (isTTY ? `\x1b[2m${s}\x1b[0m` : s);
const bold = (s: string) => (isTTY ? `\x1b[1m${s}\x1b[0m` : s);
const green = (s: string) => (isTTY ? `\x1b[32m${s}\x1b[0m` : s);
const red = (s: string) => (isTTY ? `\x1b[31m${s}\x1b[0m` : s);
const yellow = (s: string) => (isTTY ? `\x1b[33m${s}\x1b[0m` : s);

export { dim, bold, green, red, yellow };

/**
 * Output a value — either pretty-printed human text or raw JSON.
 * Commands call `out.json(data)` and `out.line(text)`.
 * In --json mode only JSON output is written; human lines are suppressed.
 */
export class Output {
	constructor(public readonly jsonMode: boolean) {}

	/** Emit a structured JSON result. In human mode, ignored — commands use line() instead. */
	json(data: unknown): void {
		if (this.jsonMode) {
			process.stdout.write(JSON.stringify(data, null, 2) + '\n');
		}
	}

	/** Emit a human-readable line. Suppressed in --json mode. */
	line(text = ''): void {
		if (!this.jsonMode) {
			process.stdout.write(text + '\n');
		}
	}

	/** Emit an error message to stderr (always, regardless of mode). */
	error(text: string): void {
		process.stderr.write(red('Error: ') + text + '\n');
	}

	/** Emit a warning to stderr (always). */
	warn(text: string): void {
		process.stderr.write(yellow('Warning: ') + text + '\n');
	}

	/** Success marker — human only. */
	ok(text: string): void {
		this.line(green('✓ ') + text);
	}

	/** Table output — human only. */
	table(rows: string[][]): void {
		if (this.jsonMode) return;
		if (rows.length === 0) return;
		const widths = rows[0].map((_, ci) => Math.max(...rows.map((r) => (r[ci] ?? '').length)));
		for (const row of rows) {
			const line = row.map((cell, ci) => cell.padEnd(widths[ci])).join('  ');
			process.stdout.write(line.trimEnd() + '\n');
		}
	}
}

export function makeOutput(args: Record<string, unknown>): Output {
	return new Output(args['json'] === true);
}
