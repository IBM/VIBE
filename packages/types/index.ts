export enum JobStatus {
	PENDING = 'pending',
	RUNNING = 'running',
	COMPLETED = 'completed',
	FAILED = 'failed',
	TIMEOUT = 'timeout'
}

export interface Agent {
	id?: number;
	name: string;
	version: string;
	prompt: string;
	settings: string; // JSON string containing configuration settings
	created_at?: string;
}

/**
 * Capability metadata for request templates.
 *
 * A capability is identified by a `name` - a simple string tag.
 * Conversations can require specific capabilities, and execution will fail
 * early if the selected template doesn't have a matching capability name.
 *
 * Example names: "openai-chat", "ollama-generate", "watsonx-chat"
 */
export interface RequestTemplateCapabilities {
	/** The capability name used for matching */
	name?: string;
}

/**
 * Capability metadata for response maps.
 *
 * A capability is identified by a `name` - a simple string tag.
 * Conversations can require specific capabilities, and execution will fail
 * early if the selected response map doesn't have a matching capability name.
 *
 * Example names: "openai-chat", "ollama-generate", "watsonx-chat"
 */
export interface ResponseMapCapabilities {
	/** The capability name used for matching */
	name?: string;
}

/**
 * Global request template (not tied to a specific agent).
 *
 * Templates can be linked to multiple agents via agent_template_links.
 */
export interface RequestTemplate {
	id?: number;
	name: string;
	description?: string;
	/** Capability JSON string, e.g., '{"name": "openai-chat"}' */
	capability?: string;
	/** JSON template body with {{placeholders}} */
	body: string;
	created_at?: string;
}

/**
 * Global response map (not tied to a specific agent).
 *
 * Response maps can be linked to multiple agents via agent_response_map_links.
 */
export interface ResponseMap {
	id?: number;
	name: string;
	description?: string;
	/** Capability JSON string, e.g., '{"name": "openai-chat"}' */
	capability?: string;
	/** JSON spec defining response parsing */
	spec: string;
	created_at?: string;
}

/**
 * Template linked to an agent, includes link metadata.
 */
export interface AgentLinkedTemplate extends RequestTemplate {
	is_default?: number | boolean;
}

/**
 * Response map linked to an agent, includes link metadata.
 */
export interface AgentLinkedResponseMap extends ResponseMap {
	is_default?: number | boolean;
}

/**
 * Legacy agent-scoped request template.
 * @deprecated Use RequestTemplate + agent linking instead
 */
export interface AgentRequestTemplate {
	id?: number;
	agent_id: number;
	name: string;
	description?: string;
	engine?: string;
	content_type?: string;
	body: string;
	tags?: string;
	is_default?: number | boolean;
	capabilities?: string | RequestTemplateCapabilities | null;
	created_at?: string;
}

/**
 * Legacy agent-scoped response map.
 * @deprecated Use ResponseMap + agent linking instead
 */
export interface AgentResponseMap {
	id?: number;
	agent_id: number;
	name: string;
	description?: string;
	spec: string;
	tags?: string;
	is_default?: number | boolean;
	capabilities?: string | ResponseMapCapabilities | null;
	created_at?: string;
}

// Legacy Test interface (kept for migration compatibility)
export interface Test {
	id?: number;
	name: string;
	description?: string;
	input: string;
	expected_output?: string;
	created_at?: string;
	updated_at?: string;
}

// Legacy TestResult interface (kept for migration compatibility)
export interface TestResult {
	id?: number;
	agent_id: number;
	test_id: number;
	output: string;
	intermediate_steps?: string; // JSON string containing intermediate processing steps
	success: boolean;
	execution_time?: number; // Time in milliseconds
	created_at?: string;
	similarity_score?: number; // Similarity score (0-100)
	similarity_scoring_status?: 'pending' | 'running' | 'completed' | 'failed'; // Scoring job status
	similarity_scoring_error?: string; // Error message if scoring failed
	similarity_scoring_metadata?: string; // JSON metadata about the scoring process
	input_tokens?: number; // Number of input tokens used
	output_tokens?: number; // Number of output tokens generated
	token_mapping_metadata?: string; // JSON metadata about token extraction process
}

/**
 * A conversation is a multi-turn test script that can be executed against an agent.
 *
 * Conversations can optionally require specific capabilities from templates and
 * response maps. When executing, the system validates that the agent's templates
 * satisfy these requirements before starting.
 */
