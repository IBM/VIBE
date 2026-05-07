import db from '../database';
import { Agent, AgentRequestTemplate, AgentResponseMap } from '@ibm-vibe/types';
import { serializeCapabilities } from '../../lib/communicationCapabilities';

/**
 * Create a new agent
 */
export const createAgent = (agent: Agent) => {
	// Ensure all required fields have default values
	const agentWithDefaults = {
		...agent,
		name: agent.name || '',
		version: agent.version || '',
		prompt: agent.prompt || '',
		settings: agent.settings || '{}'
	};

	const statement = db.prepare(`
		INSERT INTO agents (name, version, prompt, settings)
		VALUES (@name, @version, @prompt, @settings)
		RETURNING *
	`);
	return statement.get(agentWithDefaults) as Agent;
};

export const getAgents = () => {
	return db.prepare('SELECT * FROM agents ORDER BY created_at DESC').all() as Agent[];
};

export const getAgentById = (id: number) => {
	return db.prepare('SELECT * FROM agents WHERE id = ?').get(id) as Agent;
};

export const updateAgent = (id: number, agent: Partial<Agent>) => {
	// Filter out undefined values to avoid SQL errors
	const filteredAgent = Object.fromEntries(Object.entries(agent).filter(([_, value]) => value !== undefined));

	// If there are no fields to update, return the existing agent
	if (Object.keys(filteredAgent).length === 0) {
		return getAgentById(id);
	}

	const updates = Object.keys(filteredAgent)
		.filter((key) => key !== 'id' && key !== 'created_at')
		.map((key) => `${key} = @${key}`)
		.join(', ');

	const statement = db.prepare(`
		UPDATE agents
		SET ${updates}
		WHERE id = @id
		RETURNING *
	`);

	return statement.get({ ...filteredAgent, id }) as Agent;
};

export const deleteAgent = (id: number) => {
	const statement = db.prepare('DELETE FROM agents WHERE id = ?');
	return statement.run(id);
};

export const getAgentsWithCount = (
	params: { limit?: number; offset?: number } = {}
): { data: Agent[]; total: number } => {
	const { limit, offset } = params;
	let query = 'SELECT * FROM agents ORDER BY created_at DESC';
	const queryParams: any[] = [];

	if (limit !== undefined) {
		query += ' LIMIT ?';
		queryParams.push(limit);
	}
	if (offset !== undefined) {
		query += ' OFFSET ?';
		queryParams.push(offset);
	}

	const data = db.prepare(query).all(...queryParams) as Agent[];
	const totalResult = db.prepare('SELECT COUNT(*) as count FROM agents').get() as { count: number };

	return { data, total: totalResult.count };
};

export const getAgentsCount = (): number => {
	const row = db.prepare('SELECT COUNT(*) as count FROM agents').get() as { count: number };
	return row.count;
};

// Agent Request Templates
export function listAgentRequestTemplates(agentId: number): AgentRequestTemplate[] {
	const stmt = db.prepare(`
		SELECT * FROM agent_request_templates
		WHERE agent_id = ?
		ORDER BY created_at DESC, id DESC
	`);
	return stmt.all(agentId) as AgentRequestTemplate[];
}

export function getAgentRequestTemplateById(id: number): AgentRequestTemplate | undefined {
	const stmt = db.prepare(`SELECT * FROM agent_request_templates WHERE id = ?`);
	return stmt.get(id) as AgentRequestTemplate | undefined;
}

