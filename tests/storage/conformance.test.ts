import { afterEach, describe, expect, it } from 'vitest';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { z } from 'zod';

import { BaseEntitySchema, createSchemaRegistry } from '../../src/schema';
import { createMemoryProvider } from '../../src/storage/memory';
import { createFileSystemProvider } from '../../src/storage/filesystem';
import { FjellStorageProvider } from '../../src/storage/fjell/provider';
import { MemoryFjellAdapter } from '../../src/storage/fjell/memory-adapter';
import { createFjellFsProvider } from '../../src/storage/fjell/fs-provider';
import { createFjellGcsProvider } from '../../src/storage/fjell/gcs-provider';
import type { StorageProvider } from '../../src/storage/interface';

type ProviderSetup = {
    provider: StorageProvider;
    cleanup?: () => Promise<void>;
};

const PersonSchema = BaseEntitySchema.extend({
    type: z.literal('person'),
    email: z.string().optional(),
});

const ProjectSchema = BaseEntitySchema.extend({
    type: z.literal('project'),
    status: z.string().optional(),
});

const createRegistry = () => {
    const registry = createSchemaRegistry();
    registry.register({ type: 'person', schema: PersonSchema, pluralName: 'people' });
    registry.register({ type: 'project', schema: ProjectSchema, pluralName: 'projects' });
    return registry;
};

type GcsFileRecord = { name: string; content: Buffer };

class MockGcsFile {
    constructor(
        private readonly store: Map<string, GcsFileRecord>,
        public readonly name: string,
    ) {}

    async exists(): Promise<[boolean]> {
        return [this.store.has(this.name)];
    }

    async save(content: Buffer | string): Promise<void> {
        const buffer = Buffer.isBuffer(content) ? content : Buffer.from(content);
        this.store.set(this.name, { name: this.name, content: buffer });
    }

    async download(): Promise<[Buffer]> {
        const record = this.store.get(this.name);
        if (!record) {
            throw new Error(`Not found: ${this.name}`);
        }
        return [record.content];
    }

    async delete(): Promise<void> {
        this.store.delete(this.name);
    }
}

class MockGcsBucket {
    constructor(private readonly store: Map<string, GcsFileRecord>) {}

    file(name: string): MockGcsFile {
        return new MockGcsFile(this.store, name);
    }

    async getFiles(options?: { prefix?: string }): Promise<[Array<{ name: string; download: () => Promise<[Buffer]> }>]> {
        const prefix = options?.prefix ?? '';
        const files = Array.from(this.store.values())
            .filter(file => file.name.startsWith(prefix))
            .map(file => ({
                name: file.name,
                download: async () => [file.content] as [Buffer],
            }));
        return [files];
    }
}

class MockGcsStorage {
    private readonly buckets = new Map<string, Map<string, GcsFileRecord>>();

    bucket(name: string): MockGcsBucket {
        if (!this.buckets.has(name)) {
            this.buckets.set(name, new Map());
        }
        return new MockGcsBucket(this.buckets.get(name)!);
    }
}

const providers: Array<{ name: string; setup: () => Promise<ProviderSetup> }> = [
    {
        name: 'memory',
        setup: async () => ({ provider: createMemoryProvider({ registry: createRegistry() }) }),
    },
    {
        name: 'filesystem',
        setup: async () => {
            const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'overcontext-conformance-fs-'));
            const provider = await createFileSystemProvider({
                basePath: tempDir,
                registry: createRegistry(),
            });
            return {
                provider,
                cleanup: async () => fs.rm(tempDir, { recursive: true, force: true }),
            };
        },
    },
    {
        name: 'fjell-memory',
        setup: async () => {
            const registry = createRegistry();
            return {
                provider: new FjellStorageProvider(
                    new MemoryFjellAdapter(),
                    registry,
                    'fjell-memory',
                    'memory://fjell',
                ),
            };
        },
    },
    {
        name: 'fjell-fs',
        setup: async () => {
            const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'overcontext-conformance-fjell-fs-'));
            const provider = await createFjellFsProvider({
                basePath: tempDir,
                registry: createRegistry(),
            });
            return {
                provider,
                cleanup: async () => fs.rm(tempDir, { recursive: true, force: true }),
            };
        },
    },
    {
        name: 'fjell-gcs-mocked',
        setup: async () => {
            const provider = await createFjellGcsProvider({
                bucketName: 'conformance-bucket',
                basePath: 'ctx',
                registry: createRegistry(),
                storage: new MockGcsStorage() as unknown as import('@google-cloud/storage').Storage,
                querySafety: { maxScanFiles: 1000 },
            });
            return { provider };
        },
    },
];

