import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { z } from 'zod';

import { BaseEntitySchema, createSchemaRegistry } from '../../../src/schema';
import { createFjellFsProvider } from '../../../src/storage/fjell/fs-provider';
import type { StorageProvider } from '../../../src/storage/interface';

const PersonSchema = BaseEntitySchema.extend({
    type: z.literal('person'),
    email: z.string().optional(),
});

const ProjectSchema = BaseEntitySchema.extend({
    type: z.literal('project'),
    status: z.string().optional(),
});

describe('FjellFsAdapter integration', () => {
    let tempDir: string;
    let provider: StorageProvider;

    beforeEach(async () => {
        tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'overcontext-fjell-fs-'));

        const registry = createSchemaRegistry();
        registry.register({ type: 'person', schema: PersonSchema, pluralName: 'people' });
        registry.register({ type: 'project', schema: ProjectSchema, pluralName: 'projects' });

        provider = await createFjellFsProvider({
            basePath: tempDir,
            registry,
        });
    });

    afterEach(async () => {
        await provider.dispose();
        await fs.rm(tempDir, { recursive: true, force: true });
    });

    it('stores entities as JSON at <base>/<namespace>/<type>/<id>.json', async () => {
        await provider.save(
            { id: 'p1', name: 'Alice', type: 'person', email: 'alice@example.com' },
            'workspace-a',
        );

        const filePath = path.join(tempDir, 'workspace-a', 'person', 'p1.json');
        const content = await fs.readFile(filePath, 'utf8');
        const parsed = JSON.parse(content) as Record<string, unknown>;

        expect(parsed.id).toBe('p1');
        expect(parsed.name).toBe('Alice');
        expect(parsed.type).toBe('person');
    });

    it('does not create YAML files', async () => {
        await provider.save({ id: 'p1', name: 'Alice', type: 'person' }, 'workspace-a');
        const dir = path.join(tempDir, 'workspace-a', 'person');
        const files = await fs.readdir(dir);
        expect(files.some(name => name.endsWith('.yaml') || name.endsWith('.yml'))).toBe(false);
    });

    it('performs CRUD operations against filesystem backend', async () => {
        await provider.save({ id: 'p1', name: 'Alice', type: 'person' }, 'workspace-a');
        expect(await provider.exists('person', 'p1', 'workspace-a')).toBe(true);

        const retrieved = await provider.get('person', 'p1', 'workspace-a');
        expect(retrieved?.name).toBe('Alice');

        await provider.save({ id: 'p1', name: 'Alice Updated', type: 'person' }, 'workspace-a');
        const updated = await provider.get('person', 'p1', 'workspace-a');
        expect(updated?.name).toBe('Alice Updated');

        const deleted = await provider.delete('person', 'p1', 'workspace-a');
        expect(deleted).toBe(true);
        expect(await provider.get('person', 'p1', 'workspace-a')).toBeUndefined();
    });

    it('isolates entities by namespace directory', async () => {
        await provider.save({ id: 'same-id', name: 'Alice A', type: 'person' }, 'workspace-a');
        await provider.save({ id: 'same-id', name: 'Alice B', type: 'person' }, 'workspace-b');

        const a = await provider.get('person', 'same-id', 'workspace-a');
        const b = await provider.get('person', 'same-id', 'workspace-b');

        expect(a?.name).toBe('Alice A');
        expect(b?.name).toBe('Alice B');
    });

    it('lists namespaces and types from directories', async () => {
        await provider.save({ id: 'p1', name: 'Alice', type: 'person' }, 'workspace-a');
        await provider.save({ id: 'proj1', name: 'Project A', type: 'project' }, 'workspace-a');
        await provider.save({ id: 'p2', name: 'Bob', type: 'person' }, 'workspace-b');

        const namespaces = await provider.listNamespaces();
        expect(namespaces).toContain('workspace-a');
        expect(namespaces).toContain('workspace-b');

        const typesA = await provider.listTypes('workspace-a');
        expect(typesA).toContain('person');
        expect(typesA).toContain('project');
    });

    it('supports find and count filters', async () => {
        await provider.save({ id: 'p1', name: 'Alice Smith', type: 'person' }, 'workspace-a');
        await provider.save({ id: 'p2', name: 'Bob Jones', type: 'person' }, 'workspace-a');
        await provider.save({ id: 'p3', name: 'Charlie Smith', type: 'person' }, 'workspace-a');

        const smiths = await provider.find({ type: 'person', namespace: 'workspace-a', search: 'smith' });
        expect(smiths).toHaveLength(2);

        const count = await provider.count({ type: 'person', namespace: 'workspace-a' });
        expect(count).toBe(3);
    });
});
