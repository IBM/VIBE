/**
 * Unit tests for template-capability matching utilities.
 * These tests don't require database access.
 */

import { extractCapabilityName, serializeCapabilities } from '../../lib/communicationCapabilities';

describe('Template-Capability Utils', () => {
	describe('extractCapabilityName', () => {
		it('should extract name from JSON capability', () => {
			expect(extractCapabilityName('{"name": "openai-chat"}')).toBe('openai-chat');
			expect(extractCapabilityName('{"name": "ollama-generate"}')).toBe('ollama-generate');
		});

		it('should extract name from legacy schema JSON', () => {
			expect(extractCapabilityName('{"schema": "legacy-cap"}')).toBe('legacy-cap');
		});

		it('should handle plain string capability', () => {
			expect(extractCapabilityName('openai-chat')).toBe('openai-chat');
		});

		it('should handle null/empty capability', () => {
			expect(extractCapabilityName(null)).toBeNull();
			expect(extractCapabilityName(undefined)).toBeNull();
			expect(extractCapabilityName('')).toBeNull();
		});

		it('should handle whitespace-only capability', () => {
			expect(extractCapabilityName('   ')).toBeNull();
			expect(extractCapabilityName('\n\t')).toBeNull();
		});

		it('should handle malformed JSON by returning as-is', () => {
			expect(extractCapabilityName('{invalid')).toBe('{invalid');
		});

		it('should handle JSON without name property', () => {
			expect(extractCapabilityName('{"type": "openai"}')).toBeNull();
			expect(extractCapabilityName('{}')).toBeNull();
		});
	});

	describe('serializeCapabilities', () => {
		it('should convert plain string to JSON format', () => {
			expect(serializeCapabilities('openai-chat')).toBe('{"name":"openai-chat"}');
		});

		it('should handle null/undefined', () => {
			expect(serializeCapabilities(null)).toBeNull();
			expect(serializeCapabilities(undefined)).toBeNull();
		});

		it('should handle empty string', () => {
			expect(serializeCapabilities('')).toBeNull();
			expect(serializeCapabilities('   ')).toBeNull();
		});

		it('should normalize existing JSON format', () => {
			expect(serializeCapabilities('{"name": "test"}')).toBe('{"name":"test"}');
		});

		it('should normalize legacy schema JSON format', () => {
			expect(serializeCapabilities('{"schema": "legacy"}')).toBe('{"name":"legacy"}');
		});

		it('should handle object input', () => {
			expect(serializeCapabilities({ name: 'test' })).toBe('{"name":"test"}');
		});

		it('should handle legacy schema object input', () => {
			expect(serializeCapabilities({ schema: 'legacy' })).toBe('{"name":"legacy"}');
		});

		it('should handle object without name', () => {
			expect(serializeCapabilities({ type: 'test' })).toBeNull();
		});
	});

	describe('round-trip conversion', () => {
		it('should serialize and extract consistently', () => {
			const capabilities = ['openai-chat', 'ollama-generate', 'anthropic-messages'];

			for (const cap of capabilities) {
				const serialized = serializeCapabilities(cap);
				const extracted = extractCapabilityName(serialized);
				expect(extracted).toBe(cap);
			}
		});

		it('should handle JSON input round-trip', () => {
			const json = '{"name": "test-cap"}';
			const serialized = serializeCapabilities(json);
			const extracted = extractCapabilityName(serialized);
			expect(extracted).toBe('test-cap');
		});
	});
});
