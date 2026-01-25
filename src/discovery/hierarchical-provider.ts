import { StorageProvider, EntityFilter } from '../storage/interface';
import { BaseEntity } from '../schema/base';
import { SchemaRegistry } from '../schema/registry';
import { createFileSystemProvider } from '../storage/filesystem';
import { ContextRoot } from './context-root';

export interface HierarchicalProviderOptions {
    contextRoot: ContextRoot;
    registry: SchemaRegistry;
    readonly?: boolean;
}

/**
 * Storage provider that reads from multiple context directories
 * and writes to the primary (closest) directory.
 */
export const createHierarchicalProvider = async (
    options: HierarchicalProviderOptions
): Promise<StorageProvider> => {
    const { contextRoot, registry, readonly = false } = options;

    if (contextRoot.contextPaths.length === 0) {
        throw new Error('No context directories found');
    }

    // Create read-only providers for each context directory
    const readProviders: StorageProvider[] = [];
    for (const contextPath of contextRoot.contextPaths) {
        const fsProvider = await createFileSystemProvider({
            basePath: contextPath,
            registry,
            createIfMissing: false,
            readonly: true,
        });
        await fsProvider.initialize();
        readProviders.push(fsProvider);
    }

    // Primary provider for writes
    const primaryProvider = await createFileSystemProvider({
        basePath: contextRoot.primary!,
        registry,
        createIfMissing: true,
        readonly,
    });
    await primaryProvider.initialize();

    const findEntities = async <T extends BaseEntity>(filter: EntityFilter): Promise<T[]> => {
        const byId = new Map<string, T>();

        for (const p of [...readProviders].reverse()) {
            const results = await p.find<T>(filter);
            for (const entity of results) {
                byId.set(entity.id, entity);
            }
        }

        let results = Array.from(byId.values());

        if (filter.offset) results = results.slice(filter.offset);
        if (filter.limit) results = results.slice(0, filter.limit);

        return results;
    };

    return {
        name: 'hierarchical',
        location: contextRoot.primary!,
        registry,

        async initialize() { },

        async dispose() {
            for (const p of readProviders) await p.dispose();
            await primaryProvider.dispose();
        },

        async isAvailable() {
            return primaryProvider.isAvailable();
        },

        // Read operations search all providers (closest first)
        async get<T extends BaseEntity>(type: string, id: string, namespace?: string) {
            for (const p of readProviders) {
                const entity = await p.get<T>(type, id, namespace);
                if (entity) return entity;
            }
            return undefined;
        },

        async getAll<T extends BaseEntity>(type: string, namespace?: string) {
            const byId = new Map<string, T>();

            // Process in reverse order so closest overwrites
            for (const p of [...readProviders].reverse()) {
                const entities = await p.getAll<T>(type, namespace);
                for (const entity of entities) {
                    byId.set(entity.id, entity);
                }
            }

            return Array.from(byId.values());
        },

        find: findEntities,

        async exists(type: string, id: string, namespace?: string) {
            for (const p of readProviders) {
                if (await p.exists(type, id, namespace)) return true;
            }
            return false;
        },

        async count(filter: EntityFilter) {
            const results = await findEntities(filter);
            return results.length;
        },

        // Write operations go to primary
        save: (entity, namespace) => primaryProvider.save(entity, namespace),
        delete: (type, id, namespace) => primaryProvider.delete(type, id, namespace),
        saveBatch: (entities, namespace) => primaryProvider.saveBatch(entities, namespace),
        deleteBatch: (refs, namespace) => primaryProvider.deleteBatch(refs, namespace),

        listNamespaces: () => Promise.resolve(contextRoot.allNamespaces),
        namespaceExists: (ns) => Promise.resolve(contextRoot.allNamespaces.includes(ns)),
        listTypes: () => Promise.resolve(contextRoot.allTypes),
    };
};
