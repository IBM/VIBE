/**
 * Repository for global request templates and response maps.
 *
 * Templates are global resources that can be linked to multiple agents.
 * This replaces the agent-scoped templates with a more flexible many-to-many relationship.
 */

import db from '../database';

// Types for global templates (no agent_id)
export interface RequestTemplate {
	id?: number;
	name: string;
	description?: string;
	capability?: string;
	body: string;
	created_at?: string;
}

export interface ResponseMap {
	id?: number;
	name: string;
	description?: string;
	capability?: string;
	spec: string;
	created_at?: string;
}

// Types for agent-linked templates (includes is_default from junction table)
export interface AgentLinkedTemplate extends RequestTemplate {
	is_default?: number | boolean;
}

export interface AgentLinkedResponseMap extends ResponseMap {
	is_default?: number | boolean;
}

// =====================
// REQUEST TEMPLATES CRUD
// =====================

/**
 * Create a new global request template.
 */
export function createRequestTemplate(payload: Omit<RequestTemplate, 'id' | 'created_at'>): RequestTemplate {
	const stmt = db.prepare(`
		INSERT INTO request_templates (name, description, capability, body)
		VALUES (@name, @description, @capability, @body)
		RETURNING *
	`);
	return stmt.get({
		name: payload.name,
		description: payload.description ?? null,
		capability: payload.capability ?? null,
		body: payload.body
	}) as RequestTemplate;
}

/**
 * List all request templates, optionally filtered by capability.
 */
export function listRequestTemplates(filters?: { capability?: string }): RequestTemplate[] {
	if (filters?.capability) {
		// Filter by capability name (parse JSON if needed)
		const stmt = db.prepare(`
			SELECT * FROM request_templates
			WHERE capability IS NOT NULL
			ORDER BY created_at DESC, id DESC
		`);
		const all = stmt.all() as RequestTemplate[];
		return all.filter((t) => {
			const capName = extractCapabilityName(t.capability);
			return capName === filters.capability;
		});
	}
	const stmt = db.prepare(`
		SELECT * FROM request_templates
		ORDER BY created_at DESC, id DESC
	`);
	return stmt.all() as RequestTemplate[];
}

/**
 * Get a request template by ID.
 */
export function getRequestTemplateById(id: number): RequestTemplate | undefined {
	const stmt = db.prepare(`SELECT * FROM request_templates WHERE id = ?`);
	return stmt.get(id) as RequestTemplate | undefined;
}

/**
 * Update a request template.
 */
export function updateRequestTemplate(
	id: number,
	updates: Partial<Omit<RequestTemplate, 'id' | 'created_at'>>
): RequestTemplate | undefined {
	const current = getRequestTemplateById(id);
	if (!current) return undefined;

	const fields = Object.entries(updates)
		.filter(([_, v]) => v !== undefined)
		.map(([k]) => `${k} = @${k}`);

	if (fields.length === 0) {
		return current;
	}

	const stmt = db.prepare(`
		UPDATE request_templates
		SET ${fields.join(', ')}
		WHERE id = @id
		RETURNING *
	`);

	return stmt.get({ id, ...updates }) as RequestTemplate;
}

/**
 * Delete a request template.
 * This will cascade to remove all agent links.
 */
export function deleteRequestTemplate(id: number): void {
	const stmt = db.prepare(`DELETE FROM request_templates WHERE id = ?`);
	stmt.run(id);
}

// =====================
// RESPONSE MAPS CRUD
// =====================

/**
 * Create a new global response map.
 */
export function createResponseMap(payload: Omit<ResponseMap, 'id' | 'created_at'>): ResponseMap {
	const stmt = db.prepare(`
		INSERT INTO response_maps (name, description, capability, spec)
		VALUES (@name, @description, @capability, @spec)
		RETURNING *
	`);
	return stmt.get({
		name: payload.name,
		description: payload.description ?? null,
		capability: payload.capability ?? null,
		spec: payload.spec
	}) as ResponseMap;
}

/**
 * List all response maps, optionally filtered by capability.
 */