export interface Conversation {
	id?: number;
	name: string;
	description?: string;
	/** JSON array of tags for categorization */
	tags?: string;
	/**
	 * @deprecated Use required_request_template_capabilities instead.
	 * Conversations now specify capability requirements, not direct template IDs.
	 */
	default_request_template_id?: number;
	/**
	 * @deprecated Use required_response_map_capabilities instead.
	 * Conversations now specify capability requirements, not direct template IDs.
	 */
	default_response_map_id?: number;
	/** JSON object of conversation-level variables available to all messages */
	variables?: string;
	/**
	 * Required capability name for request templates.
	 * If set, execution will fail unless the template has a matching capability name.
	 * Stored as JSON: {"name": "openai-chat"} or just the capability name string.
	 */
	required_request_template_capabilities?: string;
	/**
	 * Required capability name for response maps.
	 * If set, execution will fail unless the response map has a matching capability name.
	 * Stored as JSON: {"name": "openai-chat"} or just the capability name string.
	 */
	required_response_map_capabilities?: string;
	/** If true, halt execution when a turn fails */
	stop_on_failure?: boolean;
	/** Optional messages (present on some API responses) */
	messages?: ConversationMessageDraft[];
	created_at?: string;
	updated_at?: string;
}

export interface ConversationMessage {
	id?: number;
	conversation_id: number;
	sequence: number;
	role: 'user' | 'system';
	content: string;
	metadata?: string; // JSON for message-specific config
	request_template_id?: number;
	response_map_id?: number;
	set_variables?: string; // JSON for literal/bind variable assignments
	created_at?: string;
}

/**
 * Conversation message shape accepted by create/update endpoints.
 *
 * Some payloads omit `conversation_id` because the conversation is created first.
 */
export type ConversationMessageDraft = Omit<ConversationMessage, 'conversation_id'> & { conversation_id?: number };

export interface ConversationTurnTarget {
	id?: number;
	conversation_id: number;
	user_sequence: number; // matches conversation_messages(sequence) for role='user'
	target_reply: string;
	threshold?: number | null; // 0 - 100
	weight?: number | null; // default 1.0
	created_at?: string;
	updated_at?: string;
}

export interface ExecutionSession {
	id?: number;
	conversation_id: number;
	agent_id: number;
	status: 'pending' | 'running' | 'completed' | 'failed';
	started_at?: string;
	completed_at?: string;
	success?: boolean;
	error_message?: string;
	metadata?: string; // JSON for session-level metrics (similarity scores, token usage, etc)
	variables?: string; // JSON snapshot of resolved variables during run
}

export interface SessionMessage {
	id?: number;
	session_id?: number;
	sequence: number;
	role: 'user' | 'assistant' | 'system' | 'tool';
	content: string;
	timestamp?: string;
	metadata?: string; // JSON for timing, tokens, confidence, etc.
	// Per-turn similarity scoring (source of truth)
	similarity_score?: number; // 0 - 100
	similarity_scoring_status?: 'pending' | 'running' | 'completed' | 'failed';
	similarity_scoring_error?: string;
	similarity_scoring_metadata?: string; // JSON metadata
}

export interface Job {
	id: string; // UUID
	agent_id: number;
	test_id?: number; // Legacy field (kept for compatibility)
	conversation_id?: number; // New field for conversation testing
	status: JobStatus;
	progress?: number; // 0-100 percentage
	partial_result?: string;
	result_id?: number; // Legacy field (kept for compatibility)
	session_id?: number; // New field for execution sessions
	error?: string;
	created_at?: string;
	updated_at?: string;
	suite_run_id?: number; // Reference to parent suite run
	job_type?: string; // 'crewai' or 'external_api' for routing to appropriate service
	claimed_by?: string; // Service identifier that claimed this job
	claimed_at?: string;
}

export interface JobFilters {
	status?: JobStatus;
	agent_id?: number;
	test_id?: number; // Legacy field
	conversation_id?: number;
	before?: Date;
	after?: Date;
	suite_run_id?: number;
	job_type?: string;
}

// Test Suite interfaces
export interface TestSuite {
	id?: number;
	name: string;
	description?: string;
	tags?: string; // Comma-separated tags for categorization
	created_at?: string;
	updated_at?: string;
}

export interface TestSuiteTest {
	id?: number;
	suite_id: number;
	test_id: number;
	sequence?: number; // Ordering within suite
}

