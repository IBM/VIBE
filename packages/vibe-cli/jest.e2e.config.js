/** @type {import('ts-jest').JestConfigWithTsJest} */
module.exports = {
	preset: 'ts-jest',
	testEnvironment: 'node',
	testMatch: ['**/__tests__/e2e/**/*.test.ts'],
	// E2E tests start a real backend — give them plenty of time
	testTimeout: 30000,
	// Don't collect coverage from E2E tests
	collectCoverage: false
};
