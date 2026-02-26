import type { SchemaRegistry } from '../../schema/registry';
import type { EntityFilter } from '../interface';
import type { Storage } from '@google-cloud/storage';

/**
 * Minimal interface that any Fjellgrunn backend must satisfy
 * to back a FjellStorageProvider.
 *
 * Designed to abstract over @fjell/lib-fs and @fjell/lib-gcs
 * without leaking backend-specific details into the provider.
 */
export interface FjellBackendAdapter {
    initialize(): Promise<void>;
    dispose(): Promise<void>;
    isAvailable(): Promise<boolean>;

    get(type: string, id: string, namespace?: string): Promise<Record<string, unknown> | undefined>;
    getAll(type: string, namespace?: string): Promise<Record<string, unknown>[]>;
    create(type: string, item: Record<string, unknown>, namespace?: string): Promise<Record<string, unknown>>;
    update(type: string, id: string, item: Record<string, unknown>, namespace?: string): Promise<Record<string, unknown>>;
    remove(type: string, id: string, namespace?: string): Promise<boolean>;
    find(type: string, filter: EntityFilter, namespace?: string): Promise<Record<string, unknown>[]>;
    exists(type: string, id: string, namespace?: string): Promise<boolean>;
    count(type: string, filter?: EntityFilter, namespace?: string): Promise<number>;

    listNamespaces(): Promise<string[]>;
    namespaceExists(namespace: string): Promise<boolean>;
    listTypes(namespace?: string): Promise<string[]>;
}

/**
 * Configuration for the filesystem-backed Fjellgrunn provider.
 */
export interface FjellFsProviderConfig {
    basePath: string;
    registry: SchemaRegistry;
    name?: string;
}

/**
 * Configuration for the GCS-backed Fjellgrunn provider.
 */
export interface FjellGcsProviderConfig {
    bucketName: string;
    basePath?: string;
    registry: SchemaRegistry;
    name?: string;
    storage?: Storage;
    querySafety?: {
        maxScanFiles?: number;
        warnThreshold?: number;
        disableQueryOperations?: boolean;
        downloadConcurrency?: number;
    };
}
