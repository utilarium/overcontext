import { createPrimaryGCSLibrary } from '@fjell/lib-gcs';
import type { GCSLibrary } from '@fjell/lib-gcs';
import type { EntityFilter } from '../interface';
import type { FjellBackendAdapter, FjellGcsProviderConfig } from './types';

type RawRecord = Record<string, unknown>;
type GcsFileLike = { name?: string };
type GcsBucketLike = { getFiles(options?: Record<string, unknown>): Promise<[GcsFileLike[]]> };
type GcsStorageLike = { bucket(name: string): GcsBucketLike };

/**
 * GCS-backed Fjell adapter.
 * Uses one lib-gcs Library instance per namespace/type pair.
 */
export class FjellGcsAdapter implements FjellBackendAdapter {
    private readonly libraries = new Map<string, GCSLibrary<any, string>>();
    private readonly config: FjellGcsProviderConfig;
    private readonly defaultNamespace = 'default';
    private initialized = false;

    constructor(config: FjellGcsProviderConfig) {
        this.config = config;
    }

    async initialize(): Promise<void> {
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
        return this.initialized;
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
        const names = await this.listObjectNames(this.objectPrefix());
        const knownTypes = new Set(this.config.registry.types());
        const namespaces = new Set<string>();

        for (const name of names) {
            const rel = this.relativeObjectPath(name);
            if (!rel) {
                continue;
            }
            const [firstSegment] = rel.split('/');
            if (!firstSegment || knownTypes.has(firstSegment)) {
                continue;
            }
            namespaces.add(firstSegment);
        }

        return Array.from(namespaces);
    }

    async namespaceExists(namespace: string): Promise<boolean> {
        const prefix = this.objectPrefix(namespace);
        const names = await this.listObjectNames(prefix);
        return names.length > 0;
    }

    async listTypes(namespace?: string): Promise<string[]> {
        const ns = this.resolveNamespace(namespace);
        const prefix = this.objectPrefix(ns);
        const names = await this.listObjectNames(prefix);
        const types = new Set<string>();

        for (const name of names) {
            const rel = this.relativeObjectPath(name);
            if (!rel || !rel.startsWith(`${ns}/`)) {
                continue;
            }

            const parts = rel.split('/');
            if (parts.length >= 2 && parts[1]) {
                types.add(parts[1]);
            }
        }

        return Array.from(types);
    }

    private libraryKey(type: string, namespace?: string): string {
        return `${this.resolveNamespace(namespace)}:${type}`;
    }

    private resolveNamespace(namespace?: string): string {
        return namespace ?? this.defaultNamespace;
    }

    private getLibrary(type: string, namespace?: string): GCSLibrary<any, string> {
        const key = this.libraryKey(type, namespace);
        const existing = this.libraries.get(key);
        if (existing) {
            return existing;
        }

        const ns = this.resolveNamespace(namespace);
        const libBasePath = this.joinPath(this.normalizeBasePath(this.config.basePath), ns);
        const library = createPrimaryGCSLibrary(type, type, {
            bucketName: this.config.bucketName,
            basePath: libBasePath,
            storage: this.config.storage,
            useJsonExtension: true,
            querySafety: this.config.querySafety,
        });
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

    private objectPrefix(...parts: string[]): string {
        const normalizedBase = this.normalizeBasePath(this.config.basePath);
        const segments = [normalizedBase, ...parts].filter(Boolean);
        return segments.length > 0 ? `${segments.join('/')}/` : '';
    }

    private joinPath(...parts: string[]): string {
        return parts.filter(Boolean).join('/');
    }

    private normalizeBasePath(basePath?: string): string {
        if (!basePath) {
            return '';
        }
        return basePath.replace(/^\/+|\/+$/g, '');
    }

    private relativeObjectPath(fullName: string): string {
        const base = this.normalizeBasePath(this.config.basePath);
        if (!base) {
            return fullName;
        }
        return fullName.startsWith(`${base}/`) ? fullName.slice(base.length + 1) : fullName;
    }

    private async listObjectNames(prefix: string): Promise<string[]> {
        const storage = this.config.storage as unknown as GcsStorageLike | undefined;
        if (!storage) {
            return [];
        }

        const bucket = storage.bucket(this.config.bucketName);
        const [files] = await bucket.getFiles({ prefix });
        return files.map(file => file.name ?? '').filter(Boolean);
    }
}
