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
} from '../constants.js'; //[cite: 13]

const GLOBAL_CONFIG_DIR = path.join(os.homedir(), '.config', GLOBAL_CONFIG_DIR_NAME); //[cite: 13]
export const GLOBAL_CONFIG_PATH = path.join(GLOBAL_CONFIG_DIR, GLOBAL_CONFIG_FILENAME); //[cite: 13]
const LOCAL_CONFIG_PATH = path.join(process.cwd(), LOCAL_CONFIG_FILENAME); //[cite: 13]

/**
 * Strip a single trailing slash from a URL so we never produce
 * `http://host/api//chat` when concatenating routes[cite: 13].
 */
export function normalizeEndpoint(endpoint) {
    if (typeof endpoint !== 'string') return DEFAULT_ENDPOINT; //[cite: 13]
    return endpoint.replace(/\/+$/, ''); //[cite: 13]
}

/**
 * Validate that a parsed config has the shape we expect, falling back to
 * defaults for any missing or malformed pieces[cite: 13].
 */
function sanitizeConfig(raw) {
    const safe = { ...DEFAULT_CONFIG, models: { ...DEFAULT_CONFIG.models } }; //[cite: 13]

    if (raw && typeof raw === 'object') { //[cite: 13]
        if (typeof raw.endpoint === 'string' && raw.endpoint.length > 0) { //[cite: 13]
            safe.endpoint = normalizeEndpoint(raw.endpoint); //[cite: 13]
        }
        if (typeof raw.defaultRole === 'string' && raw.defaultRole.length > 0) { //[cite: 13]
            safe.defaultRole = raw.defaultRole; //[cite: 13]
        }
        if (raw.models && typeof raw.models === 'object') { //[cite: 13]
            for (const [role, model] of Object.entries(raw.models)) { //[cite: 13]
                if (typeof model === 'string' && model.length > 0) { //[cite: 13]
                    safe.models[role] = model; //[cite: 13]
                }
            }
        }
    }

    return safe; //[cite: 13]
}

/**
 * Quick URL validator (best-effort)[cite: 13].
 */
export function isValidEndpoint(endpoint) {
    if (typeof endpoint !== 'string') return false; //[cite: 13]
    return /^https?:\/\/.+/i.test(endpoint.trim()); //[cite: 13]
}

/**
 * Ensures the global configuration directory and file exist[cite: 13].
 */
async function ensureGlobalConfig() {
    try {
        await fs.access(GLOBAL_CONFIG_DIR); //[cite: 13]
    } catch {
        await fs.mkdir(GLOBAL_CONFIG_DIR, { recursive: true }); //[cite: 13]
    }

    try {
        await fs.access(GLOBAL_CONFIG_PATH); //[cite: 13]
    } catch {
        await fs.writeFile(GLOBAL_CONFIG_PATH, JSON.stringify(DEFAULT_CONFIG, null, 4)); //[cite: 13]
    }
}

/**
 * Reads a config file and returns its parsed JSON[cite: 13].
 */
async function readConfigFile(filePath) {
    const data = await fs.readFile(filePath, 'utf-8'); //[cite: 13]
    return JSON.parse(data); //[cite: 13]
}

/**
 * Loads and merges configurations[cite: 13].
 * Priority: Local tinycoder.json > Global ~/.config/tinycoder/config.json > Defaults[cite: 13].
 */
export async function loadConfig() {
    await ensureGlobalConfig(); //[cite: 13]

    let config = sanitizeConfig(DEFAULT_CONFIG); //[cite: 13]

    // 1. Load Global Config[cite: 13]
    try {
        const globalConfig = await readConfigFile(GLOBAL_CONFIG_PATH); //[cite: 13]
        config = sanitizeConfig({ ...config, ...globalConfig }); //[cite: 13]
    } catch (error) {
        if (error.code !== 'ENOENT') { //[cite: 13]
            console.error(chalk.red(`\n[Warning] Failed to parse global config: ${error.message}`)); //[cite: 13]
        }
    }

    // 2. Load Local Config[cite: 13]
    try {
        const localConfig = await readConfigFile(LOCAL_CONFIG_PATH); //[cite: 13]
        config = sanitizeConfig({ ...config, ...localConfig }); //[cite: 13]
    } catch (error) {
        if (error.code !== 'ENOENT') { //[cite: 13]
            console.error(chalk.yellow(`\n[Warning] Failed to parse local tinycoder.json: ${error.message}`)); //[cite: 13]
        }
    }

    return config; //[cite: 13]
}

/**
 * Updates and saves the global configuration[cite: 13].
 */
export async function saveGlobalConfig(newConfig) {
    await ensureGlobalConfig(); //[cite: 13]
    try {
        const safeConfig = sanitizeConfig(newConfig); //[cite: 13]
        await fs.writeFile(GLOBAL_CONFIG_PATH, JSON.stringify(safeConfig, null, 4)); //[cite: 13]
        return true; //[cite: 13]
    } catch (error) {
        console.error(chalk.red(`\n[Error] Could not save settings: ${error.message}`)); //[cite: 13]
        return false; //[cite: 13]
    }
}