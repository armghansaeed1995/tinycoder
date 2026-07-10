import fs from 'fs/promises';
import path from 'path';

const SYSTEM_IGNORE_DIRS = new Set(['.git', 'node_modules', 'dist', 'build', '.shadow-cljs']);

/**
 * Recursively scans directory paths and collects active text configuration assets.
 */
export async function getProjectFiles(dir = process.cwd()) {
    let filesList = [];
    let entries = [];
    
    try {
        entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
        return filesList;
    }

    for (const entry of entries) {
        const resPath = path.join(dir, entry.name);
        
        if (SYSTEM_IGNORE_DIRS.has(entry.name)) {
            continue;
        }

        if (entry.isSymbolicLink()) {
            continue; // Skip symlink iterations to avoid recursion loops
        }

        if (entry.isDirectory()) {
            const subFiles = await getProjectFiles(resPath);
            filesList = filesList.concat(subFiles);
        } else {
            const relativePath = path.relative(process.cwd(), resPath);
            filesList.push(relativePath);
        }
    }

    return filesList;
}