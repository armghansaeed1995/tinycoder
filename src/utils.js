/**
 * Shared utilities used by multiple modules. Keep this file tiny; it is the
 * canonical home for helpers that would otherwise be copy-pasted across
 * src/index.js and src/commands/handlers.js.
 */

/**
 * Heuristic check for an Enquirer cancellation. Covers every sentinel the
 * library actually throws when the user hits Ctrl+C or cancels an input:
 * - any falsy value (`null`, `undefined`, `''`, `0`, `false`)
 * - a non-Error empty/whitespace string
 * - an `Error` whose `message` is `'canceled'`
 * - an `Error` whose `name` is `'CanceledError'` or `'AbortError'`
 * (AbortController-style aborts)
 *
 * Returns `true` if the value looks like a cancellation, `false` otherwise.
 */
export function isCancellation(error) {
    if (!error) return true;
    if (error === '') return true;
    if (typeof error === 'string' && error.trim() === '') return true;
    if (typeof error === 'object') {
        if (error.message === 'canceled') return true;
        if (error.name === 'CanceledError' || error.name === 'AbortError') return true;
    }
    return false;
}