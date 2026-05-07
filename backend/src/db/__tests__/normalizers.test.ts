import { normalizeConversationMessageInsert, normalizeSuiteEntryInsert } from '../normalizers';

describe('normalizers', () => {
	describe('normalizeConversationMessageInsert', () => {
		it('should normalize a complete message with all fields', () => {
			const input = {
				conversation_id: 1,
				sequence: 2,
				role: 'assistant',
				content: 'Hello world',
				metadata: { key: 'value' },
				request_template_id: 10,
				response_map_id: 20,
				set_variables: { var1: 'val1' }
			};

			const result = normalizeConversationMessageInsert(input);

			expect(result).toEqual({
				conversation_id: 1,
				sequence: 2,
				role: 'assistant',
				content: 'Hello world',
				metadata: '{"key":"value"}',
				request_template_id: 10,
				response_map_id: 20,
				set_variables: '{"var1":"val1"}'
			});
		});

		it('should use default values for missing optional fields', () => {
			const input = {
				conversation_id: 1
			};

			const result = normalizeConversationMessageInsert(input);

			expect(result).toEqual({
				conversation_id: 1,
				sequence: 1,
				role: 'user',
				content: '',
				metadata: null,
				request_template_id: null,
				response_map_id: null,
				set_variables: null
			});
		});

		it('should convert conversation_id to number', () => {
			const input = {
				conversation_id: '5' as any
			};

			const result = normalizeConversationMessageInsert(input);

			expect(result.conversation_id).toBe(5);
			expect(typeof result.conversation_id).toBe('number');
		});

		it('should convert sequence to number', () => {
			const input = {
				conversation_id: 1,
				sequence: '10' as any
			};

			const result = normalizeConversationMessageInsert(input);

			expect(result.sequence).toBe(10);
			expect(typeof result.sequence).toBe('number');
		});

		it('should convert non-string role to string', () => {
			const input = {
				conversation_id: 1,
				role: 123 as any
			};

			const result = normalizeConversationMessageInsert(input);

			expect(result.role).toBe('123');
			expect(typeof result.role).toBe('string');
		});

		it('should convert non-string content to string', () => {
			const input = {
				conversation_id: 1,
				content: 456 as any
			};

			const result = normalizeConversationMessageInsert(input);

			expect(result.content).toBe('456');
			expect(typeof result.content).toBe('string');
		});

		it('should handle null metadata', () => {
			const input = {
				conversation_id: 1,
				metadata: null
			};

			const result = normalizeConversationMessageInsert(input);

			expect(result.metadata).toBeNull();
		});

		it('should handle undefined metadata', () => {
			const input = {
				conversation_id: 1,
				metadata: undefined
			};

			const result = normalizeConversationMessageInsert(input);

			expect(result.metadata).toBeNull();
		});

		it('should keep string metadata as-is', () => {
			const input = {
				conversation_id: 1,
				metadata: '{"already":"json"}'
			};

			const result = normalizeConversationMessageInsert(input);

			expect(result.metadata).toBe('{"already":"json"}');
		});

		it('should stringify object metadata', () => {
			const input = {
				conversation_id: 1,
				metadata: { test: 'data', nested: { value: 123 } }
			};

			const result = normalizeConversationMessageInsert(input);

			expect(result.metadata).toBe('{"test":"data","nested":{"value":123}}');
		});

		it('should handle circular reference in metadata gracefully', () => {
			const circular: any = { a: 1 };
			circular.self = circular;

			const input = {
				conversation_id: 1,
				metadata: circular
			};

			const result = normalizeConversationMessageInsert(input);

			expect(result.metadata).toBeNull();
		});

		it('should convert request_template_id to number', () => {
			const input = {
				conversation_id: 1,
				request_template_id: '15' as any
			};

			const result = normalizeConversationMessageInsert(input);

			expect(result.request_template_id).toBe(15);
			expect(typeof result.request_template_id).toBe('number');
		});

		it('should handle null request_template_id', () => {
			const input = {
				conversation_id: 1,
				request_template_id: null
			};

			const result = normalizeConversationMessageInsert(input);

			expect(result.request_template_id).toBeNull();
		});

		it('should handle undefined request_template_id', () => {
			const input = {
				conversation_id: 1,
				request_template_id: undefined
			};

			const result = normalizeConversationMessageInsert(input);

			expect(result.request_template_id).toBeNull();
		});

		it('should convert response_map_id to number', () => {
			const input = {
				conversation_id: 1,
				response_map_id: '25' as any
			};

			const result = normalizeConversationMessageInsert(input);

			expect(result.response_map_id).toBe(25);
			expect(typeof result.response_map_id).toBe('number');
		});

		it('should handle null response_map_id', () => {
			const input = {
				conversation_id: 1,
				response_map_id: null
			};

			const result = normalizeConversationMessageInsert(input);

			expect(result.response_map_id).toBeNull();
		});

		it('should handle undefined response_map_id', () => {
			const input = {
				conversation_id: 1,
				response_map_id: undefined
			};

			const result = normalizeConversationMessageInsert(input);

			expect(result.response_map_id).toBeNull();
		});

		it('should handle null set_variables', () => {
			const input = {
				conversation_id: 1,
				set_variables: null
			};

			const result = normalizeConversationMessageInsert(input);

			expect(result.set_variables).toBeNull();
		});

		it('should handle undefined set_variables', () => {
			const input = {
				conversation_id: 1,
				set_variables: undefined
			};

			const result = normalizeConversationMessageInsert(input);

			expect(result.set_variables).toBeNull();
		});

		it('should keep string set_variables as-is', () => {
			const input = {
				conversation_id: 1,
				set_variables: '{"var":"value"}'
			};

			const result = normalizeConversationMessageInsert(input);

			expect(result.set_variables).toBe('{"var":"value"}');
		});

		it('should stringify object set_variables', () => {
			const input = {
				conversation_id: 1,
				set_variables: { variable1: 'value1', variable2: 'value2' }
			};

			const result = normalizeConversationMessageInsert(input);

			expect(result.set_variables).toBe('{"variable1":"value1","variable2":"value2"}');
		});

		it('should handle circular reference in set_variables gracefully', () => {
			const circular: any = { b: 2 };
			circular.self = circular;

			const input = {
				conversation_id: 1,
				set_variables: circular
			};

			const result = normalizeConversationMessageInsert(input);

			expect(result.set_variables).toBeNull();
		});
	});

	describe('normalizeSuiteEntryInsert', () => {
		it('should normalize a complete suite entry with all fields', () => {
			const input = {
				parent_suite_id: 1,
				sequence: 5,
				test_id: 10,
				conversation_id: 20,
				child_suite_id: 30,
				agent_id_override: 40
			};

			const result = normalizeSuiteEntryInsert(input);

			expect(result).toEqual({
				parent_suite_id: 1,
				sequence: 5,
				test_id: 10,
				conversation_id: 20,
				child_suite_id: 30,
				agent_id_override: 40
			});
		});

		it('should use null for missing optional fields', () => {
			const input = {
				parent_suite_id: 1
			};

			const result = normalizeSuiteEntryInsert(input);

			expect(result).toEqual({
				parent_suite_id: 1,
				sequence: null,
				test_id: null,
				conversation_id: null,
				child_suite_id: null,
				agent_id_override: null
			});
		});

		it('should convert parent_suite_id to number', () => {
			const input = {
				parent_suite_id: '5' as any
			};

			const result = normalizeSuiteEntryInsert(input);

			expect(result.parent_suite_id).toBe(5);
			expect(typeof result.parent_suite_id).toBe('number');
		});

		it('should convert sequence to number', () => {
			const input = {
				parent_suite_id: 1,
				sequence: '10' as any
			};

			const result = normalizeSuiteEntryInsert(input);

			expect(result.sequence).toBe(10);
			expect(typeof result.sequence).toBe('number');
		});

		it('should handle undefined sequence', () => {
			const input = {
				parent_suite_id: 1,
				sequence: undefined
			};

			const result = normalizeSuiteEntryInsert(input);

			expect(result.sequence).toBeNull();
		});

		it('should convert test_id to number', () => {
			const input = {
				parent_suite_id: 1,
				test_id: '15' as any
			};

			const result = normalizeSuiteEntryInsert(input);

			expect(result.test_id).toBe(15);
			expect(typeof result.test_id).toBe('number');
		});

		it('should handle undefined test_id', () => {
			const input = {
				parent_suite_id: 1,
				test_id: undefined
			};

			const result = normalizeSuiteEntryInsert(input);

			expect(result.test_id).toBeNull();
		});

		it('should convert conversation_id to number', () => {
			const input = {
				parent_suite_id: 1,
				conversation_id: '20' as any
			};

			const result = normalizeSuiteEntryInsert(input);

			expect(result.conversation_id).toBe(20);
			expect(typeof result.conversation_id).toBe('number');
		});

		it('should handle undefined conversation_id', () => {
			const input = {
				parent_suite_id: 1,
				conversation_id: undefined
			};

			const result = normalizeSuiteEntryInsert(input);

			expect(result.conversation_id).toBeNull();
		});

		it('should convert child_suite_id to number', () => {
			const input = {
				parent_suite_id: 1,
				child_suite_id: '25' as any
			};

			const result = normalizeSuiteEntryInsert(input);

			expect(result.child_suite_id).toBe(25);
			expect(typeof result.child_suite_id).toBe('number');
		});

		it('should handle undefined child_suite_id', () => {
			const input = {
				parent_suite_id: 1,
				child_suite_id: undefined
			};

			const result = normalizeSuiteEntryInsert(input);

			expect(result.child_suite_id).toBeNull();
		});

		it('should convert agent_id_override to number', () => {
			const input = {
				parent_suite_id: 1,
				agent_id_override: '30' as any
			};

			const result = normalizeSuiteEntryInsert(input);

			expect(result.agent_id_override).toBe(30);
			expect(typeof result.agent_id_override).toBe('number');
		});

		it('should handle undefined agent_id_override', () => {
			const input = {
				parent_suite_id: 1,
				agent_id_override: undefined
			};

			const result = normalizeSuiteEntryInsert(input);

			expect(result.agent_id_override).toBeNull();
		});

		it('should handle entry with only test_id', () => {
			const input = {
				parent_suite_id: 1,
				test_id: 100
			};

			const result = normalizeSuiteEntryInsert(input);

			expect(result).toEqual({
				parent_suite_id: 1,
				sequence: null,
				test_id: 100,
				conversation_id: null,
				child_suite_id: null,
				agent_id_override: null
			});
		});

		it('should handle entry with only conversation_id', () => {
			const input = {
				parent_suite_id: 1,
				conversation_id: 200
			};

			const result = normalizeSuiteEntryInsert(input);

			expect(result).toEqual({
				parent_suite_id: 1,
				sequence: null,
				test_id: null,
				conversation_id: 200,
				child_suite_id: null,
				agent_id_override: null
			});
		});

		it('should handle entry with only child_suite_id', () => {
			const input = {
				parent_suite_id: 1,
				child_suite_id: 300
			};

			const result = normalizeSuiteEntryInsert(input);

			expect(result).toEqual({
				parent_suite_id: 1,
				sequence: null,
				test_id: null,
				conversation_id: null,
				child_suite_id: 300,
				agent_id_override: null
			});
		});
	});
});

// Made with Bob
