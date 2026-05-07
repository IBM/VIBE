import type { Migration } from './types';

const shouldLog = process.env.NODE_ENV !== 'test';
const logError = (...args: unknown[]) => {
	/* istanbul ignore next */
	if (shouldLog) console.error(...args);
};

const migration: Migration = {
	version: 13,
	name: 'Create agent templates and response maps tables',
	up: (db) => {
		try {
			// 1) Ensure agent_request_templates table
			db.exec(`
		CREATE TABLE IF NOT EXISTS agent_request_templates (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			agent_id INTEGER NOT NULL,
			name TEXT NOT NULL,
			description TEXT,
			engine TEXT DEFAULT 'handlebars',
			content_type TEXT DEFAULT 'application/json',
			body TEXT NOT NULL,
			tags TEXT,
			is_default INTEGER DEFAULT 0,
			created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
			FOREIGN KEY (agent_id) REFERENCES agents(id) ON DELETE CASCADE,
			UNIQUE(agent_id, name)
		);
	`);
			// Unique default per agent (partial unique index)
			try {
				db.exec(
					'CREATE UNIQUE INDEX IF NOT EXISTS idx_agent_req_tmpl_default ON agent_request_templates(agent_id) WHERE is_default = 1;'
				);
			} catch {} // older SQLite might not support partial indexes; enforce in code if needed
			const reqTemplateCols = db.prepare("PRAGMA table_info('agent_request_templates')").all() as Array<{
				name: string;
			}>;
			if (reqTemplateCols.length > 0 && !reqTemplateCols.some((col) => col.name === 'capabilities')) {
				db.exec("ALTER TABLE agent_request_templates ADD COLUMN capabilities TEXT DEFAULT '{}'");
				db.exec("UPDATE agent_request_templates SET capabilities = '{}' WHERE capabilities IS NULL");
			}

			// 2) Ensure agent_response_maps table
			db.exec(`
		CREATE TABLE IF NOT EXISTS agent_response_maps (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			agent_id INTEGER NOT NULL,
			name TEXT NOT NULL,
			description TEXT,
			spec TEXT NOT NULL,
			tags TEXT,
			is_default INTEGER DEFAULT 0,
			created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
			FOREIGN KEY (agent_id) REFERENCES agents(id) ON DELETE CASCADE,
			UNIQUE(agent_id, name)
		);
	`);
			try {
				db.exec(
					'CREATE UNIQUE INDEX IF NOT EXISTS idx_agent_resp_map_default ON agent_response_maps(agent_id) WHERE is_default = 1;'
				);
			} catch {
				/* see note above */
			}
			const respMapCols = db.prepare("PRAGMA table_info('agent_response_maps')").all() as Array<{ name: string }>;
			if (respMapCols.length > 0 && !respMapCols.some((col) => col.name === 'capabilities')) {
				db.exec("ALTER TABLE agent_response_maps ADD COLUMN capabilities TEXT DEFAULT '{}'");
				db.exec("UPDATE agent_response_maps SET capabilities = '{}' WHERE capabilities IS NULL");
			}

			// 3) Add selection/variables columns to conversations
			const convCols2 = db.prepare("PRAGMA table_info('conversations')").all() as Array<{ name: string }>;
			if (!convCols2.some((c) => c.name === 'default_request_template_id')) {
				db.exec('ALTER TABLE conversations ADD COLUMN default_request_template_id INTEGER');
			}
			if (!convCols2.some((c) => c.name === 'default_response_map_id')) {
				db.exec('ALTER TABLE conversations ADD COLUMN default_response_map_id INTEGER');
			}
			if (!convCols2.some((c) => c.name === 'variables')) {
				db.exec('ALTER TABLE conversations ADD COLUMN variables TEXT');
			}
			if (!convCols2.some((c) => c.name === 'required_request_template_capabilities')) {
				db.exec('ALTER TABLE conversations ADD COLUMN required_request_template_capabilities TEXT');
			}
			if (!convCols2.some((c) => c.name === 'required_response_map_capabilities')) {
				db.exec('ALTER TABLE conversations ADD COLUMN required_response_map_capabilities TEXT');
			}
			if (!convCols2.some((c) => c.name === 'stop_on_failure')) {
				db.exec('ALTER TABLE conversations ADD COLUMN stop_on_failure INTEGER DEFAULT 0');
			}

			// 4) Add overrides/variables to conversation_messages
			const convMsgCols2 = db.prepare("PRAGMA table_info('conversation_messages')").all() as Array<{
				name: string;
			}>;
			if (convMsgCols2.length > 0 && !convMsgCols2.some((c) => c.name === 'request_template_id')) {
				db.exec('ALTER TABLE conversation_messages ADD COLUMN request_template_id INTEGER');
			}
			if (convMsgCols2.length > 0 && !convMsgCols2.some((c) => c.name === 'response_map_id')) {
				db.exec('ALTER TABLE conversation_messages ADD COLUMN response_map_id INTEGER');
			}
			if (convMsgCols2.length > 0 && !convMsgCols2.some((c) => c.name === 'set_variables')) {
				db.exec('ALTER TABLE conversation_messages ADD COLUMN set_variables TEXT');
			}

			// 5) Add variables to execution_sessions
			const execSessCols2 = db.prepare("PRAGMA table_info('execution_sessions')").all() as Array<{
				name: string;
			}>;
			if (!execSessCols2.some((c) => c.name === 'variables')) {
				db.exec('ALTER TABLE execution_sessions ADD COLUMN variables TEXT');
			}

			// 6) Backfill from agents.settings (one-shot): move request_template/response_mapping into new tables, set defaults, and clean settings
			const agents = db.prepare('SELECT id, settings FROM agents').all() as Array<{
				id: number;
				settings: string;
			}>;
			const insertReqTmpl = db.prepare(`
		INSERT INTO agent_request_templates (agent_id, name, description, engine, content_type, body, tags, is_default)
		VALUES (@agent_id, @name, @description, @engine, @content_type, @body, @tags, @is_default)
	`);
			const insertRespMap = db.prepare(`
		INSERT INTO agent_response_maps (agent_id, name, description, spec, tags, is_default)
		VALUES (@agent_id, @name, @description, @spec, @tags, @is_default)
	`);
			const selectAnyReqDefault = db.prepare(
				'SELECT id FROM agent_request_templates WHERE agent_id = ? AND is_default = 1 LIMIT 1'
			);
			const selectAnyRespDefault = db.prepare(
				'SELECT id FROM agent_response_maps WHERE agent_id = ? AND is_default = 1 LIMIT 1'
			);
			const updateAgentSettings = db.prepare('UPDATE agents SET settings = @settings WHERE id = @id');

			const backfillTx = db.transaction(() => {
				for (const ag of agents) {
					if (!ag?.settings) continue;
					let settingsObj: any = {};
					try {
						settingsObj = JSON.parse(ag.settings);
					} catch {
						settingsObj = {};
					}
					const isExternal = String(settingsObj?.type || '').toLowerCase() === 'external_api';

					if (!isExternal) {
						continue;
					}

					let changed = false;

					// request_template -> agent_request_templates (default)
					if (settingsObj.request_template && !selectAnyReqDefault.get(ag.id)) {
						const body =
							typeof settingsObj.request_template === 'string'
								? settingsObj.request_template
								: (() => {
										try {
											return JSON.stringify(settingsObj.request_template);
										} catch {
											return String(settingsObj.request_template);
										}
									})();
						insertReqTmpl.run({
							agent_id: ag.id,
							name: 'default',
							description: null,
							engine: 'handlebars',
							content_type: 'application/json',
							body,
							tags: null,
							is_default: 1
						});
						delete settingsObj.request_template;
						changed = true;
					}

					// response_mapping -> agent_response_maps (default)
					if (settingsObj.response_mapping && !selectAnyRespDefault.get(ag.id)) {
						const spec =
							typeof settingsObj.response_mapping === 'string'
								? settingsObj.response_mapping
								: (() => {
										try {
											return JSON.stringify(settingsObj.response_mapping);
										} catch {
											return String(settingsObj.response_mapping);
										}
									})();
						insertRespMap.run({
							agent_id: ag.id,
							name: 'default',
							description: null,
							spec,
							tags: null,
							is_default: 1
						});
						delete settingsObj.response_mapping;
						changed = true;
					}

					// If changed, persist cleaned settings JSON
					if (changed) {
						let settingsStr = '{}';
						try {
							settingsStr = JSON.stringify(settingsObj);
						} catch {
							settingsStr = '{}';
						}
						updateAgentSettings.run({ id: ag.id, settings: settingsStr });
					}
				}
			});
			backfillTx();
		} catch (e) {
			logError('Templates/maps migration failed', e);
		}
	}
};

export default migration;
