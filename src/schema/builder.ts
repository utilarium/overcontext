import { z } from 'zod';
import { BaseEntity } from './base';

/**
 * Type-safe builder for schema maps.
 * Ensures type inference works correctly.
 */
export type SchemaMapBuilder<T extends Record<string, z.ZodType<BaseEntity>>> = {
    schemas: T;
    types: { [K in keyof T]: z.infer<T[K]> };
};

/**
 * Create a schema map with proper type inference.
 * 
 * @example
 * const { schemas, types } = defineSchemas({
 *   person: PersonSchema,
 *   project: ProjectSchema,
 * });
 * 
 * type Person = typeof types.person;  // Inferred from PersonSchema
 */
export const defineSchemas = <T extends Record<string, z.ZodType<BaseEntity>>>(
    schemas: T
): SchemaMapBuilder<T> => {
    return {
        schemas,
        types: {} as { [K in keyof T]: z.infer<T[K]> },
    };
};

/**
 * Helper to check if a schema extends BaseEntity properly.
 */
export const isValidEntitySchema = (schema: z.ZodType<unknown>): boolean => {
    try {
        // BaseEntitySchema allows extra fields, so we just need id, name, type
        const result = schema.safeParse({
            id: 'test',
            name: 'Test',
            type: 'test',
        });
        // If it fails, it might be because type is a literal
        // Try without type and check if it has the base structure
        if (!result.success) {
            return false;
        }
        return true;
    } catch {
        return false;
    }
};
