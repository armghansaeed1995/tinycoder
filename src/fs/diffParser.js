import fs from 'fs/promises';
import chalk from 'chalk';

/**
 * Parses and atomically applies multi-block SEARCH/REPLACE diff blocks.
 * If any search segment fails to match uniquely, it rejects the entire file write pass.
 */
export async function applyEdits(filePath, llmOutput) {
    let fileContent = '';
    try {
        fileContent = await fs.readFile(filePath, 'utf-8');
    } catch (error) {
        return { success: false, reason: `Could not open target file: ${error.message}` };
    }

    // Explicit regex extraction for match blocks
    const blockRegex = /<<<<<<< SEARCH([\s\S]*?)=======([\s\S]*?)>>>>>>> REPLACE/g;
    const matches = [...llmOutput.matchAll(blockRegex)];

    if (matches.length === 0) {
        return { success: false, reason: 'No structural SEARCH/REPLACE blocks discovered in output stream.' };
    }

    let updatedContent = fileContent;
    let blocksApplied = 0;

    for (const match of matches) {
        const searchBlock = match[1];
        const replaceBlock = match[2];

        // Normalize string endings to eliminate carriage return mismatches
        const normalizedSearch = searchBlock.replace(/\r\n/g, '\n');
        const normalizedContent = updatedContent.replace(/\r\n/g, '\n');

        if (!normalizedSearch.trim()) {
            // Context injection or pure additions
            continue;
        }

        const matchIndex = normalizedContent.indexOf(normalizedSearch);
        if (matchIndex === -1) {
            return { 
                success: false, 
                reason: `Target search block content match criteria failed.` 
            };
        }

        if (normalizedContent.indexOf(normalizedSearch, matchIndex + 1) !== -1) {
            return { 
                success: false, 
                reason: `Ambiguous target reference. Multi-match ambiguity detected.` 
            };
        }

        // Apply replacement slice line safely
        updatedContent = normalizedContent.replace(normalizedSearch, replaceBlock.replace(/\r\n/g, '\n'));
        blocksApplied++;
    }

    try {
        await fs.writeFile(filePath, updatedContent, 'utf-8');
        return { success: true, blocksApplied };
    } catch (error) {
        return { success: false, reason: `File atomic sync write failure: ${error.message}` };
    }
}