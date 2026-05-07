import type { Migration } from './types';

const shouldLog = process.env.NODE_ENV !== 'test';
const logError = (...args: unknown[]) => {
	/* istanbul ignore next */
	if (shouldLog) console.error(...args);
};

const migration: Migration = {
	version: 14,
	name: 'Create global template library tables and links',
	up: (db) => {
		try {
			// 1) Create global request_templates table
			db.exec(`
		CREATE TABLE IF NOT EXISTS request_templates (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			name TEXT NOT NULL UNIQUE,
			description TEXT,
			capability TEXT,
			body TEXT NOT NULL,
			created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
		);
	`);

			// 2) Create global response_maps table
			db.exec(`
		CREATE TABLE IF NOT EXISTS response_maps (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			name TEXT NOT NULL UNIQUE,
			description TEXT,
			capability TEXT,
			spec TEXT NOT NULL,
			created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
		);
	`);

			// 3) Create agent-to-template junction table (many-to-many)
			db.exec(`
		CREATE TABLE IF NOT EXISTS agent_template_links (
			agent_id INTEGER NOT NULL,
			template_id INTEGER NOT NULL,
			is_default INTEGER DEFAULT 0,
			linked_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
			PRIMARY KEY (agent_id, template_id),
			FOREIGN KEY (agent_id) REFERENCES agents(id) ON DELETE CASCADE,
			FOREIGN KEY (template_id) REFERENCES request_templates(id) ON DELETE CASCADE
		);
	`);

			// 4) Create agent-to-response-map junction table (many-to-many)
			db.exec(`
		CREATE TABLE IF NOT EXISTS agent_response_map_links (
			agent_id INTEGER NOT NULL,
			response_map_id INTEGER NOT NULL,
			is_default INTEGER DEFAULT 0,
			linked_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
			PRIMARY KEY (agent_id, response_map_id),
			FOREIGN KEY (agent_id) REFERENCES agents(id) ON DELETE CASCADE,
			FOREIGN KEY (response_map_id) REFERENCES response_maps(id) ON DELETE CASCADE
		);
	`);

			// 5) Create legacy template mappings table (idempotent backfills)
			db.exec(`
		CREATE TABLE IF NOT EXISTS legacy_template_mappings (
			kind TEXT NOT NULL,
			legacy_id INTEGER NOT NULL,
			global_id INTEGER NOT NULL,
			created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
			PRIMARY KEY (kind, legacy_id)
		);
	`);

			// Ensure linked_at columns exist on older tables
			const templateLinkCols = db.prepare("PRAGMA table_info('agent_template_links')").all() as Array<{
				name: string;
			}>;
			if (!templateLinkCols.some((col) => col.name === 'linked_at')) {
				db.exec('ALTER TABLE agent_template_links ADD COLUMN linked_at TIMESTAMP');
				db.exec('UPDATE agent_template_links SET linked_at = CURRENT_TIMESTAMP WHERE linked_at IS NULL');
			}

			const mapLinkCols = db.prepare("PRAGMA table_info('agent_response_map_links')").all() as Array<{
				name: string;
			}>;
			if (!mapLinkCols.some((col) => col.name === 'linked_at')) {
				db.exec('ALTER TABLE agent_response_map_links ADD COLUMN linked_at TIMESTAMP');
				db.exec('UPDATE agent_response_map_links SET linked_at = CURRENT_TIMESTAMP WHERE linked_at IS NULL');
			}

			// Ensure only one default per agent before unique indexes
			const cleanupDefaultsTx = db.transaction(() => {
				const dupTemplateDefaults = db
					.prepare(
						`
			SELECT agent_id FROM agent_template_links
			WHERE is_default = 1
			GROUP BY agent_id
			HAVING COUNT(*) > 1
		`
					)
					.all() as Array<{ agent_id: number }>;

				for (const { agent_id } of dupTemplateDefaults) {
					const keep = db
						.prepare(
							`
				SELECT template_id FROM agent_template_links
				WHERE agent_id = ? AND is_default = 1
				ORDER BY linked_at DESC, template_id DESC
				LIMIT 1
			`
						)
						.get(agent_id) as { template_id?: number } | undefined;

					if (keep?.template_id) {
						db.prepare(
							`
					UPDATE agent_template_links
					SET is_default = CASE WHEN template_id = ? THEN 1 ELSE 0 END
					WHERE agent_id = ?
				`
						).run(keep.template_id, agent_id);
					}
				}

				const dupMapDefaults = db
					.prepare(
						`
			SELECT agent_id FROM agent_response_map_links
			WHERE is_default = 1
			GROUP BY agent_id
			HAVING COUNT(*) > 1
		`
					)
					.all() as Array<{ agent_id: number }>;

				for (const { agent_id } of dupMapDefaults) {
					const keep = db
						.prepare(
							`
				SELECT response_map_id FROM agent_response_map_links
				WHERE agent_id = ? AND is_default = 1
				ORDER BY linked_at DESC, response_map_id DESC
				LIMIT 1
			`
						)
						.get(agent_id) as { response_map_id?: number } | undefined;

					if (keep?.response_map_id) {
						db.prepare(
							`
					UPDATE agent_response_map_links
					SET is_default = CASE WHEN response_map_id = ? THEN 1 ELSE 0 END
					WHERE agent_id = ?
				`
						).run(keep.response_map_id, agent_id);
					}
				}
			});

			cleanupDefaultsTx();

			// Create indexes for the new tables
			db.exec(`
		CREATE INDEX IF NOT EXISTS idx_request_templates_capability ON request_templates(capability);
		CREATE INDEX IF NOT EXISTS idx_request_templates_name ON request_templates(name);
		CREATE INDEX IF NOT EXISTS idx_response_maps_capability ON response_maps(capability);
		CREATE INDEX IF NOT EXISTS idx_response_maps_name ON response_maps(name);
		CREATE INDEX IF NOT EXISTS idx_agent_template_links_agent ON agent_template_links(agent_id);
		CREATE INDEX IF NOT EXISTS idx_agent_template_links_template ON agent_template_links(template_id);
		CREATE INDEX IF NOT EXISTS idx_agent_response_map_links_agent ON agent_response_map_links(agent_id);
		CREATE INDEX IF NOT EXISTS idx_agent_response_map_links_map ON agent_response_map_links(response_map_id);
		CREATE UNIQUE INDEX IF NOT EXISTS idx_agent_template_links_default ON agent_template_links(agent_id) WHERE is_default = 1;
		CREATE UNIQUE INDEX IF NOT EXISTS idx_agent_response_map_links_default ON agent_response_map_links(agent_id) WHERE is_default = 1;
		CREATE INDEX IF NOT EXISTS idx_legacy_template_mappings_global ON legacy_template_mappings(global_id);
	`);
		} catch (e) {
			logError('Global template library migration failed', e);
		}
	}
};

export default migration;
