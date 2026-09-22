import * as fs from 'fs';
import * as path from 'path';
import * as readline from 'readline';
import { CONFIG_FILENAME, DEFAULT_CONFIG, writeConfig, loadConfig } from '../lib/config';
import type { Output } from '../lib/output';

function prompt(rl: readline.Interface, question: string): Promise<string> {
	return new Promise((resolve) => rl.question(question, resolve));
}

export async function cmdInit(_args: Record<string, unknown>, out: Output): Promise<void> {
	const target = path.join(process.cwd(), CONFIG_FILENAME);

	if (fs.existsSync(target)) {
		const existing = loadConfig();
		out.line(`${CONFIG_FILENAME} already exists.`);
		out.json(existing);
		return;
	}

	out.line('Initialising VIBE CLI configuration.\n');

	const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

	const backend = (await prompt(rl, 'Backend URL [http://localhost:5100]: ')).trim() || 'http://localhost:5100';

	const agentIdRaw = (await prompt(rl, 'Default agent ID (optional): ')).trim();
	const defaultAgent = agentIdRaw ? parseInt(agentIdRaw, 10) : undefined;

	const suiteIdRaw = (await prompt(rl, 'Default suite ID (optional): ')).trim();
	const defaultSuite = suiteIdRaw ? parseInt(suiteIdRaw, 10) : undefined;

	rl.close();

	const config = {
		...DEFAULT_CONFIG,
		profiles: {
			local: {
				backend,
				...(defaultAgent !== undefined ? { defaultAgent } : {}),
				...(defaultSuite !== undefined ? { defaultSuite } : {})
			}
		}
	};

	writeConfig(config, target);

	out.ok(`Created ${target}`);
	out.line();
	out.line('Run `vibe agent list` to verify connectivity.');
	out.json(config);
}