describe.each(providers)('StorageProvider conformance: $name', ({ setup }) => {
    let provider: StorageProvider;
    let cleanup: (() => Promise<void>) | undefined;

    afterEach(async () => {
        if (provider) {
            await provider.dispose();
        }
        if (cleanup) {
            await cleanup();
        }
    });

    const boot = async () => {
        const ctx = await setup();
        provider = ctx.provider;
        cleanup = ctx.cleanup;
        await provider.initialize();
    };

    it('supports lifecycle and availability', async () => {
        await boot();
        expect(await provider.isAvailable()).toBe(true);
    });

    it('supports save/get/exists/delete behavior', async () => {
        await boot();

        await provider.save({ id: 'p1', name: 'Alice', type: 'person' }, 'workspace-a');
        expect(await provider.exists('person', 'p1', 'workspace-a')).toBe(true);

        const retrieved = await provider.get('person', 'p1', 'workspace-a');
        expect(retrieved?.name).toBe('Alice');

        expect(await provider.delete('person', 'p1', 'workspace-a')).toBe(true);
        expect(await provider.get('person', 'p1', 'workspace-a')).toBeUndefined();
        expect(await provider.delete('person', 'missing', 'workspace-a')).toBe(false);
    });

    it('supports find/count and type filtering', async () => {
        await boot();

        await provider.save({ id: 'p1', name: 'Alice Smith', type: 'person' }, 'workspace-a');
        await provider.save({ id: 'p2', name: 'Bob Jones', type: 'person' }, 'workspace-a');
        await provider.save({ id: 'proj1', name: 'Smith Project', type: 'project' }, 'workspace-a');

        const people = await provider.find({ type: 'person', namespace: 'workspace-a' });
        expect(people).toHaveLength(2);

        const search = await provider.find({ namespace: 'workspace-a', search: 'smith' });
        expect(search).toHaveLength(2);

        const count = await provider.count({ namespace: 'workspace-a' });
        expect(count).toBe(3);
    });

    it('supports batch operations', async () => {
        await boot();

        await provider.saveBatch([
            { id: 'p1', name: 'Alice', type: 'person' },
            { id: 'p2', name: 'Bob', type: 'person' },
        ], 'workspace-a');

        expect(await provider.count({ type: 'person', namespace: 'workspace-a' })).toBe(2);

        const deleted = await provider.deleteBatch([
            { type: 'person', id: 'p1' },
            { type: 'person', id: 'p2' },
        ], 'workspace-a');
        expect(deleted).toBe(2);
    });

    it('isolates namespaces and reports namespace/type listings', async () => {
        await boot();

        await provider.save({ id: 'same-id', name: 'Alice A', type: 'person' }, 'workspace-a');
        await provider.save({ id: 'same-id', name: 'Alice B', type: 'person' }, 'workspace-b');
        await provider.save({ id: 'proj1', name: 'Project B', type: 'project' }, 'workspace-b');

        const a = await provider.get('person', 'same-id', 'workspace-a');
        const b = await provider.get('person', 'same-id', 'workspace-b');
        expect(a?.name).toBe('Alice A');
        expect(b?.name).toBe('Alice B');

        expect(await provider.namespaceExists('workspace-a')).toBe(true);
        expect(await provider.namespaceExists('workspace-b')).toBe(true);

        const namespaces = await provider.listNamespaces();
        expect(namespaces).toContain('workspace-a');
        expect(namespaces).toContain('workspace-b');

        const typesB = await provider.listTypes('workspace-b');
        expect(typesB).toContain('person');
        expect(typesB).toContain('project');
    });
});
