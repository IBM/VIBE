const js = require('@eslint/js');
const { FlatCompat } = require('@eslint/eslintrc');

const compat = new FlatCompat({
	baseDirectory: __dirname,
	recommendedConfig: js.configs.recommended,
	allConfig: js.configs.all
});

module.exports = [
	...compat.config({
		root: true,
		env: {
			node: true,
			es2021: true
		},
		parser: '@typescript-eslint/parser',
		parserOptions: {
			tsconfigRootDir: __dirname,
			project: ['./tsconfig.json']
		},
		plugins: ['@typescript-eslint'],
		extends: ['eslint:recommended', 'plugin:@typescript-eslint/recommended'],
		ignorePatterns: ['dist/**/*'],
		rules: {
			'no-empty': ['error', { allowEmptyCatch: true }],
			'@typescript-eslint/no-explicit-any': 'warn',
			'@typescript-eslint/no-unused-vars': [
				'error',
				{
					argsIgnorePattern: '^_',
					varsIgnorePattern: '^_',
					caughtErrorsIgnorePattern: '^_'
				}
			],
			'@typescript-eslint/no-misused-promises': ['error', { checksVoidReturn: false }]
		},
		overrides: [
			{
				files: ['src/**/*.test.ts', 'src/**/*.spec.ts', 'src/**/__tests__/**/*.ts'],
				rules: {
					'@typescript-eslint/no-explicit-any': 'off',
					'@typescript-eslint/no-require-imports': 'off',
					'@typescript-eslint/no-unsafe-function-type': 'off'
				}
			}
		]
	})
];
