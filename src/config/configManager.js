import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import chalk from 'chalk';

const GLOBAL_CONFIG_DIR = path.join(os.homedir(), '.config', 'tinycoder');
const GLOBAL_CONFIG_PATH = path.join(GLOBAL_CONFIG_DIR, 'config.json');
const LOCAL_CONFIG_PATH = path.join(process.cwd(), 'tinycoder.json');

// Default settings optimized for 1-2B local models via Ollama
const DEFAULT_CONFIG = {
    endpoint: "http://127.0.0.1:11434/api",
    defaultRole: "code",
    models: {
        code: "qwen2.5-coder:1.5b",
        power: "qwen2.5-coder:7b", // An optional larger model for heavy tasks
        gather: "llama3.2:1b",
        plan: "llama3.2:1b",
        ask: "llama3.2:1b",
        review: "qwen2.5-coder:1.5b",
        test: "qwen2.5-coder:1.5b"
    }
};

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
 * Loads and merges configurations.
 * Priority: Local tinycoder.json > Global ~/.config/tinycoder/config.json > Defaults
 */
export async function loadConfig() {
    await ensureGlobalConfig();

    let config = { ...DEFAULT_CONFIG };

    // 1. Load Global Config
    try {
        const globalData = await fs.readFile(GLOBAL_CONFIG_PATH, 'utf-8');
        const globalConfig = JSON.parse(globalData);
        config = { ...config, ...globalConfig, models: { ...config.models, ...globalConfig.models } };
    } catch (error) {
        console.error(chalk.red(`\n[Warning] Failed to parse global config: ${error.message}`));
    }

    // 2. Load Local Config (if it exists in the current project directory)
    try {
        const localData = await fs.readFile(LOCAL_CONFIG_PATH, 'utf-8');
        const localConfig = JSON.parse(localData);
        config = { ...config, ...localConfig, models: { ...config.models, ...localConfig.models } };
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
 * Used by the /settings command.
 */
export async function saveGlobalConfig(newConfig) {
    await ensureGlobalConfig();
    try {
        await fs.writeFile(GLOBAL_CONFIG_PATH, JSON.stringify(newConfig, null, 4));
        return true;
    } catch (error) {
        console.error(chalk.red(`\n[Error] Could not save settings: ${error.message}`));
        return false;
    }
}