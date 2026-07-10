import chalk from 'chalk';

/**
 * Centralized registry of every slash command tinycoder understands.
 *
 * Both the /help renderer (displayHelp in src/commands/handlers.js) and the
 * `/`-triggered autocomplete dropdown in src/index.js read from this array,
 * so adding or renaming a command only requires editing here.
 *
 * Fields:
 *   - name        the literal slash verb the user types (e.g. '/code')
 *   - description one-line explanation shown in /help and the dropdown
 *   - category    grouping key used by /help (Coding | Project | System)
 */
export const COMMANDS = [
    { name: '/code',     description: 'Edit or generate code with the default model', category: 'Coding' },
    { name: '/power',    description: 'Tackle complex logic with a larger model',     category: 'Coding' },
    { name: '/ask',      description: 'Plain chat — never edits files',               category: 'Coding' },
    { name: '/review',   description: 'Review a target file for bugs / syntax',       category: 'Coding' },
    { name: '/test',     description: 'Generate unit tests for a target file',        category: 'Coding' },
    { name: '/gather',   description: 'Build or update TINYCONTEXT.md project map',   category: 'Project' },
    { name: '/plan',     description: 'Generate a TINYPLAN.md task breakdown',        category: 'Project' },
    { name: '/settings', description: 'Configure models, endpoint, and defaults',     category: 'System' },
    { name: '/help',     description: 'Show this command reference',                  category: 'System' },
    { name: '/exit',     description: 'Safely end the session',                       category: 'System' }
];

/**
 * Choices in the shape enquirer's AutoComplete wants: { name, message }.
 * The `message` is what shows in the dropdown; the `name` is what gets
 * submitted if the user arrow-downs + Enters to pick the choice.
 */
export function getAutocompleteChoices() {
    return COMMANDS.map(({ name, description }) => ({
        name,
        message: `${chalk.bold(name.padEnd(12))} ${chalk.gray(description)}`
    }));
}

/**
 * Build an enquirer `suggest(input, choices)` override that:
 *   - always pins the user's *raw typed input* as the first choice so
 *     pressing Enter returns the literal text they typed (including any
 *     trailing prompt body, e.g. "/code fix the nav bug");
 *   - if the user is typing a slash verb, appends matching commands beneath
 *     the raw line so arrow-down + Enter can pick one;
 *   - caps the matched-command list at `maxSuggestions - 1` so the raw line
 *     never gets pushed past enquirer's `limit` ceiling;
 *   - never returns an empty list when the prompt is first opened — a
 *     placeholder is shown so the user immediately learns that `/` unlocks
 *     the command list.
 *
 * Returning the raw input as a real `name` keeps enquirer's `result` value
 * exactly equal to what the user typed — no mutation, no truncation.
 *
 * @param {object} [opts]
 * @param {number} [opts.maxSuggestions=8] cap on how many *command* matches
 *   are surfaced beneath the raw line. The total visible list size will be
 *   `maxSuggestions` (raw + matches).
 */
export function makeSlashSuggest({ maxSuggestions = 8 } = {}) {
    return function suggest(input) {
        const raw = input == null ? '' : String(input);
        const placeholder = raw
            ? chalk.cyan(raw)
            : chalk.gray(
                '(type / for the command list — or type the full command, ' +
                'e.g. /code fix the bug, then press Enter)'
            );
        const rawChoice = { name: raw, message: placeholder };

        // Free text — no slash verb in sight. Still return the rawChoice so
        // the user sees the typed line and a release-Enter hint instead of
        // a blank dropdown.
        if (!raw.startsWith('/')) {
            return [rawChoice];
        }

        const verb = raw.split(/\s+/)[0].toLowerCase();
        const matches = getAutocompleteChoices()
            .filter(c => c.name.toLowerCase().startsWith(verb))
            .slice(0, maxSuggestions - 1);

        return [rawChoice, ...matches];
    };
}

/**
 * Group commands by category while preserving the declared order of COMMANDS.
 * Used by displayHelp() to render the help screen in a stable, sectioned way.
 */
export function getCommandsByCategory() {
    const groups = new Map();
    for (const cmd of COMMANDS) {
        if (!groups.has(cmd.category)) groups.set(cmd.category, []);
        groups.get(cmd.category).push(cmd);
    }
    return groups;
}
