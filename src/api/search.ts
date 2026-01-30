import { BaseEntity } from '../schema/base';
import { SchemaRegistry } from '../schema/registry';
import { StorageProvider } from '../storage/interface';
import { StorageAccessError } from '../storage/errors';
import { QueryOptions, QueryResult, SortOption } from './query';

/**
 * Maximum number of entities that can be loaded into memory during search.
 * Prevents memory exhaustion with large datasets.
 */
const MAX_SEARCH_ENTITIES = 10000;

export interface SearchEngine {
    /**
     * Search entities with filtering, pagination, and sorting.
     */
    search<T extends BaseEntity>(options: QueryOptions): Promise<QueryResult<T>>;

    /**
     * Quick search by name across all types.
     */
    quickSearch<T extends BaseEntity>(
        query: string,
        options?: Pick<QueryOptions, 'type' | 'namespace' | 'limit'>
    ): Promise<T[]>;
}

export interface SearchEngineOptions {
    provider: StorageProvider;
    registry: SchemaRegistry;
    defaultNamespace?: string;
}

export const createSearchEngine = (options: SearchEngineOptions): SearchEngine => {
    const { provider, registry, defaultNamespace } = options;

    const textMatch = (
        text: string | undefined,
        query: string,
        caseSensitive: boolean
    ): boolean => {
        if (!text) return false;
        const a = caseSensitive ? text : text.toLowerCase();
        const b = caseSensitive ? query : query.toLowerCase();
        return a.includes(b);
    };

    const matchesSearch = (
        entity: BaseEntity,
        search: string,
        searchFields: string[],
        caseSensitive: boolean
    ): boolean => {
        // Always search name
        if (textMatch(entity.name, search, caseSensitive)) {
            return true;
        }

        // Search additional fields
        for (const field of searchFields) {
            const value = (entity as Record<string, unknown>)[field];
            if (typeof value === 'string' && textMatch(value, search, caseSensitive)) {
                return true;
            }
            // Handle arrays of strings (like sounds_like)
            if (Array.isArray(value)) {
                for (const item of value) {
                    if (typeof item === 'string' && textMatch(item, search, caseSensitive)) {
                        return true;
                    }
                }
            }
        }

        return false;
    };

    const sortEntities = <T extends BaseEntity>(
        entities: T[],
        sort: SortOption[]
    ): T[] => {
        return [...entities].sort((a, b) => {
            for (const { field, direction } of sort) {
                const aVal = (a as Record<string, unknown>)[field];
                const bVal = (b as Record<string, unknown>)[field];

                if (aVal === bVal) continue;
                if (aVal === undefined || aVal === null) return direction === 'asc' ? 1 : -1;
                if (bVal === undefined || bVal === null) return direction === 'asc' ? -1 : 1;

                let cmp: number;
                if (typeof aVal === 'string' && typeof bVal === 'string') {
                    cmp = aVal.localeCompare(bVal);
                } else if (aVal instanceof Date && bVal instanceof Date) {
                    cmp = aVal.getTime() - bVal.getTime();
                } else {
                    cmp = aVal < bVal ? -1 : 1;
                }

                return direction === 'asc' ? cmp : -cmp;
            }
            return 0;
        });
    };

    return {
        async search<T extends BaseEntity>(options: QueryOptions): Promise<QueryResult<T>> {
            const {
                type,
                namespace,
                ids,
                search,
                searchFields = [],
                caseSensitive = false,
                limit,
                offset = 0,
                sort = [{ field: 'name', direction: 'asc' }],
            } = options;

            // Determine which types to search
            const types = type
                ? (Array.isArray(type) ? type : [type])
                : registry.types();

            // Determine which namespaces to search
            const namespaces = namespace
                ? (Array.isArray(namespace) ? namespace : [namespace])
                : [defaultNamespace];

            // Collect entities
            let allEntities: T[] = [];

            for (const t of types) {
                for (const ns of namespaces) {
                    const entities = await provider.getAll<T>(t, ns);
                    allEntities = allEntities.concat(entities);
                }
            }

            // Check for memory exhaustion risk
            if (allEntities.length > MAX_SEARCH_ENTITIES) {
                throw new StorageAccessError(
                    `Search returned too many results (${allEntities.length}). ` +
                    `Please narrow your query by specifying types, namespaces, or search terms. ` +
                    `Maximum allowed: ${MAX_SEARCH_ENTITIES} entities.`
                );
            }

            // Apply ID filter
            if (ids?.length) {
                allEntities = allEntities.filter(e => ids.includes(e.id));
            }

            // Apply search filter
            if (search) {
                allEntities = allEntities.filter(e =>
                    matchesSearch(e, search, searchFields, caseSensitive)
                );
            }

            // Apply sorting
            allEntities = sortEntities(allEntities, sort);

            // Get total before pagination
            const total = allEntities.length;

            // Apply pagination
            const paginated = allEntities.slice(offset, limit ? offset + limit : undefined);

            return {
                items: paginated,
                total,
                hasMore: limit ? offset + limit < total : false,
                query: options,
            };
        },

        async quickSearch<T extends BaseEntity>(
            query: string,
            options: Pick<QueryOptions, 'type' | 'namespace' | 'limit'> = {}
        ): Promise<T[]> {
            const result = await this.search<T>({
                ...options,
                search: query,
            });
            return result.items;
        },
    };
};
