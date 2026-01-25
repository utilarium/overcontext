export * from './walker';
export * from './context-root';
export * from './hierarchical-provider';

import { z } from 'zod';
import { SchemaMap, createSchemaRegistry } from '../schema/registry';
import { BaseEntity } from '../schema/base';
import { discoverContextRoot, ContextRootOptions } from './context-root';
import { createHierarchicalProvider } from './hierarchical-provider';
import { createContext, OvercontextAPI } from '../api/context';

export interface DiscoverOptions<TSchemas extends SchemaMap> extends ContextRootOptions {
    /** Schemas to register */
    schemas: TSchemas;

    /** Custom plural names for types */
    pluralNames?: Partial<Record<keyof TSchemas, string>>;

    /** Whether context is readonly */
    readonly?: boolean;
}

/**
 * Discover context directories and create an API.
 */
export const discoverOvercontext = async <TSchemas extends SchemaMap>(
    options: DiscoverOptions<TSchemas>
): Promise<OvercontextAPI<TSchemas>> => {
    const { schemas, pluralNames = {}, readonly, ...rootOptions } = options;

    // Create registry
    const registry = createSchemaRegistry();
    for (const [type, schema] of Object.entries(schemas)) {
        registry.register({
            type,
            schema: schema as z.ZodType<BaseEntity>,
            pluralName: (pluralNames as Record<string, string>)[type],
        });
    }

    // Discover context directories
    const contextRoot = await discoverContextRoot({
        ...rootOptions,
        registry,
    });

    if (!contextRoot.primary) {
        throw new Error('No context directory found');
    }

    // Create hierarchical provider
    const provider = await createHierarchicalProvider({
        contextRoot,
        registry,
        readonly,
    });

    // Create context API
    return createContext({
        provider,
        registry,
        schemas,
        defaultNamespace: undefined,
    });
};
