import { describe, it, expect, beforeEach } from 'vitest';
import { BaseEntity } from '../../src/schema';
import {
    createObservableProvider,
    StorageProvider,
    AnyStorageEvent,
    EntityCreatedEvent,
    EntityUpdatedEvent,
    EntityDeletedEvent,
    BatchSavedEvent,
    BatchDeletedEvent,
} from '../../src/storage';
import { createSchemaRegistry } from '../../src/schema';

// Mock storage provider for testing
const createMockProvider = (): StorageProvider => {
    const data = new Map<string, BaseEntity>();

    return {
        name: 'mock',
        location: 'memory',
        registry: createSchemaRegistry(),

        async initialize() { },
        async dispose() { },
        async isAvailable() { return true; },

        async get<T extends BaseEntity>(type: string, id: string): Promise<T | undefined> {
            return data.get(`${type}:${id}`) as T | undefined;
        },

        async getAll<T extends BaseEntity>(): Promise<T[]> {
            return Array.from(data.values()) as T[];
        },

        async find<T extends BaseEntity>(): Promise<T[]> {
            return Array.from(data.values()) as T[];
        },

        async exists(type: string, id: string): Promise<boolean> {
            return data.has(`${type}:${id}`);
        },

        async count(): Promise<number> {
            return data.size;
        },

        async save<T extends BaseEntity>(entity: T): Promise<T> {
            data.set(`${entity.type}:${entity.id}`, entity);
            return entity;
        },

        async delete(type: string, id: string): Promise<boolean> {
            return data.delete(`${type}:${id}`);
        },

        async saveBatch<T extends BaseEntity>(entities: T[]): Promise<T[]> {
            entities.forEach(entity => {
                data.set(`${entity.type}:${entity.id}`, entity);
            });
            return entities;
        },

        async deleteBatch(refs: Array<{ type: string; id: string }>): Promise<number> {
            let count = 0;
            refs.forEach(ref => {
                if (data.delete(`${ref.type}:${ref.id}`)) {
                    count++;
                }
            });
            return count;
        },

        async listNamespaces(): Promise<string[]> {
            return [];
        },

        async namespaceExists(): Promise<boolean> {
            return false;
        },

        async listTypes(): Promise<string[]> {
            return [];
        },
    };
};

