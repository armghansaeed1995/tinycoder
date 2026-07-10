import chalk from 'chalk';
import boxen from 'boxen';
import pkg from 'enquirer';
const { Select, Input } = pkg;

import { getProjectFiles } from '../fs/fileExplorer.js';
import { getCommandsByCategory } from '../commands.js';
import { promptForFile } from '../ui/prompts.js';
import { readContextFile, writeContextFile } from '../fs/contextEditor.js';
import { executeWithRetry, streamLLM } from '../llm/api.js';
import { saveGlobalConfig, isValidEndpoint, GLOBAL_CONFIG_PATH, normalizeEndpoint } from '../config/configManager.js';
import { TINY_CONTEXT_FILE, TINY_PLAN_FILE } from '../constants.js';
import { printDivider, printKeyValue } from '../ui/terminal.js';
import { isCancellation } from '../utils.js';

/** Roles that stream prose but never auto-apply SEARCH/REPLACE patches. */
const CHAT_ONLY_ROLES = new Set(['ask', 'review', 'test']);

/**
 * Main command router for TinyCoder
 */
export async function routeCommand(rawInput, config) {
    const trimmed = rawInput.trim();
    const args = trimmed.split(/\s+/);
    let command = args[0].toLowerCase();
    let promptText = args.slice(1).join(' ');

    // Bare "/" is a strong "show me everything" gesture now that the
    // dropdown advertises it. Short-circuit BEFORE the default-role rewrite
    // so / is *only* ever interpreted as a slash command, never as a
    // free-text default-role prompt.
    if (trimmed === '/') {
        displayHelp(config);
        return;
    }

    // If the input didn't start with a slash, it defaults to the user's default role
    if (!command.startsWith('/')) {
        promptText = trimmed || '';
        command = `/${config.defaultRole || 'code'}`;
    }

    // Strip slash for easier matching
    const action = command.slice(1);

    switch (action) {
        case 'help':
            displayHelp(config);
            break;
        case 'settings':
            await handleSettings(config);
            break;
        case 'ask':
        case 'review':
        case 'test':
        case 'code':
        case 'power':
            await handleCodingAndQA(action, promptText, config);
            break;
        case 'gather':
            await handleGatherContext(promptText, config);
            break;
        case 'plan':
            await handlePlanning(promptText, config);
            break;
        default:
            console.log(chalk.red(`Unknown command: ${command}. Type /help for options.`));
    }
}

/**
 * Handles /code, /power, /ask, /review, and /test commands.
 * Editing roles (`code`, `power`) run a deterministic two-step pipeline:
 * 1. Silent Planning Pass to prevent logic errors and structural hallucinations.
 * 2. Coding Pass backed by the newly formulated strategy.
 */
async function handleCodingAndQA(action, promptText, config) {
    if (!promptText) {
        console.log(chalk.yellow(`Please provide a prompt. Example: /${action} Fix the bug in this file`));
        return;
    }

    const isChatOnly = CHAT_ONLY_ROLES.has(action);
    let targetFilePath = null;

    if (!isChatOnly) {
        try {
            const files = await getProjectFiles();
            if (files.length === 0) {
                console.log(chalk.yellow('No files found in the current directory tree. Proceeding strictly as chat.'));
            } else {
                targetFilePath = await promptForFile(files);
                if (!targetFilePath) {
                    console.log(chalk.gray('File selection skipped or cancelled. Proceeding as generic prompt.'));
                } else {
                    console.log(chalk.gray(`Target file locked: ${targetFilePath}`));
                    promptText = `Target File: ${targetFilePath}\n\nUser Request: ${promptText}`;
                }
            }
        } catch (e) {
            console.log(chalk.gray('File selection skipped or cancelled. Proceeding as generic prompt.'));
        }
    }

    // Build context strings from optional local Markdown files if present.
    const tinyContext = await readContextFile(TINY_CONTEXT_FILE) || '';
    const tinyPlan = await readContextFile(TINY_PLAN_FILE) || '';
    const systemContextBlock = `\n---\n[${TINY_CONTEXT_FILE} Contents]\n${tinyContext}\n---\n[${TINY_PLAN_FILE} Contents]\n${tinyPlan}\n`.trim();

    let executionPrompt = promptText;

    // --- STEP 1: DETERMINISTIC SILENT PLANNING PIPELINE ---
    if (!isChatOnly) {
        const planModel = config.models.plan || 'llama3.2:1b';
        process.stdout.write(chalk.cyan(`\n🧠 [Pipeline] Formulating implementation strategy with [${planModel}]... `));
        
        const internalPlanInstruction = `Analyze the target file and requirements. Write a brief, hyper-focused 3-bullet technical breakdown of the exact code replacements needed. Do not output code blocks. Prompt: ${promptText}`;
        
        const generatedPlan = await streamLLM(internalPlanInstruction, 'internal_planner', planModel, config.endpoint, systemContextBlock, true);
        
        if (generatedPlan && generatedPlan.trim()) {
            console.log(chalk.green('📋 Strategy prepared successfully.'));
            // Inject the crisp strategy plan directly into the next stage context window
            executionPrompt = `Implementation Strategy Plan:\n${generatedPlan.trim()}\n\nOriginal Task Request:\n${promptText}`;
        } else {
            console.log(chalk.yellow('⚠️ Planning step timed out or returned empty. Falling back to direct execution.'));
        }
    }

    // --- STEP 2: STABLE CODE EXECUTION GENERATION ---
    const modelToUse = config.models[action] || config.models.code;
    console.log(chalk.gray(`🚀 [Pipeline] Processing code implementation using model: ${modelToUse}...\n`));

    await executeWithRetry(
        executionPrompt,
        action,
        modelToUse,
        config.endpoint,
        targetFilePath,
        systemContextBlock
    );
}

