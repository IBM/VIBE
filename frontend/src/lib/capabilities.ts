// Re-export from shared package for convenience
import { extractCapabilityName } from '@ibm-vibe/config';
export { extractCapabilityName };

/**
 * Converts a capability name to JSON string for storage.
 * Returns undefined (not null) for compatibility with Conversation type.
 */
export const capabilityNameToJson = (name: string | null | undefined): string | undefined => {
	if (!name || !name.trim()) {
		return undefined;
	}
	return JSON.stringify({ name: name.trim() });
};

/**
 * Gets a display summary for capabilities.
 * Returns the capability name as a single-element array if defined, empty array otherwise.
 */
export const getCapabilitySummary = (value?: string | Record<string, unknown> | null): string[] => {
	const name = extractCapabilityName(value);
	return name ? [name] : [];
};

// Aliases for backward compatibility with existing code
export const getRequestTemplateCapabilitySummary = getCapabilitySummary;
export const getResponseMapCapabilitySummary = getCapabilitySummary;
