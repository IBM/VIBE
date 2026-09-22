import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

export interface VibeProfile {
	backend: string;
	defaultAgent?: number;
	defaultSuite?: number;
}

export interface VibeConfig {
	profiles: Record<string, VibeProfile>;
	defaultProfile: string;
}

const CONFIG_FILENAME = 'vibe.config.json';

const DEFAULT_CONFIG: VibeConfig = {
	profiles: {
		local: {
			backend: 'http://localhost:5100'
		}
	},
	defaultProfile: 'local'
};

function findConfigFile(): string | null {
	// Walk up from cwd looking for vibe.config.json
	let dir = process.cwd();
	while (true) {
		const candidate = path.join(dir, CONFIG_FILENAME);
		if (fs.existsSync(candidate)) return candidate;
		const parent = path.dirname(dir);
		if (parent === dir) break;
		dir = parent;
	}
	// Fall back to home directory
	const homeCandidate = path.join(os.homedir(), CONFIG_FILENAME);
	if (fs.existsSync(homeCandidate)) return homeCandidate;
	return null;
}

export function loadConfig(): VibeConfig {
	const configPath = findConfigFile();
	if (!configPath) return DEFAULT_CONFIG;
	try {
		const raw = fs.readFileSync(configPath, 'utf8');
		return JSON.parse(raw) as VibeConfig;
	} catch {
		return DEFAULT_CONFIG;
	}
}

export function resolveProfile(args: Record<string, unknown>): VibeProfile {
	const config = loadConfig();

	// CLI flag --profile takes precedence, then env var, then config default
	const profileName = (args['profile'] as string | undefined) ?? process.env['VIBE_PROFILE'] ?? config.defaultProfile;

	const profile = config.profiles[profileName];
	if (!profile) {
		throw new Error(
			`Profile "${profileName}" not found in vibe.config.json. ` +
				`Available: ${Object.keys(config.profiles).join(', ')}`
		);
	}

	// Env var overrides for individual fields
	return {
		backend: process.env['VIBE_BACKEND'] ?? profile.backend,
		defaultAgent:
			process.env['VIBE_AGENT_ID'] !== undefined
				? parseInt(process.env['VIBE_AGENT_ID']!, 10)
				: profile.defaultAgent,
		defaultSuite:
			process.env['VIBE_SUITE_ID'] !== undefined
				? parseInt(process.env['VIBE_SUITE_ID']!, 10)
				: profile.defaultSuite
	};
}

export function writeConfig(config: VibeConfig, filePath?: string): void {
	const target = filePath ?? path.join(process.cwd(), CONFIG_FILENAME);
	fs.writeFileSync(target, JSON.stringify(config, null, 2) + '\n', 'utf8');
}

export { CONFIG_FILENAME, DEFAULT_CONFIG };
