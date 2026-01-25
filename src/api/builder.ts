import { z } from 'zod';
import { BaseEntity } from '../schema/base';
import { SchemaMap, createSchemaRegistry } from '../schema/registry';
import { StorageProvider } from '../storage/interface';
import { OvercontextAPI, createContext } from './context';

/**
 * Helper to create a type-safe API from schemas.
 * 
 * @example
 * const api = await createTypedAPI({
 *   schemas: {
 *     person: PersonSchema,
 *     term: TermSchema,
 *   },
 *   provider,
 * });
 * 
 * // Types flow through
 * const person = await api.get('person', 'john');  // Returns Person
 */
export interface TypedAPIOptions<TSchemas extends SchemaMap> {
    schemas: TSchemas;
    provider: StorageProvider;
    defaultNamespace?: string;

    /** Custom plural names for directory mapping */
    pluralNames?: Partial<Record<keyof TSchemas, string>>;
}

export const createTypedAPI = <TSchemas extends SchemaMap>(
    options: TypedAPIOptions<TSchemas>
): OvercontextAPI<TSchemas> => {
    const { schemas, provider, defaultNamespace, pluralNames = {} } = options;

    // Create registry from schemas
    const registry = createSchemaRegistry();

    for (const [type, schema] of Object.entries(schemas)) {
        registry.register({
            type,
            schema: schema as z.ZodType<BaseEntity>,
            pluralName: (pluralNames as Record<string, string>)[type],
        });
    }

    return createContext({
        provider,
        registry,
        schemas,
        defaultNamespace,
    });
};
