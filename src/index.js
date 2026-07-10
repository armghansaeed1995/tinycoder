import chalk from 'chalk';
import boxen from 'boxen';
import pkg from 'enquirer';
const { prompt } = pkg;

import { loadConfig } from './config/configManager.js';
import { routeCommand } from './commands/handlers.js';
import { readContextFile } from './fs/contextEditor.js';

export async function runCli() {
    console.clear();

    const banner = chalk.bold.cyan('⚡ TinyCoder CLI') + 
                   chalk.gray('\nFast, local, low-resource coding assistant.');
    
    console.log(boxen(banner, {
        padding: 1,
        margin: 1,
        borderStyle: 'round',
        borderColor: 'cyan'
    }));

    console.log(chalk.gray('Initializing system configuration...'));
    const config = await loadConfig();
    console.log(chalk.green('✔ Engine settings loaded.'));

    // Resource constraint optimization reminder check
    const hasContext = await readContextFile('TINYCONTEXT.md');
    if (!hasContext) {
        console.log(boxen(
            chalk.yellow('💡 [Optimization Tip]: No codebase context mapped yet.\nRun ') + 
            chalk.bold.white('/gather') + 
            chalk.yellow(' to generate your project structural file layout maps.\nThis minimizes context window processing overhead.'),
            { padding: 1, borderStyle: 'classic', borderColor: 'yellow' }
        ));
    } else {
        console.log(chalk.green('✔ Found active TINYCONTEXT.md profile.'));
    }
    
    console.log(chalk.gray('Type /help for operations, or /exit to break environment session.\n'));

    let running = true;
    while (running) {
        try {
            const response = await prompt({
                type: 'input',
                name: 'userInput',
                message: chalk.cyan('tiny>'),
                prefix: '🚀'
            });

            const input = response.userInput.trim();

            if (!input) continue;

            if (input.toLowerCase() === '/exit' || input.toLowerCase() === '/quit') {
                console.log(chalk.gray('\nSession ended safely. Clean exit executed.'));
                running = false;
                break;
            }

            // Route execution commands seamlessly
            await routeCommand(input, config);

        } catch (error) {
            if (error === '' || error.message === 'canceled') {
                console.log(chalk.gray('\nSession aborted. Goodbye!'));
                running = false;
            } else {
                console.error(chalk.red(`\nAn unexpected runtime error occurred: ${error.message}`));
            }
        }
    }
}