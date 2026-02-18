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

    describe('path sanitization', () => {
        it('rejects ids containing forward slashes', async () => {
            await expect(
                provider.get('custom', '../etc/passwd')
            ).rejects.toThrow(ValidationError);
        });

        it('rejects ids containing backslashes', async () => {
            await expect(
                provider.get('custom', 'foo\\bar')
            ).rejects.toThrow(ValidationError);
        });

        it('rejects ids containing double dots', async () => {
            await expect(
                provider.get('custom', 'foo..bar')
            ).rejects.toThrow(ValidationError);
        });

        it('rejects ids containing null bytes', async () => {
            await expect(
                provider.get('custom', 'foo\0bar')
            ).rejects.toThrow(ValidationError);
        });

        it('rejects ids containing control characters', async () => {
            await expect(
                provider.get('custom', 'foo\x01bar')
            ).rejects.toThrow(ValidationError);
        });

        it('rejects ids containing DEL character', async () => {
            await expect(
                provider.get('custom', 'foo\x7Fbar')
            ).rejects.toThrow(ValidationError);
        });

        it('rejects namespace with path traversal', async () => {
            await expect(
                provider.get('custom', 'test1', '../escape')
            ).rejects.toThrow(ValidationError);
        });

        it('rejects namespace containing backslash', async () => {
            await expect(
                provider.get('custom', 'test1', 'ns\\bad')
            ).rejects.toThrow(ValidationError);
        });

        it('rejects namespace containing null bytes', async () => {
            await expect(
                provider.namespaceExists('ns\0bad')
            ).rejects.toThrow(ValidationError);
        });

        it('rejects namespace containing control characters in listTypes', async () => {
            await expect(
                provider.listTypes('ns\x01bad')
            ).rejects.toThrow(ValidationError);
        });
    });

    describe('readEntity edge cases', () => {
        it('skips YAML files that parse to non-object', async () => {
            const customsDir = path.join(tempDir, 'customs');
            await fs.mkdir(customsDir, { recursive: true });
            await fs.writeFile(path.join(customsDir, 'scalar.yaml'), '"just a string"');

            const all = await provider.getAll('custom');
            expect(all).toEqual([]);
        });

        it('skips YAML files that parse to null', async () => {
            const customsDir = path.join(tempDir, 'customs');
            await fs.mkdir(customsDir, { recursive: true });
            await fs.writeFile(path.join(customsDir, 'empty.yaml'), '');

            const all = await provider.getAll('custom');
            expect(all).toEqual([]);
        });

        it('detects __proto__ pollution attempts', async () => {
            const customsDir = path.join(tempDir, 'customs');
            await fs.mkdir(customsDir, { recursive: true });
            const malicious = 'id: proto-test\nname: Test\ncustomField: val\n__proto__:\n  admin: true\n';
            await fs.writeFile(path.join(customsDir, 'proto-test.yaml'), malicious);

            const entity = await provider.get('custom', 'proto-test');
            expect(entity).toBeUndefined();
        });

        it('skips entities that fail schema validation', async () => {
            const customsDir = path.join(tempDir, 'customs');
            await fs.mkdir(customsDir, { recursive: true });
            const invalid = 'id: bad\nname: Bad\ntype: custom\n';
            await fs.writeFile(path.join(customsDir, 'bad.yaml'), invalid);

            const entity = await provider.get('custom', 'bad');
            expect(entity).toBeUndefined();
        });

        it('wraps non-ENOENT read errors as StorageAccessError', async () => {
            const customsDir = path.join(tempDir, 'customs');
            await fs.mkdir(customsDir, { recursive: true });
            const dirAsFile = path.join(customsDir, 'isdir.yaml');
            await fs.mkdir(dirAsFile, { recursive: true });

            await expect(
                provider.get('custom', 'isdir')
            ).rejects.toThrow(StorageAccessError);
        });
    });

    describe('isAvailable', () => {
        it('returns false when basePath does not exist', async () => {
            const registry = createSchemaRegistry();
            registry.register({ type: 'custom', schema: CustomSchema });

            const nonExistent = await createFileSystemProvider({
                basePath: path.join(tempDir, 'nonexistent-dir'),
                registry,
                createIfMissing: false,
            });

            expect(await nonExistent.isAvailable()).toBe(false);
        });

        it('returns false when basePath is a file not a directory', async () => {
            const filePath = path.join(tempDir, 'afile.txt');
            await fs.writeFile(filePath, 'not a dir');

            const registry = createSchemaRegistry();
            registry.register({ type: 'custom', schema: CustomSchema });

            const fileProvider = await createFileSystemProvider({
                basePath: filePath,
                registry,
                createIfMissing: false,
            });

            expect(await fileProvider.isAvailable()).toBe(false);
        });
    });

    describe('find edge cases', () => {
        beforeEach(async () => {
            await provider.save({ id: 't1', name: 'Alpha', type: 'custom', customField: 'v1' });
            await provider.save({ id: 't2', name: 'Beta', type: 'custom', customField: 'v2' });
            await provider.save({ id: 't3', name: 'Gamma', type: 'another', value: 10 });
        });

        it('filters by type as array', async () => {
            const results = await provider.find({ type: ['custom', 'another'] });
            expect(results).toHaveLength(3);
        });

        it('filters by ids', async () => {
            const results = await provider.find({ ids: ['t1'] });
            expect(results).toHaveLength(1);
            expect(results[0].id).toBe('t1');
        });

        it('applies offset', async () => {
            const all = await provider.find({ type: 'custom' });
            const offset = await provider.find({ type: 'custom', offset: 1 });
            expect(offset).toHaveLength(all.length - 1);
        });

        it('applies both offset and limit', async () => {
            const results = await provider.find({ offset: 1, limit: 1 });
            expect(results).toHaveLength(1);
        });
    });

    describe('listNamespaces edge cases', () => {
        it('returns empty when basePath does not exist', async () => {
            const registry = createSchemaRegistry();
            registry.register({ type: 'custom', schema: CustomSchema });

            const noDir = await createFileSystemProvider({
                basePath: path.join(tempDir, 'gone'),
                registry,
                createIfMissing: false,
            });

            const namespaces = await noDir.listNamespaces();
            expect(namespaces).toEqual([]);
        });

        it('does not list entity-type directories as namespaces', async () => {
            await provider.save({ id: 't1', name: 'Test', type: 'custom', customField: 'v' });

            const namespaces = await provider.listNamespaces();
            expect(namespaces).not.toContain('customs');
        });

        it('skips non-directory entries', async () => {
            await fs.writeFile(path.join(tempDir, 'file.txt'), 'not a dir');

            const namespaces = await provider.listNamespaces();
            expect(namespaces).not.toContain('file.txt');
        });
    });

    describe('listTypes edge cases', () => {
        it('lists types without namespace', async () => {
            await provider.save({ id: 't1', name: 'Test', type: 'custom', customField: 'v' });

            const types = await provider.listTypes();
            expect(types).toContain('custom');
        });
    });

    describe('exists edge cases', () => {
        it('returns false when exists throws an error', async () => {
            const result = await provider.exists('custom', 'valid-id', 'non\x01existent');
            expect(result).toBe(false);
        });
    });

    describe('ensureDir behavior', () => {
        it('does not create directory when createIfMissing is false', async () => {
            const registry = createSchemaRegistry();
            registry.register({ type: 'custom', schema: CustomSchema });

            const noCreate = await createFileSystemProvider({
                basePath: tempDir,
                registry,
                createIfMissing: false,
            });

            await expect(
                noCreate.save({ id: 't1', name: 'Test', type: 'custom', customField: 'v' })
            ).rejects.toThrow();
        });
    });

    describe('filenameStrategy', () => {
        const SlugSchema = BaseEntitySchema.extend({
            type: z.literal('slugged'),
            slug: z.string(),
            customField: z.string(),
        });

        let slugProvider: StorageProvider;

        beforeEach(async () => {
            const registry = createSchemaRegistry();
            registry.register({ type: 'slugged', schema: SlugSchema, pluralName: 'slugged' });

            slugProvider = await createFileSystemProvider({
                basePath: tempDir,
                registry,
                filenameStrategy: (entity) => {
                    const slug = (entity as any).slug;
                    if (slug) {
                        return `${entity.id.substring(0, 8)}-${slug}`;
                    }
                    return entity.id;
                },
            });
            await slugProvider.initialize();
        });

        it('saves with compound filename', async () => {
            await slugProvider.save({
                id: 'a1b2c3d4-5678-9abc-def0-111111111111',
                name: 'Gerald Corson',
                type: 'slugged',
                slug: 'gerald-corson',
                customField: 'value',
            });

            const filePath = path.join(tempDir, 'slugged', 'a1b2c3d4-gerald-corson.yaml');
            expect(existsSync(filePath)).toBe(true);

            const idPath = path.join(tempDir, 'slugged', 'a1b2c3d4-5678-9abc-def0-111111111111.yaml');
            expect(existsSync(idPath)).toBe(false);
        });

        it('retrieves by id with compound filename', async () => {
            await slugProvider.save({
                id: 'a1b2c3d4-5678-9abc-def0-111111111111',
                name: 'Gerald Corson',
                type: 'slugged',
                slug: 'gerald-corson',
                customField: 'value',
            });

            const retrieved = await slugProvider.get('slugged', 'a1b2c3d4-5678-9abc-def0-111111111111');
            expect(retrieved).toBeDefined();
            expect(retrieved?.name).toBe('Gerald Corson');
        });

        it('checks exists with compound filename', async () => {
            await slugProvider.save({
                id: 'a1b2c3d4-5678-9abc-def0-111111111111',
                name: 'Gerald Corson',
                type: 'slugged',
                slug: 'gerald-corson',
                customField: 'value',
            });

            expect(await slugProvider.exists('slugged', 'a1b2c3d4-5678-9abc-def0-111111111111')).toBe(true);
            expect(await slugProvider.exists('slugged', 'nonexistent')).toBe(false);
        });

        it('deletes with compound filename', async () => {
            await slugProvider.save({
                id: 'a1b2c3d4-5678-9abc-def0-111111111111',
                name: 'Gerald Corson',
                type: 'slugged',
                slug: 'gerald-corson',
                customField: 'value',
            });

            const deleted = await slugProvider.delete('slugged', 'a1b2c3d4-5678-9abc-def0-111111111111');
            expect(deleted).toBe(true);

            const filePath = path.join(tempDir, 'slugged', 'a1b2c3d4-gerald-corson.yaml');
            expect(existsSync(filePath)).toBe(false);
        });

        it('migrates old id-based filename on save', async () => {
            // Manually create a file with old id-based naming
            const sluggedDir = path.join(tempDir, 'slugged');
            await fs.mkdir(sluggedDir, { recursive: true });
            const oldPath = path.join(sluggedDir, 'a1b2c3d4-5678-9abc-def0-111111111111.yaml');
            const content = [
                'id: a1b2c3d4-5678-9abc-def0-111111111111',
                'name: Gerald Corson',
                'slug: gerald-corson',
                'customField: value',
            ].join('\n');
            await fs.writeFile(oldPath, content, 'utf-8');

            // Save via provider with filenameStrategy — should rename
            await slugProvider.save({
                id: 'a1b2c3d4-5678-9abc-def0-111111111111',
                name: 'Gerald Corson',
                type: 'slugged',
                slug: 'gerald-corson',
                customField: 'value',
            });

            const newPath = path.join(sluggedDir, 'a1b2c3d4-gerald-corson.yaml');
            expect(existsSync(newPath)).toBe(true);
            expect(existsSync(oldPath)).toBe(false);
        });

        it('falls back to id when entity has no slug', async () => {
            await slugProvider.save({
                id: 'simple-id',
                name: 'No Slug',
                type: 'slugged',
                slug: '',
                customField: 'value',
            } as any);

            // filenameStrategy returns entity.id when slug is empty
            const filePath = path.join(tempDir, 'slugged', 'simple-id.yaml');
            expect(existsSync(filePath)).toBe(true);
        });

        it('handles getAll with mixed filename formats', async () => {
            // Create one file with old naming
            const sluggedDir = path.join(tempDir, 'slugged');
            await fs.mkdir(sluggedDir, { recursive: true });
            const oldContent = [
                'id: old11111-1111-1111-1111-111111111111',
                'name: Old Entity',
                'slug: old-entity',
                'customField: old',
            ].join('\n');
            await fs.writeFile(
                path.join(sluggedDir, 'old11111-1111-1111-1111-111111111111.yaml'),
                oldContent,
                'utf-8'
            );

            // Create one file with new naming
            await slugProvider.save({
                id: 'new22222-2222-2222-2222-222222222222',
                name: 'New Entity',
                type: 'slugged',
                slug: 'new-entity',
                customField: 'new',
            });

            const all = await slugProvider.getAll('slugged');
            expect(all).toHaveLength(2);
        });

        it('returns undefined when directory does not exist for findEntityFileById', async () => {
            const result = await slugProvider.get('slugged', 'nonexistent-id');
            expect(result).toBeUndefined();
        });

        it('resolves ambiguous prefix matches by reading entity id', async () => {
            const sluggedDir = path.join(tempDir, 'slugged');
            await fs.mkdir(sluggedDir, { recursive: true });

            // Two files with same prefix but different ids
            const content1 = [
                'id: a1b2c3d4-1111-1111-1111-111111111111',
                'name: Entity One',
                'slug: entity-one',
                'customField: one',
            ].join('\n');
            const content2 = [
                'id: a1b2c3d4-2222-2222-2222-222222222222',
                'name: Entity Two',
                'slug: entity-two',
                'customField: two',
            ].join('\n');

            await fs.writeFile(path.join(sluggedDir, 'a1b2c3d4-entity-one.yaml'), content1, 'utf-8');
            await fs.writeFile(path.join(sluggedDir, 'a1b2c3d4-entity-two.yaml'), content2, 'utf-8');

            const result = await slugProvider.get('slugged', 'a1b2c3d4-2222-2222-2222-222222222222');
            expect(result).toBeDefined();
            expect(result?.name).toBe('Entity Two');
        });

        it('returns false for delete when entity not found with filenameStrategy', async () => {
            const result = await slugProvider.delete('slugged', 'nonexistent');
            expect(result).toBe(false);
        });

        it('cleans up old file when writing same id with different filename', async () => {
            await slugProvider.save({
                id: 'a1b2c3d4-5678-9abc-def0-111111111111',
                name: 'Gerald Corson',
                type: 'slugged',
                slug: 'gerald-corson',
                customField: 'value',
            });

            const oldPath = path.join(tempDir, 'slugged', 'a1b2c3d4-gerald-corson.yaml');
            expect(existsSync(oldPath)).toBe(true);

            await slugProvider.save({
                id: 'a1b2c3d4-5678-9abc-def0-111111111111',
                name: 'Gerald Corson Updated',
                type: 'slugged',
                slug: 'gerald-corson-updated',
                customField: 'updated',
            });

            const newPath = path.join(tempDir, 'slugged', 'a1b2c3d4-gerald-corson-updated.yaml');
            expect(existsSync(newPath)).toBe(true);
            expect(existsSync(oldPath)).toBe(false);
        });
    });
});
