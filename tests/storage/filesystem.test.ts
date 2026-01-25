import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { z } from 'zod';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import { existsSync } from 'node:fs';
import {
    createFileSystemProvider,
    createSchemaRegistry,
    BaseEntitySchema,
    StorageProvider,
    ValidationError,
    ReadonlyStorageError,
    StorageAccessError,
} from '../../src';

const CustomSchema = BaseEntitySchema.extend({
    type: z.literal('custom'),
    customField: z.string(),
});

const AnotherSchema = BaseEntitySchema.extend({
    type: z.literal('another'),
    value: z.number(),
});

describe('FileSystemProvider', () => {
    let provider: StorageProvider;
    let tempDir: string;

    beforeEach(async () => {
        tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'overcontext-'));

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

        provider = await createFileSystemProvider({
            basePath: tempDir,
            registry,
        });
        await provider.initialize();
    });

    afterEach(async () => {
        await provider.dispose();
        await fs.rm(tempDir, { recursive: true, force: true });
    });

    describe('initialization', () => {
        it('creates base directory if missing', async () => {
            const newDir = path.join(tempDir, 'new-context');
            const registry = createSchemaRegistry();
            registry.register({ type: 'custom', schema: CustomSchema });

            const newProvider = await createFileSystemProvider({
                basePath: newDir,
                registry,
                createIfMissing: true,
            });

            await newProvider.initialize();
            expect(existsSync(newDir)).toBe(true);
        });

        it('throws if directory does not exist and createIfMissing is false', async () => {
            const nonExistent = path.join(tempDir, 'nonexistent');
            const registry = createSchemaRegistry();
            registry.register({ type: 'custom', schema: CustomSchema });

            const newProvider = await createFileSystemProvider({
                basePath: nonExistent,
                registry,
                createIfMissing: false,
            });

            await expect(newProvider.initialize()).rejects.toThrow(StorageAccessError);
        });

        it('checks availability', async () => {
            expect(await provider.isAvailable()).toBe(true);
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
            expect((saved as any).source).toContain('customs');

            const retrieved = await provider.get<typeof entity>('custom', 'test1');
            expect(retrieved).toBeDefined();
            expect(retrieved?.customField).toBe('value');
        });

        it('creates entity directory', async () => {
            await provider.save({
                id: 'test1',
                name: 'Test',
                type: 'custom',
                customField: 'value',
            });

            const entityDir = path.join(tempDir, 'customs');
            expect(existsSync(entityDir)).toBe(true);
        });

        it('uses correct file extension', async () => {
            await provider.save({
                id: 'test1',
                name: 'Test',
                type: 'custom',
                customField: 'value',
            });

            const filePath = path.join(tempDir, 'customs', 'test1.yaml');
            expect(existsSync(filePath)).toBe(true);
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

        it('updates existing entity', async () => {
            await provider.save({
                id: 'test1',
                name: 'Original',
                type: 'custom',
                customField: 'original',
            });

            await provider.save({
                id: 'test1',
                name: 'Updated',
                type: 'custom',
                customField: 'updated',
            });

            const retrieved = await provider.get<{ id: string; name: string; type: string; customField: string }>('custom', 'test1');
            expect(retrieved?.name).toBe('Updated');
            expect(retrieved?.customField).toBe('updated');
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

        it('ignores non-yaml files', async () => {
            const customsDir = path.join(tempDir, 'customs');
            await fs.mkdir(customsDir, { recursive: true });
            await fs.writeFile(path.join(customsDir, 'test.txt'), 'not yaml');

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

            const filePath = path.join(tempDir, 'customs', 'test1.yaml');
            expect(existsSync(filePath)).toBe(false);
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

            const nsDir = path.join(tempDir, 'work', 'customs');
            expect(existsSync(nsDir)).toBe(true);
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
        beforeEach(async () => {
            const registry = createSchemaRegistry();
            registry.register({ type: 'custom', schema: CustomSchema });

            provider = await createFileSystemProvider({
                basePath: tempDir,
                registry,
                readonly: true,
            });
            await provider.initialize();
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

    describe('error handling', () => {
        it('handles unregistered schema type', async () => {
            const registry = createSchemaRegistry();
            registry.register({ type: 'custom', schema: CustomSchema });

            const newProvider = await createFileSystemProvider({
                basePath: tempDir,
                registry,
            });
            await newProvider.initialize();

            // Try to get entities of unregistered type
            const results = await newProvider.getAll('unregistered');
            expect(results).toEqual([]);
        });

        it('handles corrupted YAML files gracefully', async () => {
            const customsDir = path.join(tempDir, 'customs');
            await fs.mkdir(customsDir, { recursive: true });
            await fs.writeFile(path.join(customsDir, 'corrupt.yaml'), 'not: valid: yaml: [');

            const all = await provider.getAll('custom');
            // Should skip corrupted file
            expect(all).toEqual([]);
        });

        it('handles missing namespace directory', async () => {
            const types = await provider.listTypes('nonexistent');
            expect(types).toEqual([]);
        });

        it('handles delete errors', async () => {
            // Try to delete from a type that doesn't exist
            const deleted = await provider.delete('custom', 'test1');
            expect(deleted).toBe(false);
        });
    });

    describe('default namespace', () => {
        beforeEach(async () => {
            const registry = createSchemaRegistry();
            registry.register({ type: 'custom', schema: CustomSchema });

            provider = await createFileSystemProvider({
                basePath: tempDir,
                registry,
                defaultNamespace: 'default',
            });
            await provider.initialize();
        });

        it('uses default namespace when not specified', async () => {
            await provider.save({
                id: 'test1',
                name: 'Test',
                type: 'custom',
                customField: 'value',
            });

            const retrieved = await provider.get('custom', 'test1');
            expect(retrieved).toBeDefined();

            // Should be in default namespace directory
            const filePath = path.join(tempDir, 'default', 'customs', 'test1.yaml');
            expect(existsSync(filePath)).toBe(true);
        });
    });

    describe('file extension options', () => {
        it('uses .yml extension when specified', async () => {
            const registry = createSchemaRegistry();
            registry.register({ type: 'custom', schema: CustomSchema });

            const ymlProvider = await createFileSystemProvider({
                basePath: tempDir,
                registry,
                extension: '.yml',
            });
            await ymlProvider.initialize();

            await ymlProvider.save({
                id: 'test1',
                name: 'Test',
                type: 'custom',
                customField: 'value',
            });

            const filePath = path.join(tempDir, 'customs', 'test1.yml');
            expect(existsSync(filePath)).toBe(true);
        });
    });
});
