import chalk from 'chalk';
import pkg from 'enquirer';
const { Select, Input } = pkg;

import { getProjectFiles } from '../fs/fileExplorer.js';
import { promptForFile } from '../ui/prompts.js';
import { readContextFile, writeContextFile } from '../fs/contextEditor.js';
import { executeWithRetry } from '../llm/api.js';
import { saveGlobalConfig } from '../config/configManager.js';

/**
 * Main command router for TinyCoder
 */
export async function routeCommand(rawInput, config) {
    const args = rawInput.trim().split(' ');
    let command = args[0].toLowerCase();
    let promptText = args.slice(1).join(' ');

    // If the input didn't start with a slash, it defaults to the user's default role
    if (!command.startsWith('/')) {
        promptText = rawInput;
        command = `/${config.defaultRole || 'code'}`;
    }

    // Strip slash for easier matching
    const action = command.slice(1);

    switch (action) {
        case 'help':
            displayHelp();
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
 * Handles /code, /power, /ask, /review, and /test commands
 */
async function handleCodingAndQA(action, promptText, config) {
    if (!promptText) {
        console.log(chalk.yellow(`Please provide a prompt. Example: /${action} Fix the bug in this file`));
        return;
    }

    let targetFilePath = null;
    
    // For roles that alter or highly inspect files, pick a file via fuzzy search
    if (action !== 'ask') {
        try {
            const files = await getProjectFiles();
            if (files.length === 0) {
                console.log(chalk.yellow("No files found in the current directory tree. Proceeding strictly as chat."));
            } else {
                targetFilePath = await promptForFile(files);
                console.log(chalk.gray(`Target file locked: ${targetFilePath}`));
                promptText = `Target File: ${targetFilePath}\n\nUser Request: ${promptText}`;
            }
        } catch (e) {
            console.log(chalk.gray("File selection skipped or cancelled. Proceeding as generic prompt."));
        }
    }

    // Build context strings from optional local Markdown files if present
    const tinyContext = await readContextFile('TINYCONTEXT.md') || '';
    const tinyPlan = await readContextFile('TINYPLAN.md') || '';
    const systemContextBlock = `
---
[TINYCONTEXT.md Contents]
${tinyContext}
---
[TINYPLAN.md Contents]
${tinyPlan}
`.trim();

    const modelToUse = config.models[action] || config.models.code;
    console.log(chalk.gray(`Running [/${action}] using model: ${modelToUse}...`));

    await executeWithRetry(
        promptText,
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
    console.log(chalk.gray("Scanning local directory structure and configuration files..."));
    
    const files = await getProjectFiles();
    let directoryTree = files.join('\n');
    let packageJsonSnippet = "";

    try {
        packageJsonSnippet = await readContextFile('package.json') || "";
        if (packageJsonSnippet) {
            packageJsonSnippet = `\n\n[package.json]:\n${packageJsonSnippet}`;
        }
    } catch { /* ignore */ }

    const instruction = `Generate a structural configuration overview for the following file tree. ${promptText}\n\nFiles:\n${directoryTree}${packageJsonSnippet}`;
    const modelToUse = config.models.gather;

    console.log(chalk.gray(`Running [/gather] context processing engine with ${modelToUse}...`));
    const output = await executeWithRetry(instruction, 'gather', modelToUse, config.endpoint, null, "");

    if (output) {
        await writeContextFile('TINYCONTEXT.md', output);
    }
}

/**
 * Handles /plan - Project Task Planner
 */
async function handlePlanning(promptText, config) {
    if (!promptText) {
        console.log(chalk.yellow("Please describe what you want to plan. Example: /plan Implement JWT Auth"));
        return;
    }

    const tinyContext = await readContextFile('TINYCONTEXT.md') || 'No context generated yet.';
    const instruction = `Create a strict structural step-by-step feature build plan for: ${promptText}`;
    const modelToUse = config.models.plan;

    console.log(chalk.gray(`Running [/plan] planner engine with ${modelToUse}...`));
    const output = await executeWithRetry(instruction, 'plan', modelToUse, config.endpoint, null, tinyContext);

    if (output) {
        await writeContextFile('TINYPLAN.md', output);
    }
}

/**
 * Interactive /settings configuration panel
 */
async function handleSettings(config) {
    console.log(chalk.bold.cyan('\n--- TinyCoder Settings Dashboard ---'));
    console.log(chalk.gray(`Endpoint: ${config.endpoint}`));
    console.log(chalk.gray(`Default Command: /${config.defaultRole}\n`));
    
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

    const choice = await menu.run();

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
        const newModelName = await modelInput.run();

        config.models[selectedRole] = newModelName.trim();
        const success = await saveGlobalConfig(config);
        if (success) console.log(chalk.green(`✔ Updated global role map: ${selectedRole} -> ${newModelName}`));
    } 
    
    else if (choice === 'changeEndpoint') {
        const urlInput = new Input({
            message: 'Enter your OpenAI-compatible base endpoint:',
            initial: config.endpoint
        });
        config.endpoint = (await urlInput.run()).trim();
        await saveGlobalConfig(config);
        console.log(chalk.green(`✔ Global Endpoint modified.`));
    }

    else if (choice === 'changeDefault') {
        const defMenu = new Select({
            name: 'defaultRole',
            message: 'Select your default direct prompt fallback role:',
            choices: ['code', 'power', 'ask']
        });
        config.defaultRole = await defMenu.run();
        await saveGlobalConfig(config);
        console.log(chalk.green(`✔ Default behavior mapped to /${config.defaultRole}`));
    }
}

function displayHelp() {
    console.log(boxen(`
${chalk.bold.cyan('Available Manual Commands:')}
  ${chalk.bold('/code <prompt>')}   - General coding context workflow (Default)
  ${chalk.bold('/power <prompt>')}  - Complex logic optimization with larger model
  ${chalk.bold('/gather')}          - Examines local setup and creates/updates ${chalk.underline('TINYCONTEXT.md')}
  ${chalk.bold('/plan <prompt>')}   - Breaks down goals down into ${chalk.underline('TINYPLAN.md')} task lists
  ${chalk.bold('/ask <prompt>')}    - Strictly Chat/Q&A mode. No code editing parameters
  ${chalk.bold('/review')}          - Evaluates a target file for syntax bugs and issues
  ${chalk.bold('/test')}            - Generates unit tests automatically for targeted files
  
${chalk.bold.cyan('System Operations:')}
  ${chalk.bold('/settings')}        - Real-time interaction dashboard for local models/endpoints
  ${chalk.bold('/help')}            - Displays this command reference overview
  ${chalk.bold('/exit')}            - Safely breaks the processing session loop
    `, { padding: 1, borderStyle: 'single', borderColor: 'gray' }));
}