export function listResponseMaps(filters?: { capability?: string }): ResponseMap[] {
	if (filters?.capability) {
		const stmt = db.prepare(`
			SELECT * FROM response_maps
			WHERE capability IS NOT NULL
			ORDER BY created_at DESC, id DESC
		`);
		const all = stmt.all() as ResponseMap[];
		return all.filter((m) => {
			const capName = extractCapabilityName(m.capability);
			return capName === filters.capability;
		});
	}
	const stmt = db.prepare(`
		SELECT * FROM response_maps
		ORDER BY created_at DESC, id DESC
	`);
	return stmt.all() as ResponseMap[];
}

/**
 * Get a response map by ID.
 */
export function getResponseMapById(id: number): ResponseMap | undefined {
	const stmt = db.prepare(`SELECT * FROM response_maps WHERE id = ?`);
	return stmt.get(id) as ResponseMap | undefined;
}

/**
 * Update a response map.
 */
export function updateResponseMap(
	id: number,
	updates: Partial<Omit<ResponseMap, 'id' | 'created_at'>>
): ResponseMap | undefined {
	const current = getResponseMapById(id);
	if (!current) return undefined;

	const fields = Object.entries(updates)
		.filter(([_, v]) => v !== undefined)
		.map(([k]) => `${k} = @${k}`);

	if (fields.length === 0) {
		return current;
	}

	const stmt = db.prepare(`
		UPDATE response_maps
		SET ${fields.join(', ')}
		WHERE id = @id
		RETURNING *
	`);

	return stmt.get({ id, ...updates }) as ResponseMap;
}

/**
 * Delete a response map.
 * This will cascade to remove all agent links.
 */
export function deleteResponseMap(id: number): void {
	const stmt = db.prepare(`DELETE FROM response_maps WHERE id = ?`);
	stmt.run(id);
}

// =====================
// UNIQUE NAME HELPERS
// =====================

const findUniqueName = (table: 'request_templates' | 'response_maps', baseName: string, agentName?: string): string => {
	const trimmedBase = baseName.trim();
	const suffixRoot = agentName?.trim() ? agentName.trim() : 'copy';
	const existsStmt = db.prepare(`SELECT 1 FROM ${table} WHERE name = ? LIMIT 1`);
	const exists = (name: string) => !!existsStmt.get(name);

	if (!exists(trimmedBase)) {
		return trimmedBase;
	}

	const candidate = `${trimmedBase} (${suffixRoot})`;
	if (!exists(candidate)) {
		return candidate;
	}

	let counter = 2;
	while (exists(`${trimmedBase} (${suffixRoot} ${counter})`)) {
		counter += 1;
	}

	return `${trimmedBase} (${suffixRoot} ${counter})`;
};

export function getUniqueRequestTemplateName(baseName: string, agentName?: string): string {
	return findUniqueName('request_templates', baseName, agentName);
}

export function getUniqueResponseMapName(baseName: string, agentName?: string): string {
	return findUniqueName('response_maps', baseName, agentName);
}

type LinkTableConfig = {
	table: 'agent_template_links' | 'agent_response_map_links';
	resourceColumn: 'template_id' | 'response_map_id';
};

const TEMPLATE_LINKS: LinkTableConfig = {
	table: 'agent_template_links',
	resourceColumn: 'template_id'
};

const RESPONSE_MAP_LINKS: LinkTableConfig = {
	table: 'agent_response_map_links',
	resourceColumn: 'response_map_id'
};

