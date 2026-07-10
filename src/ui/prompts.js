import pkg from 'enquirer';
import chalk from 'chalk';
const { AutoComplete, Confirm } = pkg;

/**
 * Fuzzy search to select a file without needing to type the full path.
 * Refined with explicit instruction labels for the developer.
 */
export async function promptForFile(files) {
    const prompt = new AutoComplete({
        name: 'file',
        message: 'Select a target file to focus (type to fuzzy match):',
        limit: 10,
        choices: files
    });
    return await prompt.run();
}

/**
 * Safety check for TINYCONTEXT.md and TINYPLAN.md overwrites.
 */
export async function promptForOverwrite(filename) {
    const prompt = new Confirm({
        name: 'overwrite',
        message: chalk.yellow(`[Warning] ${filename} already exists. Do you want to overwrite?`),
        initial: false // Default to 'no' to prevent accidental data loss
    });
    return await prompt.run();
}