/**
 * Shared constants for the TinyCoder CLI.
 */

/** Filenames used for the lightweight, on-disk context/plan documents. */
export const TINY_CONTEXT_FILE = 'TINYCONTEXT.md';
export const TINY_PLAN_FILE = 'TINYPLAN.md';

/** Folder names used by default global configuration. */
export const GLOBAL_CONFIG_DIR_NAME = 'tinycoder';
export const GLOBAL_CONFIG_FILENAME = 'config.json';

/** Local project override filename. */
export const LOCAL_CONFIG_FILENAME = 'tinycoder.json';

/** Default Ollama OpenAI-compatible base endpoint (no trailing slash). */
export const DEFAULT_ENDPOINT = 'http://127.0.0.1:11434';

/**
 * The chat-completions path appended to the endpoint.
 * Kept here so we don't sprinkle string concatenations across the codebase.
 */
export const CHAT_PATH = '/api/chat';

/**
 * Default fetch timeout for LLM requests, in milliseconds.
 * Prevents the UI from hanging if the backend stalls or drops the connection.
 */
export const DEFAULT_FETCH_TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes

/**
 * Default fallback configuration used when no global or local config exists.
 * Tuned for sub-2B local models via Ollama.
 */
export const DEFAULT_CONFIG = Object.freeze({
    endpoint: DEFAULT_ENDPOINT,
    defaultRole: 'code',
    models: {
        code: 'qwen2.5-coder:1.5b',
        power: 'qwen2.5-coder:7b',
        gather: 'llama3.2:1b',
        plan: 'llama3.2:1b',
        ask: 'llama3.2:1b',
        review: 'qwen2.5-coder:1.5b',
        test: 'qwen2.5-coder:1.5b'
    }
});