import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { z } from 'zod';

import { BaseEntitySchema, createSchemaRegistry } from '../../../src/schema';
import { createFjellGcsProvider } from '../../../src/storage/fjell/gcs-provider';
import type { StorageProvider } from '../../../src/storage/interface';

type GcsFileRecord = {
    name: string;
    content: Buffer;
};

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

    clear(): void {
        this.buckets.clear();
    }
}

const PersonSchema = BaseEntitySchema.extend({
    type: z.literal('person'),
    email: z.string().optional(),
});

const ProjectSchema = BaseEntitySchema.extend({
    type: z.literal('project'),
    status: z.string().optional(),
});

describe('FjellGcsAdapter', () => {
    let provider: StorageProvider;
    let storage: MockGcsStorage;

    beforeEach(async () => {
        storage = new MockGcsStorage();
        const registry = createSchemaRegistry();
        registry.register({ type: 'person', schema: PersonSchema, pluralName: 'people' });
        registry.register({ type: 'project', schema: ProjectSchema, pluralName: 'projects' });

        provider = await createFjellGcsProvider({
            bucketName: 'test-bucket',
            basePath: 'ctx',
            registry,
            storage: storage as unknown as import('@google-cloud/storage').Storage,
            querySafety: {
                maxScanFiles: 100,
                downloadConcurrency: 2,
            },
        });
    });

    afterEach(async () => {
        await provider.dispose();
        storage.clear();
    });

    it('creates provider with gcs location', () => {
        expect(provider.name).toBe('fjell-gcs');
        expect(provider.location).toBe('gs://test-bucket/ctx');
    });

    it('writes and reads records via mocked gcs storage', async () => {
        await provider.save({ id: 'p1', name: 'Alice', type: 'person' }, 'workspace-a');

        const result = await provider.get('person', 'p1', 'workspace-a');
        expect(result).toBeDefined();
        expect(result?.name).toBe('Alice');
    });

    it('uses expected gcs object path <base>/<namespace>/<type>/<id>.json', async () => {
        await provider.save({ id: 'p1', name: 'Alice', type: 'person' }, 'workspace-a');

        const [files] = await storage.bucket('test-bucket').getFiles({ prefix: 'ctx/workspace-a/person/' });
        expect(files.some(file => file.name === 'ctx/workspace-a/person/p1.json')).toBe(true);
    });

    it('isolates same ids by namespace', async () => {
        await provider.save({ id: 'p1', name: 'Alice A', type: 'person' }, 'workspace-a');
        await provider.save({ id: 'p1', name: 'Alice B', type: 'person' }, 'workspace-b');

        const a = await provider.get('person', 'p1', 'workspace-a');
        const b = await provider.get('person', 'p1', 'workspace-b');

        expect(a?.name).toBe('Alice A');
        expect(b?.name).toBe('Alice B');
    });

    it('supports listNamespaces and listTypes from object names', async () => {
        await provider.save({ id: 'p1', name: 'Alice', type: 'person' }, 'workspace-a');
        await provider.save({ id: 'proj1', name: 'Project 1', type: 'project' }, 'workspace-a');
        await provider.save({ id: 'p2', name: 'Bob', type: 'person' }, 'workspace-b');

        const namespaces = await provider.listNamespaces();
        expect(namespaces).toContain('workspace-a');
        expect(namespaces).toContain('workspace-b');

        const types = await provider.listTypes('workspace-a');
        expect(types).toContain('person');
        expect(types).toContain('project');
    });

    it('supports query safety options via config', async () => {
        const registry = createSchemaRegistry();
        registry.register({ type: 'person', schema: PersonSchema, pluralName: 'people' });

        const strictProvider = await createFjellGcsProvider({
            bucketName: 'test-bucket',
            basePath: 'ctx',
            registry,
            storage: storage as unknown as import('@google-cloud/storage').Storage,
            querySafety: { maxScanFiles: 1 },
        });

        await strictProvider.save({ id: 'p1', name: 'A', type: 'person' }, 'ns');
        await strictProvider.save({ id: 'p2', name: 'B', type: 'person' }, 'ns');

        await expect(strictProvider.getAll('person', 'ns')).rejects.toThrow(/maxScanFiles/);
        await strictProvider.dispose();
    });
});
