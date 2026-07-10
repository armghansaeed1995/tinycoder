import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import chalk from 'chalk';

import {
    GLOBAL_CONFIG_DIR_NAME,
    GLOBAL_CONFIG_FILENAME,
    LOCAL_CONFIG_FILENAME,
    DEFAULT_CONFIG,
    DEFAULT_ENDPOINT
} from '../constants.js';

const GLOBAL_CONFIG_DIR = path.join(os.homedir(), '.config', GLOBAL_CONFIG_DIR_NAME);
// Exported so /settings failure messages can point the user at the exact
// file rather than re-deriving the path on the other side of the import
// boundary.
export const GLOBAL_CONFIG_PATH = path.join(GLOBAL_CONFIG_DIR, GLOBAL_CONFIG_FILENAME);
const LOCAL_CONFIG_PATH = path.join(process.cwd(), LOCAL_CONFIG_FILENAME);

/**
 * Strip a single trailing slash from a URL so we never produce
 * `http://host/api//chat` when concatenating routes.
 */
export function normalizeEndpoint(endpoint) {
    if (typeof endpoint !== 'string') return DEFAULT_ENDPOINT;
    return endpoint.replace(/\/+$/, '');
}

/**
 * Validate that a parsed config has the shape we expect, falling back to
 * defaults for any missing or malformed pieces. This avoids one bad key
 * taking down the whole CLI.
 */
function sanitizeConfig(raw) {
    const safe = { ...DEFAULT_CONFIG, models: { ...DEFAULT_CONFIG.models } };

    if (raw && typeof raw === 'object') {
        if (typeof raw.endpoint === 'string' && raw.endpoint.length > 0) {
            safe.endpoint = normalizeEndpoint(raw.endpoint);
        }
        if (typeof raw.defaultRole === 'string' && raw.defaultRole.length > 0) {
            safe.defaultRole = raw.defaultRole;
        }
        if (raw.models && typeof raw.models === 'object') {
            for (const [role, model] of Object.entries(raw.models)) {
                if (typeof model === 'string' && model.length > 0) {
                    safe.models[role] = model;
                }
            }
        }
    }

    return safe;
}

/**
 * Quick URL validator (best-effort). We only check that the value looks
 * like `http://...` or `https://...`. The LLM endpoint will be exercised
 * fully on the next request.
 */
export function isValidEndpoint(endpoint) {
    if (typeof endpoint !== 'string') return false;
    return /^https?:\/\/.+/i.test(endpoint.trim());
}

/**
 * Ensures the global configuration directory and file exist.
 * If they do not, it creates them using the DEFAULT_CONFIG.
 */
async function ensureGlobalConfig() {
    try {
        await fs.access(GLOBAL_CONFIG_DIR);
    } catch {
        await fs.mkdir(GLOBAL_CONFIG_DIR, { recursive: true });
    }

    try {
        await fs.access(GLOBAL_CONFIG_PATH);
    } catch {
        await fs.writeFile(GLOBAL_CONFIG_PATH, JSON.stringify(DEFAULT_CONFIG, null, 4));
    }
}

/**
 * Reads a config file and returns its parsed JSON.
 * Throws on read or parse errors; callers decide how loud to be.
 */
async function readConfigFile(filePath) {
    const data = await fs.readFile(filePath, 'utf-8');
    return JSON.parse(data);
}

/**
 * Loads and merges configurations.
 * Priority: Local tinycoder.json > Global ~/.config/tinycoder/config.json > Defaults
 */
export async function loadConfig() {
    await ensureGlobalConfig();

    let config = sanitizeConfig(DEFAULT_CONFIG);

    // 1. Load Global Config
    try {
        const globalConfig = await readConfigFile(GLOBAL_CONFIG_PATH);
        config = sanitizeConfig({ ...config, ...globalConfig });
    } catch (error) {
        if (error.code !== 'ENOENT') {
            console.error(chalk.red(`\n[Warning] Failed to parse global config: ${error.message}`));
        }
    }

    // 2. Load Local Config (if it exists in the current project directory)
    try {
        const localConfig = await readConfigFile(LOCAL_CONFIG_PATH);
        config = sanitizeConfig({ ...config, ...localConfig });
    } catch (error) {
        // Silently ignore if no local config exists, this is expected behavior
        if (error.code !== 'ENOENT') {
            console.error(chalk.yellow(`\n[Warning] Failed to parse local tinycoder.json: ${error.message}`));
        }
    }

    return config;
}

/**
 * Updates and saves the global configuration.
 * Used by the /settings command. Endpoint URLs are normalized before saving
 * to guarantee consistent URL composition downstream.
 */
export async function saveGlobalConfig(newConfig) {
    await ensureGlobalConfig();
    try {
        const safeConfig = sanitizeConfig(newConfig);
        await fs.writeFile(GLOBAL_CONFIG_PATH, JSON.stringify(safeConfig, null, 4));
        return true;
    } catch (error) {
        console.error(chalk.red(`\n[Error] Could not save settings: ${error.message}`));
        return false;
    }
}
