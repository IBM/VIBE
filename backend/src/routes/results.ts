import { Router } from 'express';
import type { Request, Response } from 'express';
import {
	getExecutionSessionsWithCount,
	getExecutionSessionById,
	getSessionMessages,
	getConversationById,
	createExecutionSession,
	addSessionMessage,
	countUserTurnsUpTo,
	getConversationTurnTarget,
	getConversationMessages
} from '../db/queries';
import type { TestResult } from '@ibm-vibe/types';
import { paginationConfig } from '../config';
import { hasPaginationParams, validatePaginationOrError } from '../utils/pagination';
import { extractTokenUsage, validateTokenUsage } from '../lib/tokenUsageExtractor';
import { sessionToLegacyResult, legacyResultToSession } from '../adapters/legacy-adapter';
import { testIdToConversationId } from '../lib/legacyIdResolver';
import { asyncHandler } from '../lib/asyncHandler';
import { logError, logWarn } from '../lib/logger';
import { parseIdParam } from '../lib/routeHelpers';

const router = Router();

// Get all results (from execution sessions)
router.get(
	'/',
	asyncHandler(async (req: Request, res: Response) => {
		try {
			const { agent_id, test_id } = req.query as { agent_id?: string; test_id?: string };

			// Map legacy filters to session filters
			const baseFilters: { agent_id?: number; conversation_id?: number } = {
				...(agent_id ? { agent_id: Number(agent_id) } : {}),
				...(test_id ? { conversation_id: Number(test_id) } : {}) // Map test_id to conversation_id TODO deprecate this
			};

			// If client supplied pagination, honor it
			if (hasPaginationParams(req)) {
				const paginationParams = validatePaginationOrError(req, res);
				if (!paginationParams) {
					return;
				}

				const { data, total } = getExecutionSessionsWithCount({ ...baseFilters, ...paginationParams });

				// Transform sessions to legacy results format
				const legacyResults = await Promise.all(
					data.map(async (session) => {
						const sessionMessages = await getSessionMessages(session.id!);
						const legacy = sessionToLegacyResult(session, sessionMessages);
						// Calculate success from per-turn similarity if available
						try {
							const assistant = sessionMessages.find((m) => m.role === 'assistant');
							if (
								assistant &&
								assistant.similarity_scoring_status === 'completed' &&
								typeof assistant.similarity_score === 'number'
							) {
								const k = countUserTurnsUpTo(session.id!, assistant.sequence);
								const target = getConversationTurnTarget(session.conversation_id, k);
								const threshold = target?.threshold ?? 70;
								legacy.success = assistant.similarity_score >= threshold;
							}
						} catch {}
						return legacy;
					})
				);

				return res.json({
					data: legacyResults,
					total,
					limit: paginationParams.limit,
					offset: paginationParams.offset || 0
				});
			}

			// Otherwise fall back to default pagination limit for large tables
			const defaultLimit = paginationConfig.defaultLargeLimit;
			const { data, total } = getExecutionSessionsWithCount({
				...baseFilters,
				limit: defaultLimit,
				offset: 0
			});

			// Transform sessions to legacy results format (with per-turn success from similarity)
			const legacyResults = await Promise.all(
				data.map(async (session) => {
					const sessionMessages = await getSessionMessages(session.id!);
					const legacy = sessionToLegacyResult(session, sessionMessages);
					try {
						const assistant = sessionMessages.find((m) => m.role === 'assistant');
						if (
							assistant &&
							assistant.similarity_scoring_status === 'completed' &&
							typeof assistant.similarity_score === 'number'
						) {
							const k = countUserTurnsUpTo(session.id!, assistant.sequence);
							const target = getConversationTurnTarget(session.conversation_id, k);
							const threshold = target?.threshold ?? 70;
							legacy.success = assistant.similarity_score >= threshold;
						}
					} catch {}
					return legacy;
				})
			);

			return res.json({
				data: legacyResults,
				total,
				limit: defaultLimit,
				offset: 0
			});
		} catch (error) {
			logError('Error fetching results:', error);
			return res.status(500).json({ error: 'Failed to fetch results' });
		}
	})
);

// Get result by ID (from execution session)
router.get(
	'/:id',
	asyncHandler(async (req: Request<{ id: string }>, res: Response) => {
		try {
			const idNum = parseIdParam(res, req.params.id, 'Invalid result ID');
			if (idNum === null) {
				return;
			}

			// Primary: treat id as session_id (tests -> conversations)
			const session = await getExecutionSessionById(idNum);
			if (session) {
				const sessionMessages = await getSessionMessages(idNum);
				const legacyResult = sessionToLegacyResult(session, sessionMessages);
				// Calculate success from per-turn similarity if available
				try {
					const assistant = sessionMessages.find((m) => m.role === 'assistant');
					if (
						assistant &&
						assistant.similarity_scoring_status === 'completed' &&
						typeof assistant.similarity_score === 'number'
					) {
						const k = countUserTurnsUpTo(session.id!, assistant.sequence);
						const target = getConversationTurnTarget(session.conversation_id, k);
						const threshold = target?.threshold ?? 70;
						legacyResult.success = assistant.similarity_score >= threshold;
					}
				} catch {}
				return res.json(legacyResult);
			}

			// Fallback: legacy results.id -> transform on the fly
			// TODO deprecate this
			// Note: access directly through queries to avoid route circular deps
			const legacy = (await import('../db/queries')) as typeof import('../db/queries');
			const legacyResultRow = legacy.getResultById?.(idNum);
			if (legacyResultRow) {
				// Build a minimal legacy result response compatible with frontend expectations
				// This mirrors the TestResult shape; scoring fields may be undefined
				const minimalLegacyResult: TestResult = {
					id: legacyResultRow.id,
					agent_id: legacyResultRow.agent_id,
					test_id: legacyResultRow.test_id,
					output: legacyResultRow.output,
					intermediate_steps: legacyResultRow.intermediate_steps,
					success: legacyResultRow.success,
					execution_time: legacyResultRow.execution_time,
					created_at: legacyResultRow.created_at,
					similarity_score: (legacyResultRow as any).similarity_score,
					similarity_scoring_status: (legacyResultRow as any).similarity_scoring_status,
					similarity_scoring_error: (legacyResultRow as any).similarity_scoring_error,
					similarity_scoring_metadata: (legacyResultRow as any).similarity_scoring_metadata,
					input_tokens: (legacyResultRow as any).input_tokens,
					output_tokens: (legacyResultRow as any).output_tokens,
					token_mapping_metadata: (legacyResultRow as any).token_mapping_metadata
				} as any;
				return res.json(minimalLegacyResult);
			}

			return res.status(404).json({ error: 'Result not found' });
		} catch (error) {
			logError('Error fetching result:', error);
			return res.status(500).json({ error: 'Failed to fetch result' });
		}
	})
);

