import type {
	Agent,
	Conversation,
	ConversationMessage,
	ConversationTurnTarget,
	ExecutionSession,
	SessionMessage,
	Job,
	SuiteRun,
	TestSuite,
	SuiteEntry,
	RequestTemplate,
	ResponseMap,
	ExportBundle,
	AnalysisReport,
	ImportRequest,
	ImportResultSummary
} from '@ibm-vibe/types';

export class VibeApiError extends Error {
	constructor(
		public readonly status: number,
		public readonly path: string,
		message: string
	) {
		super(`${status} ${path}: ${message}`);
		this.name = 'VibeApiError';
	}
}

export class VibeClient {
	constructor(private readonly backend: string) {}

	private async req<T>(method: string, path: string, body?: unknown): Promise<T> {
		const opts: RequestInit = { method, headers: {} as Record<string, string> };
		if (body !== undefined) {
			(opts.headers as Record<string, string>)['Content-Type'] = 'application/json';
			opts.body = JSON.stringify(body);
		}
		const res = await fetch(`${this.backend}${path}`, opts);
		if (res.status === 204) return undefined as unknown as T;
		const data = await res.json().catch(() => ({ error: res.statusText }));
		if (!res.ok) {
			const msg = (data as { error?: string }).error ?? res.statusText;
			throw new VibeApiError(res.status, path, msg);
		}
		return data as T;
	}

	private get<T>(path: string) {
		return this.req<T>('GET', path);
	}
	private post<T>(path: string, body: unknown) {
		return this.req<T>('POST', path, body);
	}
	private put<T>(path: string, body: unknown) {
		return this.req<T>('PUT', path, body);
	}
	private del<T>(path: string) {
		return this.req<T>('DELETE', path);
	}

	// ── Agents ───────────────────────────────────────────────────────────────

	listAgents(): Promise<Agent[]> {
		return this.get<Agent[]>('/api/agents');
	}

	getAgent(id: number): Promise<Agent> {
		return this.get<Agent>(`/api/agents/${id}`);
	}

	createAgent(body: Omit<Agent, 'id' | 'created_at'>): Promise<Agent> {
		return this.post<Agent>('/api/agents', body);
	}

	updateAgent(id: number, body: Partial<Agent>): Promise<Agent> {
		return this.put<Agent>(`/api/agents/${id}`, body);
	}

	deleteAgent(id: number): Promise<void> {
		return this.del<void>(`/api/agents/${id}`);
	}

	// ── Conversations ────────────────────────────────────────────────────────

	listConversations(): Promise<Conversation[]> {
		return this.get<Conversation[]>('/api/conversations');
	}

	getConversation(id: number): Promise<Conversation & { messages: ConversationMessage[] }> {
		return this.get<Conversation & { messages: ConversationMessage[] }>(`/api/conversations/${id}`);
	}

	createConversation(
		body: Omit<Conversation, 'id' | 'created_at' | 'updated_at'> & {
			messages?: Omit<ConversationMessage, 'id' | 'conversation_id' | 'created_at'>[];
		}
	): Promise<Conversation> {
		return this.post<Conversation>('/api/conversations', body);
	}

	updateConversation(id: number, body: Partial<Conversation>): Promise<Conversation> {
		return this.put<Conversation>(`/api/conversations/${id}`, body);
	}

	deleteConversation(id: number): Promise<void> {
		return this.del<void>(`/api/conversations/${id}`);
	}

	addMessage(
		conversationId: number,
		body: Omit<ConversationMessage, 'id' | 'conversation_id' | 'created_at'>
	): Promise<ConversationMessage> {
		return this.post<ConversationMessage>(`/api/conversations/${conversationId}/messages`, body);
	}

	listMessages(conversationId: number): Promise<ConversationMessage[]> {
		return this.get<ConversationMessage[]>(`/api/conversations/${conversationId}/messages`);
	}

	// ── Turn targets ─────────────────────────────────────────────────────────

	listTurnTargets(conversationId: number): Promise<ConversationTurnTarget[]> {
		return this.get<ConversationTurnTarget[]>(`/api/conversation-turn-targets/conversation/${conversationId}`);
	}

	upsertTurnTarget(body: {
		conversation_id: number;
		user_sequence: number;
		target_reply: string;
		threshold?: number;
		weight?: number;
	}): Promise<ConversationTurnTarget> {
		return this.put<ConversationTurnTarget>('/api/conversation-turn-targets', body);
	}

	deleteTurnTarget(id: number): Promise<void> {
		return this.del<void>(`/api/conversation-turn-targets/${id}`);
	}

