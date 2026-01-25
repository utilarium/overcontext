import { z } from 'zod';
import { BaseEntity } from '../schema/base';
import { SchemaRegistry, SchemaMap } from '../schema/registry';
import { StorageProvider } from '../storage/interface';
import { EntityNotFoundError } from '../storage/errors';
import { generateUniqueId, slugify } from './slug';
import { createSearchEngine } from './search';
import { QueryOptions, QueryResult } from './query';

/**
 * Options for creating an entity.
 */
export interface CreateOptions {
    /** Override auto-generated ID */
    id?: string;

    /** Namespace to create in */
    namespace?: string;

    /** Whether to generate unique ID on collision */
    generateUniqueId?: boolean;
}

/**
 * Main context API for entity operations.
 * Type safety flows from registered schemas.
 */
export interface OvercontextAPI<TSchemas extends SchemaMap = SchemaMap> {
    /**
     * The underlying storage provider.
     */
    readonly provider: StorageProvider;

    /**
     * The schema registry.
     */
    readonly registry: SchemaRegistry;

    /**
     * Default namespace for operations.
     */
    readonly defaultNamespace?: string;

    // --- Generic Operations ---

    /**
     * Get an entity by type and ID.
     */
    get<K extends keyof TSchemas & string>(
        type: K,
        id: string,
        namespace?: string
    ): Promise<z.infer<TSchemas[K]> | undefined>;

    /**
     * Get all entities of a type.
     */
    getAll<K extends keyof TSchemas & string>(
        type: K,
        namespace?: string
    ): Promise<z.infer<TSchemas[K]>[]>;

    /**
     * Check if an entity exists.
     */
    exists(
        type: string,
        id: string,
        namespace?: string
    ): Promise<boolean>;

    /**
     * Create a new entity.
     */
    create<K extends keyof TSchemas & string>(
        type: K,
        data: Omit<z.infer<TSchemas[K]>, 'id' | 'type'> & { name: string },
        options?: CreateOptions
    ): Promise<z.infer<TSchemas[K]>>;

    /**
     * Update an existing entity.
     */
    update<K extends keyof TSchemas & string>(
        type: K,
        id: string,
        updates: Partial<Omit<z.infer<TSchemas[K]>, 'id' | 'type'>>,
        namespace?: string
    ): Promise<z.infer<TSchemas[K]>>;

    /**
     * Create or update an entity.
     */
    upsert<K extends keyof TSchemas & string>(
        type: K,
        entity: Omit<z.infer<TSchemas[K]>, 'type'> & { id: string; name: string },
        namespace?: string
    ): Promise<z.infer<TSchemas[K]>>;

    /**
     * Delete an entity.
     */
    delete(
        type: string,
        id: string,
        namespace?: string
    ): Promise<boolean>;

    /**
     * List all registered entity types.
     */
    types(): string[];

    /**
     * Create a namespaced context.
     */
    withNamespace(namespace: string): OvercontextAPI<TSchemas>;

    /**
     * Search entities.
     */
    search<T extends BaseEntity>(options: QueryOptions): Promise<QueryResult<T>>;

    /**
     * Quick search by name.
     */
    quickSearch<T extends BaseEntity>(
        query: string,
        options?: Pick<QueryOptions, 'type' | 'namespace' | 'limit'>
    ): Promise<T[]>;
}

export interface CreateContextOptions<TSchemas extends SchemaMap> {
    provider: StorageProvider;
    registry: SchemaRegistry;
    schemas: TSchemas;
    defaultNamespace?: string;
}

export const createContext = <TSchemas extends SchemaMap>(
    options: CreateContextOptions<TSchemas>
): OvercontextAPI<TSchemas> => {
    const { provider, registry, defaultNamespace } = options;

    const resolveNamespace = (ns?: string) => ns ?? defaultNamespace;

    const searchEngine = createSearchEngine({
        provider,
        registry,
        defaultNamespace,
    });

    const api: OvercontextAPI<TSchemas> = {
        provider,
        registry,
        defaultNamespace,

        async get<K extends keyof TSchemas & string>(
            type: K,
            id: string,
            namespace?: string
        ): Promise<z.infer<TSchemas[K]> | undefined> {
            return provider.get(type, id, resolveNamespace(namespace));
        },

        async getAll<K extends keyof TSchemas & string>(
            type: K,
            namespace?: string
        ): Promise<z.infer<TSchemas[K]>[]> {
            return provider.getAll(type, resolveNamespace(namespace));
        },

        async exists(
            type: string,
            id: string,
            namespace?: string
        ): Promise<boolean> {
            return provider.exists(type, id, resolveNamespace(namespace));
        },

        async create<K extends keyof TSchemas & string>(
            type: K,
            data: Omit<z.infer<TSchemas[K]>, 'id' | 'type'> & { name: string },
            options: CreateOptions = {}
        ): Promise<z.infer<TSchemas[K]>> {
            const namespace = resolveNamespace(options.namespace);
            const shouldGenerateUnique = options.generateUniqueId ?? true;

            let id: string;
            if (options.id) {
                id = options.id;
            } else if (shouldGenerateUnique) {
                id = await generateUniqueId(
                    data.name,
                    (testId) => provider.exists(type, testId, namespace)
                );
            } else {
                id = slugify(data.name);
            }

            const entity = {
                ...data,
                id,
                type,
                createdAt: new Date(),
                updatedAt: new Date(),
            } as z.infer<TSchemas[K]>;

            return provider.save(entity, namespace);
        },

        async update<K extends keyof TSchemas & string>(
            type: K,
            id: string,
            updates: Partial<Omit<z.infer<TSchemas[K]>, 'id' | 'type'>>,
            namespace?: string
        ): Promise<z.infer<TSchemas[K]>> {
            const ns = resolveNamespace(namespace);
            const existing = await provider.get(type, id, ns);

            if (!existing) {
                throw new EntityNotFoundError(type, id, ns);
            }

            const updated = {
                ...existing,
                ...updates,
                id,
                type,
                updatedAt: new Date(),
            } as z.infer<TSchemas[K]>;

            return provider.save(updated, ns);
        },

        async upsert<K extends keyof TSchemas & string>(
            type: K,
            entity: Omit<z.infer<TSchemas[K]>, 'type'> & { id: string; name: string },
            namespace?: string
        ): Promise<z.infer<TSchemas[K]>> {
            const ns = resolveNamespace(namespace);
            const existing = await provider.get(type, entity.id, ns);

            const now = new Date();
            const toSave = {
                ...existing,
                ...entity,
                type,
                createdAt: existing?.createdAt || now,
                updatedAt: now,
            } as z.infer<TSchemas[K]>;

            return provider.save(toSave, ns);
        },

        async delete(
            type: string,
            id: string,
            namespace?: string
        ): Promise<boolean> {
            return provider.delete(type, id, resolveNamespace(namespace));
        },

        types(): string[] {
            return registry.types();
        },

        withNamespace(namespace: string): OvercontextAPI<TSchemas> {
            return createContext({
                ...options,
                defaultNamespace: namespace,
            });
        },

        search: searchEngine.search.bind(searchEngine),
        quickSearch: searchEngine.quickSearch.bind(searchEngine),
    };

    return api;
};
