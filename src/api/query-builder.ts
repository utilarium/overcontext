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
     * Must be a positive integer (minimum 1).
     */
    limit(n: number): this {
        this.options.limit = Math.max(1, Math.floor(n));
        return this;
    }

    /**
     * Set result offset.
     * Must be a non-negative integer (minimum 0).
     */
    offset(n: number): this {
        this.options.offset = Math.max(0, Math.floor(n));
        return this;
    }

    /**
     * Set page (calculates offset from limit).
     * Page numbers are 1-indexed (first page is 1).
     */
    page(pageNum: number, pageSize: number): this {
        // Ensure valid page number (minimum 1)
        const safePage = Math.max(1, Math.floor(pageNum));
        // Ensure valid page size (minimum 1)
        const safeSize = Math.max(1, Math.floor(pageSize));
        
        this.options.limit = safeSize;
        this.options.offset = (safePage - 1) * safeSize;
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
