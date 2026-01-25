import { z, ZodError } from 'zod';
import { BaseEntity, BaseEntitySchema } from './base';

export interface ValidationResult<T> {
    success: boolean;
    data?: T;
    errors?: Array<{ path: string; message: string }>;
}

/**
 * Validate that an object satisfies at least the base entity contract.
 */
export const validateBaseEntity = (data: unknown): ValidationResult<BaseEntity> => {
    const result = BaseEntitySchema.safeParse(data);

    if (result.success) {
        return { success: true, data: result.data };
    }

    return {
        success: false,
        errors: result.error.errors.map(e => ({
            path: e.path.join('.'),
            message: e.message,
        })),
    };
};

/**
 * Validate data against a specific schema.
 */
export const validateEntity = <T extends BaseEntity>(
    schema: z.ZodType<T>,
    data: unknown
): ValidationResult<T> => {
    const result = schema.safeParse(data);

    if (result.success) {
        return { success: true, data: result.data };
    }

    return {
        success: false,
        errors: result.error.errors.map(e => ({
            path: e.path.join('.'),
            message: e.message,
        })),
    };
};

/**
 * Check if data extends the base entity (has id, name, type).
 */
export const isBaseEntity = (data: unknown): data is BaseEntity => {
    return validateBaseEntity(data).success;
};

/**
 * Format Zod errors into a readable message.
 */
export const formatValidationErrors = (errors: ZodError): string => {
    return errors.errors
        .map(e => `${e.path.join('.')}: ${e.message}`)
        .join('; ');
};
