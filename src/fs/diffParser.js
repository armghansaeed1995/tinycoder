import fs from 'fs/promises';
import chalk from 'chalk';

/**
 * Extracts SEARCH/REPLACE blocks from LLM output.
 */
export function extractBlocks(text) {
    const blockRegex = /<<<<<<< SEARCH\n([\s\S]*?)\n=======\n([\s\S]*?)\n>>>>>>> REPLACE/g;
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
 * Applies blocks to a file string. Throws errors if safety checks fail.
 */
export async function applyEdits(filePath, llmOutput) {
    const blocks = extractBlocks(llmOutput);
    
    if (blocks.length === 0) {
        return { success: false, reason: "No valid SEARCH/REPLACE blocks found in output." };
    }

    try {
        let content = await fs.readFile(filePath, 'utf-8');

        for (const block of blocks) {
            // Check if the search text exactly exists in the file
            if (!content.includes(block.search)) {
                return { 
                    success: false, 
                    reason: "Search block did not exactly match any code in the file. Context might be wrong." 
                };
            }
            
            // Apply the replacement
            content = content.replace(block.search, block.replace);
        }

        await fs.writeFile(filePath, content, 'utf-8');
        return { success: true };

    } catch (error) {
        return { success: false, reason: `File error: ${error.message}` };
    }
}