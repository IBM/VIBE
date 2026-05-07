import type { IntermediateStep, ResponseMapping, TestExecutionRequest } from '@ibm-vibe/types';
import { tokenizePath as tokenizeSharedPath, traverseByTokens as traverseSharedTokens } from '@ibm-vibe/utils';
import { compareValues as compareMappedValues } from './api-service-formatters';

export interface ProcessResponseResult {
	output: string;
	steps: IntermediateStep[];
	success: boolean;
	extractedVariables?: Record<string, any>;
}

export class ApiServiceResponseProcessor {
	parseScriptMetadata(metadata: unknown): Record<string, any> {
		if (!metadata) {
			return {};
		}
		if (typeof metadata === 'string') {
			try {
				const parsed = JSON.parse(metadata);
				return parsed && typeof parsed === 'object' ? (parsed as Record<string, any>) : {};
			} catch {
				return {};
			}
		}
		if (typeof metadata === 'object') {
			return metadata as Record<string, any>;
		}
		return {};
	}

	processResponse(
		responseData: any,
		request: TestExecutionRequest,
		steps: IntermediateStep[]
	): ProcessResponseResult {
		let output = '';
		let success = false;
		let extractedVariables: Record<string, any> | undefined;

		try {
			if (request.response_mapping) {
				const mapping: ResponseMapping = JSON.parse(request.response_mapping);

				output = mapping.output
					? this.extractByPath(responseData, mapping.output)
					: typeof responseData === 'string'
						? responseData
						: JSON.stringify(responseData);

				if (mapping.intermediate_steps) {
					const extractedSteps = this.extractByPath(responseData, mapping.intermediate_steps);

					if (Array.isArray(extractedSteps)) {
						extractedSteps.forEach((step: any) => {
							steps.push({
								timestamp: new Date().toISOString(),
								action: step.action || 'Intermediate Step',
								output: step.output || JSON.stringify(step)
							});
						});
					} else if (extractedSteps) {
						steps.push({
							timestamp: new Date().toISOString(),
							action: 'Intermediate Data',
							output: JSON.stringify(extractedSteps)
						});
					}
				}

				if (mapping.variables && typeof mapping.variables === 'object') {
					extractedVariables = {};
					for (const [varName, varPath] of Object.entries(mapping.variables)) {
						try {
							const value = this.extractByPath(responseData, varPath as string);
							if (value !== undefined) {
								extractedVariables[varName] = value;
							}
						} catch {
							// Ignore individual extraction failures.
						}
					}
				}

				if (mapping.success_criteria) {
					switch (mapping.success_criteria.type) {
						case 'contains':
							success = output.includes(mapping.success_criteria.value);
							break;
						case 'exact_match':
							success = output === mapping.success_criteria.value;
							break;
						case 'json_match':
							if (mapping.success_criteria.path) {
								const actualValue = this.extractByPath(responseData, mapping.success_criteria.path);
								success = this.compareValues(
									actualValue,
									mapping.success_criteria.operator || '==',
									mapping.success_criteria.value
								);
							}
							break;
						default:
							success = false;
					}
				}
			} else {
				output =
					typeof responseData === 'string'
						? responseData
						: responseData.output || JSON.stringify(responseData);
			}

			steps.push({
				timestamp: new Date().toISOString(),
				action: 'Processing Complete',
				output: success ? 'Test execution successful' : 'Test execution unsuccessful'
			});

			return { output, steps, success, extractedVariables };
		} catch (error: any) {
			steps.push({
				timestamp: new Date().toISOString(),
				action: 'Processing Error',
				output: `Error processing response: ${error.message}`
			});

			return {
				output: `Error processing response: ${error.message}`,
				steps,
				success: false,
				extractedVariables
			};
		}
	}

	tokenizePath(path: string): (string | number)[] {
		return tokenizeSharedPath(path);
	}

	traverseByTokens(obj: any, tokens: (string | number)[]): any {
		return traverseSharedTokens(obj, tokens);
	}

	extractByPath(obj: any, path: string): any {
		try {
			if (!path || typeof path !== 'string') return undefined;
			const tokens = this.tokenizePath(path);
			return this.traverseByTokens(obj, tokens);
		} catch {
			return undefined;
		}
	}

	compareValues(left: any, operator: string, right: any): boolean {
		return compareMappedValues(left, operator, right);
	}

	resolvePointer(pointer: string, context: Record<string, any>): any {
		try {
			if (typeof pointer !== 'string' || !pointer.startsWith('$.')) {
				return pointer;
			}

			const path = pointer.slice(2);
			const tokens = this.tokenizePath(path);

			return this.traverseByTokens(context, tokens);
		} catch {
			return undefined;
		}
	}
}