export function createAgentRequestTemplate(
	agentId: number,
	payload: Omit<AgentRequestTemplate, 'id' | 'agent_id' | 'created_at'>
): AgentRequestTemplate {
	const hadDefaultStmt = db.prepare(
		`SELECT id FROM agent_request_templates WHERE agent_id = ? AND is_default = 1 LIMIT 1`
	);
	const insertStmt = db.prepare(`
		INSERT INTO agent_request_templates (agent_id, name, description, engine, content_type, body, tags, capabilities, is_default)
		VALUES (@agent_id, @name, @description, @engine, @content_type, @body, @tags, @capabilities, @is_default)
		RETURNING *
	`);
	const clearDefaultStmt = db.prepare(`UPDATE agent_request_templates SET is_default = 0 WHERE agent_id = ?`);
	const setDefaultStmt = db.prepare(`UPDATE agent_request_templates SET is_default = 1 WHERE id = ?`);

	const tx = db.transaction(() => {
		const hadDefault = !!hadDefaultStmt.get(agentId);
		const wantsDefault = payload.is_default ? 1 : 0;

		if (wantsDefault) {
			clearDefaultStmt.run(agentId);
		}
		const row = insertStmt.get({
			agent_id: agentId,
			name: payload.name,
			description: payload.description ?? null,
			engine: payload.engine ?? 'handlebars',
			content_type: payload.content_type ?? 'application/json',
			body: payload.body,
			tags: payload.tags ?? null,
			capabilities: serializeCapabilities(payload.capabilities),
			is_default: wantsDefault
		}) as AgentRequestTemplate;

		if (!hadDefault && !wantsDefault && row?.id) {
			setDefaultStmt.run(row.id);
			row.is_default = 1;
		}
		return row;
	});
	return tx();
}

export function updateAgentRequestTemplate(
	id: number,
	updates: Partial<Omit<AgentRequestTemplate, 'id' | 'agent_id' | 'created_at'>>
): AgentRequestTemplate | undefined {
	// Handle default toggle inside a transaction
	const clearDefaultStmt = db.prepare(
		`UPDATE agent_request_templates SET is_default = 0 WHERE agent_id = (SELECT agent_id FROM agent_request_templates WHERE id = ?)`
	);
	const setDefaultStmt = db.prepare(`UPDATE agent_request_templates SET is_default = 1 WHERE id = ?`);

	const current = getAgentRequestTemplateById(id);
	if (!current) return undefined;

	const normalizedUpdates: typeof updates = { ...updates };
	if (Object.prototype.hasOwnProperty.call(updates, 'capabilities')) {
		normalizedUpdates.capabilities = serializeCapabilities(updates.capabilities);
	}

	const fields = Object.entries(normalizedUpdates)
		.filter(([k, v]) => v !== undefined && k !== 'is_default')
		.map(([k]) => `${k} = @${k}`);

	const updateStmt = db.prepare(`
		UPDATE agent_request_templates
		SET ${fields.length ? fields.join(', ') : 'name = name'}
		WHERE id = @id
		RETURNING *
	`);

	const tx = db.transaction(() => {
		const row = updateStmt.get({ id, ...normalizedUpdates }) as AgentRequestTemplate;
		if (updates.is_default) {
			clearDefaultStmt.run(id);
			setDefaultStmt.run(id);
			row.is_default = 1;
		}
		return row;
	});
	return tx();
}

export function deleteAgentRequestTemplate(id: number): void {
	const getAgentStmt = db.prepare(`SELECT agent_id, is_default FROM agent_request_templates WHERE id = ?`);
	const delStmt = db.prepare(`DELETE FROM agent_request_templates WHERE id = ?`);
	const ensureDefaultStmt = db.prepare(`
		UPDATE agent_request_templates
		SET is_default = 1
		WHERE id = (
			SELECT id FROM agent_request_templates
			WHERE agent_id = ?
			ORDER BY created_at DESC, id DESC
			LIMIT 1
		)
	`);

	const tx = db.transaction(() => {
		const row = getAgentStmt.get(id) as { agent_id: number; is_default: number } | undefined;
		if (!row) return;
		delStmt.run(id);
		if (row.is_default) {
			// if we deleted the default, promote the newest one as default (if any)
			const hasAny = db
				.prepare(`SELECT id FROM agent_request_templates WHERE agent_id = ? LIMIT 1`)
				.get(row.agent_id) as { id?: number } | undefined;
			const hasDefault = db
				.prepare(`SELECT id FROM agent_request_templates WHERE agent_id = ? AND is_default = 1 LIMIT 1`)
				.get(row.agent_id) as { id?: number } | undefined;
			if (hasAny && !hasDefault) {
				ensureDefaultStmt.run(row.agent_id);
			}
		}
	});
	tx();
}

