import * as fs from 'node:fs/promises';
import type { Dirent } from 'node:fs';
import * as path from 'node:path';

import { createPrimaryFilesystemLibrary } from '@fjell/lib-fs';
import type { FilesystemLibrary } from '@fjell/lib-fs';
import type { EntityFilter } from '../interface';
import type { FjellBackendAdapter, FjellFsProviderConfig } from './types';

type RawRecord = Record<string, unknown>;

/**
 * Filesystem-backed Fjell adapter.
 * Uses one lib-fs Library instance per namespace/type pair.
 */
export class FjellFsAdapter implements FjellBackendAdapter {
    private readonly libraries = new Map<string, FilesystemLibrary<any, string>>();
    private readonly config: FjellFsProviderConfig;
    private readonly defaultNamespace = 'default';
    private initialized = false;

    constructor(config: FjellFsProviderConfig) {
        this.config = config;
    }

    async initialize(): Promise<void> {
        await fs.mkdir(this.config.basePath, { recursive: true });
        // Prime libraries for known types in the default namespace.
        for (const type of this.config.registry.types()) {
            this.getLibrary(type);
        }
        this.initialized = true;
    }

    async dispose(): Promise<void> {
        this.libraries.clear();
        this.initialized = false;
    }

    async isAvailable(): Promise<boolean> {
        if (!this.initialized) {
            return false;
        }
        try {
            const stat = await fs.stat(this.config.basePath);
            return stat.isDirectory();
        } catch {
            return false;
        }
    }

    async get(type: string, id: string, namespace?: string): Promise<RawRecord | undefined> {
        const library = this.getLibrary(type, namespace);
        const key = this.toPriKey(type, id);
        const item = await library.operations.get(key);
        if (!item) {
            return undefined;
        }
        return this.normalizeFromFjell(item as RawRecord, type, id);
    }

    async getAll(type: string, namespace?: string): Promise<RawRecord[]> {
        const library = this.getLibrary(type, namespace);
        const result = await library.operations.all();
        return result.items.map(item => this.normalizeFromFjell(item as RawRecord, type));
    }

    async create(type: string, item: RawRecord, namespace?: string): Promise<RawRecord> {
        const id = String(item.id ?? '');
        const library = this.getLibrary(type, namespace);
        const key = this.toPriKey(type, id);
        const created = await library.operations.create(this.toFjellItem(type, id, item), { key });
        return this.normalizeFromFjell(created as RawRecord, type, id);
    }

    async update(type: string, id: string, item: RawRecord, namespace?: string): Promise<RawRecord> {
        const library = this.getLibrary(type, namespace);
        const key = this.toPriKey(type, id);
        const updated = await library.operations.update(key, this.toFjellItem(type, id, item));
        return this.normalizeFromFjell(updated as RawRecord, type, id);
    }

    async remove(type: string, id: string, namespace?: string): Promise<boolean> {
        const existing = await this.get(type, id, namespace);
        if (!existing) {
            return false;
        }
        const library = this.getLibrary(type, namespace);
        const key = this.toPriKey(type, id);
        await library.operations.remove(key);
        return true;
    }

    async find(type: string, filter: EntityFilter, namespace?: string): Promise<RawRecord[]> {
        let results = await this.getAll(type, namespace);

        if (filter.ids && filter.ids.length > 0) {
            const ids = new Set(filter.ids);
            results = results.filter(item => ids.has(String(item.id)));
        }

        if (filter.search) {
            const search = filter.search.toLowerCase();
            results = results.filter(item => {
                const name = String(item.name ?? '').toLowerCase();
                const notes = String(item.notes ?? '').toLowerCase();
                return name.includes(search) || notes.includes(search);
            });
        }

        if (filter.offset && filter.offset > 0) {
            results = results.slice(filter.offset);
        }

        if (filter.limit && filter.limit >= 0) {
            results = results.slice(0, filter.limit);
        }

        return results;
    }

    async exists(type: string, id: string, namespace?: string): Promise<boolean> {
        const existing = await this.get(type, id, namespace);
        return Boolean(existing);
    }

    async count(type: string, filter?: EntityFilter, namespace?: string): Promise<number> {
        if (!filter) {
            const all = await this.getAll(type, namespace);
            return all.length;
        }
        const results = await this.find(type, filter, namespace);
        return results.length;
    }

    async listNamespaces(): Promise<string[]> {
        let entries: Dirent[];
        try {
            entries = await fs.readdir(this.config.basePath, { withFileTypes: true });
        } catch {
            return [];
        }

        const knownTypes = new Set(this.config.registry.types());
        return entries
            .filter(entry => entry.isDirectory())
            .map(entry => entry.name)
            .filter(name => !knownTypes.has(name));
    }

    async namespaceExists(namespace: string): Promise<boolean> {
        const nsPath = path.join(this.config.basePath, namespace);
        try {
            const stat = await fs.stat(nsPath);
            return stat.isDirectory();
        } catch {
            return false;
        }
    }

    async listTypes(namespace?: string): Promise<string[]> {
        const ns = this.resolveNamespace(namespace);
        const nsPath = path.join(this.config.basePath, ns);
        let entries: Dirent[];
        try {
            entries = await fs.readdir(nsPath, { withFileTypes: true });
        } catch {
            return [];
        }

        return entries
            .filter(entry => entry.isDirectory())
            .map(entry => entry.name);
    }

    private libraryKey(type: string, namespace?: string): string {
        return `${this.resolveNamespace(namespace)}:${type}`;
    }

    private resolveNamespace(namespace?: string): string {
        return namespace ?? this.defaultNamespace;
    }

    private getLibrary(type: string, namespace?: string): FilesystemLibrary<any, string> {
        const key = this.libraryKey(type, namespace);
        const existing = this.libraries.get(key);
        if (existing) {
            return existing;
        }

        const ns = this.resolveNamespace(namespace);
        const library = createPrimaryFilesystemLibrary(type, `${ns}/${type}`, this.config.basePath);
        this.libraries.set(key, library);
        return library;
    }

    private toPriKey(type: string, id: string): { kt: string; pk: string } {
        return { kt: type, pk: id };
    }

    private toFjellItem(type: string, id: string, item: RawRecord): RawRecord {
        return {
            ...item,
            id,
            type,
        };
    }

    private normalizeFromFjell(item: RawRecord, type: string, idFromKey?: string): RawRecord {
        const raw = { ...item };
        delete raw.key;
        delete raw.events;
        delete raw.aggs;
        delete raw.refs;

        const key = item.key as { pk?: string | number } | undefined;
        const id = idFromKey ?? (typeof raw.id === 'string' ? raw.id : key?.pk);

        return {
            ...raw,
            id: id ? String(id) : '',
            type: (typeof raw.type === 'string' ? raw.type : type),
        };
    }
}
