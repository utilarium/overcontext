import { z } from 'zod';
import { BaseEntity } from './base';
import { validateEntity, ValidationResult } from './validation';

/**
 * A map of entity type names to their Zod schemas.
 */
export type SchemaMap = Record<string, z.ZodType<BaseEntity>>;

/**
 * Options for schema registration.
 */
export interface SchemaRegistrationOptions {
    /** The type name (should match the schema's type literal) */
    type: string;

    /** The Zod schema for this entity type */
    schema: z.ZodType<BaseEntity>;

    /** Plural name for directory (e.g., 'people' for 'person') */
    pluralName?: string;

    /** Additional validation beyond schema */
    customValidator?: (entity: BaseEntity) => ValidationResult<BaseEntity>;
}

/**
 * Registered schema with metadata.
 */
export interface RegisteredSchema {
    type: string;
    schema: z.ZodType<BaseEntity>;
    pluralName: string;
    customValidator?: (entity: BaseEntity) => ValidationResult<BaseEntity>;
}

/**
 * Schema registry for managing entity schemas.
 */
export interface SchemaRegistry {
    /**
     * Register a schema for an entity type.
     */
    register(options: SchemaRegistrationOptions): void;

    /**
     * Register multiple schemas at once.
     */
    registerAll(schemas: SchemaMap): void;

    /**
     * Get the schema for a type.
     */
    get(type: string): RegisteredSchema | undefined;

    /**
     * Check if a type is registered.
     */
    has(type: string): boolean;

    /**
     * Get all registered type names.
     */
    types(): string[];

    /**
     * Get the directory name for a type.
     */
    getDirectoryName(type: string): string | undefined;

    /**
     * Get the type from a directory name.
     */
    getTypeFromDirectory(directory: string): string | undefined;

    /**
     * Validate an entity against its registered schema.
     */
    validate<T extends BaseEntity>(entity: T): ValidationResult<T>;

    /**
     * Validate data as a specific type.
     */
    validateAs<T extends BaseEntity>(type: string, data: unknown): ValidationResult<T>;
}

/**
 * Default plural name derivation.
 */
const derivePluralName = (type: string): string => {
    // Simple pluralization rules
    if (type.endsWith('y')) {
        return type.slice(0, -1) + 'ies';
    }
    if (type.endsWith('s') || type.endsWith('x') || type.endsWith('ch') || type.endsWith('sh')) {
        return type + 'es';
    }
    return type + 's';
};

/**
 * Create a new schema registry.
 */
export const createSchemaRegistry = (): SchemaRegistry => {
    const schemas = new Map<string, RegisteredSchema>();
    const directoryToType = new Map<string, string>();

    const register = (options: SchemaRegistrationOptions): void => {
        const { type, schema, pluralName, customValidator } = options;

        const plural = pluralName || derivePluralName(type);

        const registered: RegisteredSchema = {
            type,
            schema,
            pluralName: plural,
            customValidator,
        };

        schemas.set(type, registered);
        directoryToType.set(plural, type);
    };

    const registerAll = (schemaMap: SchemaMap): void => {
        for (const [type, schema] of Object.entries(schemaMap)) {
            register({ type, schema });
        }
    };

    const get = (type: string): RegisteredSchema | undefined => {
        return schemas.get(type);
    };

    const has = (type: string): boolean => {
        return schemas.has(type);
    };

    const types = (): string[] => {
        return Array.from(schemas.keys());
    };

    const getDirectoryName = (type: string): string | undefined => {
        return schemas.get(type)?.pluralName;
    };

    const getTypeFromDirectory = (directory: string): string | undefined => {
        return directoryToType.get(directory);
    };

    const validate = <T extends BaseEntity>(entity: T): ValidationResult<T> => {
        const registered = schemas.get(entity.type);

        if (!registered) {
            return {
                success: false,
                errors: [{ path: 'type', message: `Unknown entity type: ${entity.type}` }],
            };
        }

        // Schema validation
        const schemaResult = validateEntity(registered.schema, entity);
        if (!schemaResult.success) {
            return schemaResult as ValidationResult<T>;
        }

        // Custom validation
        if (registered.customValidator) {
            return registered.customValidator(entity) as ValidationResult<T>;
        }

        return { success: true, data: entity };
    };

    const validateAs = <T extends BaseEntity>(
        type: string,
        data: unknown
    ): ValidationResult<T> => {
        const registered = schemas.get(type);

        if (!registered) {
            return {
                success: false,
                errors: [{ path: 'type', message: `Unknown entity type: ${type}` }],
            };
        }

        // Add type to data if missing (for convenience when loading from files)
        const withType = typeof data === 'object' && data !== null
            ? { ...data, type }
            : data;

        return validateEntity(registered.schema, withType) as ValidationResult<T>;
    };

    return {
        register,
        registerAll,
        get,
        has,
        types,
        getDirectoryName,
        getTypeFromDirectory,
        validate,
        validateAs,
    };
};
