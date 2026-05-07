import type { ConversationTurnTarget } from '@ibm-vibe/types';
import { api } from './api';

export const DEFAULT_SIMILARITY_THRESHOLD = 70;

export function getUserTurnForAssistantMessage(
	messages: Array<{ role: string; sequence: number }>,
	assistantMessageSequence: number
): number {
	return messages.filter((m) => m.role === 'user' && m.sequence <= assistantMessageSequence).length;
}

export function getThresholdForTurn(
	conversationId: number | null | undefined,
	userSequence: number,
	turnTargetsMap?: Map<number, Map<number, number>>
): number {
	if (!conversationId || !turnTargetsMap) {
		return DEFAULT_SIMILARITY_THRESHOLD;
	}

	const thresholdsForConversation = turnTargetsMap.get(conversationId);
	if (!thresholdsForConversation) {
		return DEFAULT_SIMILARITY_THRESHOLD;
	}

	const threshold = thresholdsForConversation.get(userSequence);
	return typeof threshold === 'number' ? threshold : DEFAULT_SIMILARITY_THRESHOLD;
}

export async function loadTurnTargetsMap(conversationIds: number[]): Promise<Map<number, Map<number, number>>> {
	const result = new Map<number, Map<number, number>>();
	if (conversationIds.length === 0) {
		return result;
	}

	const uniqueIds = Array.from(new Set(conversationIds));
	const promises = uniqueIds.map(async (conversationId) => {
		try {
			const targets: ConversationTurnTarget[] = await api.getConversationTurnTargets(conversationId);
			const thresholds = new Map<number, number>();
			for (const target of targets) {
				if (typeof target.threshold === 'number') {
					thresholds.set(target.user_sequence, target.threshold);
				}
			}
			return [conversationId, thresholds] as const;
		} catch {
			return [conversationId, new Map<number, number>()] as const;
		}
	});

	const entries = await Promise.all(promises);
	for (const [conversationId, thresholds] of entries) {
		result.set(conversationId, thresholds);
	}

	return result;
}
