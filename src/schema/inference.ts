import { z } from 'zod';
import { BaseEntitySchema, BaseEntity } from './base';

/**
 * A valid entity schema must extend BaseEntitySchema.
 * The type field should be a literal (e.g., z.literal('person')).
 */
export type EntitySchema<T extends BaseEntity = BaseEntity> = z.ZodType<T> & {
    _input: T;
    _output: T;
};

/**
 * Helper to create a properly typed entity schema.
 * Ensures the schema extends BaseEntitySchema.
 */
export const createEntitySchema = <
    TType extends string,
    TExtension extends z.ZodRawShape
>(
        typeName: TType,
        extension: TExtension
    ) => {
    return BaseEntitySchema.extend({
        type: z.literal(typeName),
        ...extension,
    });
};

/**
 * Extract the type literal from an entity schema.
 */
export type EntityTypeFromSchema<T extends z.ZodType<BaseEntity>> =
    T extends z.ZodType<infer U> ? (U extends { type: infer TType } ? TType : never) : never;

/**
 * Extract the full entity type from a schema.
 */
export type InferEntity<T extends z.ZodType<BaseEntity>> = z.infer<T>;
