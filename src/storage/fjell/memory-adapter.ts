import type { FjellBackendAdapter } from './types';
import type { EntityFilter } from '../interface';

/**
 * In-memory implementation of FjellBackendAdapter for testing.
 * Stores entities in a nested Map: namespaceKey:type -> id -> entity data.
 */
export class MemoryFjellAdapter implements FjellBackendAdapter {
    private store = new Map<string, Map<string, Record<string, unknown>>>();
    private initialized = false;
    private defaultNamespace = 'default';

    private bucketKey(type: string, namespace?: string): string {
        return `${namespace ?? this.defaultNamespace}:${type}`;
    }

    private getBucket(type: string, namespace?: string): Map<string, Record<string, unknown>> {
        const key = this.bucketKey(type, namespace);
        let bucket = this.store.get(key);
        if (!bucket) {
            bucket = new Map();
            this.store.set(key, bucket);
        }
        return bucket;
    }

    async initialize(): Promise<void> {
        this.initialized = true;
    }

    async dispose(): Promise<void> {
        this.store.clear();
        this.initialized = false;
    }

    async isAvailable(): Promise<boolean> {
        return this.initialized;
    }

    async get(type: string, id: string, namespace?: string): Promise<Record<string, unknown> | undefined> {
        const bucket = this.getBucket(type, namespace);
        const item = bucket.get(id);
        return item ? { ...item } : undefined;
    }

    async getAll(type: string, namespace?: string): Promise<Record<string, unknown>[]> {
        const bucket = this.getBucket(type, namespace);
        return Array.from(bucket.values()).map(item => ({ ...item }));
    }

    async create(type: string, item: Record<string, unknown>, namespace?: string): Promise<Record<string, unknown>> {
        const bucket = this.getBucket(type, namespace);
        const id = item.id as string;
        const stored = { ...item };
        bucket.set(id, stored);
        return { ...stored };
    }

    async update(type: string, id: string, item: Record<string, unknown>, namespace?: string): Promise<Record<string, unknown>> {
        const bucket = this.getBucket(type, namespace);
        const stored = { ...item };
        bucket.set(id, stored);
        return { ...stored };
    }

    async remove(type: string, id: string, namespace?: string): Promise<boolean> {
        const bucket = this.getBucket(type, namespace);
        return bucket.delete(id);
    }

    async find(type: string, filter: EntityFilter, namespace?: string): Promise<Record<string, unknown>[]> {
        const all = await this.getAll(type, namespace);
        let results = all;

        if (filter.ids) {
            const idSet = new Set(filter.ids);
            results = results.filter(item => idSet.has(item.id as string));
        }

        if (filter.search) {
            const term = filter.search.toLowerCase();
            results = results.filter(item => {
                const name = (item.name as string) ?? '';
                const notes = (item.notes as string) ?? '';
                return name.toLowerCase().includes(term) || notes.toLowerCase().includes(term);
            });
        }

        if (filter.offset) {
            results = results.slice(filter.offset);
        }

        if (filter.limit) {
            results = results.slice(0, filter.limit);
        }

        return results;
    }

    async exists(type: string, id: string, namespace?: string): Promise<boolean> {
        const bucket = this.getBucket(type, namespace);
        return bucket.has(id);
    }

    async count(type: string, filter?: EntityFilter, namespace?: string): Promise<number> {
        if (filter) {
            const results = await this.find(type, filter, namespace);
            return results.length;
        }
        const bucket = this.getBucket(type, namespace);
        return bucket.size;
    }

    async listNamespaces(): Promise<string[]> {
        const namespaces = new Set<string>();
        for (const key of this.store.keys()) {
            const ns = key.split(':')[0];
            if (this.store.get(key)!.size > 0) {
                namespaces.add(ns);
            }
        }
        return Array.from(namespaces);
    }

    async namespaceExists(namespace: string): Promise<boolean> {
        for (const [key, bucket] of this.store.entries()) {
            if (key.startsWith(`${namespace}:`) && bucket.size > 0) {
                return true;
            }
        }
        return false;
    }

    async listTypes(namespace?: string): Promise<string[]> {
        const ns = namespace ?? this.defaultNamespace;
        const types = new Set<string>();
        for (const [key, bucket] of this.store.entries()) {
            if (key.startsWith(`${ns}:`) && bucket.size > 0) {
                types.add(key.split(':')[1]);
            }
        }
        return Array.from(types);
    }
}
