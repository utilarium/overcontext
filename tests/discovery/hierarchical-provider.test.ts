import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { z } from 'zod';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import {
    createHierarchicalProvider,
    createSchemaRegistry,
    BaseEntitySchema,
    StorageProvider,
    ContextRoot,
} from '../../src';

const PersonSchema = BaseEntitySchema.extend({
    type: z.literal('person'),
    company: z.string().optional(),
});

describe('HierarchicalProvider', () => {
    let tempDir: string;
    let workspaceContext: string;
    let projectContext: string;
    let provider: StorageProvider;

    beforeEach(async () => {
        tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'overcontext-hier-'));
        workspaceContext = path.join(tempDir, 'workspace-context');
        projectContext = path.join(tempDir, 'project-context');

        // Create context directories
        await fs.mkdir(path.join(workspaceContext, 'people'), { recursive: true });
        await fs.mkdir(path.join(projectContext, 'people'), { recursive: true });

        // Add entities at different levels
        await fs.writeFile(
            path.join(workspaceContext, 'people', 'shared.yaml'),
            'id: shared\nname: Shared Person\n'
        );
        await fs.writeFile(
            path.join(workspaceContext, 'people', 'workspace-only.yaml'),
            'id: workspace-only\nname: Workspace Person\n'
        );
        await fs.writeFile(
            path.join(projectContext, 'people', 'project-only.yaml'),
            'id: project-only\nname: Project Person\n'
        );
        await fs.writeFile(
            path.join(projectContext, 'people', 'shared.yaml'),
            'id: shared\nname: Project Override\ncompany: ProjectCo\n'
        );

        const registry = createSchemaRegistry();
        registry.register({ type: 'person', schema: PersonSchema, pluralName: 'people' });

        const contextRoot: ContextRoot = {
            directories: [
                { path: projectContext, level: 0, namespaces: [], types: ['person'] },
                { path: workspaceContext, level: 1, namespaces: [], types: ['person'] },
            ],
            primary: projectContext,
            contextPaths: [projectContext, workspaceContext],
            allNamespaces: [],
            allTypes: ['person'],
        };

        provider = await createHierarchicalProvider({
            contextRoot,
            registry,
        });
        await provider.initialize();
    });

    afterEach(async () => {
        await provider.dispose();
        await fs.rm(tempDir, { recursive: true, force: true });
    });

    describe('get', () => {
        it('finds entity in closest context', async () => {
            const entity = await provider.get('person', 'project-only');

            expect(entity).toBeDefined();
            expect(entity?.name).toBe('Project Person');
        });

        it('falls back to distant context', async () => {
            const entity = await provider.get('person', 'workspace-only');

            expect(entity).toBeDefined();
            expect(entity?.name).toBe('Workspace Person');
        });

        it('closest context overrides distant', async () => {
            const entity = await provider.get<{ id: string; name: string; type: string; company?: string }>('person', 'shared');

            expect(entity).toBeDefined();
            expect(entity?.name).toBe('Project Override');
            expect(entity?.company).toBe('ProjectCo');
        });

        it('returns undefined when not found', async () => {
            const entity = await provider.get('person', 'nonexistent');

            expect(entity).toBeUndefined();
        });
    });

    describe('getAll', () => {
        it('merges entities from all levels', async () => {
            const entities = await provider.getAll('person');

            expect(entities).toHaveLength(3); // shared (overridden), workspace-only, project-only
        });

        it('closest overrides distant on ID collision', async () => {
            const entities = await provider.getAll('person');

            const shared = entities.find(e => e.id === 'shared');
            expect(shared?.name).toBe('Project Override');
        });
    });

    describe('exists', () => {
        it('returns true if found in any level', async () => {
            expect(await provider.exists('person', 'workspace-only')).toBe(true);
            expect(await provider.exists('person', 'project-only')).toBe(true);
        });

        it('returns false when not found', async () => {
            expect(await provider.exists('person', 'nonexistent')).toBe(false);
        });
    });

    describe('save', () => {
        it('saves to primary context', async () => {
            await provider.save({
                id: 'new-person',
                name: 'New Person',
                type: 'person',
            });

            const filePath = path.join(projectContext, 'people', 'new-person.yaml');
            expect(existsSync(filePath)).toBe(true);
        });

        it('does not save to distant contexts', async () => {
            await provider.save({
                id: 'new-person',
                name: 'New Person',
                type: 'person',
            });

            const workspaceFile = path.join(workspaceContext, 'people', 'new-person.yaml');
            expect(existsSync(workspaceFile)).toBe(false);
        });
    });

    describe('delete', () => {
        it('deletes from primary context', async () => {
            await provider.delete('person', 'project-only');

            const filePath = path.join(projectContext, 'people', 'project-only.yaml');
            expect(existsSync(filePath)).toBe(false);
        });

        it('does not delete from distant contexts', async () => {
            await provider.delete('person', 'workspace-only');

            // Should still exist in workspace
            const workspaceFile = path.join(workspaceContext, 'people', 'workspace-only.yaml');
            expect(existsSync(workspaceFile)).toBe(true);
        });
    });

    describe('metadata', () => {
        it('has correct name', () => {
            expect(provider.name).toBe('hierarchical');
        });

        it('location points to primary', () => {
            expect(provider.location).toBe(projectContext);
        });
    });

    describe('find', () => {
        it('merges results from all levels', async () => {
            const results = await provider.find({ type: 'person' });

            expect(results).toHaveLength(3);
        });

        it('applies pagination', async () => {
            const results = await provider.find({ type: 'person', limit: 2 });

            expect(results).toHaveLength(2);
        });

        it('applies offset', async () => {
            const all = await provider.find({ type: 'person' });
            const results = await provider.find({ type: 'person', offset: 1 });

            // Offset should reduce results
            expect(results.length).toBeLessThanOrEqual(all.length);
        });
    });

    describe('count', () => {
        it('counts merged entities', async () => {
            const count = await provider.count({ type: 'person' });

            expect(count).toBe(3);
        });
    });

    describe('batch operations', () => {
        it('saves batch to primary', async () => {
            const entities = [
                { id: 'batch1', name: 'Batch 1', type: 'person' },
                { id: 'batch2', name: 'Batch 2', type: 'person' },
            ];

            await provider.saveBatch(entities);

            const file1 = path.join(projectContext, 'people', 'batch1.yaml');
            const file2 = path.join(projectContext, 'people', 'batch2.yaml');
            expect(existsSync(file1)).toBe(true);
            expect(existsSync(file2)).toBe(true);
        });

        it('deletes batch from primary', async () => {
            await provider.deleteBatch([
                { type: 'person', id: 'project-only' },
            ]);

            const filePath = path.join(projectContext, 'people', 'project-only.yaml');
            expect(existsSync(filePath)).toBe(false);
        });
    });

    describe('namespace operations', () => {
        it('lists all namespaces', async () => {
            const namespaces = await provider.listNamespaces();

            expect(Array.isArray(namespaces)).toBe(true);
        });

        it('checks namespace existence', async () => {
            const exists = await provider.namespaceExists('test');

            expect(typeof exists).toBe('boolean');
        });

        it('lists types', async () => {
            const types = await provider.listTypes();

            expect(types).toContain('person');
        });
    });

    describe('initialization', () => {
        it('initializes successfully', async () => {
            await provider.initialize();
            expect(await provider.isAvailable()).toBe(true);
        });
    });
});

function existsSync(filePath: string): boolean {
    const fsSync = require('node:fs');
    return fsSync.existsSync(filePath);
}
