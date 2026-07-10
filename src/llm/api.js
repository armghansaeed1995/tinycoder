import chalk from 'chalk';
import { SYSTEM_PROMPTS } from './roles.js';
import { applyEdits } from '../fs/diffParser.js';

/**
 * Sends a streaming request to an OpenAI-compatible endpoint (like local Ollama).
 */
export async function streamLLM(prompt, role, model, endpoint, contextFiles = "") {
    const systemPrompt = SYSTEM_PROMPTS[role] || SYSTEM_PROMPTS.code;
    
    const messages = [
        { role: "system", content: `${systemPrompt}\n\nProject Context:\n${contextFiles}` },
        { role: "user", content: prompt }
    ];

    return await executeStream(messages, model, endpoint);
}

/**
 * The core streaming engine using native fetch to keep resources low.
 */
async function executeStream(messages, model, endpoint) {
    let fullResponse = "";

    try {
        const response = await fetch(`${endpoint}/chat`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model: model,
                messages: messages,
                stream: true
            })
        });

        if (!response.ok) {
            throw new Error(`LLM API returned status: ${response.status}`);
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder('utf-8');

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            
            const chunk = decoder.decode(value, { stream: true });
            
            // Ollama sends newline-delimited JSON
            const lines = chunk.split('\n').filter(line => line.trim() !== '');
            for (const line of lines) {
                try {
                    const parsed = JSON.parse(line);
                    const token = parsed.message?.content || "";
                    fullResponse += token;
                    // Print instantly to terminal without newlines
                    process.stdout.write(chalk.green(token));
                } catch (e) {
                    // Ignore malformed JSON chunks from the stream
                }
            }
        }
        console.log("\n"); // Clear line after stream finishes
        return fullResponse;

    } catch (error) {
        console.error(chalk.red(`\nConnection Error: Could not reach LLM at ${endpoint}. Is Ollama running?`));
        return null;
    }
}

/**
 * Wraps the stream and handles the 1-time automated format retry logic.
 */
export async function executeWithRetry(prompt, role, model, endpoint, filePath, contextFiles) {
    let output = await streamLLM(prompt, role, model, endpoint, contextFiles);
    
    if (!output) return; // Connection failed

    // If it's a file editing role, attempt to parse the diff
    if (role === 'code' || role === 'power') {
        const editResult = await applyEdits(filePath, output);
        
        if (!editResult.success) {
            console.log(chalk.yellow(`\n[Auto-Retry]: Model format failed (${editResult.reason}). Forcing strict format...`));
            
            // 1-Time Automated Retry Prompt
            const retryPrompt = `Your previous output had invalid formatting. You MUST use the exact <<<<<<< SEARCH ... ======= ... >>>>>>> REPLACE block. Here is the original request: ${prompt}`;
            
            output = await streamLLM(retryPrompt, role, model, endpoint, contextFiles);
            
            const retryEdit = await applyEdits(filePath, output);
            if (!retryEdit.success) {
                console.log(chalk.red(`\n[Error]: Model failed format twice. Falling back to manual copy/paste.`));
                // Output is already printed on the screen via the stream for the user to copy.
            } else {
                console.log(chalk.green(`✔ Auto-retry successful. File updated.`));
            }
        } else {
            console.log(chalk.green(`✔ Edits applied successfully.`));
        }
    }
    
    return output;
}