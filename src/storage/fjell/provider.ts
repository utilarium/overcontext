import type { StorageProvider, EntityFilter } from '../interface';
import type { FjellBackendAdapter } from './types';
import type { SchemaRegistry } from '../../schema/registry';
import type { BaseEntity } from '../../schema/base';

/**
 * StorageProvider backed by a FjellBackendAdapter.
 * Delegates all persistence to the adapter and handles
 * entity <-> raw record conversion at the boundary.
 */
export class FjellStorageProvider implements StorageProvider {
    readonly name: string;
    readonly location: string;
    readonly registry: SchemaRegistry;
    private adapter: FjellBackendAdapter;

    constructor(
        adapter: FjellBackendAdapter,
        registry: SchemaRegistry,
        name: string,
        location: string,
    ) {
        this.adapter = adapter;
        this.registry = registry;
        this.name = name;
        this.location = location;
    }

    async initialize(): Promise<void> {
        return this.adapter.initialize();
    }

    async dispose(): Promise<void> {
        return this.adapter.dispose();
    }

    async isAvailable(): Promise<boolean> {
        return this.adapter.isAvailable();
    }

    async get<T extends BaseEntity>(
        type: string,
        id: string,
        namespace?: string,
    ): Promise<T | undefined> {
        const raw = await this.adapter.get(type, id, namespace);
        return raw ? this.toEntity<T>(raw) : undefined;
    }

    async getAll<T extends BaseEntity>(
        type: string,
        namespace?: string,
    ): Promise<T[]> {
        const raws = await this.adapter.getAll(type, namespace);
        return raws.map(r => this.toEntity<T>(r));
    }

    async find<T extends BaseEntity>(filter: EntityFilter): Promise<T[]> {
        const types = this.resolveFilterTypes(filter);
        const results: T[] = [];

        for (const type of types) {
            const typeFilter = { ...filter, type };
            const raws = await this.adapter.find(type, typeFilter, filter.namespace);
            results.push(...raws.map(r => this.toEntity<T>(r)));
        }

        if (filter.limit && results.length > filter.limit) {
            return results.slice(0, filter.limit);
        }

        return results;
    }

    async exists(type: string, id: string, namespace?: string): Promise<boolean> {
        return this.adapter.exists(type, id, namespace);
    }

    async count(filter: EntityFilter): Promise<number> {
        const types = this.resolveFilterTypes(filter);
        let total = 0;

        for (const type of types) {
            const typeFilter = { ...filter, type };
            total += await this.adapter.count(type, typeFilter, filter.namespace);
        }

        return total;
    }

    async save<T extends BaseEntity>(entity: T, namespace?: string): Promise<T> {
        const raw = this.toRaw(entity);
        const entityExists = await this.adapter.exists(entity.type, entity.id, namespace);
        const result = entityExists
            ? await this.adapter.update(entity.type, entity.id, raw, namespace)
            : await this.adapter.create(entity.type, raw, namespace);
        return this.toEntity<T>(result);
    }

    async delete(type: string, id: string, namespace?: string): Promise<boolean> {
        return this.adapter.remove(type, id, namespace);
    }

    async saveBatch<T extends BaseEntity>(entities: T[], namespace?: string): Promise<T[]> {
        return Promise.all(entities.map(e => this.save(e, namespace)));
    }

    async deleteBatch(
        refs: Array<{ type: string; id: string }>,
        namespace?: string,
    ): Promise<number> {
        let deleted = 0;
        for (const ref of refs) {
            const removed = await this.adapter.remove(ref.type, ref.id, namespace);
            if (removed) deleted++;
        }
        return deleted;
    }

    async listNamespaces(): Promise<string[]> {
        return this.adapter.listNamespaces();
    }

    async namespaceExists(namespace: string): Promise<boolean> {
        return this.adapter.namespaceExists(namespace);
    }

    async listTypes(namespace?: string): Promise<string[]> {
        return this.adapter.listTypes(namespace);
    }

    private toEntity<T extends BaseEntity>(raw: Record<string, unknown>): T {
        const entity = { ...raw } as T;
        if (raw.createdAt && typeof raw.createdAt === 'string') {
            (entity as Record<string, unknown>).createdAt = new Date(raw.createdAt as string);
        }
        if (raw.updatedAt && typeof raw.updatedAt === 'string') {
            (entity as Record<string, unknown>).updatedAt = new Date(raw.updatedAt as string);
        }
        return entity;
    }

    private toRaw(entity: BaseEntity): Record<string, unknown> {
        const raw = { ...entity } as Record<string, unknown>;
        if (entity.createdAt) {
            raw.createdAt = entity.createdAt.toISOString();
        }
        if (entity.updatedAt) {
            raw.updatedAt = entity.updatedAt.toISOString();
        }
        return raw;
    }

    private resolveFilterTypes(filter: EntityFilter): string[] {
        if (filter.type) {
            return Array.isArray(filter.type) ? filter.type : [filter.type];
        }
        return this.registry.types();
    }
}
