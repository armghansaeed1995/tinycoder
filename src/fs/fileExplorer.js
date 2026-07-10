import fs from 'fs/promises';
import path from 'path';

/**
 * Default heavy directories that the fuzzy finder should never recurse into.
 * These are applied even when no .gitignore is present so the project layout
 * stays usable on freshly-initialized repos.
 */
const DEFAULT_IGNORED = ['.git', 'node_modules', '.env', 'dist', 'build'];

/**
 * Reads the local .gitignore (if any) and merges its patterns with the
 * built-in defaults. Comments and blank lines are stripped. Trailing
 * directory markers (e.g. `build/`) are normalized.
 */
async function getIgnoredPatterns(dir) {
    const patterns = [...DEFAULT_IGNORED];
    try {
        const gitignore = await fs.readFile(path.join(dir, '.gitignore'), 'utf-8');
        for (const rawLine of gitignore.split('\n')) {
            const line = rawLine.trim();
            if (!line || line.startsWith('#') || line.startsWith('!')) continue;
            // Strip trailing slash used in gitignore to denote directories only.
            patterns.push(line.replace(/\/$/, ''));
        }
    } catch {
        // No .gitignore found — proceed with defaults.
    }
    return patterns;
}

/**
 * Decide whether a file/folder should be skipped. Supports:
 *   - Exact name matches (`.git`, `node_modules`)
 *   - Glob wildcards (`*.log`)
 *   - Path-prefix matches (`build/...`)
 *
 * Negation (`!pattern`) is intentionally not honored — we only *exclude*
 * more from the default deny-list, never re-include.
 */
function isIgnored(itemPath, name, patterns) {
    return patterns.some(pattern => {
        if (!pattern) return false;
        if (pattern.startsWith('*.')) {
            return name.endsWith(pattern.slice(1));
        }
        // Exact name match
        if (name === pattern) return true;
        // Path-prefix match (handles both POSIX and Windows separators)
        return itemPath === pattern
            || itemPath.startsWith(pattern + '/');
    });
}

/**
 * Recursively collects all project files under `dir` (defaults to cwd),
 * respecting .gitignore and a small built-in deny-list. Symlinks are
 * intentionally skipped to avoid infinite recursion on cycles.
 */
export async function getProjectFiles(dir = process.cwd()) {
    const patterns = await getIgnoredPatterns(dir);
    const files = [];

    async function scan(currentDir, relativePath = '') {
        let entries;
        try {
            entries = await fs.readdir(currentDir, { withFileTypes: true });
        } catch {
            // Unreadable directory (perms, EACCES, etc.) — just skip it.
            return;
        }

        for (const entry of entries) {
            // Skip symlinks outright to avoid cycles and surprises.
            if (entry.isSymbolicLink()) continue;

            const entryRelativePath = path.join(relativePath, entry.name);

            if (isIgnored(entryRelativePath, entry.name, patterns)) continue;

            const fullPath = path.join(currentDir, entry.name);

            if (entry.isDirectory()) {
                await scan(fullPath, entryRelativePath);
            } else if (entry.isFile()) {
                files.push(entryRelativePath);
            }
        }
    }

    await scan(dir);
    return files;
}
