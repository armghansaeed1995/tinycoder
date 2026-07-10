import fs from 'fs/promises';

/**
 * Extracts SEARCH/REPLACE blocks from LLM output.
 *
 * The block delimiter strands tolerate a leading or trailing newline so
 * sloppy model outputs still match (e.g. `<<<<<<< SEARCH` with a blank
 * line immediately after).
 */
export function extractBlocks(text) {
    if (typeof text !== 'string' || text.length === 0) return [];

    const blockRegex = /<<<<<<< SEARCH\r?\n([\s\S]*?)\r?\n=======\r?\n([\s\S]*?)\r?\n>>>>>>> REPLACE/g;
    const blocks = [];
    let match;

    while ((match = blockRegex.exec(text)) !== null) {
        blocks.push({
            search: match[1],
            replace: match[2]
        });
    }
    return blocks;
}

/**
 * Applies SEARCH/REPLACE blocks to a file on disk. Throws on I/O errors but
 * returns a structured `{ success, reason }` for any logical failure so the
 * caller can decide whether to retry, fall back to manual paste, etc.
 */
export async function applyEdits(filePath, llmOutput) {
    const blocks = extractBlocks(llmOutput);

    if (blocks.length === 0) {
        return {
            success: false,
            reason: 'No valid SEARCH/REPLACE blocks found in output.'
        };
    }

    try {
        const original = await fs.readFile(filePath, 'utf-8');

        // Validate every block against the *original* content first. If any
        // block doesn't match we refuse to write at all — this prevents a
        // partial mutation followed by a retry that re-edits an already
        // half-modified file.
        const missing = [];
        blocks.forEach((block, index) => {
            if (!original.includes(block.search)) {
                missing.push(`Block #${index + 1}: search text did not match any line in the file.`);
            }
        });
        if (missing.length > 0) {
            return { success: false, reason: missing.join(' ') };
        }

        // Apply atomically: every block matches, so build the final content
        // by walking the blocks and replacing each first occurrence on the
        // *original* snapshot — never on a midway-mutated string.
        let content = original;
        for (const block of blocks) {
            content = content.replace(block.search, block.replace);
        }

        if (content === original) {
            return { success: false, reason: 'Edits produced no textual change.' };
        }

        await fs.writeFile(filePath, content, 'utf-8');
        return { success: true, blocksApplied: blocks.length };

    } catch (error) {
        return { success: false, reason: `File error: ${error.message}` };
    }
}
