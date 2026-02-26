import { BaseEntity } from '../schema/base';
import { StorageProvider } from './interface';
import {
    StorageEventHandler,
    AnyStorageEvent,
    ObservableStorageProvider,
} from './events';

/**
 * Wrap any StorageProvider to make it observable.
 */
export const createObservableProvider = (
    provider: StorageProvider
): ObservableStorageProvider => {
    const handlers = new Set<StorageEventHandler>();

    const emit = (event: AnyStorageEvent): void => {
        handlers.forEach(handler => {
            try {
                handler(event);
            } catch (error) {
                // eslint-disable-next-line no-console
                console.error('Storage event handler error:', error);
            }
        });
    };

    return {
        get name(): string {
            return provider.name;
        },

        get location(): string {
            return provider.location;
        },

        get registry() {
            return provider.registry;
        },

        subscribe(handler: StorageEventHandler): () => void {
            handlers.add(handler);
            return () => handlers.delete(handler);
        },

        async initialize(): Promise<void> {
            await provider.initialize();
            emit({ type: 'storage:initialized', timestamp: new Date() });
        },

        async dispose(): Promise<void> {
            emit({ type: 'storage:disposed', timestamp: new Date() });
            handlers.clear(); // Clear all handlers to prevent memory leaks
            await provider.dispose();
        },

        async isAvailable(): Promise<boolean> {
            return provider.isAvailable();
        },

        async get<T extends BaseEntity>(type: string, id: string, namespace?: string): Promise<T | undefined> {
            return provider.get<T>(type, id, namespace);
        },

        async getAll<T extends BaseEntity>(type: string, namespace?: string): Promise<T[]> {
            return provider.getAll<T>(type, namespace);
        },

        async find<T extends BaseEntity>(filter: Parameters<StorageProvider['find']>[0]): Promise<T[]> {
            return provider.find<T>(filter);
        },

        async exists(type: string, id: string, namespace?: string): Promise<boolean> {
            return provider.exists(type, id, namespace);
        },

        async count(filter: Parameters<StorageProvider['count']>[0]): Promise<number> {
            return provider.count(filter);
        },

        async save<T extends BaseEntity>(entity: T, namespace?: string): Promise<T> {
            const existing = await provider.get(entity.type, entity.id, namespace);
            const saved = await provider.save(entity, namespace);

            if (existing) {
                emit({
                    type: 'entity:updated',
                    timestamp: new Date(),
                    namespace,
                    entityType: entity.type,
                    entityId: entity.id,
                    entity: saved,
                    previousEntity: existing,
                });
            } else {
                emit({
                    type: 'entity:created',
                    timestamp: new Date(),
                    namespace,
                    entityType: entity.type,
                    entityId: entity.id,
                    entity: saved,
                });
            }

            return saved;
        },

        async delete(type: string, id: string, namespace?: string): Promise<boolean> {
            const deleted = await provider.delete(type, id, namespace);

            if (deleted) {
                emit({
                    type: 'entity:deleted',
                    timestamp: new Date(),
                    namespace,
                    entityType: type,
                    entityId: id,
                });
            }

            return deleted;
        },

        async saveBatch<T extends BaseEntity>(entities: T[], namespace?: string): Promise<T[]> {
            const saved = await provider.saveBatch(entities, namespace);

            emit({
                type: 'batch:saved',
                timestamp: new Date(),
                namespace,
                entities: saved,
            });

            return saved;
        },

        async deleteBatch(
            refs: Array<{ type: string; id: string }>,
            namespace?: string
        ): Promise<number> {
            const count = await provider.deleteBatch(refs, namespace);

            emit({
                type: 'batch:deleted',
                timestamp: new Date(),
                namespace,
                refs,
                deletedCount: count,
            });

            return count;
        },

        async listNamespaces(): Promise<string[]> {
            return provider.listNamespaces();
        },

        async namespaceExists(namespace: string): Promise<boolean> {
            return provider.namespaceExists(namespace);
        },

        async listTypes(namespace?: string): Promise<string[]> {
            return provider.listTypes(namespace);
        },
    };
};
