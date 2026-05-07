let consoleErrorSpy: jest.SpyInstance;
let consoleWarnSpy: jest.SpyInstance;

type ConsoleHelper = (...args: unknown[]) => void;

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

const globalWithHelpers = globalThis as typeof globalThis & {
	expectConsoleError: ConsoleHelper;
	expectConsoleWarn: ConsoleHelper;
	allowConsoleErrors: () => void;
	allowConsoleWarns: () => void;
	allowConsoleOutput: () => void;
};

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

globalWithHelpers.expectConsoleError = (...args: unknown[]) => {
	consumeConsoleCall(consoleErrorSpy, args);
};

globalWithHelpers.expectConsoleWarn = (...args: unknown[]) => {
	consumeConsoleCall(consoleWarnSpy, args);
};

globalWithHelpers.allowConsoleErrors = () => {
	consoleErrorSpy.mockClear();
};

globalWithHelpers.allowConsoleWarns = () => {
	consoleWarnSpy.mockClear();
};

globalWithHelpers.allowConsoleOutput = () => {
	consoleErrorSpy.mockClear();
	consoleWarnSpy.mockClear();
};

export {};