/**
 * Handles /gather - Context Gatherer
 */
async function handleGatherContext(promptText, config) {
    console.log(chalk.gray('Scanning local directory structure and configuration files...'));

    let files = [];
    try {
        files = await getProjectFiles();
    } catch (e) {
        console.error(chalk.red(`[Error] Could not scan project files: ${e.message}`));
        return;
    }
    const directoryTree = files.join('\n');

    let packageJsonSnippet = '';
    try {
        const packageJson = await readContextFile('package.json');
        if (packageJson) {
            packageJsonSnippet = `\n\n[package.json]:\n${packageJson}`;
        }
    } catch {
        // No package.json — perfectly fine not every project has one.
    }

    const instruction = `Generate a structural configuration overview for the following file tree. ${promptText}\n\nFiles:\n${directoryTree}${packageJsonSnippet}`;
    const modelToUse = config.models.gather;

    console.log(chalk.gray(`Running [/gather] context processing engine with ${modelToUse}...`));
    const output = await executeWithRetry(instruction, 'gather', modelToUse, config.endpoint, null, '');

    if (output) {
        await writeContextFile(TINY_CONTEXT_FILE, output);
    }
}

/**
 * Handles /plan - Project Task Planner
 */
async function handlePlanning(promptText, config) {
    if (!promptText) {
        console.log(chalk.yellow('Please describe what you want to plan. Example: /plan Implement JWT Auth'));
        return;
    }

    const tinyContext = await readContextFile(TINY_CONTEXT_FILE) || 'No context generated yet.';
    const instruction = `Create a strict structural step-by-step feature build plan for: ${promptText}`;
    const modelToUse = config.models.plan;

    console.log(chalk.gray(`Running [/plan] planner engine with ${modelToUse}...`));
    const output = await executeWithRetry(instruction, 'plan', modelToUse, config.endpoint, null, tinyContext);

    if (output) {
        await writeContextFile(TINY_PLAN_FILE, output);
    }
}

/**
 * Interactive /settings configuration panel
 */
