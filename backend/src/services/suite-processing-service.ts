import { getAgentById, getEntriesInSuite } from '../db/queries';
import { SuiteEntry, Agent } from '@ibm-vibe/types';

const shouldLog = process.env.NODE_ENV !== 'test';

/**
 * Interface for suite processing results
 */
export interface SuiteProcessingResult {
	agent_id: number;
	conversation_id?: number;
	test_id?: number;
}

/**
 * Agent validation result
 */
interface AgentValidationResult {
	isValid: boolean;
	agent?: Agent;
	agentType?: string;
	warnings: string[];
	errors: string[];
}

/**
 * Service for processing nested test suites and flattening them into executable tests
 */
export class SuiteProcessingService {
	/**
	 * Count the total number of leaf tests in a nested suite structure
	 * This method is optimized for counting only and skips agent validation
	 */
	public countLeafTests(parentSuiteId: number, visited: Set<number> = new Set()): number {
		// Prevent infinite recursion by checking if we've already visited this suite
		if (visited.has(parentSuiteId)) {
			/* istanbul ignore next */
			if (shouldLog) {
				console.warn(
					`[Suite Count] Circular reference detected: Suite ${parentSuiteId} references itself. Skipping to prevent infinite recursion.`
				);
			}
			return 0;
		}
		visited.add(parentSuiteId);

		const entries = getEntriesInSuite(parentSuiteId);

		let count = 0;

		for (const entry of entries) {
			if (entry.conversation_id || entry.test_id) {
				count += 1;
			} else if (entry.child_suite_id) {
				// Child suite entry - recursively count its tests
				const childVisited = new Set(visited);
				count += this.countLeafTests(entry.child_suite_id, childVisited);
			}
		}

		// Remove current suite from visited set when backtracking
		visited.delete(parentSuiteId);

		return count;
	}

	/**
	 * Validate an agent and its settings
	 */
	private validateAgent(agentId: number, context: string = ''): AgentValidationResult {
		const result: AgentValidationResult = {
			isValid: false,
			warnings: [],
			errors: []
		};

		const agent = getAgentById(agentId);
		if (!agent) {
			result.errors.push(`Agent ${agentId} not found${context ? ` ${context}` : ''}!`);
			return result;
		}

		result.agent = agent;
		result.isValid = true;

		try {
			const agentSettings = JSON.parse(agent.settings);
			const agentType = agentSettings.type || 'crewai';
			result.agentType = agentType;

			// Warn if agent type might cause issues
			if (!agentSettings.type) {
				result.warnings.push(`Agent ${agentId} has no 'type' field in settings, defaulting to 'crewai'`);
			} else if (agentType !== 'crewai' && agentType !== 'external_api') {
				result.warnings.push(
					`Agent ${agentId} has unexpected type '${agentType}' - this may cause job timeout issues`
				);
			}
		} catch {
			result.errors.push(`Agent ${agentId} has invalid settings JSON: ${agent.settings}`);
			result.warnings.push(`This will likely cause job execution failures${context ? ` ${context}` : ''}`);
		}

		return result;
	}

	/**
	 * Process a direct test entry
	 */
	private processDirectTest(entry: SuiteEntry, defaultAgentId: number): SuiteProcessingResult | null {
		if (!entry.conversation_id && !entry.test_id) {
			return null;
		}

		const agentId = entry.agent_id_override || defaultAgentId;
		const contextRef = entry.conversation_id ?? entry.test_id;
		const validation = this.validateAgent(agentId, `for test ${contextRef}`);

		// Log warnings and errors
		/* istanbul ignore next */
		if (shouldLog) {
			validation.warnings.forEach((warning) => console.warn(`[Nested Suite]   WARNING: ${warning}`));
			validation.errors.forEach((error) => console.error(`[Nested Suite]   ERROR: ${error}`));
		}

		// Still return the result even if there are validation issues
		// The job system will handle the failures appropriately
		if (entry.conversation_id) {
			return { agent_id: agentId, conversation_id: entry.conversation_id };
		}
		return { agent_id: agentId, test_id: entry.test_id };
	}

	/**
	 * Process a child suite entry
	 */
	private processChildSuite(
		entry: SuiteEntry,
		defaultAgentId: number,
		visited: Set<number>
	): SuiteProcessingResult[] {
		if (!entry.child_suite_id) {
			return [];
		}

		const childAgentId = entry.agent_id_override || defaultAgentId;

		// Validate child agent if overridden
		if (entry.agent_id_override) {
			const validation = this.validateAgent(childAgentId, `for child suite ${entry.child_suite_id}`);

			// Log warnings and errors
			/* istanbul ignore next */
			if (shouldLog) {
				validation.warnings.forEach((warning) =>
					console.warn(`[Nested Suite]   WARNING: Child suite agent ${warning}`)
				);
				validation.errors.forEach((error) =>
					console.error(`[Nested Suite]   ERROR: Child suite agent override ${error}`)
				);
			}
		}

		// Create a copy of visited set for this branch to track path
		const childVisited = new Set(visited);

		// Recursively process the child suite
		return this.getFlattenedLeaves(entry.child_suite_id, childAgentId, childVisited);
	}

	/**
	 * Flatten a nested suite structure into a list of executable tests with their assigned agents
	 */
	public getFlattenedLeaves(
		parentSuiteId: number,
		defaultAgentId: number,
		visited: Set<number> = new Set()
	): SuiteProcessingResult[] {
		// Prevent infinite recursion by checking if we've already visited this suite
		if (visited.has(parentSuiteId)) {
			/* istanbul ignore next */
			if (shouldLog) {
				console.warn(
					`[Nested Suite] Circular reference detected: Suite ${parentSuiteId} references itself. Skipping to prevent infinite recursion.`
				);
			}
			return [];
		}

		// Add current suite to visited set
		visited.add(parentSuiteId);

		// Get entries for this suite
		const entries = getEntriesInSuite(parentSuiteId);

		// Validate the default agent exists
		const defaultAgentValidation = this.validateAgent(defaultAgentId, 'as default agent');
		if (!defaultAgentValidation.isValid) {
			/* istanbul ignore next */
			if (shouldLog) {
				console.error(`[Nested Suite] Default agent ${defaultAgentId} not found!`);
			}
		} else if (defaultAgentValidation.warnings.length > 0) {
			/* istanbul ignore next */
			if (shouldLog) {
				console.warn(
					`[Nested Suite] Default agent ${defaultAgentId} has invalid settings JSON: ${defaultAgentValidation.agent?.settings}`
				);
			}
		}

		const result: SuiteProcessingResult[] = [];

		// Process each entry in the suite
		for (const entry of entries) {
			if (entry.conversation_id || entry.test_id) {
				// Direct test entry (prefer conversation_id)
				const testResult = this.processDirectTest(entry, defaultAgentId);
				if (testResult) {
					result.push(testResult);
				}
			} else if (entry.child_suite_id) {
				// Child suite entry
				const childResults = this.processChildSuite(entry, defaultAgentId, visited);
				result.push(...childResults);
			} else {
				// Invalid entry
				/* istanbul ignore next */
				if (shouldLog) {
					console.warn(
						`[Nested Suite]   WARNING: Entry ${entry.id} has neither test_id nor child_suite_id - this is invalid`
					);
				}
			}
		}

		// Remove current suite from visited set when backtracking
		visited.delete(parentSuiteId);

		return result;
	}
}

// Export singleton instance
export const suiteProcessingService = new SuiteProcessingService();
