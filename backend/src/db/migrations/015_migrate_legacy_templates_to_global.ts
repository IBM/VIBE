import { serializeCapabilities } from '../../lib/communicationCapabilities';
import type { Migration } from './types';

const shouldLog = process.env.NODE_ENV !== 'test';
const logError = (...args: unknown[]) => {
	/* istanbul ignore next */
	if (shouldLog) console.error(...args);
};

const migration: Migration = {
	version: 15,
	name: 'Migrate legacy agent-scoped templates to global tables',
	up: (db) => {
		try {
			const legacyTemplateCount = (
				db.prepare('SELECT COUNT(*) as count FROM agent_request_templates').get() as { count: number }
			).count;
			const legacyMapCount = (
				db.prepare('SELECT COUNT(*) as count FROM agent_response_maps').get() as { count: number }
			).count;

			if (legacyTemplateCount <= 0 && legacyMapCount <= 0) {
				return;
			}

			if (process.env.NODE_ENV !== 'test') {
				console.log('Migrating agent-scoped templates to global template library...');
			}

			const normalizeCapability = (value: string | null) => serializeCapabilities(value);

			const existingTemplates = db
				.prepare(
					`
			SELECT id, name, description, capability, body
			FROM request_templates
		`
				)
				.all() as Array<{ id: number; name: string; capability: string | null; body: string }>;

			const existingMaps = db
				.prepare(
					`
			SELECT id, name, description, capability, spec
			FROM response_maps
		`
				)
				.all() as Array<{ id: number; name: string; capability: string | null; spec: string }>;

			// Get all legacy request templates
			const legacyTemplates = db
				.prepare(
					`
			SELECT art.*, a.name as agent_name
			FROM agent_request_templates art
			JOIN agents a ON art.agent_id = a.id
			ORDER BY art.agent_id, art.is_default DESC
		`
				)
				.all() as Array<{
				id: number;
				agent_id: number;
				name: string;
				description: string | null;
				body: string;
				capabilities: string | null;
				is_default: number;
				agent_name: string;
				created_at: string | null;
			}>;

			// Get all legacy response maps
			const legacyMaps = db
				.prepare(
					`
			SELECT arm.*, a.name as agent_name
			FROM agent_response_maps arm
			JOIN agents a ON arm.agent_id = a.id
			ORDER BY arm.agent_id, arm.is_default DESC
		`
				)
				.all() as Array<{
				id: number;
				agent_id: number;
				name: string;
				description: string | null;
				spec: string;
				capabilities: string | null;
				is_default: number;
				agent_name: string;
				created_at: string | null;
			}>;

			// Track used names to avoid conflicts (seed from existing globals)
			const usedTemplateNames = new Set(existingTemplates.map((t) => t.name));
			const usedMapNames = new Set(existingMaps.map((m) => m.name));

			// Dedupe by name + body/spec (+ capability)
			const templateKeyToGlobalId = new Map<string, number>();
			const mapKeyToGlobalId = new Map<string, number>();

			for (const t of existingTemplates) {
				const key = `${t.name}::${t.body}::${normalizeCapability(t.capability) ?? ''}`;
				templateKeyToGlobalId.set(key, t.id);
			}
			for (const m of existingMaps) {
				const key = `${m.name}::${m.spec}::${normalizeCapability(m.capability) ?? ''}`;
				mapKeyToGlobalId.set(key, m.id);
			}

			// Prepared statements for insertion and linking
			const insertGlobalTemplate = db.prepare(`
			INSERT INTO request_templates (name, description, capability, body)
			VALUES (@name, @description, @capability, @body)
		`);
			const linkTemplate = db.prepare(`
			INSERT OR IGNORE INTO agent_template_links (agent_id, template_id, is_default, linked_at)
			VALUES (@agent_id, @template_id, @is_default, @linked_at)
		`);
			const insertGlobalMap = db.prepare(`
			INSERT INTO response_maps (name, description, capability, spec)
			VALUES (@name, @description, @capability, @spec)
		`);
			const linkMap = db.prepare(`
			INSERT OR IGNORE INTO agent_response_map_links (agent_id, response_map_id, is_default, linked_at)
			VALUES (@agent_id, @response_map_id, @is_default, @linked_at)
		`);
			const insertLegacyMapping = db.prepare(`
			INSERT OR IGNORE INTO legacy_template_mappings (kind, legacy_id, global_id)
			VALUES (@kind, @legacy_id, @global_id)
		`);

			// Helper to generate unique name
			const getUniqueName = (baseName: string, agentName: string, usedNames: Set<string>): string => {
				let name = baseName;
				if (usedNames.has(name)) {
					name = `${baseName} (${agentName})`;
					let counter = 2;
					while (usedNames.has(name)) {
						name = `${baseName} (${agentName} ${counter})`;
						counter++;
					}
				}
				usedNames.add(name);
				return name;
			};

			// Migrate request templates
			const migrateTemplatesTx = db.transaction(() => {
				let inserted = 0;
				let reused = 0;
				for (const lt of legacyTemplates) {
					const normalizedCapability = normalizeCapability(lt.capabilities);
					const key = `${lt.name}::${lt.body}::${normalizedCapability ?? ''}`;
					let globalId = templateKeyToGlobalId.get(key);

					if (!globalId) {
						const uniqueName = getUniqueName(lt.name, lt.agent_name, usedTemplateNames);
						const result = insertGlobalTemplate.run({
							name: uniqueName,
							description: lt.description,
							capability: normalizedCapability,
							body: lt.body
						});
						globalId = Number(result.lastInsertRowid);
						templateKeyToGlobalId.set(key, globalId);
						inserted += 1;
					} else {
						reused += 1;
					}

					linkTemplate.run({
						agent_id: lt.agent_id,
						template_id: globalId,
						is_default: lt.is_default,
						linked_at: lt.created_at ?? null
					});

					insertLegacyMapping.run({
						kind: 'request_template',
						legacy_id: lt.id,
						global_id: globalId
					});
				}

				return { inserted, reused };
			});
			const templateResult = migrateTemplatesTx();

			// Migrate response maps
			const migrateMapsTx = db.transaction(() => {
				let inserted = 0;
				let reused = 0;
				for (const lm of legacyMaps) {
					const normalizedCapability = normalizeCapability(lm.capabilities);
					const key = `${lm.name}::${lm.spec}::${normalizedCapability ?? ''}`;
					let globalId = mapKeyToGlobalId.get(key);

					if (!globalId) {
						const uniqueName = getUniqueName(lm.name, lm.agent_name, usedMapNames);
						const result = insertGlobalMap.run({
							name: uniqueName,
							description: lm.description,
							capability: normalizedCapability,
							spec: lm.spec
						});
						globalId = Number(result.lastInsertRowid);
						mapKeyToGlobalId.set(key, globalId);
						inserted += 1;
					} else {
						reused += 1;
					}

					linkMap.run({
						agent_id: lm.agent_id,
						response_map_id: globalId,
						is_default: lm.is_default,
						linked_at: lm.created_at ?? null
					});

					insertLegacyMapping.run({
						kind: 'response_map',
						legacy_id: lm.id,
						global_id: globalId
					});
				}

				return { inserted, reused };
			});
			const mapResult = migrateMapsTx();

			if (process.env.NODE_ENV !== 'test') {
				console.log(
					`Migrated ${legacyTemplates.length} legacy request templates into ${templateResult.inserted} new global templates ` +
						`(${templateResult.reused} reused), and ${legacyMaps.length} legacy response maps into ${mapResult.inserted} new global maps ` +
						`(${mapResult.reused} reused).`
				);
			}
		} catch (e) {
			logError('Template data migration failed', e);
		}
	}
};

export default migration;