describe('createObservableProvider', () => {
    let provider: StorageProvider;
    let observable: ReturnType<typeof createObservableProvider>;
    let events: AnyStorageEvent[];

    beforeEach(() => {
        provider = createMockProvider();
        observable = createObservableProvider(provider);
        events = [];
    });

    describe('subscribe', () => {
        it('returns unsubscribe function', () => {
            const unsubscribe = observable.subscribe(() => { });

            expect(typeof unsubscribe).toBe('function');
        });

        it('calls handler on events', async () => {
            observable.subscribe(event => events.push(event));

            await observable.save({
                id: 'test',
                name: 'Test',
                type: 'custom',
            });

            expect(events.length).toBeGreaterThan(0);
        });

        it('unsubscribe stops receiving events', async () => {
            const unsubscribe = observable.subscribe(event => events.push(event));

            await observable.save({
                id: 'test1',
                name: 'Test 1',
                type: 'custom',
            });

            expect(events).toHaveLength(1);

            unsubscribe();

            await observable.save({
                id: 'test2',
                name: 'Test 2',
                type: 'custom',
            });

            expect(events).toHaveLength(1); // Still 1, not 2
        });
    });

    describe('initialize', () => {
        it('emits storage:initialized event', async () => {
            observable.subscribe(event => events.push(event));

            await observable.initialize();

            expect(events).toHaveLength(1);
            expect(events[0].type).toBe('storage:initialized');
        });
    });

    describe('dispose', () => {
        it('emits storage:disposed event', async () => {
            observable.subscribe(event => events.push(event));

            await observable.dispose();

            expect(events).toHaveLength(1);
            expect(events[0].type).toBe('storage:disposed');
        });
    });

    describe('save', () => {
        it('emits entity:created event for new entity', async () => {
            observable.subscribe(event => events.push(event));

            await observable.save({
                id: 'test',
                name: 'Test',
                type: 'custom',
            });

            expect(events).toHaveLength(1);
            expect(events[0].type).toBe('entity:created');

            const event = events[0] as EntityCreatedEvent;
            expect(event.entityType).toBe('custom');
            expect(event.entityId).toBe('test');
            expect(event.entity.name).toBe('Test');
        });

        it('emits entity:updated event for existing entity', async () => {
            // Pre-populate
            await provider.save({
                id: 'test',
                name: 'Original',
                type: 'custom',
            });

            observable.subscribe(event => events.push(event));

            await observable.save({
                id: 'test',
                name: 'Updated',
                type: 'custom',
            });

            expect(events).toHaveLength(1);
            expect(events[0].type).toBe('entity:updated');

            const event = events[0] as EntityUpdatedEvent;
            expect(event.entityType).toBe('custom');
            expect(event.entityId).toBe('test');
            expect(event.entity.name).toBe('Updated');
            expect(event.previousEntity?.name).toBe('Original');
        });

        it('includes namespace in event', async () => {
            observable.subscribe(event => events.push(event));

            await observable.save({
                id: 'test',
                name: 'Test',
                type: 'custom',
            }, 'work');

            expect(events[0].namespace).toBe('work');
        });
    });

    describe('delete', () => {
        it('emits entity:deleted event when entity exists', async () => {
            await provider.save({
                id: 'test',
                name: 'Test',
                type: 'custom',
            });

            observable.subscribe(event => events.push(event));

            const deleted = await observable.delete('custom', 'test');

            expect(deleted).toBe(true);
            expect(events).toHaveLength(1);
            expect(events[0].type).toBe('entity:deleted');

            const event = events[0] as EntityDeletedEvent;
            expect(event.entityType).toBe('custom');
            expect(event.entityId).toBe('test');
        });

        it('does not emit event when entity does not exist', async () => {
            observable.subscribe(event => events.push(event));

            const deleted = await observable.delete('custom', 'nonexistent');

            expect(deleted).toBe(false);
            expect(events).toHaveLength(0);
        });
    });

    describe('saveBatch', () => {
        it('emits batch:saved event', async () => {
            observable.subscribe(event => events.push(event));

            const entities = [
                { id: 'test1', name: 'Test 1', type: 'custom' },
                { id: 'test2', name: 'Test 2', type: 'custom' },
            ];

            await observable.saveBatch(entities);

            expect(events).toHaveLength(1);
            expect(events[0].type).toBe('batch:saved');

            const event = events[0] as BatchSavedEvent;
            expect(event.entities).toHaveLength(2);
        });
    });

    describe('deleteBatch', () => {
        it('emits batch:deleted event', async () => {
            await provider.saveBatch([
                { id: 'test1', name: 'Test 1', type: 'custom' },
                { id: 'test2', name: 'Test 2', type: 'custom' },
            ]);

            observable.subscribe(event => events.push(event));

            const refs = [
                { type: 'custom', id: 'test1' },
                { type: 'custom', id: 'test2' },
            ];

            const count = await observable.deleteBatch(refs);

            expect(count).toBe(2);
            expect(events).toHaveLength(1);
            expect(events[0].type).toBe('batch:deleted');

            const event = events[0] as BatchDeletedEvent;
            expect(event.refs).toEqual(refs);
            expect(event.deletedCount).toBe(2);
        });
    });

    describe('error handling', () => {
        it('catches and logs handler errors', async () => {
            const errorHandler = () => {
                throw new Error('Handler error');
            };

            observable.subscribe(errorHandler);
            observable.subscribe(event => events.push(event));

            // Should not throw
            await observable.save({
                id: 'test',
                name: 'Test',
                type: 'custom',
            });

            // Second handler should still receive event
            expect(events).toHaveLength(1);
        });
    });
});
