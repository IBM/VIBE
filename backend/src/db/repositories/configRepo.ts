import db from '../database';
import { LLMConfig } from '@ibm-vibe/types';

// LLM Config queries
export const createLLMConfig = (llmConfig: LLMConfig) => {
	// Ensure all required fields have default values
	const configWithDefaults = {
		...llmConfig,
		name: llmConfig.name || '',
		provider: llmConfig.provider || '',
		config: llmConfig.config || '{}',
		priority: llmConfig.priority || 100
	};

	const statement = db.prepare(`
		INSERT INTO llm_configs (name, provider, config, priority)
		VALUES (@name, @provider, @config, @priority)
		RETURNING *
	`);
	return statement.get(configWithDefaults) as LLMConfig;
};

export const getLLMConfigs = () => {
	return db.prepare('SELECT * FROM llm_configs ORDER BY priority ASC').all() as LLMConfig[];
};

export const getLLMConfigById = (id: number) => {
	return db.prepare('SELECT * FROM llm_configs WHERE id = ?').get(id) as LLMConfig;
};

export const updateLLMConfig = (id: number, config: Partial<LLMConfig>) => {
	// Filter out undefined values to avoid SQL errors
	const filteredConfig = Object.fromEntries(Object.entries(config).filter(([_, value]) => value !== undefined));

	// If there are no fields to update, return the existing config
	if (Object.keys(filteredConfig).length === 0) {
		return getLLMConfigById(id);
	}

	const updates = Object.keys(filteredConfig)
		.filter((key) => key !== 'id' && key !== 'created_at')
		.map((key) => `${key} = @${key}`)
		.join(', ');

	const statement = db.prepare(`
		UPDATE llm_configs
		SET ${updates}, updated_at = CURRENT_TIMESTAMP
		WHERE id = @id
		RETURNING *
	`);

	return statement.get({ ...filteredConfig, id }) as LLMConfig;
};

export const deleteLLMConfig = (id: number) => {
	const statement = db.prepare('DELETE FROM llm_configs WHERE id = ?');
	return statement.run(id);
};

export const getLLMConfigsWithCount = (
	params: { limit?: number; offset?: number } = {}
): { data: LLMConfig[]; total: number } => {
	const { limit, offset } = params;
	let query = 'SELECT * FROM llm_configs ORDER BY priority ASC';
	const queryParams: any[] = [];

	if (limit !== undefined) {
		query += ' LIMIT ?';
		queryParams.push(limit);
	}
	if (offset !== undefined) {
		query += ' OFFSET ?';
		queryParams.push(offset);
	}

	const data = db.prepare(query).all(...queryParams) as LLMConfig[];
	const totalResult = db.prepare('SELECT COUNT(*) as count FROM llm_configs').get() as { count: number };

	return { data, total: totalResult.count };
};
