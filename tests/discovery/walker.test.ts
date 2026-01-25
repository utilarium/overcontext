import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import {
    createDirectoryWalker,
    createSchemaRegistry,
    BaseEntitySchema,
} from '../../src';

describe('DirectoryWalker', () => {
    let tempDir: string;
    let projectDir: string;
    let nestedDir: string;

    beforeEach(async () => {
        tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'overcontext-walker-'));
        projectDir = path.join(tempDir, 'project');
        nestedDir = path.join(projectDir, 'subdir', 'nested');

        // Create directory structure
        await fs.mkdir(nestedDir, { recursive: true });

        // Create context at multiple levels
        await fs.mkdir(path.join(tempDir, 'context', 'people'), { recursive: true });
        await fs.mkdir(path.join(projectDir, 'context', 'people'), { recursive: true });
        await fs.mkdir(path.join(nestedDir, 'context', 'people'), { recursive: true });

        // Add a marker file at project level
        await fs.writeFile(path.join(projectDir, 'package.json'), '{}');
    });

    afterEach(async () => {
        await fs.rm(tempDir, { recursive: true, force: true });
    });

    describe('discover', () => {
        it('discovers context at multiple levels', async () => {
            const walker = createDirectoryWalker({
                startDir: nestedDir,
                contextDirName: 'context',
                maxLevels: 10,
            });

            const discovered = await walker.discover();

            expect(discovered.length).toBeGreaterThanOrEqual(2);
            expect(discovered[0].level).toBe(0); // Closest
            expect(discovered[0].path).toBe(path.join(nestedDir, 'context'));
        });

        it('assigns correct level numbers', async () => {
            const walker = createDirectoryWalker({
                startDir: nestedDir,
                contextDirName: 'context',
                maxLevels: 10,
            });

            const discovered = await walker.discover();

            expect(discovered[0].level).toBe(0);
            if (discovered.length > 1) {
                expect(discovered[1].level).toBeGreaterThan(discovered[0].level);
            }
        });

        it('respects maxLevels', async () => {
            const walker = createDirectoryWalker({
                startDir: nestedDir,
                contextDirName: 'context',
                maxLevels: 1,
            });

            const discovered = await walker.discover();

            expect(discovered.length).toBeLessThanOrEqual(1);
        });

        it('stops at marker files', async () => {
            const walker = createDirectoryWalker({
                startDir: nestedDir,
                contextDirName: 'context',
                maxLevels: 10,
                stopMarkers: ['package.json'],
            });

            const discovered = await walker.discover();

            // Should not go beyond project dir (which has package.json)
            const beyondProject = discovered.some(d =>
                d.path.startsWith(tempDir) && !d.path.startsWith(projectDir)
            );
            expect(beyondProject).toBe(false);
        });

        it('stops at specified directory', async () => {
            const walker = createDirectoryWalker({
                startDir: nestedDir,
                contextDirName: 'context',
                maxLevels: 10,
                stopAt: projectDir,
            });

            const discovered = await walker.discover();

            // Should not include anything above projectDir
            const aboveProject = discovered.some(d => !d.path.startsWith(projectDir));
            expect(aboveProject).toBe(false);
        });

        it('identifies entity types', async () => {
            const registry = createSchemaRegistry();
            registry.register({ type: 'person', schema: BaseEntitySchema, pluralName: 'people' });

            const walker = createDirectoryWalker({
                startDir: nestedDir,
                contextDirName: 'context',
                maxLevels: 10,
                registry,
            });

            const discovered = await walker.discover();

            expect(discovered[0].types).toContain('person');
        });

        it('returns empty array when no context found', async () => {
            const emptyDir = path.join(tempDir, 'empty');
            await fs.mkdir(emptyDir, { recursive: true });

            const walker = createDirectoryWalker({
                startDir: emptyDir,
                contextDirName: 'nonexistent',
                maxLevels: 10,
            });

            const discovered = await walker.discover();

            expect(discovered).toEqual([]);
        });
    });

    describe('hasContext', () => {
        it('returns true when context exists', async () => {
            const walker = createDirectoryWalker({
                startDir: nestedDir,
                contextDirName: 'context',
                maxLevels: 10,
            });

            expect(await walker.hasContext(nestedDir)).toBe(true);
        });

        it('returns false when context does not exist', async () => {
            const walker = createDirectoryWalker({
                startDir: nestedDir,
                contextDirName: 'context',
                maxLevels: 10,
            });

            const emptyDir = path.join(tempDir, 'empty');
            await fs.mkdir(emptyDir, { recursive: true });

            expect(await walker.hasContext(emptyDir)).toBe(false);
        });
    });
});