export function setDefaultAgentRequestTemplate(agentId: number, templateId: number): void {
	const tx = db.transaction(() => {
		db.prepare(`UPDATE agent_request_templates SET is_default = 0 WHERE agent_id = ?`).run(agentId);
		db.prepare(`UPDATE agent_request_templates SET is_default = 1 WHERE id = ? AND agent_id = ?`).run(
			templateId,
			agentId
		);
	});
	tx();
}

// Agent Response Maps
export function listAgentResponseMaps(agentId: number): AgentResponseMap[] {
	const stmt = db.prepare(`
		SELECT * FROM agent_response_maps
		WHERE agent_id = ?
		ORDER BY created_at DESC, id DESC
	`);
	return stmt.all(agentId) as AgentResponseMap[];
}

export function getAgentResponseMapById(id: number): AgentResponseMap | undefined {
	const stmt = db.prepare(`SELECT * FROM agent_response_maps WHERE id = ?`);
	return stmt.get(id) as AgentResponseMap | undefined;
}

export function createAgentResponseMap(
	agentId: number,
	payload: Omit<AgentResponseMap, 'id' | 'agent_id' | 'created_at'>
): AgentResponseMap {
	const hadDefaultStmt = db.prepare(
		`SELECT id FROM agent_response_maps WHERE agent_id = ? AND is_default = 1 LIMIT 1`
	);
	const insertStmt = db.prepare(`
		INSERT INTO agent_response_maps (agent_id, name, description, spec, tags, capabilities, is_default)
		VALUES (@agent_id, @name, @description, @spec, @tags, @capabilities, @is_default)
		RETURNING *
	`);
	const clearDefaultStmt = db.prepare(`UPDATE agent_response_maps SET is_default = 0 WHERE agent_id = ?`);
	const setDefaultStmt = db.prepare(`UPDATE agent_response_maps SET is_default = 1 WHERE id = ?`);

	const tx = db.transaction(() => {
		const hadDefault = !!hadDefaultStmt.get(agentId);
		const wantsDefault = payload.is_default ? 1 : 0;

		if (wantsDefault) {
			clearDefaultStmt.run(agentId);
		}
		const row = insertStmt.get({
			agent_id: agentId,
			name: payload.name,
			description: payload.description ?? null,
			spec: payload.spec,
			tags: payload.tags ?? null,
			capabilities: serializeCapabilities(payload.capabilities),
			is_default: wantsDefault
		}) as AgentResponseMap;

		if (!hadDefault && !wantsDefault && row?.id) {
			setDefaultStmt.run(row.id);
			row.is_default = 1;
		}
		return row;
	});
	return tx();
}

export function updateAgentResponseMap(
	id: number,
	updates: Partial<Omit<AgentResponseMap, 'id' | 'agent_id' | 'created_at'>>
): AgentResponseMap | undefined {
	const clearDefaultStmt = db.prepare(
		`UPDATE agent_response_maps SET is_default = 0 WHERE agent_id = (SELECT agent_id FROM agent_response_maps WHERE id = ?)`
	);
	const setDefaultStmt = db.prepare(`UPDATE agent_response_maps SET is_default = 1 WHERE id = ?`);

	const current = getAgentResponseMapById(id);
	if (!current) return undefined;

	const normalizedUpdates: typeof updates = { ...updates };
	if (Object.prototype.hasOwnProperty.call(updates, 'capabilities')) {
		normalizedUpdates.capabilities = serializeCapabilities(updates.capabilities);
	}

	const fields = Object.entries(normalizedUpdates)
		.filter(([k, v]) => v !== undefined && k !== 'is_default')
		.map(([k]) => `${k} = @${k}`);

	const updateStmt = db.prepare(`
		UPDATE agent_response_maps
		SET ${fields.length ? fields.join(', ') : 'name = name'}
		WHERE id = @id
		RETURNING *
	`);

	const tx = db.transaction(() => {
		const row = updateStmt.get({ id, ...normalizedUpdates }) as AgentResponseMap;
		if (updates.is_default) {
			clearDefaultStmt.run(id);
			setDefaultStmt.run(id);
			row.is_default = 1;
		}
		return row;
	});
	return tx();
}

