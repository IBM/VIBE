import { Router } from 'express';
import type { Request, Response } from 'express';
import { z } from 'zod';
import { getAgentById, getConversationById, getConversationMessages } from '../db/queries';
import * as templateRepo from '../db/repositories/templateRepo';
import { jobQueue } from '../services/job-queue';
import { getAgentJobType } from '../utils/agent-utils';
import { preflightConversationExecution } from '../lib/conversationPreflight';
import { asyncHandler } from '../lib/asyncHandler';
import { validateBody } from '../lib/validateBody';
import { createLegacyTestExecutionJob, LegacyExecutionError } from '../services/legacy-execution';
import { logError } from '../lib/logger';

const router = Router();

interface ExecuteTestRequest {
	agent_id: number;
	test_id: number;
}

interface ExecuteConversationRequest {
	agent_id: number;
	conversation_id: number;
}

const executeTestRequestSchema = z.object({
	agent_id: z.coerce.number().int().positive(),
	test_id: z.coerce.number().int().positive()
});

const executeConversationRequestSchema = z.object({
	agent_id: z.coerce.number().int().positive(),
	conversation_id: z.coerce.number().int().positive()
});

// Legacy endpoint: Execute using test_id compatibility (maps to conversation execution).
// Prefer /api/execute/conversation for new clients.
router.post(
	'/',
	asyncHandler(async (req: Request<Record<string, never>, unknown, ExecuteTestRequest>, res: Response) => {
		try {
			const validated = validateBody(req, res, executeTestRequestSchema, {
				error: 'agent_id and test_id are required',
				includeDetails: false
			});
			if (!validated) {
				return;
			}
			const { agent_id, test_id } = validated;

			const { jobId } = await createLegacyTestExecutionJob(agent_id, test_id);

			// Return the job ID with 202 Accepted status
			return res.status(202).json({
				job_id: jobId,
				message: 'Test execution job created and queued for execution'
			});
		} catch (error: any) {
			if (error instanceof LegacyExecutionError) {
				return res.status(error.statusCode).json({ error: error.message });
			}
			logError('Error executing test:', error);
			return res.status(500).json({
				error: 'Failed to execute test',
				details: error instanceof Error ? error.message : 'Unknown error'
			});
		}
	})
);

// Execute a conversation with a specific agent
router.post(
	'/conversation',
	asyncHandler(async (req: Request<Record<string, never>, unknown, ExecuteConversationRequest>, res: Response) => {
		try {
			const validated = validateBody(req, res, executeConversationRequestSchema, {
				error: 'agent_id and conversation_id are required',
				includeDetails: false
			});
			if (!validated) {
				return;
			}
			const { agent_id, conversation_id } = validated;

			// Get agent and conversation from database
			const agent = await getAgentById(agent_id);
			const conversation = await getConversationById(conversation_id);

			if (!agent) {
				return res.status(404).json({ error: 'Agent not found' });
			}
			if (!conversation) {
				return res.status(404).json({ error: 'Conversation not found' });
			}

			// Preflight validation before enqueueing
			const jobType = getAgentJobType(agent.settings);

			if (jobType === 'external_api') {
				const messages = await getConversationMessages(conversation_id);
				const templates = templateRepo.getAgentTemplates(agent_id);
				const maps = templateRepo.getAgentResponseMaps(agent_id);
				const preflight = preflightConversationExecution({
					agent_job_type: jobType,
					conversation,
					messages,
					agent_templates: templates.map((t) => ({
						id: t.id!,
						is_default: t.is_default,
						capabilities: t.capability ?? null
					})),
					agent_response_maps: maps.map((m) => ({
						id: m.id!,
						is_default: m.is_default,
						capabilities: m.capability ?? null
					}))
				});
				if (!preflight.ok) {
					return res.status(400).json({
						error: 'Conversation cannot be executed with this agent',
						code: 'CONVERSATION_PREFLIGHT_FAILED',
						details: preflight.errors
					});
				}
			} else {
				// If this conversation declares external API capability requirements, fail early for non-external_api agents.
				const preflight = preflightConversationExecution({
					agent_job_type: jobType,
					conversation,
					messages: [],
					agent_templates: [],
					agent_response_maps: []
				});
				if (!preflight.ok) {
					return res.status(400).json({
						error: 'Conversation cannot be executed with this agent',
						code: 'CONVERSATION_PREFLIGHT_FAILED',
						details: preflight.errors
					});
				}
			}

			// Create a job to execute the conversation
			const jobId = await jobQueue.createConversationJob(agent_id, conversation_id);

			// Return the job ID with 202 Accepted status
			return res.status(202).json({
				job_id: jobId,
				message: 'Conversation execution job created and queued for execution'
			});
		} catch (error: any) {
			logError('Error executing conversation:', error);
			return res.status(500).json({
				error: 'Failed to execute conversation',
				details: error instanceof Error ? error.message : 'Unknown error'
			});
		}
	})
);

export default router;
