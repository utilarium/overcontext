import * as path from 'node:path';
import { existsSync } from 'node:fs';
import { SchemaRegistry } from '../schema/registry';
import { DiscoveredContextDir, createDirectoryWalker } from './walker';

export interface ContextRootOptions {
    /** Starting directory for discovery */
    startDir?: string;

    /** Name of context directory (default: 'context') */
    contextDirName?: string;

    /** Max levels to search (default: 10) */
    maxLevels?: number;

    /** Markers that indicate project root */
    projectMarkers?: string[];

    /** Schema registry for type detection */
    registry?: SchemaRegistry;
}

export interface ContextRoot {
    /** All discovered context directories (closest first) */
    directories: DiscoveredContextDir[];

    /** Primary context directory for writes */
    primary: string | undefined;

    /** All paths to load context from (in merge order) */
    contextPaths: string[];

    /** All namespaces found across all directories */
    allNamespaces: string[];

    /** All types found across all directories */
    allTypes: string[];
}

export const discoverContextRoot = async (
    options: ContextRootOptions = {}
): Promise<ContextRoot> => {
    const {
        startDir = process.cwd(),
        contextDirName = 'context',
        maxLevels = 10,
        projectMarkers = ['.git', 'package.json'],
        registry,
    } = options;

    const walker = createDirectoryWalker({
        startDir,
        contextDirName,
        maxLevels,
        stopMarkers: projectMarkers,
        registry,
    });

    const directories = await walker.discover();

    // Collect all namespaces and types (deduped)
    const namespaceSet = new Set<string>();
    const typeSet = new Set<string>();

    for (const dir of directories) {
        for (const ns of dir.namespaces) namespaceSet.add(ns);
        for (const type of dir.types) typeSet.add(type);
    }

    return {
        directories,
        primary: directories[0]?.path,
        contextPaths: directories.map(d => d.path),
        allNamespaces: Array.from(namespaceSet),
        allTypes: Array.from(typeSet),
    };
};

/**
 * Create or ensure a context directory exists.
 */
export const ensureContextRoot = async (
    projectDir: string,
    contextDirName: string = 'context'
): Promise<string> => {
    const contextPath = path.join(projectDir, contextDirName);

    if (!existsSync(contextPath)) {
        const fs = await import('node:fs/promises');
        await fs.mkdir(contextPath, { recursive: true });
    }

    return contextPath;
};