function linkResourceToAgent(config: LinkTableConfig, agentId: number, resourceId: number, isDefault?: boolean): void {
	const tx = db.transaction(() => {
		const existingLink = db
			.prepare(
				`
			SELECT is_default
			FROM ${config.table}
			WHERE agent_id = ? AND ${config.resourceColumn} = ?
		`
			)
			.get(agentId, resourceId) as { is_default?: number } | undefined;

		const hasDefault = !!db
			.prepare(
				`
			SELECT 1 FROM ${config.table}
			WHERE agent_id = ? AND is_default = 1 LIMIT 1
		`
			)
			.get(agentId);

		if (isDefault) {
			db.prepare(`UPDATE ${config.table} SET is_default = 0 WHERE agent_id = ?`).run(agentId);
			if (existingLink) {
				db.prepare(
					`
					UPDATE ${config.table}
					SET is_default = 1
					WHERE agent_id = ? AND ${config.resourceColumn} = ?
				`
				).run(agentId, resourceId);
			} else {
				db.prepare(
					`
					INSERT INTO ${config.table} (agent_id, ${config.resourceColumn}, is_default, linked_at)
					VALUES (?, ?, 1, CURRENT_TIMESTAMP)
				`
				).run(agentId, resourceId);
			}
			return;
		}

		if (!hasDefault) {
			if (existingLink) {
				db.prepare(
					`
					UPDATE ${config.table}
					SET is_default = 1
					WHERE agent_id = ? AND ${config.resourceColumn} = ?
				`
				).run(agentId, resourceId);
			} else {
				db.prepare(
					`
					INSERT INTO ${config.table} (agent_id, ${config.resourceColumn}, is_default, linked_at)
					VALUES (?, ?, 1, CURRENT_TIMESTAMP)
				`
				).run(agentId, resourceId);
			}
			return;
		}

		if (!existingLink) {
			db.prepare(
				`
				INSERT INTO ${config.table} (agent_id, ${config.resourceColumn}, is_default, linked_at)
				VALUES (?, ?, 0, CURRENT_TIMESTAMP)
			`
			).run(agentId, resourceId);
		}
	});
	tx();
}

function unlinkResourceFromAgent(config: LinkTableConfig, agentId: number, resourceId: number): void {
	const tx = db.transaction(() => {
		const existing = db
			.prepare(
				`
			SELECT is_default
			FROM ${config.table}
			WHERE agent_id = ? AND ${config.resourceColumn} = ?
		`
			)
			.get(agentId, resourceId) as { is_default?: number } | undefined;

		db.prepare(
			`
			DELETE FROM ${config.table}
			WHERE agent_id = ? AND ${config.resourceColumn} = ?
		`
		).run(agentId, resourceId);

		if (existing?.is_default) {
			const replacement = db
				.prepare(
					`
				SELECT ${config.resourceColumn} as resource_id
				FROM ${config.table}
				WHERE agent_id = ?
				ORDER BY linked_at DESC, ${config.resourceColumn} DESC
				LIMIT 1
			`
				)
				.get(agentId) as { resource_id?: number } | undefined;

			if (replacement?.resource_id) {
				db.prepare(
					`
					UPDATE ${config.table}
					SET is_default = 1
					WHERE agent_id = ? AND ${config.resourceColumn} = ?
				`
				).run(agentId, replacement.resource_id);
			}
		}
	});
	tx();
}

function setAgentDefaultResource(config: LinkTableConfig, agentId: number, resourceId: number): void {
	const tx = db.transaction(() => {
		db.prepare(`UPDATE ${config.table} SET is_default = 0 WHERE agent_id = ?`).run(agentId);
		db.prepare(
			`
			UPDATE ${config.table}
			SET is_default = 1
			WHERE agent_id = ? AND ${config.resourceColumn} = ?
		`
		).run(agentId, resourceId);
	});
	tx();
}

function getAgentResourceLink(
	config: LinkTableConfig,
	agentId: number,
	resourceId: number
): { is_default?: number; linked_at?: string } | undefined {
	const stmt = db.prepare(`
		SELECT is_default, linked_at
		FROM ${config.table}
		WHERE agent_id = ? AND ${config.resourceColumn} = ?
	`);
	return stmt.get(agentId, resourceId) as { is_default?: number; linked_at?: string } | undefined;
}

function getResourceLinkCount(config: LinkTableConfig, resourceId: number): number {
	const row = db
		.prepare(
			`
		SELECT COUNT(*) as count
		FROM ${config.table}
		WHERE ${config.resourceColumn} = ?
	`
		)
		.get(resourceId) as { count: number };
	return row.count;
}

// =====================
// AGENT-TEMPLATE LINKING
// =====================

/**
 * Link a template to an agent.
 * If isDefault is true, clears existing default first.
 * If isDefault is omitted and no default exists, sets this link as default.
 */
export function linkTemplateToAgent(agentId: number, templateId: number, isDefault?: boolean): void {
	linkResourceToAgent(TEMPLATE_LINKS, agentId, templateId, isDefault);
}

/**
 * Unlink a template from an agent.
 */
export function unlinkTemplateFromAgent(agentId: number, templateId: number): void {
	unlinkResourceFromAgent(TEMPLATE_LINKS, agentId, templateId);
}

/**
 * Get all templates linked to an agent.
 */
