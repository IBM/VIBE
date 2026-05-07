import nextCoreWebVitals from 'eslint-config-next/core-web-vitals';
import nextTypescript from 'eslint-config-next/typescript';

const config = [
	{
		ignores: ['coverage/**']
	},
	...nextCoreWebVitals,
	...nextTypescript,
	{
		linterOptions: {
			reportUnusedDisableDirectives: false
		},
		rules: {
			'comma-dangle': ['error', 'never'],
			'react-hooks/immutability': 'off',
			'react-hooks/purity': 'off',
			'react-hooks/set-state-in-effect': 'off',
			'@typescript-eslint/no-unused-vars': [
				'error',
				{
					argsIgnorePattern: '^_',
					varsIgnorePattern: '^_',
					caughtErrorsIgnorePattern: '^_',
					ignoreRestSiblings: true
				}
			]
		}
	},
	{
		files: ['**/*.test.ts', '**/*.test.tsx', '**/*.spec.ts', '**/*.spec.tsx', '**/__tests__/**'],
		rules: {
			'@typescript-eslint/no-explicit-any': 'off',
			'@typescript-eslint/no-unsafe-function-type': 'off'
		}
	}
];

export default config;