export function deleteAgentResponseMap(id: number): void {
	const getAgentStmt = db.prepare(`SELECT agent_id, is_default FROM agent_response_maps WHERE id = ?`);
	const delStmt = db.prepare(`DELETE FROM agent_response_maps WHERE id = ?`);
	const ensureDefaultStmt = db.prepare(`
		UPDATE agent_response_maps
		SET is_default = 1
		WHERE id = (
			SELECT id FROM agent_response_maps
			WHERE agent_id = ?
			ORDER BY created_at DESC, id DESC
			LIMIT 1
		)
	`);

	const tx = db.transaction(() => {
		const row = getAgentStmt.get(id) as { agent_id: number; is_default: number } | undefined;
		if (!row) {
			return;
		}
		delStmt.run(id);
		if (row.is_default) {
			const hasAny = db
				.prepare(`SELECT id FROM agent_response_maps WHERE agent_id = ? LIMIT 1`)
				.get(row.agent_id) as { id?: number } | undefined;
			const hasDefault = db
				.prepare(`SELECT id FROM agent_response_maps WHERE agent_id = ? AND is_default = 1 LIMIT 1`)
				.get(row.agent_id) as { id?: number } | undefined;
			if (hasAny && !hasDefault) {
				ensureDefaultStmt.run(row.agent_id);
			}
		}
	});
	tx();
}

export function setDefaultAgentResponseMap(agentId: number, mapId: number): void {
	const tx = db.transaction(() => {
		db.prepare(`UPDATE agent_response_maps SET is_default = 0 WHERE agent_id = ?`).run(agentId);
		db.prepare(`UPDATE agent_response_maps SET is_default = 1 WHERE id = ? AND agent_id = ?`).run(mapId, agentId);
	});
	tx();
}

/**
 * Extracts capability name from a capabilities JSON string.
 * Supports both `name` and legacy `schema` fields.
 */
function extractCapabilityNameFromJson(capabilitiesJson: string | null): string | null {
	if (!capabilitiesJson) {
		return null;
	}
	try {
		const parsed = JSON.parse(capabilitiesJson);
		return parsed?.name || parsed?.schema || null;
	} catch {
		return null;
	}
}

/**
 * Lists all distinct capability names used by request templates.
 * Returns an array of unique capability names, sorted alphabetically.
 */
export function listRequestTemplateCapabilityNames(): string[] {
	const rows = db
		.prepare(
			`
		SELECT DISTINCT capabilities FROM agent_request_templates
		WHERE capabilities IS NOT NULL AND capabilities != '{}'
	`
		)
		.all() as Array<{ capabilities: string }>;

	const names = new Set<string>();
	for (const row of rows) {
		const name = extractCapabilityNameFromJson(row.capabilities);
		if (name) {
			names.add(name);
		}
	}

	return Array.from(names).sort();
}

/**
 * Lists all distinct capability names used by response maps.
 * Returns an array of unique capability names, sorted alphabetically.
 */
export function listResponseMapCapabilityNames(): string[] {
	const rows = db
		.prepare(
			`
		SELECT DISTINCT capabilities FROM agent_response_maps
		WHERE capabilities IS NOT NULL AND capabilities != '{}'
	`
		)
		.all() as Array<{ capabilities: string }>;

	const names = new Set<string>();
	for (const row of rows) {
		const name = extractCapabilityNameFromJson(row.capabilities);
		if (name) {
			names.add(name);
		}
	}

	return Array.from(names).sort();
}
