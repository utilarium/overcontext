import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import { existsSync } from 'node:fs';
import {
    discoverContextRoot,
    ensureContextRoot,
    createSchemaRegistry,
    BaseEntitySchema,
} from '../../src';

describe('discoverContextRoot', () => {
    let tempDir: string;
    let projectDir: string;

    beforeEach(async () => {
        tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'overcontext-root-'));
        projectDir = path.join(tempDir, 'project');

        await fs.mkdir(projectDir, { recursive: true });

        // Create context directories
        await fs.mkdir(path.join(tempDir, 'context', 'people'), { recursive: true });
        await fs.mkdir(path.join(projectDir, 'context', 'terms'), { recursive: true });

        // Add marker
        await fs.writeFile(path.join(projectDir, '.git'), '');
    });

    afterEach(async () => {
        await fs.rm(tempDir, { recursive: true, force: true });
    });

    it('discovers all context directories', async () => {
        const root = await discoverContextRoot({
            startDir: projectDir,
            contextDirName: 'context',
        });

        expect(root.directories.length).toBeGreaterThanOrEqual(1);
    });

    it('sets primary to closest directory', async () => {
        const root = await discoverContextRoot({
            startDir: projectDir,
            contextDirName: 'context',
        });

        expect(root.primary).toBe(path.join(projectDir, 'context'));
    });

    it('lists all context paths', async () => {
        const root = await discoverContextRoot({
            startDir: projectDir,
            contextDirName: 'context',
        });

        expect(root.contextPaths).toContain(path.join(projectDir, 'context'));
    });

    it('collects all types', async () => {
        const registry = createSchemaRegistry();
        registry.register({ type: 'person', schema: BaseEntitySchema, pluralName: 'people' });
        registry.register({ type: 'term', schema: BaseEntitySchema, pluralName: 'terms' });

        const root = await discoverContextRoot({
            startDir: projectDir,
            contextDirName: 'context',
            registry,
        });

        // At least one type should be found
        expect(root.allTypes.length).toBeGreaterThan(0);
        // The types found depend on which context directories exist
        const hasPersonOrTerm = root.allTypes.includes('person') || root.allTypes.includes('term');
        expect(hasPersonOrTerm).toBe(true);
    });

    it('uses default options', async () => {
        const root = await discoverContextRoot({
            startDir: projectDir,
        });

        expect(root).toBeDefined();
    });

    it('returns empty when no context found', async () => {
        const emptyDir = path.join(tempDir, 'empty');
        await fs.mkdir(emptyDir, { recursive: true });

        const root = await discoverContextRoot({
            startDir: emptyDir,
            contextDirName: 'nonexistent',
        });

        expect(root.directories).toEqual([]);
        expect(root.primary).toBeUndefined();
    });
});

describe('ensureContextRoot', () => {
    let tempDir: string;

    beforeEach(async () => {
        tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'overcontext-ensure-'));
    });

    afterEach(async () => {
        await fs.rm(tempDir, { recursive: true, force: true });
    });

    it('creates context directory if missing', async () => {
        const contextPath = await ensureContextRoot(tempDir, 'context');

        expect(existsSync(contextPath)).toBe(true);
        expect(contextPath).toBe(path.join(tempDir, 'context'));
    });

    it('returns existing context directory', async () => {
        const contextDir = path.join(tempDir, 'context');
        await fs.mkdir(contextDir);

        const contextPath = await ensureContextRoot(tempDir, 'context');

        expect(contextPath).toBe(contextDir);
    });

    it('uses default name', async () => {
        const contextPath = await ensureContextRoot(tempDir);

        expect(contextPath).toBe(path.join(tempDir, 'context'));
    });
});
