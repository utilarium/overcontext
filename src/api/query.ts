import { BaseEntity } from '../schema/base';

export type SortDirection = 'asc' | 'desc';

export interface SortOption {
    field: string;
    direction: SortDirection;
}

export interface QueryOptions {
    /** Filter by entity type(s) */
    type?: string | string[];

    /** Filter by namespace(s) */
    namespace?: string | string[];

    /** Filter by specific IDs */
    ids?: string[];

    /** Text search across name and searchable fields */
    search?: string;

    /** Additional fields to include in search */
    searchFields?: string[];

    /** Case sensitive search (default: false) */
    caseSensitive?: boolean;

    /** Pagination limit */
    limit?: number;

    /** Pagination offset */
    offset?: number;

    /** Sort options */
    sort?: SortOption[];
}

export interface QueryResult<T extends BaseEntity> {
    items: T[];
    total: number;
    hasMore: boolean;
    query: QueryOptions;
}
