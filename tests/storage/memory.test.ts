import { describe, it, expect, beforeEach } from 'vitest';
import { z } from 'zod';
import {
    createMemoryProvider,
    createSchemaRegistry,
    BaseEntitySchema,
    StorageProvider,
    ValidationError,
    ReadonlyStorageError,
} from '../../src';

const CustomSchema = BaseEntitySchema.extend({
    type: z.literal('custom'),
    customField: z.string(),
});

const AnotherSchema = BaseEntitySchema.extend({
    type: z.literal('another'),
    value: z.number(),
});

describe('MemoryProvider', () => {
    let provider: StorageProvider;

    beforeEach(() => {
        const registry = createSchemaRegistry();
        registry.register({
            type: 'custom',
            schema: CustomSchema,
            pluralName: 'customs',
        });
        registry.register({
            type: 'another',
            schema: AnotherSchema,
            pluralName: 'anothers',
        });

        provider = createMemoryProvider({ registry });
    });

    describe('initialization', () => {
        it('initializes successfully', async () => {
            await provider.initialize();
            expect(await provider.isAvailable()).toBe(true);
        });

        it('accepts initial data', () => {
            const registry = createSchemaRegistry();
            registry.register({ type: 'custom', schema: CustomSchema });

            const initialData = [
                { id: 'test1', name: 'Test 1', type: 'custom', customField: 'value1' },
                { id: 'test2', name: 'Test 2', type: 'custom', customField: 'value2' },
            ];

            const providerWithData = createMemoryProvider({ registry, initialData });

            expect(providerWithData).toBeDefined();
        });
    });

    describe('save and get', () => {
        it('saves and retrieves entity', async () => {
            const entity = {
                id: 'test1',
                name: 'Test Entity',
                type: 'custom',
                customField: 'value',
            };

            const saved = await provider.save(entity);
            expect(saved.id).toBe('test1');
            expect((saved as any).createdAt).toBeInstanceOf(Date);
            expect((saved as any).updatedAt).toBeInstanceOf(Date);

            const retrieved = await provider.get<typeof entity>('custom', 'test1');
            expect(retrieved).toBeDefined();
            expect(retrieved?.customField).toBe('value');
        });

        it('updates existing entity', async () => {
            await provider.save({
                id: 'test1',
                name: 'Original',
                type: 'custom',
                customField: 'original',
            });

            const updated = await provider.save({
                id: 'test1',
                name: 'Updated',
                type: 'custom',
                customField: 'updated',
            });

            expect(updated.name).toBe('Updated');
            expect(updated.customField).toBe('updated');
        });

        it('validates entity before saving', async () => {
            await expect(
                provider.save({
                    id: 'test1',
                    name: 'Test',
                    type: 'custom',
                    // Missing required customField
                } as any)
            ).rejects.toThrow(ValidationError);
        });
    });

    describe('getAll', () => {
        it('returns all entities of a type', async () => {
            await provider.save({
                id: 'test1',
                name: 'Test 1',
                type: 'custom',
                customField: 'value1',
            });
            await provider.save({
                id: 'test2',
                name: 'Test 2',
                type: 'custom',
                customField: 'value2',
            });

            const all = await provider.getAll('custom');
            expect(all).toHaveLength(2);
        });

        it('returns empty array for type with no entities', async () => {
            const all = await provider.getAll('custom');
            expect(all).toEqual([]);
        });
    });

    describe('find', () => {
        beforeEach(async () => {
            await provider.save({
                id: 'test1',
                name: 'First Entity',
                type: 'custom',
                customField: 'value1',
            });
            await provider.save({
                id: 'test2',
                name: 'Second Entity',
                type: 'custom',
                customField: 'value2',
            });
            await provider.save({
                id: 'test3',
                name: 'Third Entity',
                type: 'another',
                value: 42,
            });
        });

        it('finds all entities when no filter', async () => {
            const results = await provider.find({});
            expect(results.length).toBeGreaterThanOrEqual(3);
        });

        it('filters by type', async () => {
            const results = await provider.find({ type: 'custom' });
            expect(results).toHaveLength(2);
            expect(results.every(e => e.type === 'custom')).toBe(true);
        });

        it('filters by multiple types', async () => {
            const results = await provider.find({ type: ['custom', 'another'] });
            expect(results.length).toBeGreaterThanOrEqual(3);
        });

        it('filters by IDs', async () => {
            const results = await provider.find({ ids: ['test1', 'test3'] });
            expect(results).toHaveLength(2);
            expect(results.map(e => e.id).sort()).toEqual(['test1', 'test3']);
        });

        it('filters by search text', async () => {
            const results = await provider.find({ search: 'First' });
            expect(results).toHaveLength(1);
            expect(results[0].name).toBe('First Entity');
        });

        it('applies limit', async () => {
            const results = await provider.find({ limit: 2 });
            expect(results).toHaveLength(2);
        });

        it('applies offset', async () => {
            const all = await provider.find({});
            const offset = await provider.find({ offset: 1 });
            expect(offset.length).toBe(all.length - 1);
        });
    });

    describe('exists', () => {
        it('returns true for existing entity', async () => {
            await provider.save({
                id: 'test1',
                name: 'Test',
                type: 'custom',
                customField: 'value',
            });

            expect(await provider.exists('custom', 'test1')).toBe(true);
        });

        it('returns false for non-existing entity', async () => {
            expect(await provider.exists('custom', 'nonexistent')).toBe(false);
        });
    });

    describe('count', () => {
        beforeEach(async () => {
            await provider.save({
                id: 'test1',
                name: 'Test 1',
                type: 'custom',
                customField: 'value1',
            });
            await provider.save({
                id: 'test2',
                name: 'Test 2',
                type: 'custom',
                customField: 'value2',
            });
        });

        it('counts all entities', async () => {
            const count = await provider.count({});
            expect(count).toBeGreaterThanOrEqual(2);
        });

        it('counts filtered entities', async () => {
            const count = await provider.count({ type: 'custom' });
            expect(count).toBe(2);
        });
    });

    describe('delete', () => {
        it('deletes existing entity', async () => {
            await provider.save({
                id: 'test1',
                name: 'Test',
                type: 'custom',
                customField: 'value',
            });

            const deleted = await provider.delete('custom', 'test1');
            expect(deleted).toBe(true);

            const retrieved = await provider.get('custom', 'test1');
            expect(retrieved).toBeUndefined();
        });

        it('returns false for non-existing entity', async () => {
            const deleted = await provider.delete('custom', 'nonexistent');
            expect(deleted).toBe(false);
        });
    });

    describe('batch operations', () => {
        it('saves multiple entities', async () => {
            const entities = [
                { id: 'test1', name: 'Test 1', type: 'custom', customField: 'value1' },
                { id: 'test2', name: 'Test 2', type: 'custom', customField: 'value2' },
            ];

            const saved = await provider.saveBatch(entities);
            expect(saved).toHaveLength(2);

            const all = await provider.getAll('custom');
            expect(all).toHaveLength(2);
        });

        it('deletes multiple entities', async () => {
            await provider.saveBatch([
                { id: 'test1', name: 'Test 1', type: 'custom', customField: 'value1' },
                { id: 'test2', name: 'Test 2', type: 'custom', customField: 'value2' },
            ]);

            const count = await provider.deleteBatch([
                { type: 'custom', id: 'test1' },
                { type: 'custom', id: 'test2' },
            ]);

            expect(count).toBe(2);

            const all = await provider.getAll('custom');
            expect(all).toHaveLength(0);
        });
    });

    describe('namespaces', () => {
        it('saves and retrieves in namespace', async () => {
            await provider.save({
                id: 'test1',
                name: 'Test',
                type: 'custom',
                customField: 'value',
            }, 'work');

            const retrieved = await provider.get('custom', 'test1', 'work');
            expect(retrieved).toBeDefined();

            const defaultNs = await provider.get('custom', 'test1');
            expect(defaultNs).toBeUndefined();
        });

        it('lists namespaces', async () => {
            await provider.save({
                id: 'test1',
                name: 'Test',
                type: 'custom',
                customField: 'value',
            }, 'work');
            await provider.save({
                id: 'test2',
                name: 'Test',
                type: 'custom',
                customField: 'value',
            }, 'personal');

            const namespaces = await provider.listNamespaces();
            expect(namespaces).toContain('work');
            expect(namespaces).toContain('personal');
        });

        it('checks namespace existence', async () => {
            await provider.save({
                id: 'test1',
                name: 'Test',
                type: 'custom',
                customField: 'value',
            }, 'work');

            expect(await provider.namespaceExists('work')).toBe(true);
            expect(await provider.namespaceExists('nonexistent')).toBe(false);
        });

        it('lists types in namespace', async () => {
            await provider.save({
                id: 'test1',
                name: 'Test',
                type: 'custom',
                customField: 'value',
            }, 'work');
            await provider.save({
                id: 'test2',
                name: 'Test',
                type: 'another',
                value: 42,
            }, 'work');

            const types = await provider.listTypes('work');
            expect(types).toContain('custom');
            expect(types).toContain('another');
        });
    });

    describe('readonly mode', () => {
        beforeEach(() => {
            const registry = createSchemaRegistry();
            registry.register({ type: 'custom', schema: CustomSchema });

            provider = createMemoryProvider({ registry, readonly: true });
        });

        it('prevents saving', async () => {
            await expect(
                provider.save({
                    id: 'test1',
                    name: 'Test',
                    type: 'custom',
                    customField: 'value',
                })
            ).rejects.toThrow(ReadonlyStorageError);
        });

        it('prevents deleting', async () => {
            await expect(
                provider.delete('custom', 'test1')
            ).rejects.toThrow(ReadonlyStorageError);
        });
    });

    describe('dispose', () => {
        it('clears all data', async () => {
            await provider.save({
                id: 'test1',
                name: 'Test',
                type: 'custom',
                customField: 'value',
            });

            await provider.dispose();

            const all = await provider.getAll('custom');
            expect(all).toHaveLength(0);
        });
    });
});
