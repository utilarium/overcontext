import { BaseEntity } from '../schema/base';

export type StorageEventType =
    | 'entity:created'
    | 'entity:updated'
    | 'entity:deleted'
    | 'batch:saved'
    | 'batch:deleted'
    | 'storage:initialized'
    | 'storage:disposed';

export interface StorageEvent {
    type: StorageEventType;
    timestamp: Date;
    namespace?: string;
}

export interface EntityCreatedEvent extends StorageEvent {
    type: 'entity:created';
    entityType: string;
    entityId: string;
    entity: BaseEntity;
}

export interface EntityUpdatedEvent extends StorageEvent {
    type: 'entity:updated';
    entityType: string;
    entityId: string;
    entity: BaseEntity;
    previousEntity?: BaseEntity;
}

export interface EntityDeletedEvent extends StorageEvent {
    type: 'entity:deleted';
    entityType: string;
    entityId: string;
}

export interface BatchSavedEvent extends StorageEvent {
    type: 'batch:saved';
    entities: BaseEntity[];
}

export interface BatchDeletedEvent extends StorageEvent {
    type: 'batch:deleted';
    refs: Array<{ type: string; id: string }>;
    deletedCount: number;
}

export type AnyStorageEvent =
    | EntityCreatedEvent
    | EntityUpdatedEvent
    | EntityDeletedEvent
    | BatchSavedEvent
    | BatchDeletedEvent
    | StorageEvent;

export type StorageEventHandler = (event: AnyStorageEvent) => void;

/**
 * Observable storage provider with event subscription.
 */
export interface ObservableStorageProvider extends StorageProvider {
    /**
     * Subscribe to storage events.
     * Returns unsubscribe function.
     */
    subscribe(handler: StorageEventHandler): () => void;
}

// Import after defining types to avoid circular dependency
import { StorageProvider } from './interface';
