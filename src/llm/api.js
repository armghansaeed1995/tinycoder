import chalk from 'chalk';
import { SYSTEM_PROMPTS } from './roles.js';
import { applyEdits } from '../fs/diffParser.js';
import { CHAT_PATH, DEFAULT_FETCH_TIMEOUT_MS } from '../constants.js';

/**
 * Roles that emit SEARCH/REPLACE blocks instead of plain prose.
 */
const EDITING_ROLES = new Set(['code', 'power']);

/**
 * Hard ceiling on the bytes a *silent* stream will buffer in memory. The
 * silent path is used for auto-retries; a runaway 7B model could otherwise
 * fill memory until the 10-minute timeout fires.
 */
const MAX_BUFFER_BYTES = 5 * 1024 * 1024; // 5 MiB

/**
 * Sends a streaming request to an OpenAI-compatible endpoint (e.g. local Ollama).
 * Returns the full response text or `null` on failure.
 *
 * @param {boolean} [silent=false] When true, tokens are buffered but not
 *   written to stdout. Used by the auto-retry path so a failed retry doesn't
 *   double-print to the terminal.
 */
export async function streamLLM(prompt, role, model, endpoint, contextFiles = '', silent = false) {
    const systemPrompt = SYSTEM_PROMPTS[role] || SYSTEM_PROMPTS.code;
    const messages = [
        { role: 'system', content: `${systemPrompt}\n\nProject Context:\n${contextFiles}` },
        { role: 'user', content: prompt }
    ];

    return await executeStream(messages, model, endpoint, silent);
}

/**
 * The core streaming engine using native fetch. Wraps the request in an
 * AbortController so a stalled backend cannot hang the CLI forever.
 *
 * If `silent` is true, the tokens are *not* written to stdout (useful for
 * the auto-retry path that already streams the first attempt).
 */
async function executeStream(messages, model, endpoint, silent = false) {    let fullResponse = '';
    let bufferBytes = 0;
    let bufferExceeded = false;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), DEFAULT_FETCH_TIMEOUT_MS);

    try {
        const url = `${endpoint}${CHAT_PATH}`;
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model,
                messages,
                stream: true
            }),
            signal: controller.signal
        });

        if (!response.ok) {
            throw new Error(`LLM API returned status: ${response.status} ${response.statusText || ''}`.trim());
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder('utf-8');

        streamLoop: while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            const chunk = decoder.decode(value, { stream: true });

            // Ollama sends newline-delimited JSON.
            const lines = chunk.split('\n').filter(line => line.trim() !== '');
            for (const line of lines) {
                try {
                    const parsed = JSON.parse(line);
                    const token = parsed.message?.content || '';
                    if (!token) continue;
                    fullResponse += token;
                    bufferBytes += Buffer.byteLength(token, 'utf8');
                    if (!silent) process.stdout.write(chalk.green(token));
                    if (silent && bufferBytes >= MAX_BUFFER_BYTES) {
                        bufferExceeded = true;
                        controller.abort();
                        break streamLoop;
                    }
                } catch {
                    // Ignore malformed JSON chunks from the stream.
                }
            }
        }

        // Flush any tail bytes the decoder was holding.
        const tail = decoder.decode();
        if (tail) {
            fullResponse += tail;
            if (!silent) process.stdout.write(chalk.green(tail));
        }

        if (!silent) console.log('\n');
        return fullResponse;

    } catch (error) {
        if (bufferExceeded) {
            console.error(chalk.yellow(`\n[Warning]: Model output exceeded ${MAX_BUFFER_BYTES} bytes during silent stream; truncating.`));
        } else if (error.name === 'AbortError') {
            console.error(chalk.red(`\nConnection Error: LLM at ${endpoint} did not respond within ${Math.round(DEFAULT_FETCH_TIMEOUT_MS / 1000)}s.`));
        } else {
            console.error(chalk.red(`\nConnection Error: Could not reach LLM at ${endpoint} (${error.message}). Is the backend running?`));
        }
        return null;
    } finally {
        clearTimeout(timer);
    }
}

/**
 * Wraps the stream and handles the 1-time automated format retry logic.
 * For editing roles it attempts to apply the SEARCH/REPLACE patches; if
 * the model produced malformed output, it asks once more, then gracefully
 * falls back to letting the user copy/paste from the printed terminal output.
 */
export async function executeWithRetry(prompt, role, model, endpoint, filePath, contextFiles) {
    let output = await streamLLM(prompt, role, model, endpoint, contextFiles);

    if (output === null) return null; // Connection failed; nothing to retry.

    if (EDITING_ROLES.has(role) && filePath) {
        const firstAttempt = await applyEdits(filePath, output);
        if (firstAttempt.success) {
            console.log(chalk.green(`✔ Edits applied successfully${firstAttempt.blocksApplied ? ` (${firstAttempt.blocksApplied} block${firstAttempt.blocksApplied === 1 ? '' : 's'})` : ''}.`));
            return output;
        }

        console.log(chalk.yellow(`\n[Auto-Retry]: Model format failed (${firstAttempt.reason}). Resending with strict instructions...`));

        const retryPrompt =
            `Your previous output had invalid formatting: ${firstAttempt.reason}\n` +
            `You MUST respond using ONLY the <<<<<<< SEARCH ... ======= ... >>>>>>> REPLACE block format. ` +
            `Wrap each edit in its own block. Here is the original request again: ${prompt}`;

        // Stream the retry silently so the terminal isn't cluttered with a
        // second copy of the model's regeneration. If the retry succeeds the
        // success line is printed after; if it fails we fall back to letting
        // the user paste.
        const retried = await streamLLM(retryPrompt, role, model, endpoint, contextFiles, true);
        if (retried === null) {
            console.error(chalk.red('\n[Error]: Could not reach the LLM for the retry. Output above is what was already streamed.'));
            return null;
        }

        const secondAttempt = await applyEdits(filePath, retried);
        if (secondAttempt.success) {
            console.log(chalk.green(`✔ Auto-retry successful. File updated.`));
            return retried;
        }

        // Silent retry didn't apply — print its output now so the user can
        // copy/paste it manually (matches the README's stated fallback).
        console.log(chalk.gray('\n--- Model retry output (manual paste) ---'));
        console.log(chalk.gray(retried));
        console.log(chalk.red(`\n[Error]: Model failed format twice (${secondAttempt.reason}). See block above — copy and apply manually.`));
        return retried;
    }

    return output;
}
