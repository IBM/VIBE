import { preflightConversationExecution } from '../conversationPreflight';

describe('preflightConversationExecution', () => {
	it('passes when no requirements exist', () => {
		const res = preflightConversationExecution({
			agent_job_type: 'external_api',
			conversation: { id: 1, name: 'c1' },
			messages: [{ conversation_id: 1, sequence: 1, role: 'user', content: 'hi' }],
			agent_templates: [{ id: 10, is_default: 1, capabilities: null }],
			agent_response_maps: [{ id: 20, is_default: 1, capabilities: null }]
		});
		expect(res.ok).toBe(true);
	});

	it('fails when agent is not external_api but requirements exist', () => {
		const res = preflightConversationExecution({
			agent_job_type: 'crewai',
			conversation: { id: 1, name: 'c1', required_request_template_capabilities: '{"name":"openai-chat"}' },
			messages: [{ conversation_id: 1, sequence: 1, role: 'user', content: 'hi' }],
			agent_templates: [],
			agent_response_maps: []
		});
		expect(res.ok).toBe(false);
		expect(res.errors.join(' ')).toContain('not an external API agent');
	});

	it('fails when conversation references template id not present on agent', () => {
		const res = preflightConversationExecution({
			agent_job_type: 'external_api',
			conversation: { id: 1, name: 'c1', default_request_template_id: 999 },
			messages: [{ conversation_id: 1, sequence: 1, role: 'user', content: 'hi' }],
			agent_templates: [{ id: 10, is_default: 1, capabilities: '{"name":"custom"}' }],
			agent_response_maps: [{ id: 20, is_default: 1, capabilities: '{"name":"custom"}' }]
		});
		expect(res.ok).toBe(false);
		expect(res.errors.some((e) => e.includes('default request template id 999'))).toBe(true);
	});

	it('fails when capability requirement does not match', () => {
		const res = preflightConversationExecution({
			agent_job_type: 'external_api',
			conversation: { id: 1, name: 'c1', required_request_template_capabilities: '{"name":"openai-chat"}' },
			messages: [{ conversation_id: 1, sequence: 1, role: 'user', content: 'hi' }],
			agent_templates: [{ id: 10, is_default: 1, capabilities: '{"name":"custom"}' }],
			agent_response_maps: [{ id: 20, is_default: 1, capabilities: '{"name":"custom"}' }]
		});
		expect(res.ok).toBe(false);
		expect(res.errors.join(' ')).toContain('capability mismatch');
	});
	it('passes when capability names match', () => {
		const res = preflightConversationExecution({
			agent_job_type: 'external_api',
			conversation: { id: 1, name: 'c1', required_request_template_capabilities: '{"name":"openai-chat"}' },
			messages: [{ conversation_id: 1, sequence: 1, role: 'user', content: 'hi' }],
			agent_templates: [{ id: 10, is_default: 1, capabilities: '{"name":"openai-chat"}' }],
			agent_response_maps: [{ id: 20, is_default: 1, capabilities: '{"name":"openai-chat"}' }]
		});
		expect(res.ok).toBe(true);
	});

	it('fails when agent has no templates for external_api with user messages', () => {
		const res = preflightConversationExecution({
			agent_job_type: 'external_api',
			conversation: { id: 1, name: 'c1' },
			messages: [{ conversation_id: 1, sequence: 1, role: 'user', content: 'hi' }],
			agent_templates: [],
			agent_response_maps: [{ id: 20, is_default: 1, capabilities: null }]
		});
		expect(res.ok).toBe(false);
		expect(res.errors.join(' ')).toContain('no request templates');
	});

	it('fails when agent has no response maps for external_api with user messages', () => {
		const res = preflightConversationExecution({
			agent_job_type: 'external_api',
			conversation: { id: 1, name: 'c1' },
			messages: [{ conversation_id: 1, sequence: 1, role: 'user', content: 'hi' }],
			agent_templates: [{ id: 10, is_default: 1, capabilities: null }],
			agent_response_maps: []
		});
		expect(res.ok).toBe(false);
		expect(res.errors.join(' ')).toContain('no response maps');
	});

	it('fails when conversation references response map id not present on agent', () => {
		const res = preflightConversationExecution({
			agent_job_type: 'external_api',
			conversation: { id: 1, name: 'c1', default_response_map_id: 999 },
			messages: [{ conversation_id: 1, sequence: 1, role: 'user', content: 'hi' }],
			agent_templates: [{ id: 10, is_default: 1, capabilities: null }],
			agent_response_maps: [{ id: 20, is_default: 1, capabilities: null }]
		});
		expect(res.ok).toBe(false);
		expect(res.errors.some((e) => e.includes('default response map id 999'))).toBe(true);
	});

	it('fails when message references invalid template id', () => {
		const res = preflightConversationExecution({
			agent_job_type: 'external_api',
			conversation: { id: 1, name: 'c1' },
			messages: [{ conversation_id: 1, sequence: 1, role: 'user', content: 'hi', request_template_id: 999 }],
			agent_templates: [{ id: 10, is_default: 1, capabilities: null }],
			agent_response_maps: [{ id: 20, is_default: 1, capabilities: null }]
		});
		expect(res.ok).toBe(false);
		expect(res.errors.some((e) => e.includes('Message 1') && e.includes('template id 999'))).toBe(true);
	});

	it('fails when message references invalid response map id', () => {
		const res = preflightConversationExecution({
			agent_job_type: 'external_api',
			conversation: { id: 1, name: 'c1' },
			messages: [{ conversation_id: 1, sequence: 1, role: 'user', content: 'hi', response_map_id: 999 }],
			agent_templates: [{ id: 10, is_default: 1, capabilities: null }],
			agent_response_maps: [{ id: 20, is_default: 1, capabilities: null }]
		});
		expect(res.ok).toBe(false);
		expect(res.errors.some((e) => e.includes('Message 1') && e.includes('response map id 999'))).toBe(true);
	});

	it('passes with empty messages array', () => {
		const res = preflightConversationExecution({
			agent_job_type: 'external_api',
			conversation: { id: 1, name: 'c1' },
			messages: [],
			agent_templates: [{ id: 10, is_default: 1, capabilities: null }],
			agent_response_maps: [{ id: 20, is_default: 1, capabilities: null }]
		});
		expect(res.ok).toBe(true);
	});

	it('passes with only system messages', () => {
		const res = preflightConversationExecution({
			agent_job_type: 'external_api',
			conversation: { id: 1, name: 'c1' },
			messages: [{ conversation_id: 1, sequence: 1, role: 'system', content: 'system prompt' }],
			agent_templates: [],
			agent_response_maps: []
		});
		expect(res.ok).toBe(true);
	});

	it('handles mixed legacy and new ID references', () => {
		const res = preflightConversationExecution({
			agent_job_type: 'external_api',
			conversation: { id: 1, name: 'c1', default_request_template_id: 10 },
			messages: [
				{ conversation_id: 1, sequence: 1, role: 'user', content: 'hi', request_template_id: 11 },
				{ conversation_id: 1, sequence: 2, role: 'user', content: 'hello' }
			],
			agent_templates: [
				{ id: 10, is_default: 0, capabilities: null },
				{ id: 11, is_default: 1, capabilities: null }
			],
			agent_response_maps: [{ id: 20, is_default: 1, capabilities: null }]
		});
		expect(res.ok).toBe(true);
	});

	it('handles response map capability requirements', () => {
		const res = preflightConversationExecution({
			agent_job_type: 'external_api',
			conversation: { id: 1, name: 'c1', required_response_map_capabilities: '{"name":"openai-chat"}' },
			messages: [{ conversation_id: 1, sequence: 1, role: 'user', content: 'hi' }],
			agent_templates: [{ id: 10, is_default: 1, capabilities: '{"name":"openai-chat"}' }],
			agent_response_maps: [{ id: 20, is_default: 1, capabilities: '{"name":"openai-chat"}' }]
		});
		expect(res.ok).toBe(true);
	});

	it('fails when response map capability does not match', () => {
		const res = preflightConversationExecution({
			agent_job_type: 'external_api',
			conversation: { id: 1, name: 'c1', required_response_map_capabilities: '{"name":"openai-chat"}' },
			messages: [{ conversation_id: 1, sequence: 1, role: 'user', content: 'hi' }],
			agent_templates: [{ id: 10, is_default: 1, capabilities: '{"name":"openai-chat"}' }],
			agent_response_maps: [{ id: 20, is_default: 1, capabilities: '{"name":"custom"}' }]
		});
		expect(res.ok).toBe(false);
		expect(res.errors.join(' ')).toContain('capability mismatch');
	});

	it('passes for crewai agent without requirements', () => {
		const res = preflightConversationExecution({
			agent_job_type: 'crewai',
			conversation: { id: 1, name: 'c1' },
			messages: [{ conversation_id: 1, sequence: 1, role: 'user', content: 'hi' }],
			agent_templates: [],
			agent_response_maps: []
		});
		expect(res.ok).toBe(true);
	});

	it('handles empty string capability values', () => {
		const res = preflightConversationExecution({
			agent_job_type: 'external_api',
			conversation: { id: 1, name: 'c1', required_request_template_capabilities: '' },
			messages: [{ conversation_id: 1, sequence: 1, role: 'user', content: 'hi' }],
			agent_templates: [{ id: 10, is_default: 1, capabilities: null }],
			agent_response_maps: [{ id: 20, is_default: 1, capabilities: null }]
		});
		expect(res.ok).toBe(true);
	});

	it('handles undefined capability values', () => {
		const res = preflightConversationExecution({
			agent_job_type: 'external_api',
			conversation: { id: 1, name: 'c1' },
			messages: [{ conversation_id: 1, sequence: 1, role: 'user', content: 'hi' }],
			agent_templates: [{ id: 10, is_default: 1 }],
			agent_response_maps: [{ id: 20, is_default: 1 }]
		});
		expect(res.ok).toBe(true);
	});
});
