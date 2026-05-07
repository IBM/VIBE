import { frontendConfig } from '../runtimeConfig';

export const API_URL = frontendConfig.apiUrl;

type JsonObject = Record<string, unknown>;

const parseJsonSafe = (value: string): JsonObject | null => {
	try {
		const parsed = JSON.parse(value);
		return parsed && typeof parsed === 'object' ? (parsed as JsonObject) : null;
	} catch {
		return null;
	}
};

const getContentType = (response: Response): string => {
	const responseLike = response as Response & { headers?: { get?: (name: string) => string | null } };
	if (typeof responseLike.headers?.get !== 'function') {
		return '';
	}
	return String(responseLike.headers.get('content-type') || '').toLowerCase();
};

const shouldTreatAsJson = (response: Response): boolean => {
	const contentType = getContentType(response);
	// Missing content type is common in tests/mocks; default to JSON-first behavior.
	if (!contentType) {
		return true;
	}
	return contentType.includes('application/json') || contentType.includes('+json');
};

const tryReadJson = async (response: Response): Promise<unknown | undefined> => {
	const responseLike = response as Response & { json?: () => Promise<unknown> };
	if (typeof responseLike.json !== 'function') {
		return undefined;
	}
	try {
		return await responseLike.json();
	} catch {
		return undefined;
	}
};

const tryReadText = async (response: Response): Promise<string> => {
	const responseLike = response as Response & { text?: () => Promise<string> };
	if (typeof responseLike.text !== 'function') {
		return '';
	}
	try {
		return await responseLike.text();
	} catch {
		return '';
	}
};

export async function fetchJson<T>(url: string, options?: RequestInit, fallbackMessage = 'Request failed'): Promise<T> {
	const response = options ? await fetch(url, options) : await fetch(url);

	if (!response.ok) {
		let errorJson: JsonObject | null = null;
		if (shouldTreatAsJson(response)) {
			const jsonValue = await tryReadJson(response);
			if (jsonValue && typeof jsonValue === 'object') {
				errorJson = jsonValue as JsonObject;
			} else {
				const rawBody = await tryReadText(response);
				errorJson = rawBody ? parseJsonSafe(rawBody) : null;
			}
		}

		const errorMessage =
			typeof errorJson?.error === 'string' && errorJson.error
				? errorJson.error
				: `${fallbackMessage} (Status: ${response.status})`;
		throw new Error(errorMessage);
	}

	if (response.status === 204) {
		return undefined as T;
	}

	if (shouldTreatAsJson(response)) {
		const jsonValue = await tryReadJson(response);
		if (jsonValue !== undefined) {
			return jsonValue as T;
		}
	}

	const rawBody = await tryReadText(response);
	if (!rawBody) return undefined as T;

	const parsedJson = parseJsonSafe(rawBody);
	if (parsedJson !== null) {
		return parsedJson as T;
	}

	return rawBody as T;
}
