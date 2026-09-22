#!/usr/bin/env node
'use strict';

import { resolveProfile } from './lib/config';
import { VibeClient } from './lib/client';
import { makeOutput } from './lib/output';
import { cmdInit } from './commands/init';
import { cmdAgent } from './commands/agent';
import { cmdSuite } from './commands/suite';
import { cmdConversation } from './commands/conversation';
import { cmdRun } from './commands/run';
import { cmdResults } from './commands/results';
import { cmdTransfer } from './commands/transfer';

// ── Arg parser ────────────────────────────────────────────────────────────────

interface ParsedArgs {
	_as_array: string[];
	[key: string]: unknown;
}

function parseArgs(argv: string[]): ParsedArgs {
	const args: ParsedArgs = { _as_array: argv };
	for (let i = 0; i < argv.length; i++) {
		const a = argv[i];
		if (a.startsWith('--')) {
			const key = a.slice(2);
			const next = argv[i + 1];
			if (next !== undefined && !next.startsWith('--')) {
				args[key] = next;
				i++;
			} else {
				args[key] = true;
			}
		}
	}
	return args;
}

// ── Help ──────────────────────────────────────────────────────────────────────

function printHelp(): void {
	process.stdout.write(`
IBM VIBE CLI

Usage: vibe <command> <subcommand> [options]

Commands:
  init                           Create vibe.config.json in the current directory

  agent    list                  List all agents
  agent    show    <id>          Show agent details
  agent    create  --name --version --settings <file>
  agent    delete  <id>

  suite    list                  List all test suites
  suite    show    <id>          Show suite details and entries
  suite    create  --name <name> [--description] [--tags]
  suite    delete  <id>
  suite    entries <id>          List entries in a suite
  suite    add-conversation  --suite <id> --conversation <id> [--agent <id>]
  suite    remove-entry      --suite <id> --entry <id>

  conversation  list             List all conversations
  conversation  show    <id>     Show conversation with messages and targets
  conversation  create  --name <name> [--messages turns.json]
  conversation  delete  <id>
  conversation  add-message  --conversation <id> --role <user|system> --content <text>
  conversation  set-target   --conversation <id> --target <text> [--sequence <n>] [--threshold <0-100>]
  conversation  record        --agent-url <url> [--suite <id>] [--threshold <n>] [--no-save]

  run  conversation  --conversation <id> [--agent <id>]
  run  suite         --suite <id>        [--agent <id>]

  results  session      <id>             Full transcript for a session
  results  conversation <id>             Latest session for a conversation
  results  suite-run    <id>             Summary of a suite run
  results  runs         [--suite <id>]   List recent suite runs

  transfer  export  --types <types,...>  [--out bundle.json]
  transfer  import  --file bundle.json   [--dry-run]

Global options:
  --profile <name>    Use a named profile from vibe.config.json
  --json              Output raw JSON (for scripting and AI agent use)

Environment:
  VIBE_BACKEND        Override backend URL
  VIBE_PROFILE        Override active profile name
  VIBE_AGENT_ID       Override default agent ID
  VIBE_SUITE_ID       Override default suite ID
  VIBE_AGENT_URL      Agent chat URL for 'conversation record'

Config:
  vibe.config.json in the project root (or any ancestor directory).
  Run 'vibe init' to create one.
`);
}

// ── Entry point ───────────────────────────────────────────────────────────────

async function main(): Promise<void> {
	const argv = process.argv.slice(2);
	const args = parseArgs(argv);
	const positional = argv.filter((a) => !a.startsWith('--'));

	const command = positional[0];
	const subcommand = positional[1];

	const out = makeOutput(args);

	if (!command || command === 'help' || command === '--help' || command === '-h') {
		printHelp();
		return;
	}

	if (command === 'init') {
		await cmdInit(args, out);
		return;
	}

	// All other commands need a client
	let profile;
	try {
		profile = resolveProfile(args);
	} catch (err) {
		out.error((err as Error).message);
		process.exit(1);
	}

	const client = new VibeClient(profile.backend);

	try {
		switch (command) {
			case 'agent':
				await cmdAgent(subcommand, args, client, out);
				break;
			case 'suite':
				await cmdSuite(subcommand, args, client, out);
				break;
			case 'conversation':
				await cmdConversation(subcommand, args, client, out);
				break;
			case 'run':
				await cmdRun(subcommand, args, client, profile, out);
				break;
			case 'results':
				await cmdResults(subcommand, args, client, out);
				break;
			case 'transfer':
				await cmdTransfer(subcommand, args, client, out);
				break;
			default:
				out.error(`Unknown command: ${command}`);
				out.line('Run `vibe help` for usage.');
				process.exit(1);
		}
	} catch (err: unknown) {
		const msg = err instanceof Error ? err.message : String(err);
		out.error(msg);
		if (out.jsonMode) {
			process.stdout.write(JSON.stringify({ error: msg }, null, 2) + '\n');
		}
		process.exit(2);
	}
}

main();