	// ── Suites ───────────────────────────────────────────────────────────────

	listSuites(): Promise<(TestSuite & { test_count: number })[]> {
		return this.get<(TestSuite & { test_count: number })[]>('/api/test-suites');
	}

	getSuite(id: number): Promise<TestSuite> {
		return this.get<TestSuite>(`/api/test-suites/${id}`);
	}

	createSuite(body: Omit<TestSuite, 'id' | 'created_at' | 'updated_at'>): Promise<TestSuite> {
		return this.post<TestSuite>('/api/test-suites', body);
	}

	deleteSuite(id: number): Promise<void> {
		return this.del<void>(`/api/test-suites/${id}`);
	}

	listSuiteEntries(suiteId: number): Promise<SuiteEntry[]> {
		return this.get<SuiteEntry[]>(`/api/test-suites/${suiteId}/entries`);
	}

	addSuiteEntry(
		suiteId: number,
		body: {
			sequence?: number;
			conversation_id?: number;
			child_suite_id?: number;
			agent_id_override?: number;
		}
	): Promise<SuiteEntry> {
		return this.post<SuiteEntry>(`/api/test-suites/${suiteId}/entries`, body);
	}

	deleteSuiteEntry(suiteId: number, entryId: number): Promise<void> {
		return this.del<void>(`/api/test-suites/${suiteId}/entries/${entryId}`);
	}

	// ── Execution ────────────────────────────────────────────────────────────

	executeConversation(agentId: number, conversationId: number): Promise<{ job_id: string }> {
		return this.post<{ job_id: string }>('/api/execute/conversation', {
			agent_id: agentId,
			conversation_id: conversationId
		});
	}

	executeSuite(suiteId: number, agentId: number): Promise<{ suite_run_id: number }> {
		return this.post<{ suite_run_id: number }>('/api/execute-suite', {
			suite_id: suiteId,
			agent_id: agentId
		});
	}

	// ── Jobs ─────────────────────────────────────────────────────────────────

	getJob(id: string): Promise<Job> {
		return this.get<Job>(`/api/jobs/${id}`);
	}

	// ── Suite runs ───────────────────────────────────────────────────────────

	getSuiteRun(id: number): Promise<SuiteRun> {
		return this.get<SuiteRun>(`/api/suite-runs/${id}`);
	}

	listSuiteRuns(filters?: { suite_id?: number; limit?: number }): Promise<{ data: SuiteRun[] }> {
		const params = new URLSearchParams();
		if (filters?.suite_id !== undefined) params.set('suite_id', String(filters.suite_id));
		if (filters?.limit !== undefined) params.set('limit', String(filters.limit));
		return this.get<{ data: SuiteRun[] }>(`/api/suite-runs?${params}`);
	}

	// ── Sessions ─────────────────────────────────────────────────────────────

	getSession(id: number): Promise<ExecutionSession> {
		return this.get<ExecutionSession>(`/api/sessions/${id}`);
	}

	getSessionTranscript(id: number): Promise<{ session: ExecutionSession; messages: SessionMessage[] }> {
		return this.get<{ session: ExecutionSession; messages: SessionMessage[] }>(`/api/sessions/${id}/transcript`);
	}

	listSessions(filters?: { conversation_id?: number; agent_id?: number }): Promise<ExecutionSession[]> {
		const params = new URLSearchParams();
		if (filters?.conversation_id !== undefined) params.set('conversation_id', String(filters.conversation_id));
		if (filters?.agent_id !== undefined) params.set('agent_id', String(filters.agent_id));
		return this.get<ExecutionSession[]>(`/api/sessions?${params}`);
	}

	// ── Templates ────────────────────────────────────────────────────────────

	listTemplates(): Promise<RequestTemplate[]> {
		return this.get<RequestTemplate[]>('/api/templates');
	}

	// ── Response maps ─────────────────────────────────────────────────────────

	listResponseMaps(): Promise<ResponseMap[]> {
		return this.get<ResponseMap[]>('/api/response-maps');
	}

	// ── Data transfer ─────────────────────────────────────────────────────────

	exportData(types: string[]): Promise<ExportBundle> {
		return this.get<ExportBundle>(`/api/data-transfer/export?types=${types.join(',')}`);
	}

	analyzeImport(bundle: ExportBundle): Promise<AnalysisReport> {
		return this.post<AnalysisReport>('/api/data-transfer/analyze', { bundle });
	}

	executeImport(req: ImportRequest): Promise<ImportResultSummary> {
		return this.post<ImportResultSummary>('/api/data-transfer/import', req);
	}
}
