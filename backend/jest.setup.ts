// Global test setup
// Note: We dynamically import database and job queue only when needed
// to avoid initializing them for tests that don't use them

import { cleanupTestResources } from './src/__tests__/cleanup-helper';

type ConsoleHelper = (...args: unknown[]) => void;

let consoleErrorSpy: jest.SpyInstance;
let consoleWarnSpy: jest.SpyInstance;

function installConsoleSpies() {
	consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
	consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
}

installConsoleSpies();

function formatConsoleArg(arg: unknown): string {
	if (arg instanceof Error) {
		return `${arg.name}: ${arg.message}`;
	}
	if (typeof arg === 'string') {
		return JSON.stringify(arg);
	}
	try {
		return JSON.stringify(arg);
	} catch {
		return String(arg);
	}
}

function formatConsoleCalls(calls: unknown[][], limit: number = 10): string {
	return calls
		.slice(0, limit)
		.map((args, idx) => `  ${idx + 1}) ${args.map(formatConsoleArg).join(' ')}`)
		.join('\n');
}

function consumeConsoleCall(spy: jest.SpyInstance, expectedArgs: unknown[]) {
	const calls = spy.mock.calls as unknown[][];
	const index = calls.findIndex((callArgs) => {
		try {
			expect(callArgs).toEqual(expectedArgs);
			return true;
		} catch {
			return false;
		}
	});

	if (index === -1) {
		throw new Error(
			[
				'Expected console call not found.',
				`Expected args: ${expectedArgs.map(formatConsoleArg).join(' ')}`,
				'Actual calls:',
				calls.length === 0 ? '  (none)' : formatConsoleCalls(calls)
			].join('\n')
		);
	}

	calls.splice(index, 1);
}

declare global {
	// Helpers for tests that need to assert on console output.
	// eslint-disable-next-line no-var
	var expectConsoleError: ConsoleHelper;
	// eslint-disable-next-line no-var
	var expectConsoleWarn: ConsoleHelper;
	// eslint-disable-next-line no-var
	var allowConsoleErrors: () => void;
	// eslint-disable-next-line no-var
	var allowConsoleWarns: () => void;
	// eslint-disable-next-line no-var
	var allowConsoleOutput: () => void;
}

beforeEach(() => {
	if (!jest.isMockFunction(console.error) || !jest.isMockFunction(console.warn)) {
		installConsoleSpies();
	}
	consoleErrorSpy.mockClear();
	consoleWarnSpy.mockClear();
});

afterEach(() => {
	const errorCalls = consoleErrorSpy.mock.calls as unknown[][];
	const warnCalls = consoleWarnSpy.mock.calls as unknown[][];

	if (errorCalls.length > 0 || warnCalls.length > 0) {
		const messageLines: string[] = ['Unexpected console output detected.'];

		if (errorCalls.length > 0) {
			messageLines.push(`\nconsole.error calls (${errorCalls.length}):`);
			messageLines.push(formatConsoleCalls(errorCalls));
			if (errorCalls.length > 10) {
				messageLines.push(`  ... and ${errorCalls.length - 10} more`);
			}
		}

		if (warnCalls.length > 0) {
			messageLines.push(`\nconsole.warn calls (${warnCalls.length}):`);
			messageLines.push(formatConsoleCalls(warnCalls));
			if (warnCalls.length > 10) {
				messageLines.push(`  ... and ${warnCalls.length - 10} more`);
			}
		}

		// Prevent cascading failures across tests
		consoleErrorSpy.mockClear();
		consoleWarnSpy.mockClear();

		throw new Error(messageLines.join('\n'));
	}
});

globalThis.expectConsoleError = (...args: unknown[]) => {
	consumeConsoleCall(consoleErrorSpy, args);
};

globalThis.expectConsoleWarn = (...args: unknown[]) => {
	consumeConsoleCall(consoleWarnSpy, args);
};

globalThis.allowConsoleErrors = () => {
	consoleErrorSpy.mockClear();
};

globalThis.allowConsoleWarns = () => {
	consoleWarnSpy.mockClear();
};

globalThis.allowConsoleOutput = () => {
	consoleErrorSpy.mockClear();
	consoleWarnSpy.mockClear();
};

// Global teardown after all test suites complete
// Note: afterAll in jest.setup.ts runs after EACH test file, not globally
// We run a best-effort cleanup after each test file to prevent
// long-lived intervals / DB handles from keeping Jest alive.
afterAll(async () => {
	consoleErrorSpy.mockRestore();
	consoleWarnSpy.mockRestore();
	await Promise.race([cleanupTestResources(), new Promise<void>((resolve) => setTimeout(() => resolve(), 1000))]);
}, 2000);

// Made with Bob
