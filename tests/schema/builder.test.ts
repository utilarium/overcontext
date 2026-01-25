import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import {
    defineSchemas,
    isValidEntitySchema,
    BaseEntitySchema,
    createEntitySchema,
} from '../../src/schema';

const PersonSchema = createEntitySchema('person', {
    email: z.string().email(),
    role: z.enum(['developer', 'designer', 'manager']),
});

const ProjectSchema = createEntitySchema('project', {
    status: z.enum(['active', 'completed', 'archived']),
    owner: z.string(),
});

describe('defineSchemas', () => {
    it('returns schemas object', () => {
        const { schemas } = defineSchemas({
            person: PersonSchema,
            project: ProjectSchema,
        });

        expect(schemas.person).toBe(PersonSchema);
        expect(schemas.project).toBe(ProjectSchema);
    });

    it('provides type inference structure', () => {
        const { types } = defineSchemas({
            person: PersonSchema,
            project: ProjectSchema,
        });

        // Runtime check that types object exists
        expect(types).toBeDefined();

        // Compile-time type checking happens in TypeScript
        type Person = typeof types.person;
        type Project = typeof types.project;

        // These are compile-time checks, but we can verify the structure exists
        const _person: Person = {
            id: 'test',
            name: 'Test',
            type: 'person',
            email: 'test@example.com',
            role: 'developer',
        };

        const _project: Project = {
            id: 'test',
            name: 'Test',
            type: 'project',
            status: 'active',
            owner: 'john',
        };

        expect(_person).toBeDefined();
        expect(_project).toBeDefined();
    });

    it('works with empty schema map', () => {
        const { schemas, types } = defineSchemas({});

        expect(Object.keys(schemas)).toHaveLength(0);
        expect(types).toBeDefined();
    });

    it('preserves schema keys', () => {
        const { schemas } = defineSchemas({
            person: PersonSchema,
            project: ProjectSchema,
        });

        expect(Object.keys(schemas)).toEqual(['person', 'project']);
    });
});

describe('isValidEntitySchema', () => {
    it('returns true for valid entity schema', () => {
        expect(isValidEntitySchema(BaseEntitySchema)).toBe(true);
    });

    it('returns false for extended entity schema with literal type', () => {
        // PersonSchema has type: z.literal('person'), so 'test' won't match
        expect(isValidEntitySchema(PersonSchema)).toBe(false);
    });

    it('returns true for schema missing required fields but accepting test data', () => {
        const InvalidSchema = z.object({
            id: z.string(),
            // Missing name and type, but passthrough allows them
        }).passthrough();

        expect(isValidEntitySchema(InvalidSchema)).toBe(true);
    });

    it('returns false for non-object schema', () => {
        const StringSchema = z.string();

        expect(isValidEntitySchema(StringSchema)).toBe(false);
    });

    it('returns false for schema with wrong field types', () => {
        const InvalidSchema = z.object({
            id: z.number(),  // Should be string
            name: z.string(),
            type: z.string(),
        });

        expect(isValidEntitySchema(InvalidSchema)).toBe(false);
    });

    it('handles schema validation errors gracefully', () => {
        const ThrowingSchema = {
            safeParse: () => {
                throw new Error('Test error');
            },
        } as any;

        expect(isValidEntitySchema(ThrowingSchema)).toBe(false);
    });

    it('returns false for schema with additional required fields', () => {
        const ExtendedSchema = BaseEntitySchema.extend({
            customField: z.string(), // Required field, so test data will fail
        });

        expect(isValidEntitySchema(ExtendedSchema)).toBe(false);
    });

    it('returns true for schema with optional fields', () => {
        const OptionalSchema = BaseEntitySchema.extend({
            optional: z.string().optional(),
        });

        expect(isValidEntitySchema(OptionalSchema)).toBe(true);
    });
});
