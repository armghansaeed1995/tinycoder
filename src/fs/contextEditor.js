import fs from 'fs/promises';
import path from 'path';
import chalk from 'chalk';
import { promptForOverwrite } from '../ui/prompts.js';

/**
 * Safely loads context files. Returns null if they don't exist.
 */
export async function readContextFile(filename) {
    const filePath = path.join(process.cwd(), filename);
    try {
        return await fs.readFile(filePath, 'utf-8');
    } catch (error) {
        return null; 
    }
}

/**
 * Writes to TINYPLAN.md or TINYCONTEXT.md, asking for permission if necessary.
 */
export async function writeContextFile(filename, content) {
    const filePath = path.join(process.cwd(), filename);
    
    try {
        // Check if file exists
        await fs.access(filePath);
        
        // If it does, ask the user what to do
        const overwrite = await promptForOverwrite(filename);
        if (!overwrite) {
            console.log(chalk.gray(`Skipped writing to ${filename}.`));
            return false;
        }
    } catch (error) {
        // File doesn't exist, we can safely create it
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