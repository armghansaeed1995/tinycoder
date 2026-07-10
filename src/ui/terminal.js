import chalk from 'chalk';
import boxen from 'boxen';

/**
 * Tiny terminal helpers used across the UI layer. Kept here so the rest of
 * the codebase doesn't sprinkle chalk + boxen boilerplate everywhere.
 */

/**
 * Print a small banner inside a colored box.
 *
 * @param {string} title  The main heading (rendered bold cyan).
 * @param {string} body   Optional descriptive body text (gray).
 * @param {object} [opts] Optional overrides forwarded to boxen.
 */
export function printBanner(title, body = '', opts = {}) {
    const content = chalk.bold.cyan(title) + (body ? chalk.gray('\n' + body) : '');
    console.log(boxen(content, {
        padding: 1,
        margin: { top: 1, bottom: 1, left: 0, right: 0 },
        borderStyle: 'round',
        borderColor: 'cyan',
        ...opts
    }));
}

/**
 * Print a tip / notice in a yellow boxed callout.
 */
export function printTip(message) {
    console.log(boxen(chalk.yellow(message), {
        padding: 1,
        margin: { top: 0, bottom: 1, left: 0, right: 0 },
        borderStyle: 'classic',
        borderColor: 'yellow'
    }));
}

/**
 * Print a centered gray divider line. Useful between unrelated commands.
 *
 * @param {number} [width=60]
 */
export function printDivider(width = 60) {
    console.log(chalk.gray('─'.repeat(width)));
}

/**
 * Print a labeled status line. Pass a single-glyph `symbol` (e.g. '✔', '•')
 * followed by a bold label and an optional gray detail.
 */
export function printStatus(symbol, label, detail = '') {
    const tail = detail ? chalk.gray(` — ${detail}`) : '';
    console.log(`${symbol} ${chalk.bold(label)}${tail}`);
}

/**
 * Print `key: value` for /settings view dashboard layouts cleanly.
 */
export function printKeyValue(key, value) {
    console.log(`  ${chalk.bold(key.padEnd(14))}: ${chalk.green(value)}`);
}