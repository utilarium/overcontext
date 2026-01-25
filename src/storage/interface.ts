import { BaseEntity } from '../schema/base';
import { SchemaRegistry } from '../schema/registry';

/**
 * Filter options for querying entities.
 */
export interface EntityFilter {
    /** Filter by entity type(s) */
    type?: string | string[];

    /** Filter by namespace */
    namespace?: string;

    /** Filter by specific IDs */
    ids?: string[];

    /** Text search across name and searchable fields */
    search?: string;

    /** Maximum results to return */
    limit?: number;

    /** Offset for pagination */
    offset?: number;
}

/**
 * Options for creating a storage provider.
 */
export interface StorageProviderOptions {
    /** Schema registry for validation */
    registry: SchemaRegistry;

    /** Default namespace for operations */
    defaultNamespace?: string;

    /** Whether to prevent writes */
    readonly?: boolean;
}

/**
 * Generic storage provider interface.
 * Implementations work with any entity type via the schema registry.
 */
export interface StorageProvider {
    /**
     * Initialize the storage provider.
     */
    initialize(): Promise<void>;

    /**
     * Clean up resources.
     */
    dispose(): Promise<void>;

    /**
     * Check if storage is accessible.
     */
    isAvailable(): Promise<boolean>;

    // --- Read Operations ---

    /**
     * Get a single entity by type and ID.
     * Returns undefined if not found.
     */
    get<T extends BaseEntity>(
        type: string,
        id: string,
        namespace?: string
    ): Promise<T | undefined>;

    /**
     * Get all entities of a type.
     */
    getAll<T extends BaseEntity>(
        type: string,
        namespace?: string
    ): Promise<T[]>;

    /**
     * Find entities matching a filter.
     */
    find<T extends BaseEntity>(filter: EntityFilter): Promise<T[]>;

    /**
     * Check if an entity exists.
     */
    exists(type: string, id: string, namespace?: string): Promise<boolean>;

    /**
     * Count entities matching a filter.
     */
    count(filter: EntityFilter): Promise<number>;

    // --- Write Operations ---

    /**
     * Save an entity (create or update).
     * Entity is validated against its registered schema.
     * Returns the saved entity with updated metadata.
     */
    save<T extends BaseEntity>(entity: T, namespace?: string): Promise<T>;

    /**
     * Delete an entity.
     * Returns true if entity existed and was deleted.
     */
    delete(type: string, id: string, namespace?: string): Promise<boolean>;

    /**
     * Save multiple entities in batch.
     */
    saveBatch<T extends BaseEntity>(entities: T[], namespace?: string): Promise<T[]>;

    /**
     * Delete multiple entities in batch.
     */
    deleteBatch(
        refs: Array<{ type: string; id: string }>,
        namespace?: string
    ): Promise<number>;

    // --- Namespace Operations ---

    /**
     * List available namespaces.
     */
    listNamespaces(): Promise<string[]>;

    /**
     * Check if a namespace exists.
     */
    namespaceExists(namespace: string): Promise<boolean>;

    /**
     * List entity types that have data in a namespace.
     */
    listTypes(namespace?: string): Promise<string[]>;

    // --- Metadata ---

    /** Provider name (e.g., 'filesystem', 'memory') */
    readonly name: string;

    /** Storage location info */
    readonly location: string;

    /** Schema registry reference */
    readonly registry: SchemaRegistry;
}