async function handleSettings(config) {
    console.log(chalk.bold.cyan('\n--- TinyCoder Settings Dashboard ---'));
    printKeyValue('Endpoint', config.endpoint);
    printKeyValue('Default', `/${config.defaultRole}`);
    printDivider();

    const menu = new Select({
        name: 'action',
        message: 'What would you like to modify?',
        choices: [
            { name: 'view', message: 'View Active Role Mapping Models' },
            { name: 'changeModel', message: 'Update a Role Model Mapping' },
            { name: 'changeEndpoint', message: 'Modify LLM API Endpoint' },
            { name: 'changeDefault', message: 'Toggle Default Coding Command' },
            { name: 'exit', message: 'Back to terminal' }
        ]
    });

    let choice;
    try {
        choice = await menu.run();
    } catch (e) {
        if (isCancellation(e)) {
            console.log(chalk.gray('\nCancelled.'));
            return;
        }
        throw e;
    }

    try {
        if (choice === 'view') {
            console.log(chalk.cyan('\nCurrent Models Configured per Role:'));
            Object.entries(config.models).forEach(([role, model]) => {
                console.log(`  ${chalk.bold(role.padEnd(10))}: ${chalk.green(model)}`);
            });
            console.log('');
        }
        else if (choice === 'changeModel') {
            const roleMenu = new Select({
                name: 'role',
                message: 'Select the role you want to map:',
                choices: Object.keys(config.models)
            });
            const selectedRole = await roleMenu.run();

            const modelInput = new Input({
                message: `Enter the model string for [${selectedRole}] (e.g. llama3.2:1b):`,
                initial: config.models[selectedRole]
            });
            const newModelName = (await modelInput.run()).trim();
            if (!newModelName) {
                console.log(chalk.yellow('Model name cannot be empty — no change made.'));
                return;
            }
            const oldModel = config.models[selectedRole];
            config.models[selectedRole] = newModelName;
            const success = await saveGlobalConfig(config);
            if (success) {
                console.log(chalk.green(`✔ Updated global role map: ${selectedRole} -> ${newModelName}`));
            } else {
                config.models[selectedRole] = oldModel;
                console.log(chalk.red(`✖ Could not persist model mapping change — nothing was saved. Check that ${GLOBAL_CONFIG_PATH} is writable.`));
            }
        }
        else if (choice === 'changeEndpoint') {
            const urlInput = new Input({
                message: 'Enter your OpenAI-compatible base endpoint:',
                initial: config.endpoint
            });
            const newEndpoint = (await urlInput.run()).trim();
            if (!isValidEndpoint(newEndpoint)) {
                console.log(chalk.yellow("That doesn't look like an http(s) URL — no change made."));
                return;
            }
            const oldEndpoint = config.endpoint;
            config.endpoint = normalizeEndpoint(newEndpoint);
            const success = await saveGlobalConfig(config);
            if (success) {
                console.log(chalk.green(`✔ Global Endpoint modified to ${config.endpoint}.`));
            } else {
                config.endpoint = oldEndpoint;
                console.log(chalk.red(`✖ Could not persist endpoint change — nothing was saved. Check that ${GLOBAL_CONFIG_PATH} is writable.`));
            }
        }
        else if (choice === 'changeDefault') {
            const defMenu = new Select({
                name: 'defaultRole',
                message: 'Select your default direct prompt fallback role:',
                choices: ['code', 'power', 'ask']
            });
            const oldDefaultRole = config.defaultRole;
            config.defaultRole = await defMenu.run();
            const success = await saveGlobalConfig(config);
            if (success) {
                console.log(chalk.green(`✔ Default behavior mapped to /${config.defaultRole}`));
            } else {
                config.defaultRole = oldDefaultRole;
                console.log(chalk.red(`✖ Could not persist default role change — nothing was saved. Check that ${GLOBAL_CONFIG_PATH} is writable.`));
            }
        }
        else if (choice === 'exit') {
            console.log(chalk.gray('Returning to chat. Type /settings any time to come back.'));
        }
    } catch (e) {
        if (isCancellation(e)) {
            console.log(chalk.gray('\nCancelled.'));
            return;
        }
        console.error(chalk.red(`[Error] Settings change failed: ${e.message}`));
    }
}

/**
 * Render the help screen grouped by category, driven entirely by the COMMANDS
 * registry in src/commands.js.
 */
function displayHelp(config) {
    const groups = getCommandsByCategory();
    const sections = [];
    for (const [category, cmds] of groups) {
        const lines = cmds.map(cmd => {
            const label = cmd.name.padEnd(12);
            return `  ${chalk.bold(label)} ${chalk.gray(cmd.description)}`;
        });
        sections.push(chalk.bold.cyan(category.toUpperCase()) + '\n' + lines.join('\n'));
    }

    const header = chalk.bold.cyan('⚡ TinyCoder Commands');
    const defaultRole = config?.defaultRole ? `/${config.defaultRole}` : '/code';
    const footer = chalk.gray(
        '\n\nHow it works' +
        chalk.bold(':') +
        '\n  • ' + chalk.bold('Type /') + ' to open the live dropdown. Arrow + Enter picks a single-word verb like /help or /exit.' +
        '\n  • For commands that take a prompt body (' +
        chalk.cyan('/code, /plan, /ask, /review, /test, /power') +
        ') type the FULL string — e.g. ' +
        chalk.cyan('/code fix the navigation bug') +
        ' — and press Enter. The raw line is submitted verbatim.' +
        '\n  • Free text without / is dispatched to your default role (' + chalk.cyan(defaultRole) + ').'
    );

    console.log(boxen(
        header + '\n\n' + sections.join('\n\n') + footer,
        { padding: 1, borderStyle: 'round', borderColor: 'cyan', title: 'Help', titleAlignment: 'center' }
    ));
}