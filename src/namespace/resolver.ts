import { StorageProvider } from '../storage/interface';
import { NamespaceConfig, NamespaceReference, NamespaceResolution } from './types';

export interface NamespaceResolverOptions {
    /** Storage provider to query for namespaces */
    provider: StorageProvider;

    /** Default namespace when none specified */
    defaultNamespace?: string;

    /** Pre-configured namespaces */
    namespaces?: NamespaceConfig[];
}

export interface NamespaceResolver {
    /**
     * Resolve which namespaces to use for an operation.
     */
    resolve(requested?: string | string[]): Promise<NamespaceResolution>;

    /**
     * Get all available namespaces.
     */
    listAll(): Promise<NamespaceConfig[]>;

    /**
     * Register a new namespace configuration.
     */
    register(config: NamespaceConfig): void;

    /**
     * Get the primary (writable) namespace.
     */
    getPrimary(): string;

    /**
     * Check if a namespace exists.
     */
    exists(namespace: string): Promise<boolean>;
}

export const createNamespaceResolver = (
    options: NamespaceResolverOptions
): NamespaceResolver => {
    const { provider, defaultNamespace = '_default' } = options;
    const configuredNamespaces = new Map<string, NamespaceConfig>();

    // Load initial configurations
    if (options.namespaces) {
        for (const ns of options.namespaces) {
            configuredNamespaces.set(ns.id, ns);
        }
    }

    return {
        async resolve(requested?: string | string[]): Promise<NamespaceResolution> {
            let namespaceIds: string[];

            if (!requested) {
                namespaceIds = [defaultNamespace];
            } else if (typeof requested === 'string') {
                namespaceIds = [requested];
            } else {
                namespaceIds = requested;
            }

            const references: NamespaceReference[] = [];
            const readable: string[] = [];
            let primary: string | undefined;

            for (let i = 0; i < namespaceIds.length; i++) {
                const nsId = namespaceIds[i];
                const config = configuredNamespaces.get(nsId);

                // Include all requested namespaces, even if they don't exist yet
                const ref: NamespaceReference = {
                    namespace: nsId,
                    priority: namespaceIds.length - i,  // Earlier = higher priority
                    searchable: config?.active !== false,
                    writable: i === 0,  // Only first is writable
                };

                references.push(ref);
                readable.push(nsId);

                if (!primary) {
                    primary = nsId;
                }
            }

            if (!primary) {
                primary = defaultNamespace;
                readable.push(defaultNamespace);
            }

            return { primary, readable, references };
        },

        async listAll(): Promise<NamespaceConfig[]> {
            const discovered = await provider.listNamespaces();
            const all = new Map<string, NamespaceConfig>();

            // Add configured namespaces
            for (const [id, config] of configuredNamespaces) {
                all.set(id, config);
            }

            // Add discovered namespaces
            for (const nsId of discovered) {
                if (!all.has(nsId)) {
                    all.set(nsId, { id: nsId, name: nsId, active: true });
                }
            }

            return Array.from(all.values());
        },

        register(config: NamespaceConfig): void {
            configuredNamespaces.set(config.id, config);
        },

        getPrimary(): string {
            return defaultNamespace;
        },

        async exists(namespace: string): Promise<boolean> {
            return configuredNamespaces.has(namespace) ||
                   await provider.namespaceExists(namespace);
        },
    };
};
