import { z } from 'zod';
import { SchemaMap } from '../schema/registry';
import { OvercontextAPI } from '../api/context';
import { NamespaceResolver } from './resolver';
import { NamespaceResolution } from './types';

export interface MultiNamespaceContextOptions<TSchemas extends SchemaMap> {
    api: OvercontextAPI<TSchemas>;
    resolver: NamespaceResolver;
}

/**
 * Extended context that supports multi-namespace operations.
 */
export interface MultiNamespaceContext<TSchemas extends SchemaMap = SchemaMap>
    extends OvercontextAPI<TSchemas> {

    /**
     * Get entity from any readable namespace.
     * Returns the first match in priority order.
     */
    getFromAny<K extends keyof TSchemas & string>(
        type: K,
        id: string
    ): Promise<{ entity: z.infer<TSchemas[K]>; namespace: string } | undefined>;

    /**
     * Get all entities of a type merged from all namespaces.
     * Higher priority namespaces override lower priority.
     */
    getAllMerged<K extends keyof TSchemas & string>(
        type: K
    ): Promise<z.infer<TSchemas[K]>[]>;

    /**
     * Find which namespace an entity lives in.
     */
    locateEntity(type: string, id: string): Promise<string | undefined>;

    /**
     * Get the current namespace resolution.
     */
    getResolution(): NamespaceResolution;

    /**
     * Create a context with different namespace resolution.
     */
    withNamespaces(namespaces: string | string[]): Promise<MultiNamespaceContext<TSchemas>>;
}

export const createMultiNamespaceContext = async <TSchemas extends SchemaMap>(
    options: MultiNamespaceContextOptions<TSchemas>,
    namespaces?: string | string[]
): Promise<MultiNamespaceContext<TSchemas>> => {
    const { api, resolver } = options;
    const { provider } = api;
    const resolution = await resolver.resolve(namespaces);

    return {
        // Forward base API methods
        provider: api.provider,
        registry: api.registry,
        defaultNamespace: resolution.primary,

        get: (type, id, namespace) => api.get(type, id, namespace ?? resolution.primary),
        getAll: (type, namespace) => api.getAll(type, namespace ?? resolution.primary),
        exists: (type, id, namespace) => api.exists(type, id, namespace ?? resolution.primary),
        create: (type, data, opts) => api.create(type, data, {
            ...opts,
            namespace: opts?.namespace ?? resolution.primary,
        }),
        update: (type, id, updates, namespace) =>
            api.update(type, id, updates, namespace ?? resolution.primary),
        upsert: (type, entity, namespace) =>
            api.upsert(type, entity, namespace ?? resolution.primary),
        delete: (type, id, namespace) =>
            api.delete(type, id, namespace ?? resolution.primary),
        types: () => api.types(),
        search: (opts) => api.search(opts),
        quickSearch: (q, opts) => api.quickSearch(q, opts),
        withNamespace: (ns) => api.withNamespace(ns),

        // Multi-namespace methods
        async getFromAny<K extends keyof TSchemas & string>(
            type: K,
            id: string
        ): Promise<{ entity: z.infer<TSchemas[K]>; namespace: string } | undefined> {
            for (const ns of resolution.readable) {
                const entity = await provider.get(type, id, ns);
                if (entity) {
                    return { entity: entity as z.infer<TSchemas[K]>, namespace: ns };
                }
            }
            return undefined;
        },

        async getAllMerged<K extends keyof TSchemas & string>(
            type: K
        ): Promise<z.infer<TSchemas[K]>[]> {
            const byId = new Map<string, z.infer<TSchemas[K]>>();

            // Process in reverse priority order so higher priority wins
            const reversed = [...resolution.readable].reverse();
            for (const ns of reversed) {
                const entities = await provider.getAll(type, ns);
                for (const entity of entities) {
                    byId.set(entity.id, entity as z.infer<TSchemas[K]>);
                }
            }

            return Array.from(byId.values());
        },

        async locateEntity(type: string, id: string): Promise<string | undefined> {
            for (const ns of resolution.readable) {
                if (await provider.exists(type, id, ns)) {
                    return ns;
                }
            }
            return undefined;
        },

        getResolution(): NamespaceResolution {
            return resolution;
        },

        async withNamespaces(ns: string | string[]): Promise<MultiNamespaceContext<TSchemas>> {
            return createMultiNamespaceContext(options, ns);
        },
    };
};