// Score a result
router.post(
	'/:id/score',
	asyncHandler(async (req: Request<{ id: string }>, res: Response) => {
		try {
			const idNum = parseIdParam(res, req.params.id, 'Invalid result ID');
			const { llm_config_id } = req.body;

			if (idNum === null) {
				return;
			}

			// Import legacy queries dynamically to avoid circular deps
			const legacy = (await import('../db/queries')) as typeof import('../db/queries');
			const result = legacy.getResultById ? legacy.getResultById(idNum) : null;

			if (!result) {
				return res.status(404).json({ error: 'Result not found' });
			}

			const test = legacy.getTestById ? legacy.getTestById(result.test_id) : null;
			if (!test) {
				return res.status(404).json({ error: 'Test associated with result not found' });
			}

			const { scoringService } = await import('../services/scoring-service');
			await scoringService.scoreTestResult(result, test, llm_config_id);

			const updatedResult = legacy.getResultById ? legacy.getResultById(idNum) : null;
			return res.json(updatedResult);
		} catch (error) {
			logError('Error scoring result:', error);
			return res.status(500).json({ error: 'Failed to score result' });
		}
	})
);

// Create new result (as execution session)
router.post(
	'/',
	asyncHandler(
		async (req: Request<Record<string, never>, unknown, Omit<TestResult, 'id' | 'created_at'>>, res: Response) => {
			try {
				const processedBody = { ...req.body };

				// If token data isn't provided but we have intermediate steps, try to extract it
				if (!processedBody.input_tokens && !processedBody.output_tokens && processedBody.intermediate_steps) {
					try {
						const { tokens, metadata } = extractTokenUsage(
							null,
							undefined,
							processedBody.intermediate_steps
						);
						const validatedTokens = validateTokenUsage(tokens);

						if (validatedTokens.input_tokens !== undefined || validatedTokens.output_tokens !== undefined) {
							processedBody.input_tokens = validatedTokens.input_tokens;
							processedBody.output_tokens = validatedTokens.output_tokens;
							processedBody.token_mapping_metadata = JSON.stringify({
								...metadata,
								processed_during_result_creation: true,
								timestamp: new Date().toISOString()
							});
						}
					} catch (error) {
						logWarn('Failed to extract token usage from intermediate steps:', error);
					}
				} else if (processedBody.input_tokens !== undefined || processedBody.output_tokens !== undefined) {
					const tokens = {
						input_tokens: processedBody.input_tokens,
						output_tokens: processedBody.output_tokens
					};
					const validatedTokens = validateTokenUsage(tokens);
					processedBody.input_tokens = validatedTokens.input_tokens;
					processedBody.output_tokens = validatedTokens.output_tokens;
				}

				// Resolve legacy id mapping and fetch conversation for the test input
				// TODO deprecate this
				const conversationId = testIdToConversationId(processedBody.test_id) ?? processedBody.test_id;
				const conversation = await getConversationById(conversationId);
				if (!conversation) {
					return res.status(404).json({ error: 'Test not found' });
				}

				// Use the authored first user message content as the legacy input
				const authoredMessages = await getConversationMessages(conversationId);
				const firstUser = authoredMessages.find((m) => m.role === 'user');
				const inputContent = firstUser?.content || '';
				const { session, messages } = legacyResultToSession(
					{ ...processedBody, test_id: conversationId },
					inputContent
				);

				const createdSession = await createExecutionSession(session);

				// Add session messages
				const createdMessages = [];
				for (const message of messages) {
					const createdMessage = await addSessionMessage({
						session_id: createdSession.id!,
						...message
					});
					createdMessages.push(createdMessage);
				}

				// Transform back to legacy result format for response
				const legacyResult = sessionToLegacyResult(createdSession, createdMessages);

				const formattedResult = {
					...legacyResult,
					input_tokens: legacyResult.input_tokens ?? undefined,
					output_tokens: legacyResult.output_tokens ?? undefined
				};

				return res.status(201).json(formattedResult);
			} catch (error) {
				logError('Error creating result:', error);
				return res.status(500).json({ error: 'Failed to create result' });
			}
		}
	)
);

export default router;
