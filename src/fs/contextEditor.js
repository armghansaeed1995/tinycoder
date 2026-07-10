import fs from 'fs/promises';
import path from 'path';
import chalk from 'chalk';
import { promptForOverwrite } from '../ui/prompts.js';

/**
 * Safely loads context files. Returns null if the file does not exist or
 * cannot be read.
 */
export async function readContextFile(filename) {
    const filePath = path.join(process.cwd(), filename);
    try {
        const data = await fs.readFile(filePath, 'utf-8');
        // Treat empty strings as `null` so callers can use a simple `if (!x)` check.
        return data.length > 0 ? data : null;
    } catch (error) {
        return null;
    }
}

/**
 * Writes to TINYPLAN.md or TINYCONTEXT.md, asking for permission if necessary.
 * Returns true if the file was written, false if the user skipped or an
 * error occurred.
 */
export async function writeContextFile(filename, content) {
    const filePath = path.join(process.cwd(), filename);

    try {
        // Check if file already exists; if so, prompt the user before clobbering.
        await fs.access(filePath);

        const overwrite = await promptForOverwrite(filename);
        if (!overwrite) {
            console.log(chalk.gray(`Skipped writing to ${filename}.`));
            return false;
        }
    } catch (error) {
        // File doesn't exist (ENOENT) — safe to create without prompting.
        if (error.code && error.code !== 'ENOENT') {
            console.error(chalk.red(`Cannot access ${filename}: ${error.message}`));
            return false;
        }
    }

    try {
        await fs.writeFile(filePath, content, 'utf-8');
        console.log(chalk.green(`✔ Successfully wrote to ${filename}`));
        return true;
    } catch (error) {
        console.error(chalk.red(`Failed to write ${filename}: ${error.message}`));
        return false;
    }
}
