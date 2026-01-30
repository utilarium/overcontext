import { describe, it, expect } from 'vitest';
import { z, ZodError } from 'zod';
import {
    validateEntity,
    formatValidationErrors,
    createEntitySchema,
} from '../../src/schema';

describe('validateEntity', () => {
    const TestSchema = createEntitySchema('test', {
        email: z.string().email(),
        age: z.number().int().positive(),
    });

    it('validates against custom schema', () => {
        const result = validateEntity(TestSchema, {
            id: 'test',
            name: 'Test',
            type: 'test',
            email: 'test@example.com',
            age: 25,
        });

        expect(result.success).toBe(true);
        expect(result.data).toBeDefined();
        expect(result.errors).toBeUndefined();
    });

    it('returns errors for schema violations', () => {
        const result = validateEntity(TestSchema, {
            id: 'test',
            name: 'Test',
            type: 'test',
            email: 'not-an-email',
            age: -5,
        });

        expect(result.success).toBe(false);
        expect(result.data).toBeUndefined();
        expect(result.errors).toBeDefined();
        expect(result.errors!.length).toBeGreaterThan(0);
    });

    it('validates type literal enforcement', () => {
        const result = validateEntity(TestSchema, {
            id: 'test',
            name: 'Test',
            type: 'wrong',  // Should be 'test'
            email: 'test@example.com',
            age: 25,
        });

        expect(result.success).toBe(false);
    });

    it('requires all mandatory fields', () => {
        const result = validateEntity(TestSchema, {
            id: 'test',
            name: 'Test',
            type: 'test',
            // Missing email and age
        });

        expect(result.success).toBe(false);
        expect(result.errors).toBeDefined();

        const errorPaths = result.errors!.map(e => e.path);
        expect(errorPaths).toContain('email');
        expect(errorPaths).toContain('age');
    });
});

describe('formatValidationErrors', () => {
    it('formats single error', () => {
        const schema = z.object({ name: z.string() });
        const result = schema.safeParse({});

        if (!result.success) {
            const formatted = formatValidationErrors(result.error);
            expect(formatted).toContain('name');
            expect(formatted).toContain('expected string');
        }
    });

    it('formats multiple errors', () => {
        const schema = z.object({
            name: z.string(),
            age: z.number(),
        });
        const result = schema.safeParse({});

        if (!result.success) {
            const formatted = formatValidationErrors(result.error);
            expect(formatted).toContain('name');
            expect(formatted).toContain('age');
            expect(formatted).toContain(';');
        }
    });

    it('formats nested path errors', () => {
        const schema = z.object({
            user: z.object({
                profile: z.object({
                    email: z.string().email(),
                }),
            }),
        });
        const result = schema.safeParse({
            user: {
                profile: {
                    email: 'not-an-email',
                },
            },
        });

        if (!result.success) {
            const formatted = formatValidationErrors(result.error);
            expect(formatted).toContain('user.profile.email');
        }
    });

    it('includes error messages', () => {
        const schema = z.object({
            email: z.string().email(),
        });
        const result = schema.safeParse({ email: 'invalid' });

        if (!result.success) {
            const formatted = formatValidationErrors(result.error);
            expect(formatted).toContain('email');
            expect(formatted.length).toBeGreaterThan(0);
        }
    });
});
