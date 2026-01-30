import { z } from 'zod';

/**
 * Metadata that overcontext manages automatically.
 * Consumers don't need to define these.
 */
export const EntityMetadataSchema = z.object({
    createdAt: z.date().optional(),
    updatedAt: z.date().optional(),
    createdBy: z.string().optional(),     // Tool that created this entity
    namespace: z.string().optional(),      // Which namespace this came from
    source: z.string().optional(),         // File path or storage key
});

export type EntityMetadata = z.infer<typeof EntityMetadataSchema>;

/**
 * The minimal contract every entity must satisfy.
 * Consuming libraries extend this with their own fields.
 */
export const BaseEntitySchema = z.object({
    /** Unique identifier within the entity type (used as filename) */
    id: z.string()
        .min(1)
        .max(255)
        .regex(/^[a-zA-Z0-9][-a-zA-Z0-9_.]*$/, {
            message: 'ID must be filesystem-safe: start with alphanumeric and contain only alphanumeric, hyphens, underscores, and dots',
        }),

    /** Human-readable name (used for display and search) */
    name: z.string().min(1),

    /** Entity type discriminator (must be a string literal in extensions) */
    type: z.string().min(1),

    /** Optional notes - common enough to include in base */
    notes: z.string().optional(),
}).merge(EntityMetadataSchema);

export type BaseEntity = z.infer<typeof BaseEntitySchema>;