export function getAgentTemplates(agentId: number): AgentLinkedTemplate[] {
	const stmt = db.prepare(`
		SELECT t.*, l.is_default, l.linked_at
		FROM request_templates t
		JOIN agent_template_links l ON t.id = l.template_id
		WHERE l.agent_id = ?
		ORDER BY l.is_default DESC, t.created_at DESC
	`);
	return stmt.all(agentId) as AgentLinkedTemplate[];
}

/**
 * Set a template as the default for an agent.
 */
export function setAgentDefaultTemplate(agentId: number, templateId: number): void {
	setAgentDefaultResource(TEMPLATE_LINKS, agentId, templateId);
}

export function getAgentTemplateLink(
	agentId: number,
	templateId: number
): { is_default?: number; linked_at?: string } | undefined {
	return getAgentResourceLink(TEMPLATE_LINKS, agentId, templateId);
}

export function getTemplateLinkCount(templateId: number): number {
	return getResourceLinkCount(TEMPLATE_LINKS, templateId);
}

// =====================
// AGENT-RESPONSE-MAP LINKING
// =====================

/**
 * Link a response map to an agent.
 */
export function linkResponseMapToAgent(agentId: number, mapId: number, isDefault?: boolean): void {
	linkResourceToAgent(RESPONSE_MAP_LINKS, agentId, mapId, isDefault);
}

/**
 * Unlink a response map from an agent.
 */
export function unlinkResponseMapFromAgent(agentId: number, mapId: number): void {
	unlinkResourceFromAgent(RESPONSE_MAP_LINKS, agentId, mapId);
}

/**
 * Get all response maps linked to an agent.
 */
export function getAgentResponseMaps(agentId: number): AgentLinkedResponseMap[] {
	const stmt = db.prepare(`
		SELECT m.*, l.is_default, l.linked_at
		FROM response_maps m
		JOIN agent_response_map_links l ON m.id = l.response_map_id
		WHERE l.agent_id = ?
		ORDER BY l.is_default DESC, m.created_at DESC
	`);
	return stmt.all(agentId) as AgentLinkedResponseMap[];
}

/**
 * Set a response map as the default for an agent.
 */
export function setAgentDefaultResponseMap(agentId: number, mapId: number): void {
	setAgentDefaultResource(RESPONSE_MAP_LINKS, agentId, mapId);
}

export function getAgentResponseMapLink(
	agentId: number,
	mapId: number
): { is_default?: number; linked_at?: string } | undefined {
	return getAgentResourceLink(RESPONSE_MAP_LINKS, agentId, mapId);
}

export function getResponseMapLinkCount(mapId: number): number {
	return getResourceLinkCount(RESPONSE_MAP_LINKS, mapId);
}

// =====================
// CAPABILITY LISTING
// =====================

/**
 * Extract capability name from a JSON string or plain string.
 */
function extractCapabilityName(capability: string | null | undefined): string | null {
	if (!capability) return null;
	try {
		const parsed = JSON.parse(capability);
		if (typeof parsed?.name === 'string') {
			return parsed.name;
		}
		if (typeof parsed?.schema === 'string') {
			return parsed.schema;
		}
		return null;
	} catch {
		// If not valid JSON, treat as plain string capability name
		return capability;
	}
}

/**
 * List all distinct capability names from request templates.
 */
export function listRequestTemplateCapabilityNames(): string[] {
	const rows = db
		.prepare(
			`
		SELECT DISTINCT capability FROM request_templates
		WHERE capability IS NOT NULL AND capability != ''
	`
		)
		.all() as Array<{ capability: string }>;

	const names = new Set<string>();
	for (const row of rows) {
		const name = extractCapabilityName(row.capability);
		if (name) {
			names.add(name);
		}
	}

	return Array.from(names).sort();
}

/**
 * List all distinct capability names from response maps.
 */
export function listResponseMapCapabilityNames(): string[] {
	const rows = db
		.prepare(
			`
		SELECT DISTINCT capability FROM response_maps
		WHERE capability IS NOT NULL AND capability != ''
	`
		)
		.all() as Array<{ capability: string }>;

	const names = new Set<string>();
	for (const row of rows) {
		const name = extractCapabilityName(row.capability);
		if (name) {
			names.add(name);
		}
	}

	return Array.from(names).sort();
}
