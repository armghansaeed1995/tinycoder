import chalk from 'chalk';

/**
 * Centralized registry of every slash command tinycoder understands.
 *
 * Both the /help renderer (displayHelp in src/commands/handlers.js) and the
 * `/`-triggered autocomplete dropdown in src/index.js read from this array,
 * so adding or renaming a command only requires editing here.
 *
 * Fields:
 * - name        the literal slash verb the user types (e.g. '/code')
 * - description one-line explanation shown in /help and the dropdown
 * - category    grouping key used by /help (Coding | Project | System)
 */
export const COMMANDS = [
    { name: '/code',     description: 'Plan & edit code with the default model (Pipeline)', category: 'Coding' },
    { name: '/power',    description: 'Plan & edit complex logic with a larger model (Pipeline)', category: 'Coding' },
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
 * - always pins the user's *raw typed input* as the first choice so
 * pressing Enter returns the literal text they typed (including any
 * trailing prompt body, e.g. "/code fix the nav bug");
 * - if the user is typing a slash verb, appends matching commands beneath
 * the raw line so arrow-down + Enter can pick one;
 * - caps the matched-command list at `maxSuggestions - 1` so the raw line
 * never gets pushed past enquirer's `limit` ceiling;
 * - never returns an empty list when the prompt is first opened — a
 * placeholder is shown so the user immediately learns that `/` unlocks
 * the command list.
 *
 * Returning the raw input as a real `name` keeps enquirer's `result` value
 * exactly equal to what the user typed — no mutation, no truncation.
 *
 * @param {object} [opts]
 * @param {number} [opts.maxSuggestions=8] cap on how many *command* matches
 * are surfaced beneath the raw line. The total visible list size will be
 * `maxSuggestions` (raw + matches).
 */
/**
 * Build an enquirer `suggest(input, choices)` override that:
 * - hides the dropdown entirely when the input is empty (no `/` typed yet);
 * - keeps free text (e.g. "hi there") flowing through by returning it as a
 * single fake choice so enquirer's AutoComplete can still submit on Enter
 * (returning `[]` here would trap the user — Enquirer refuses to submit
 * an empty choice list);
 * - when the user is typing a slash verb, appends matching commands beneath
 * the raw line so arrow + Enter can pick one;
 * - **dedupes** when the typed text equals an existing verb exactly (e.g.
 * `/settings`). Two choices with the same name breaks enquirer's AutoComplete
 * submit (it threw / returned undefined, which then killed the main loop in
 * src/index.js — that was why `/settings`, `/help`, etc. "showed nothing");
 * - caps the matched-command list at `maxSuggestions - 1` so the raw line
 * never gets pushed past enquirer's `limit` ceiling.
 *
 * @param {object} [opts]
 * @param {number} [opts.maxSuggestions=8] cap on total visible items.
 */
export function makeSlashSuggest({ maxSuggestions = 8 } = {}) {
    return function suggest(input) {
        const raw = input == null ? '' : String(input);

        // Empty prompt → no dropdown at all (per user request: don't show
        // command choices until `/` is typed).
        if (!raw) return [];

        const rawChoice = { name: raw, message: chalk.cyan(raw) };

        // Free text with no slash verb — still expose the typed line as a
        // single fake choice so Enquirer's AutoComplete accepts Enter and
        // returns the raw text. The display shows just the user's line.
        if (!raw.startsWith('/')) {
            return [rawChoice];
        }

        const verb = raw.split(/\s+/)[0].toLowerCase();
        const matches = getAutocompleteChoices()
            .filter(c => c.name.toLowerCase().startsWith(verb))
            .slice(0, maxSuggestions - 1);

        // DEDUP: if the raw typed text is *exactly* one of the registered
        // verbs (e.g. `/settings`, `/gather`), don't also pin it as a
        // rawChoice — two choices with the same name broke Enquirer's
        // submit, which is what made every command after the first seem to
        // "do nothing".
        const matchNames = new Set(matches.map(m => m.name));
        if (matchNames.has(raw)) return matches;

        // Otherwise pin raw typed text as item #1 so multi-arg commands
        // like `/code fix the bug` submit verbatim on Enter instead of
        // collapsing to just `/code`.
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