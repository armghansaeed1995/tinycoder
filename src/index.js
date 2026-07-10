import chalk from 'chalk';
import pkg from 'enquirer';
const { AutoComplete } = pkg;

import { loadConfig } from './config/configManager.js';
import { routeCommand } from './commands/handlers.js';
import { readContextFile } from './fs/contextEditor.js';
import { TINY_CONTEXT_FILE } from './constants.js';
import { printBanner, printTip, printStatus, printDivider } from './ui/terminal.js';
import { isCancellation } from './utils.js';
import { getAutocompleteChoices, makeSlashSuggest, COMMANDS } from './commands.js';

export async function runCli() {
    console.clear();

    printBanner(
        '⚡ TinyCoder CLI',
        'Fast, local, low-resource coding assistant with Chained Execution Pipeline.'
    );

    printStatus(chalk.gray('•'), 'Initializing system configuration...');
    let config;
    try {
        config = await loadConfig();
        printStatus(chalk.green('✔'), 'Engine settings loaded.');
    } catch (e) {
        console.error(chalk.red(`Could not load configuration: ${e.message}`));
        process.exit(1);
    }

    // Resource-constraint optimization reminder check.
    const hasContext = await readContextFile(TINY_CONTEXT_FILE);
    if (!hasContext) {
        printTip(
            `💡 [Optimization Tip]: No codebase context mapped yet.\n` +
            `Run ${chalk.bold.white('/gather')} to generate your project structural file layout maps.\n` +
            `This minimizes context window processing overhead.`
        );
    } else {
        printStatus(chalk.green('✔'), 'Found active TINYCONTEXT.md profile.');
    }

    console.log(chalk.gray('Type /help for operations, or /exit to break environment session.\n'));

    // AutoComplete limit: 1 raw line + every command in the registry + a
    // small buffer. Deriving from COMMANDS.length means the dropdown never
    // silently truncates when new verbs are added to src/commands.js.
    const suggestionLimit = COMMANDS.length + 2;

    // Factory: a fresh AutoComplete per loop iteration. Reusing an instance
    // would leak `state.input` (the previous command becomes the default
    // value the next time the prompt opens), and it would also let enquirer
    // accumulate match history between turns.
    const buildPrompt = () => {
        const p = new AutoComplete({
            name: 'userInput',
            message: chalk.cyan('tiny>'),
            prefix: '',
            limit: suggestionLimit,
            choices: getAutocompleteChoices()
        });
        // Hook so typing "/" surfaces the slash list while free text and
        // trailing prompt bodies still pass straight through verbatim.
        p.suggest = makeSlashSuggest({ maxSuggestions: suggestionLimit });
        return p;
    };

    let running = true;
    while (running) {
        let response;
        try {
            response = await buildPrompt().run();
        } catch (error) {
            if (isCancellation(error)) {
                console.log(chalk.gray('\nCancelled.'));
            } else {
                console.error(chalk.red(`\nAn unexpected runtime error occurred: ${error?.message || error}`));
            }
            running = false;
            break;
        }

        const input = (response?.userInput || '').trim();
        if (!input) continue;

        if (input.toLowerCase() === '/exit' || input.toLowerCase() === '/quit') {
            console.log(chalk.gray('\nSession ended safely. Clean exit executed.'));
            running = false;
            break;
        }

        try {
            await routeCommand(input, config);
            console.log('');
            printDivider(60);
            console.log('');
        } catch (error) {
            console.error(chalk.red(`\nCommand failed: ${error?.message || error}`));
        }
    }
}