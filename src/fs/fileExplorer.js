import fs from 'fs/promises';
import path from 'path';

/**
 * Reads local .gitignore and merges it with default heavy directories.
 */
async function getIgnoredPatterns(dir) {
    const patterns = ['.git', 'node_modules', '.env', 'dist', 'build']; 
    try {
        const gitignore = await fs.readFile(path.join(dir, '.gitignore'), 'utf-8');
        const parsed = gitignore.split('\n')
            .map(line => line.trim())
            .filter(line => line && !line.startsWith('#'));
        patterns.push(...parsed);
    } catch (error) {
        // No .gitignore found, proceed with defaults
    }
    return patterns;
}

/**
 * Basic matcher to check if a file/folder should be skipped.
 */
function isIgnored(itemPath, patterns) {
    return patterns.some(pattern => {
        // Handle wildcards like *.log
        if (pattern.startsWith('*.')) {
            return itemPath.endsWith(pattern.slice(1));
        }
        // Exact match or folder match
        return itemPath === pattern || itemPath.startsWith(pattern + '/') || itemPath.startsWith(pattern + '\\');
    });
}

/**
 * Recursively gets all project files for the fuzzy finder.
 */
export async function getProjectFiles(dir = process.cwd()) {
    const patterns = await getIgnoredPatterns(dir);
    const files = [];

    async function scan(currentDir, relativePath = '') {
        const entries = await fs.readdir(currentDir, { withFileTypes: true });

        for (const entry of entries) {
            const entryRelativePath = path.join(relativePath, entry.name);
            
            // Skip ignored files/directories
            if (isIgnored(entryRelativePath, patterns) || isIgnored(entry.name, patterns)) {
                continue;
            }

            const fullPath = path.join(currentDir, entry.name);

            if (entry.isDirectory()) {
                await scan(fullPath, entryRelativePath);
            } else {
                files.push(entryRelativePath);
            }
        }
    }

    await scan(dir);
    return files;
}