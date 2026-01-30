import { StorageProvider, StorageProviderOptions, EntityFilter } from './interface';
import { BaseEntity } from '../schema/base';
import { ValidationError, ReadonlyStorageError } from './errors';

/**
 * Create a deep clone of an entity to prevent external mutation of stored data.
 * Uses structured clone for proper handling of dates and nested objects.
 */
const cloneEntity = <T extends BaseEntity>(entity: T): T => {
    // structuredClone handles Date objects properly
    return structuredClone(entity);
};

export interface MemoryProviderOptions extends StorageProviderOptions {
    /** Initial data to populate */
    initialData?: BaseEntity[];
}

export const createMemoryProvider = (
    options: MemoryProviderOptions
): StorageProvider => {
    const { registry, readonly = false, defaultNamespace, initialData = [] } = options;

    // Storage: namespace -> type -> id -> entity
    const store = new Map<string, Map<string, Map<string, BaseEntity>>>();

    const getNamespaceStore = (namespace: string): Map<string, Map<string, BaseEntity>> => {
        if (!store.has(namespace)) {
            store.set(namespace, new Map());
        }
        return store.get(namespace)!;
    };

    const getTypeStore = (
        namespace: string,
        type: string
    ): Map<string, BaseEntity> => {
        const nsStore = getNamespaceStore(namespace);
        if (!nsStore.has(type)) {
            nsStore.set(type, new Map());
        }
        return nsStore.get(type)!;
    };

    const resolveNamespace = (ns?: string): string => ns ?? defaultNamespace ?? '_default';

    // Initialize with any provided data
    for (const entity of initialData) {
        const ns = resolveNamespace(entity.namespace);
        getTypeStore(ns, entity.type).set(entity.id, entity);
    }

    return {
        name: 'memory',
        location: 'in-memory',
        registry,

        async initialize() { },

        async dispose() {
            store.clear();
        },

        async isAvailable() {
            return true;
        },

        async get<T extends BaseEntity>(
            type: string,
            id: string,
            namespace?: string
        ): Promise<T | undefined> {
            const ns = resolveNamespace(namespace);
            const entity = getTypeStore(ns, type).get(id) as T | undefined;
            // Return a defensive copy to prevent external mutation of stored data
            return entity ? cloneEntity(entity) : undefined;
        },

        async getAll<T extends BaseEntity>(
            type: string,
            namespace?: string
        ): Promise<T[]> {
            const ns = resolveNamespace(namespace);
            // Return defensive copies to prevent external mutation
            return Array.from(getTypeStore(ns, type).values()).map(e => cloneEntity(e as T));
        },

        async find<T extends BaseEntity>(filter: EntityFilter): Promise<T[]> {
            let results: T[] = [];

            const types = filter.type
                ? (Array.isArray(filter.type) ? filter.type : [filter.type])
                : registry.types();

            const ns = resolveNamespace(filter.namespace);

            for (const type of types) {
                results = results.concat(await this.getAll<T>(type, ns));
            }

            if (filter.ids?.length) {
                results = results.filter(e => filter.ids!.includes(e.id));
            }

            if (filter.search) {
                const s = filter.search.toLowerCase();
                results = results.filter(e => e.name.toLowerCase().includes(s));
            }

            if (filter.offset) results = results.slice(filter.offset);
            if (filter.limit) results = results.slice(0, filter.limit);

            return results;
        },

        async exists(type: string, id: string, namespace?: string): Promise<boolean> {
            const ns = resolveNamespace(namespace);
            return getTypeStore(ns, type).has(id);
        },

        async count(filter: EntityFilter): Promise<number> {
            return (await this.find(filter)).length;
        },

        async save<T extends BaseEntity>(entity: T, namespace?: string): Promise<T> {
            if (readonly) {
                throw new ReadonlyStorageError();
            }

            const validationResult = registry.validate(entity);
            if (!validationResult.success) {
                throw new ValidationError(
                    'Validation failed',
                    validationResult.errors || []
                );
            }

            const ns = resolveNamespace(namespace);
            const now = new Date();
            const existing = getTypeStore(ns, entity.type).get(entity.id);

            const saved = {
                ...entity,
                namespace: ns,
                createdAt: existing?.createdAt || now,
                updatedAt: now,
            } as T;

            // Store a cloned copy to prevent external mutation from affecting stored data
            getTypeStore(ns, entity.type).set(entity.id, cloneEntity(saved));
            // Return a clone so caller can't mutate stored data through returned reference
            return cloneEntity(saved);
        },

        async delete(type: string, id: string, namespace?: string): Promise<boolean> {
            if (readonly) {
                throw new ReadonlyStorageError();
            }

            const ns = resolveNamespace(namespace);
            return getTypeStore(ns, type).delete(id);
        },

        async saveBatch<T extends BaseEntity>(
            entities: T[],
            namespace?: string
        ): Promise<T[]> {
            return Promise.all(entities.map(e => this.save(e, namespace)));
        },

        async deleteBatch(
            refs: Array<{ type: string; id: string }>,
            namespace?: string
        ): Promise<number> {
            let count = 0;
            for (const ref of refs) {
                if (await this.delete(ref.type, ref.id, namespace)) count++;
            }
            return count;
        },

        async listNamespaces(): Promise<string[]> {
            return Array.from(store.keys()).filter(ns => ns !== '_default');
        },

        async namespaceExists(namespace: string): Promise<boolean> {
            return store.has(namespace);
        },

        async listTypes(namespace?: string): Promise<string[]> {
            const ns = resolveNamespace(namespace);
            const nsStore = store.get(ns);
            return nsStore ? Array.from(nsStore.keys()) : [];
        },
    };
};
