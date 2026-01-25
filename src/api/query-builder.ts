import { QueryOptions, SortDirection } from './query';

/**
 * Fluent query builder for constructing search queries.
 */
export class QueryBuilder {
    private options: QueryOptions = {};

    /**
     * Filter by entity type(s).
     */
    type(type: string | string[]): this {
        this.options.type = type;
        return this;
    }

    /**
     * Filter by namespace(s).
     */
    namespace(ns: string | string[]): this {
        this.options.namespace = ns;
        return this;
    }

    /**
     * Filter by specific IDs.
     */
    ids(ids: string[]): this {
        this.options.ids = ids;
        return this;
    }

    /**
     * Add text search.
     */
    search(query: string, fields?: string[]): this {
        this.options.search = query;
        if (fields) this.options.searchFields = fields;
        return this;
    }

    /**
     * Enable case-sensitive search.
     */
    caseSensitive(enabled: boolean = true): this {
        this.options.caseSensitive = enabled;
        return this;
    }

    /**
     * Add sort field.
     */
    sortBy(field: string, direction: SortDirection = 'asc'): this {
        this.options.sort = [...(this.options.sort || []), { field, direction }];
        return this;
    }

    /**
     * Set result limit.
     */
    limit(n: number): this {
        this.options.limit = n;
        return this;
    }

    /**
     * Set result offset.
     */
    offset(n: number): this {
        this.options.offset = n;
        return this;
    }

    /**
     * Set page (calculates offset from limit).
     */
    page(pageNum: number, pageSize: number): this {
        this.options.limit = pageSize;
        this.options.offset = (pageNum - 1) * pageSize;
        return this;
    }

    /**
     * Build the query options.
     */
    build(): QueryOptions {
        return { ...this.options };
    }
}

/**
 * Start building a query.
 */
export const query = () => new QueryBuilder();
