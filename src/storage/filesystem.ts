import * as fs from 'node:fs/promises';
import { existsSync, statSync } from 'node:fs';
import * as path from 'node:path';
import * as yaml from 'js-yaml';
import {
    StorageProvider,
    StorageProviderOptions,
    EntityFilter,
} from './interface';
import { BaseEntity } from '../schema/base';
import {
    StorageAccessError,
    ValidationError,
    SchemaNotRegisteredError,
    ReadonlyStorageError,
} from './errors';

export interface FileSystemProviderOptions extends StorageProviderOptions {
    /** Base path for context storage */
    basePath: string;

    /** Create directories if they don't exist */
    createIfMissing?: boolean;

    /** File extension to use (default: .yaml) */
    extension?: '.yaml' | '.yml';
}

export const createFileSystemProvider = async (
    options: FileSystemProviderOptions
): Promise<StorageProvider> => {
    const {
        basePath,
        registry,
        createIfMissing = true,
        extension = '.yaml',
        readonly = false,
        defaultNamespace,
    } = options;

    // --- Helper Functions ---

    const getEntityDir = (type: string, namespace?: string): string => {
        const dirName = registry.getDirectoryName(type);
        if (!dirName) {
            throw new SchemaNotRegisteredError(type);
        }

        if (namespace) {
            return path.join(basePath, namespace, dirName);
        }
        return path.join(basePath, dirName);
    };

    const getEntityPath = (type: string, id: string, namespace?: string): string => {
        return path.join(getEntityDir(type, namespace), `${id}${extension}`);
    };

    const ensureDir = async (dir: string): Promise<void> => {
        if (!existsSync(dir) && createIfMissing && !readonly) {
            await fs.mkdir(dir, { recursive: true });
        }
    };

    const readEntity = async <T extends BaseEntity>(
        filePath: string,
        type: string
    ): Promise<T | undefined> => {
        try {
            const content = await fs.readFile(filePath, 'utf-8');
            
            let parsed: unknown;
            try {
                parsed = yaml.load(content);
            } catch (yamlError) {
                // eslint-disable-next-line no-console
                console.warn(`Invalid YAML at ${filePath}:`, yamlError);
                return undefined;
            }

            if (!parsed || typeof parsed !== 'object') {
                return undefined;
            }

            // Validate against registered schema
            const result = registry.validateAs<T>(type, {
                ...(parsed as Record<string, unknown>),
                source: filePath,
            });

            if (!result.success) {
                // eslint-disable-next-line no-console
                console.warn(`Invalid entity at ${filePath}:`, result.errors);
                return undefined;
            }

            return result.data;
        } catch (error) {
            if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
                return undefined;
            }
            throw new StorageAccessError(`Failed to read ${filePath}`, error as Error);
        }
    };

    const writeEntity = async <T extends BaseEntity>(
        entity: T,
        namespace?: string
    ): Promise<T> => {
        if (readonly) {
            throw new ReadonlyStorageError();
        }

        // Validate against schema
        const validationResult = registry.validate(entity);
        if (!validationResult.success) {
            throw new ValidationError(
                'Entity validation failed',
                validationResult.errors || []
            );
        }

        const dir = getEntityDir(entity.type, namespace);
        await ensureDir(dir);

        const filePath = getEntityPath(entity.type, entity.id, namespace);

        // Remove framework-managed fields from saved YAML
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { type: _type, source: _source, ...entityToSave } = entity;

        // Update metadata
        const now = new Date();
        const toSave = {
            ...entityToSave,
            updatedAt: now,
            createdAt: entityToSave.createdAt || now,
        };

        const content = yaml.dump(toSave, {
            lineWidth: -1,
            sortKeys: false,
        });
        await fs.writeFile(filePath, content, 'utf-8');

        return {
            ...entity,
            ...toSave,
            type: entity.type,
            source: filePath,
        } as T;
    };

    const listDirectoryTypes = async (basePath: string): Promise<string[]> => {
        const types: string[] = [];

        try {
            const entries = await fs.readdir(basePath, { withFileTypes: true });

            for (const entry of entries) {
                if (entry.isDirectory()) {
                    const type = registry.getTypeFromDirectory(entry.name);
                    if (type) {
                        types.push(type);
                    }
                }
            }
        } catch {
            // Directory doesn't exist
        }

        return types;
    };

    // --- StorageProvider Implementation ---

    const provider: StorageProvider = {
        name: 'filesystem',
        location: basePath,
        registry,

        async initialize(): Promise<void> {
            if (createIfMissing && !readonly) {
                await ensureDir(basePath);
            }

            if (!existsSync(basePath)) {
                throw new StorageAccessError(`Context path does not exist: ${basePath}`);
            }
        },

        async dispose(): Promise<void> {
            // No cleanup needed for filesystem
        },

        async isAvailable(): Promise<boolean> {
            try {
                const stat = statSync(basePath);
                return stat.isDirectory();
            } catch {
                return false;
            }
        },

        async get<T extends BaseEntity>(
            type: string,
            id: string,
            namespace?: string
        ): Promise<T | undefined> {
            const ns = namespace ?? defaultNamespace;
            const filePath = getEntityPath(type, id, ns);
            return readEntity<T>(filePath, type);
        },

        async getAll<T extends BaseEntity>(
            type: string,
            namespace?: string
        ): Promise<T[]> {
            const ns = namespace ?? defaultNamespace;

            let dir: string;
            try {
                dir = getEntityDir(type, ns);
            } catch (error) {
                if (error instanceof SchemaNotRegisteredError) {
                    return [];
                }
                throw error;
            }

            if (!existsSync(dir)) {
                return [];
            }

            const files = await fs.readdir(dir);
            const entities: T[] = [];

            for (const file of files) {
                if (!file.endsWith('.yaml') && !file.endsWith('.yml')) {
                    continue;
                }

                const entity = await readEntity<T>(path.join(dir, file), type);
                if (entity) {
                    entities.push(entity);
                }
            }

            return entities;
        },

        async find<T extends BaseEntity>(filter: EntityFilter): Promise<T[]> {
            let results: T[] = [];

            const types = filter.type
                ? (Array.isArray(filter.type) ? filter.type : [filter.type])
                : registry.types();

            const namespace = filter.namespace ?? defaultNamespace;

            for (const type of types) {
                const entities = await this.getAll<T>(type, namespace);
                results = results.concat(entities);
            }

            // Apply ID filter
            if (filter.ids?.length) {
                results = results.filter(e => filter.ids!.includes(e.id));
            }

            // Apply search filter
            if (filter.search) {
                const searchLower = filter.search.toLowerCase();
                results = results.filter(e =>
                    e.name.toLowerCase().includes(searchLower)
                );
            }

            // Apply pagination
            if (filter.offset) {
                results = results.slice(filter.offset);
            }
            if (filter.limit) {
                results = results.slice(0, filter.limit);
            }

            return results;
        },

        async exists(type: string, id: string, namespace?: string): Promise<boolean> {
            const ns = namespace ?? defaultNamespace;
            try {
                const filePath = getEntityPath(type, id, ns);
                return existsSync(filePath);
            } catch {
                return false;
            }
        },

        async count(filter: EntityFilter): Promise<number> {
            const results = await this.find(filter);
            return results.length;
        },

        async save<T extends BaseEntity>(entity: T, namespace?: string): Promise<T> {
            const ns = namespace ?? defaultNamespace;
            return writeEntity(entity, ns);
        },

        async delete(type: string, id: string, namespace?: string): Promise<boolean> {
            if (readonly) {
                throw new ReadonlyStorageError();
            }

            const ns = namespace ?? defaultNamespace;

            try {
                const filePath = getEntityPath(type, id, ns);
                await fs.unlink(filePath);
                return true;
            } catch (error) {
                if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
                    return false;
                }
                throw error;
            }
        },

        async saveBatch<T extends BaseEntity>(
            entities: T[],
            namespace?: string
        ): Promise<T[]> {
            const saved: T[] = [];
            for (const entity of entities) {
                saved.push(await this.save(entity, namespace));
            }
            return saved;
        },

        async deleteBatch(
            refs: Array<{ type: string; id: string }>,
            namespace?: string
        ): Promise<number> {
            let count = 0;
            for (const ref of refs) {
                if (await this.delete(ref.type, ref.id, namespace)) {
                    count++;
                }
            }
            return count;
        },

        async listNamespaces(): Promise<string[]> {
            const namespaces: string[] = [];

            if (!existsSync(basePath)) {
                return namespaces;
            }

            const entries = await fs.readdir(basePath, { withFileTypes: true });

            for (const entry of entries) {
                if (!entry.isDirectory()) continue;

                // Check if it's a namespace (contains entity type directories)
                // vs being an entity type directory itself
                const subPath = path.join(basePath, entry.name);
                const subTypes = await listDirectoryTypes(subPath);

                if (subTypes.length > 0) {
                    namespaces.push(entry.name);
                }
            }

            return namespaces;
        },

        async namespaceExists(namespace: string): Promise<boolean> {
            const namespacePath = path.join(basePath, namespace);
            return existsSync(namespacePath);
        },

        async listTypes(namespace?: string): Promise<string[]> {
            const ns = namespace ?? defaultNamespace;
            const searchPath = ns ? path.join(basePath, ns) : basePath;
            return listDirectoryTypes(searchPath);
        },
    };

    return provider;
};