export interface SuiteRun {
	id?: number;
	suite_id: number;
	agent_id: number;
	agent_name?: string;
	status: JobStatus;
	progress?: number; // 0-100 percentage
	total_tests: number;
	completed_tests: number;
	successful_tests: number;
	failed_tests: number;
	average_execution_time?: number; // Time in milliseconds
	avg_similarity_score?: number; // average similarity score for the run
	total_input_tokens?: number; // Total input tokens for all tests in suite
	total_output_tokens?: number; // Total output tokens for all tests in suite
	started_at?: string;
	completed_at?: string;
}

export interface SuiteRunFilters {
	status?: JobStatus;
	suite_id?: number;
	agent_id?: number;
	before?: Date;
	after?: Date;
}

export interface LLMConfig {
	id?: number;
	name: string;
	provider: string;
	config: string; // JSON-stringified configuration object
	priority: number;
	created_at?: string;
	updated_at?: string;
}

// SuiteEntry represents a test or child suite entry in a nested suite structure
export interface SuiteEntry {
	id: number;
	parent_suite_id: number;
	sequence: number;
	test_id?: number; // Legacy field
	conversation_id?: number;
	child_suite_id?: number;
	agent_id_override?: number;
}

// Additional shared types from root types/index.ts
export interface PaginatedResponse<T> {
	data: T[];
	total: number;
	limit?: number;
	offset?: number;
}

export interface StatsResponse {
	agents_total: number;
	tests_total: number;
}

export interface LLMRequestOptions {
	prompt: string;
	max_tokens?: number;
	temperature?: number;
	stop?: string[];
}

export interface LLMResponse {
	text: string;
	provider: string;
	model: string;
	config_id: number;
	error?: string;
}

export interface TokenUsage {
	input_tokens?: number;
	output_tokens?: number;
	total_tokens?: number;
}

export interface TokenMapping {
	input_tokens?: string;
	output_tokens?: string;
	total_tokens?: string;
}

export interface AgentSettings {
	type: string;
	api_endpoint: string;
	http_method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
	headers?: Record<string, string>;
	api_key?: string;
	token_mapping?: string;
	request_template?: string; // Legacy
	response_mapping?: string; // Legacy
	[key: string]: any;
}

export interface TestExecutionRequest {
	test_input: string;
	test_id: number;
	api_endpoint: string;
	api_key?: string;
	request_template?: string;
	response_mapping?: string;
	token_mapping?: string;
	headers?: Record<string, string>;
	http_method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
}

export interface ConversationExecutionRequest {
	conversation_id: number;
	conversation_script: ConversationMessage[];
	api_endpoint: string;
	api_key?: string;
	request_template?: string;
	response_mapping?: string;
	token_mapping?: string;
	headers?: Record<string, string>;
	http_method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
	stop_on_failure?: boolean; // if true, halt on per-turn failure
}

export interface IntermediateStep {
	timestamp: string;
	agent_id?: number;
	action: string;
	output: string;
}

export interface Metrics {
	model_calls?: number;
	tool_calls?: number;
	execution_time: number;
	input_tokens?: number;
	output_tokens?: number;
}

export interface TestExecutionResponse {
	agent_id?: number;
	test_id: number;
	output: string;
	success: boolean;
	execution_time: number;
	intermediate_steps: IntermediateStep[];
	metrics: Metrics;
}

export interface ConversationExecutionResponse {
	agent_id?: number;
	conversation_id: number;
	transcript: SessionMessage[];
	success: boolean;
	execution_time: number;
	intermediate_steps: IntermediateStep[];
	variables?: Record<string, any>;
	metrics: Metrics;
}

export interface ResponseMapping {
	output?: string;
	intermediate_steps?: string;
	variables?: Record<string, string>;
	success_criteria?: {
		type: 'contains' | 'exact_match' | 'json_match';
		path?: string;
		operator?: string;
		value: any;
	};
}

export enum ExportableDataType {
	AGENTS = 'agents',
	CONVERSATIONS = 'conversations',
	TEST_SUITES = 'test_suites',
	LLM_CONFIGS = 'llm_configs',
	REQUEST_TEMPLATES = 'request_templates',
	RESPONSE_MAPS = 'response_maps'
}

export interface ExportedAgentTemplateLink {
	template_name: string;
	is_default?: boolean;
}

export interface ExportedAgentResponseMapLink {
	response_map_name: string;
	is_default?: boolean;
}

