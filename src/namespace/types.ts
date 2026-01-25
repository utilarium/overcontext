/**
 * Configuration for a namespace.
 */
export interface NamespaceConfig {
    /** Unique identifier for the namespace */
    id: string;

    /** Human-readable name */
    name: string;

    /** Description of what this namespace contains */
    description?: string;

    /** Parent namespace (for hierarchy) */
    parent?: string;

    /** Tools/projects that use this namespace */
    consumers?: string[];

    /** Whether this namespace is active */
    active?: boolean;
}

/**
 * Reference to a namespace with resolution metadata.
 */
export interface NamespaceReference {
    /** The namespace ID */
    namespace: string;

    /** Priority for merging (higher = preferred) */
    priority: number;

    /** Whether to include in searches */
    searchable: boolean;

    /** Whether writes go to this namespace */
    writable: boolean;
}

/**
 * Result of namespace resolution.
 */
export interface NamespaceResolution {
    /** Primary namespace for writes */
    primary: string;

    /** All namespaces to read from (in priority order) */
    readable: string[];

    /** Resolved namespace references */
    references: NamespaceReference[];
}
