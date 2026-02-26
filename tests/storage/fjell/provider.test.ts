import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { z } from 'zod';
import { BaseEntitySchema, createSchemaRegistry } from '../../../src/schema';
import { FjellStorageProvider } from '../../../src/storage/fjell/provider';
import { MemoryFjellAdapter } from '../../../src/storage/fjell/memory-adapter';
import type { SchemaRegistry } from '../../../src/schema/registry';
import type { StorageProvider } from '../../../src/storage/interface';

const PersonSchema = BaseEntitySchema.extend({
    type: z.literal('person'),
    email: z.string().optional(),
});

const ProjectSchema = BaseEntitySchema.extend({
    type: z.literal('project'),
    status: z.string().optional(),
});

function createTestProvider(): { provider: StorageProvider; adapter: MemoryFjellAdapter; registry: SchemaRegistry } {
    const registry = createSchemaRegistry();
    registry.register({ type: 'person', schema: PersonSchema, pluralName: 'people' });
    registry.register({ type: 'project', schema: ProjectSchema, pluralName: 'projects' });

    const adapter = new MemoryFjellAdapter();
    const provider = new FjellStorageProvider(adapter, registry, 'test-fjell', '/test');
    return { provider, adapter, registry };
}

describe('FjellStorageProvider', () => {
    let provider: StorageProvider;
    let adapter: MemoryFjellAdapter;

    beforeEach(async () => {
        const ctx = createTestProvider();
        provider = ctx.provider;
        adapter = ctx.adapter;
        await provider.initialize();
    });

    afterEach(async () => {
        await provider.dispose();
    });

    describe('lifecycle', () => {
        it('initializes successfully', async () => {
            expect(await provider.isAvailable()).toBe(true);
        });

        it('dispose clears state', async () => {
            await provider.save({ id: 'p1', name: 'Alice', type: 'person' });
            await provider.dispose();
            expect(await provider.isAvailable()).toBe(false);
        });

        it('reports metadata', () => {
            expect(provider.name).toBe('test-fjell');
            expect(provider.location).toBe('/test');
            expect(provider.registry).toBeDefined();
        });
    });

    describe('get', () => {
        it('returns undefined for missing entity', async () => {
            const result = await provider.get('person', 'nonexistent');
            expect(result).toBeUndefined();
        });

        it('retrieves a saved entity', async () => {
            await provider.save({ id: 'p1', name: 'Alice', type: 'person', email: 'alice@test.com' });
            const result = await provider.get('person', 'p1');
            expect(result).toBeDefined();
            expect(result!.id).toBe('p1');
            expect(result!.name).toBe('Alice');
            expect((result as any).email).toBe('alice@test.com');
        });
    });

    describe('getAll', () => {
        it('returns empty array for empty type', async () => {
            const results = await provider.getAll('person');
            expect(results).toEqual([]);
        });

        it('returns all entities of a type', async () => {
            await provider.save({ id: 'p1', name: 'Alice', type: 'person' });
            await provider.save({ id: 'p2', name: 'Bob', type: 'person' });
            await provider.save({ id: 'proj1', name: 'Project X', type: 'project' });

            const people = await provider.getAll('person');
            expect(people).toHaveLength(2);

            const projects = await provider.getAll('project');
            expect(projects).toHaveLength(1);
        });
    });

    describe('save', () => {
        it('creates a new entity', async () => {
            const saved = await provider.save({ id: 'p1', name: 'Alice', type: 'person' });
            expect(saved.id).toBe('p1');
            expect(saved.name).toBe('Alice');
        });

        it('updates an existing entity', async () => {
            await provider.save({ id: 'p1', name: 'Alice', type: 'person' });
            const updated = await provider.save({ id: 'p1', name: 'Alice Updated', type: 'person' });
            expect(updated.name).toBe('Alice Updated');

            const retrieved = await provider.get('person', 'p1');
            expect(retrieved!.name).toBe('Alice Updated');
        });
    });

    describe('delete', () => {
        it('returns false for missing entity', async () => {
            const result = await provider.delete('person', 'nonexistent');
            expect(result).toBe(false);
        });

        it('deletes an existing entity', async () => {
            await provider.save({ id: 'p1', name: 'Alice', type: 'person' });
            const result = await provider.delete('person', 'p1');
            expect(result).toBe(true);

            const retrieved = await provider.get('person', 'p1');
            expect(retrieved).toBeUndefined();
        });
    });

    describe('exists', () => {
        it('returns false for missing entity', async () => {
            expect(await provider.exists('person', 'nonexistent')).toBe(false);
        });

        it('returns true for existing entity', async () => {
            await provider.save({ id: 'p1', name: 'Alice', type: 'person' });
            expect(await provider.exists('person', 'p1')).toBe(true);
        });
    });

    describe('find', () => {
        beforeEach(async () => {
            await provider.save({ id: 'p1', name: 'Alice Smith', type: 'person' });
            await provider.save({ id: 'p2', name: 'Bob Jones', type: 'person' });
            await provider.save({ id: 'p3', name: 'Charlie Smith', type: 'person' });
        });

        it('finds by type', async () => {
            const results = await provider.find({ type: 'person' });
            expect(results).toHaveLength(3);
        });

        it('finds by text search', async () => {
            const results = await provider.find({ type: 'person', search: 'smith' });
            expect(results).toHaveLength(2);
        });

        it('finds by IDs', async () => {
            const results = await provider.find({ type: 'person', ids: ['p1', 'p3'] });
            expect(results).toHaveLength(2);
        });

        it('respects limit', async () => {
            const results = await provider.find({ type: 'person', limit: 2 });
            expect(results).toHaveLength(2);
        });

        it('finds across multiple types', async () => {
            await provider.save({ id: 'proj1', name: 'Alpha Project', type: 'project' });
            const results = await provider.find({ type: ['person', 'project'] });
            expect(results).toHaveLength(4);
        });

        it('finds across all types when type not specified', async () => {
            await provider.save({ id: 'proj1', name: 'Alpha Project', type: 'project' });
            const results = await provider.find({});
            expect(results).toHaveLength(4);
        });
    });

    describe('count', () => {
        it('counts zero for empty type', async () => {
            const result = await provider.count({ type: 'person' });
            expect(result).toBe(0);
        });

        it('counts entities by type', async () => {
            await provider.save({ id: 'p1', name: 'Alice', type: 'person' });
            await provider.save({ id: 'p2', name: 'Bob', type: 'person' });
            expect(await provider.count({ type: 'person' })).toBe(2);
        });

        it('counts across multiple types', async () => {
            await provider.save({ id: 'p1', name: 'Alice', type: 'person' });
            await provider.save({ id: 'proj1', name: 'Alpha', type: 'project' });
            expect(await provider.count({ type: ['person', 'project'] })).toBe(2);
        });
    });

    describe('saveBatch', () => {
        it('saves multiple entities', async () => {
            const entities = [
                { id: 'p1', name: 'Alice', type: 'person' },
                { id: 'p2', name: 'Bob', type: 'person' },
            ];
            const saved = await provider.saveBatch(entities);
            expect(saved).toHaveLength(2);

            const all = await provider.getAll('person');
            expect(all).toHaveLength(2);
        });
    });

    describe('deleteBatch', () => {
        it('deletes multiple entities', async () => {
            await provider.save({ id: 'p1', name: 'Alice', type: 'person' });
            await provider.save({ id: 'p2', name: 'Bob', type: 'person' });
            await provider.save({ id: 'p3', name: 'Charlie', type: 'person' });

            const deleted = await provider.deleteBatch([
                { type: 'person', id: 'p1' },
                { type: 'person', id: 'p3' },
            ]);
            expect(deleted).toBe(2);

            const remaining = await provider.getAll('person');
            expect(remaining).toHaveLength(1);
            expect(remaining[0].id).toBe('p2');
        });

        it('counts only actually deleted entities', async () => {
            await provider.save({ id: 'p1', name: 'Alice', type: 'person' });
            const deleted = await provider.deleteBatch([
                { type: 'person', id: 'p1' },
                { type: 'person', id: 'nonexistent' },
            ]);
            expect(deleted).toBe(1);
        });
    });

    describe('namespace operations', () => {
        it('isolates entities by namespace', async () => {
            await provider.save({ id: 'p1', name: 'Alice', type: 'person' }, 'workspace-a');
            await provider.save({ id: 'p1', name: 'Different Alice', type: 'person' }, 'workspace-b');

            const a = await provider.get('person', 'p1', 'workspace-a');
            const b = await provider.get('person', 'p1', 'workspace-b');

            expect(a!.name).toBe('Alice');
            expect(b!.name).toBe('Different Alice');
        });

        it('getAll respects namespace', async () => {
            await provider.save({ id: 'p1', name: 'Alice', type: 'person' }, 'ns-a');
            await provider.save({ id: 'p2', name: 'Bob', type: 'person' }, 'ns-b');

            const nsA = await provider.getAll('person', 'ns-a');
            expect(nsA).toHaveLength(1);
            expect(nsA[0].id).toBe('p1');
        });

        it('listNamespaces returns populated namespaces', async () => {
            await provider.save({ id: 'p1', name: 'Alice', type: 'person' }, 'ns-x');
            await provider.save({ id: 'proj1', name: 'Alpha', type: 'project' }, 'ns-y');

            const namespaces = await provider.listNamespaces();
            expect(namespaces).toContain('ns-x');
            expect(namespaces).toContain('ns-y');
        });

        it('namespaceExists returns correct result', async () => {
            expect(await provider.namespaceExists('empty-ns')).toBe(false);

            await provider.save({ id: 'p1', name: 'Alice', type: 'person' }, 'populated-ns');
            expect(await provider.namespaceExists('populated-ns')).toBe(true);
        });

        it('listTypes returns types with data in namespace', async () => {
            await provider.save({ id: 'p1', name: 'Alice', type: 'person' }, 'ns-z');
            await provider.save({ id: 'proj1', name: 'Alpha', type: 'project' }, 'ns-z');

            const types = await provider.listTypes('ns-z');
            expect(types).toContain('person');
            expect(types).toContain('project');
            expect(types).toHaveLength(2);
        });

        it('listTypes returns empty for unpopulated namespace', async () => {
            const types = await provider.listTypes('nonexistent-ns');
            expect(types).toEqual([]);
        });

        it('delete respects namespace', async () => {
            await provider.save({ id: 'p1', name: 'Alice', type: 'person' }, 'ns-a');
            await provider.save({ id: 'p1', name: 'Other Alice', type: 'person' }, 'ns-b');

            await provider.delete('person', 'p1', 'ns-a');

            expect(await provider.get('person', 'p1', 'ns-a')).toBeUndefined();
            expect(await provider.get('person', 'p1', 'ns-b')).toBeDefined();
        });
    });

    describe('date handling', () => {
        it('round-trips Date objects through JSON serialization', async () => {
            const now = new Date();
            await provider.save({
                id: 'p1',
                name: 'Alice',
                type: 'person',
                createdAt: now,
                updatedAt: now,
            });

            const retrieved = await provider.get('person', 'p1');
            expect(retrieved).toBeDefined();
            expect((retrieved as any).createdAt).toBeInstanceOf(Date);
            expect((retrieved as any).updatedAt).toBeInstanceOf(Date);
        });
    });
});