export interface ExportedAgent {
	name: string;
	version: string;
	prompt: string;
	settings: string;
	linked_templates?: ExportedAgentTemplateLink[];
	linked_response_maps?: ExportedAgentResponseMapLink[];
}

export interface ExportedConversationMessage {
	sequence: number;
	role: 'user' | 'system';
	content: string;
	metadata?: string;
	request_template_name?: string;
	response_map_name?: string;
	set_variables?: string;
}

export interface ExportedConversationTurnTarget {
	user_sequence: number;
	target_reply: string;
	threshold?: number | null;
	weight?: number | null;
}

export interface ExportedConversation {
	name: string;
	reference_key?: string;
	description?: string;
	tags?: string;
	variables?: string;
	required_request_template_capabilities?: string;
	required_response_map_capabilities?: string;
	stop_on_failure?: boolean;
	messages?: ExportedConversationMessage[];
	turn_targets?: ExportedConversationTurnTarget[];
}

export interface ExportedSuiteEntry {
	sequence: number;
	conversation_name?: string;
	conversation_reference_key?: string;
	child_suite_name?: string;
	child_suite_reference_key?: string;
	agent_override_name?: string;
	agent_override_version?: string;
}

export interface ExportedTestSuite {
	name: string;
	reference_key?: string;
	description?: string;
	tags?: string;
	entries?: ExportedSuiteEntry[];
}

export interface ExportedLLMConfig {
	name: string;
	provider: string;
	config: string;
	priority: number;
}

export interface ExportedRequestTemplate {
	name: string;
	description?: string;
	capability?: string;
	body: string;
}

export interface ExportedResponseMap {
	name: string;
	description?: string;
	capability?: string;
	spec: string;
}

export interface ExportBundleData {
	agents?: ExportedAgent[];
	conversations?: ExportedConversation[];
	test_suites?: ExportedTestSuite[];
	llm_configs?: ExportedLLMConfig[];
	request_templates?: ExportedRequestTemplate[];
	response_maps?: ExportedResponseMap[];
}

export interface ExportBundle {
	version: number;
	exported_at: string;
	instance_name?: string;
	data: ExportBundleData;
}

export type AnalysisStatus = 'new' | 'conflict' | 'dependency_missing';

export interface AnalysisItem {
	item_key: string;
	entity_type: ExportableDataType;
	entity_name: string;
	status: AnalysisStatus;
	existing_id?: number;
	issues?: string[];
	allowed_decisions?: ImportResolutionDecision[];
}

export interface AnalysisTotals {
	new: number;
	conflict: number;
	dependency_missing: number;
}

export interface AnalysisReport {
	items: AnalysisItem[];
	totals: AnalysisTotals;
	has_issues: boolean;
}

export type ImportResolutionDecision = 'skip' | 'overwrite' | 'create_new';

export interface ImportResolution {
	item_key: string;
	decision: ImportResolutionDecision;
	new_name?: string;
	new_version?: string;
}

export interface ImportRequest {
	bundle: ExportBundle;
	resolutions: Record<string, ImportResolution>;
}

export type ImportResultAction = 'created' | 'updated' | 'skipped';

export interface ImportResultItem {
	item_key: string;
	entity_type: ExportableDataType;
	entity_name: string;
	action: ImportResultAction;
	message?: string;
}

export interface ImportResultSummary {
	created: number;
	updated: number;
	skipped: number;
	items: ImportResultItem[];
}

export const EXPORT_BUNDLE_VERSION = 1;

export const IMPORT_RESOLUTION_DECISIONS = ['skip', 'overwrite', 'create_new'] as const;

export interface ImportPlanIssue {
	code: string;
	message: string;
	item_key?: string;
}

export interface ImportPlanItem extends AnalysisItem {
	allowed_decisions: ImportResolutionDecision[];
	selected_decision: ImportResolutionDecision;
	executable: boolean;
	final_name?: string;
	final_version?: string;
	final_entity_name?: string;
	action: ImportResultAction;
}

export interface ImportPlanTotals extends AnalysisTotals {
	selected: number;
	executable: number;
	blocked: number;
	create_new: number;
	overwrite: number;
	skip: number;
}

export interface ImportPlan {
	version: number;
	generated_at: string;
	items: ImportPlanItem[];
	totals: ImportPlanTotals;
	has_issues: boolean;
	executable: boolean;
	issues: ImportPlanIssue[];
	resolutions: Record<string, ImportResolution>;
}
