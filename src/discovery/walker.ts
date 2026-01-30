import * as fs from 'node:fs/promises';
import { existsSync } from 'node:fs';
import * as path from 'node:path';
import { SchemaRegistry } from '../schema/registry';

export interface DiscoveredContextDir {
    /** Absolute path to the context directory */
    path: string;

    /** Distance from starting point (0 = closest) */
    level: number;

    /** Namespaces found in this context dir */
    namespaces: string[];

    /** Entity types found (based on directory names) */
    types: string[];
}

export interface WalkerOptions {
    /** Directory to start searching from */
    startDir: string;

    /** Name of context directory to look for */
    contextDirName: string;

    /** Maximum levels to walk up */
    maxLevels: number;

    /** Stop walking when this directory is reached */
    stopAt?: string;

    /** Stop when finding a marker file (e.g., '.git', 'package.json') */
    stopMarkers?: string[];

    /** Schema registry to identify entity type directories */
    registry?: SchemaRegistry;
}

export interface DirectoryWalker {
    /**
     * Find all context directories walking up from startDir.
     */
    discover(): Promise<DiscoveredContextDir[]>;

    /**
     * Check if a specific directory contains context.
     */
    hasContext(dir: string): Promise<boolean>;
}

export const createDirectoryWalker = (options: WalkerOptions): DirectoryWalker => {
    const {
        startDir,
        contextDirName,
        maxLevels,
        stopAt,
        stopMarkers = [],
        registry,
    } = options;

    const shouldStop = async (dir: string): Promise<boolean> => {
        if (stopAt && dir === stopAt) return true;

        for (const marker of stopMarkers) {
            if (existsSync(path.join(dir, marker))) {
                return true;
            }
        }

        const parent = path.dirname(dir);
        return parent === dir;  // Root
    };

    const getNamespacesAndTypes = async (
        contextDir: string
    ): Promise<{ namespaces: string[]; types: string[] }> => {
        const namespaces: string[] = [];
        const types: string[] = [];

        try {
            const entries = await fs.readdir(contextDir, { withFileTypes: true });

            for (const entry of entries) {
                if (!entry.isDirectory()) continue;

                const subPath = path.join(contextDir, entry.name);
                const subEntries = await fs.readdir(subPath, { withFileTypes: true });

                // Check if this is a type directory (has .yaml files)
                const hasYamlFiles = subEntries.some(
                    sub => sub.isFile() && (sub.name.endsWith('.yaml') || sub.name.endsWith('.yml'))
                );

                // Check if this looks like a type directory (known to registry)
                const isTypeDir = registry
                    ? !!registry.getTypeFromDirectory(entry.name)
                    : hasYamlFiles;

                if (isTypeDir) {
                    const typeName = registry?.getTypeFromDirectory(entry.name) || entry.name;
                    if (!types.includes(typeName)) {
                        types.push(typeName);
                    }
                } else {
                    // Check if it's a namespace (contains type directories)
                    const hasTypeDirs = subEntries.some(sub => {
                        if (!sub.isDirectory()) return false;
                        return registry
                            ? !!registry.getTypeFromDirectory(sub.name)
                            : true;  // Assume any subdir could be a type
                    });

                    if (hasTypeDirs) {
                        namespaces.push(entry.name);
                    }
                }
            }
        } catch {
            // Directory doesn't exist or can't be read
        }

        return { namespaces, types };
    };

    return {
        async discover(): Promise<DiscoveredContextDir[]> {
            const discovered: DiscoveredContextDir[] = [];
            let currentDir = path.resolve(startDir);
            let level = 0;
            const visited = new Set<string>();

            while (level < maxLevels) {
                // Resolve real path to handle symlinks and prevent cycles
                let realPath: string;
                try {
                    realPath = await fs.realpath(currentDir);
                } catch {
                    // If realpath fails, use resolved path (may happen with permissions)
                    realPath = currentDir;
                }

                // Check for symlink cycles
                if (visited.has(realPath)) {
                    break; // Already visited this real path, prevent infinite loop
                }
                visited.add(realPath);

                const contextDir = path.join(currentDir, contextDirName);

                if (existsSync(contextDir)) {
                    const { namespaces, types } = await getNamespacesAndTypes(contextDir);
                    discovered.push({ path: contextDir, level, namespaces, types });
                }

                if (await shouldStop(currentDir)) break;

                currentDir = path.dirname(currentDir);
                level++;
            }

            return discovered;
        },

        async hasContext(dir: string): Promise<boolean> {
            return existsSync(path.join(dir, contextDirName));
        },
    };
};
