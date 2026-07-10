import fs from 'fs/promises';
import path from 'path';
import chalk from 'chalk';
import { promptForOverwrite } from '../ui/prompts.js';

/**
 * Safely loads context files. Returns null if the file does not exist or
 * cannot be read[cite: 12].
 */
export async function readContextFile(filename) {
    const filePath = path.join(process.cwd(), filename); //[cite: 12]
    try {
        const data = await fs.readFile(filePath, 'utf-8'); //[cite: 12]
        // Treat empty strings as `null` so callers can use a simple `if (!x)` check[cite: 12].
        return data.length > 0 ? data : null; //[cite: 12]
    } catch (error) {
        return null; //[cite: 12]
    }
}

/**
 * Writes to TINYPLAN.md or TINYCONTEXT.md, asking for permission if necessary[cite: 12].
 * Returns true if the file was written, false if the user skipped or an
 * error occurred[cite: 12].
 */
export async function writeContextFile(filename, content) {
    const filePath = path.join(process.cwd(), filename); //[cite: 12]

    try {
        // Check if file already exists; if so, prompt the user before clobbering[cite: 12].
        await fs.access(filePath); //[cite: 12]

        const overwrite = await promptForOverwrite(filename); //[cite: 12]
        if (!overwrite) {
            console.log(chalk.gray(`\n⏸️ Skipped writing to ${filename}.`));
            return false; //[cite: 12]
        }
    } catch (error) {
        // File doesn't exist (ENOENT) — safe to create without prompting[cite: 12].
        if (error.code && error.code !== 'ENOENT') { //[cite: 12]
            console.error(chalk.red(`\n✖ Cannot access ${filename}: ${error.message}`));
            return false; //[cite: 12]
        }
    }

    try {
        await fs.writeFile(filePath, content, 'utf-8'); //[cite: 12]
        console.log(chalk.green(`\n✔ Successfully saved compilation maps to ${filename}`));
        return true; //[cite: 12]
    } catch (error) {
        console.error(chalk.red(`\n✖ Failed to write ${filename}: ${error.message}`));
        return false; //[cite: 12]
    }
}