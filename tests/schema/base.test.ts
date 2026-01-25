import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import {
    BaseEntitySchema,
    EntityMetadataSchema,
    validateBaseEntity,
    createEntitySchema,
    isBaseEntity,
} from '../../src/schema';

describe('EntityMetadataSchema', () => {
    it('accepts empty metadata', () => {
        const result = EntityMetadataSchema.safeParse({});
        expect(result.success).toBe(true);
    });

    it('accepts all metadata fields', () => {
        const result = EntityMetadataSchema.safeParse({
            createdAt: new Date(),
            updatedAt: new Date(),
            createdBy: 'test-tool',
            namespace: 'default',
            source: '/path/to/file',
        });
        expect(result.success).toBe(true);
    });

    it('accepts partial metadata', () => {
        const result = EntityMetadataSchema.safeParse({
            createdAt: new Date(),
            namespace: 'work',
        });
        expect(result.success).toBe(true);
    });
});

describe('BaseEntitySchema', () => {
    it('accepts minimal valid entity', () => {
        const result = BaseEntitySchema.safeParse({
            id: 'test-id',
            name: 'Test Entity',
            type: 'custom',
        });

        expect(result.success).toBe(true);
        if (result.success) {
            expect(result.data.id).toBe('test-id');
            expect(result.data.name).toBe('Test Entity');
            expect(result.data.type).toBe('custom');
        }
    });

    it('rejects entity without id', () => {
        const result = BaseEntitySchema.safeParse({
            name: 'Test',
            type: 'custom',
        });

        expect(result.success).toBe(false);
    });

    it('rejects entity without name', () => {
        const result = BaseEntitySchema.safeParse({
            id: 'test',
            type: 'custom',
        });

        expect(result.success).toBe(false);
    });

    it('rejects entity without type', () => {
        const result = BaseEntitySchema.safeParse({
            id: 'test',
            name: 'Test',
        });

        expect(result.success).toBe(false);
    });

    it('rejects empty id', () => {
        const result = BaseEntitySchema.safeParse({
            id: '',
            name: 'Test',
            type: 'custom',
        });

        expect(result.success).toBe(false);
    });

    it('rejects empty name', () => {
        const result = BaseEntitySchema.safeParse({
            id: 'test',
            name: '',
            type: 'custom',
        });

        expect(result.success).toBe(false);
    });

    it('rejects empty type', () => {
        const result = BaseEntitySchema.safeParse({
            id: 'test',
            name: 'Test',
            type: '',
        });

        expect(result.success).toBe(false);
    });

    it('accepts optional notes field', () => {
        const result = BaseEntitySchema.safeParse({
            id: 'test',
            name: 'Test',
            type: 'custom',
            notes: 'Some notes',
        });

        expect(result.success).toBe(true);
        if (result.success) {
            expect(result.data.notes).toBe('Some notes');
        }
    });

    it('accepts optional metadata fields', () => {
        const result = BaseEntitySchema.safeParse({
            id: 'test',
            name: 'Test',
            type: 'custom',
            notes: 'Some notes',
            createdAt: new Date(),
            namespace: 'work',
        });

        expect(result.success).toBe(true);
        if (result.success) {
            expect(result.data.createdAt).toBeInstanceOf(Date);
            expect(result.data.namespace).toBe('work');
        }
    });

    it('allows extra fields (for extensions)', () => {
        const result = BaseEntitySchema.safeParse({
            id: 'test',
            name: 'Test',
            type: 'custom',
            customField: 'custom value',
        });

        expect(result.success).toBe(true);
    });
});

describe('createEntitySchema', () => {
    it('creates schema extending base', () => {
        const CustomSchema = createEntitySchema('custom', {
            customField: z.string(),
        });

        const result = CustomSchema.safeParse({
            id: 'test',
            name: 'Test',
            type: 'custom',
            customField: 'value',
        });

        expect(result.success).toBe(true);
        if (result.success) {
            expect(result.data.customField).toBe('value');
        }
    });

    it('enforces type literal', () => {
        const CustomSchema = createEntitySchema('custom', {});

        const result = CustomSchema.safeParse({
            id: 'test',
            name: 'Test',
            type: 'wrong-type',  // Should fail
        });

        expect(result.success).toBe(false);
    });

    it('requires base entity fields', () => {
        const CustomSchema = createEntitySchema('custom', {
            customField: z.string(),
        });

        const result = CustomSchema.safeParse({
            type: 'custom',
            customField: 'value',
            // Missing id and name
        });

        expect(result.success).toBe(false);
    });

    it('validates custom field types', () => {
        const CustomSchema = createEntitySchema('custom', {
            email: z.string().email(),
            age: z.number().int().positive(),
        });

        const invalidEmail = CustomSchema.safeParse({
            id: 'test',
            name: 'Test',
            type: 'custom',
            email: 'not-an-email',
            age: 25,
        });
        expect(invalidEmail.success).toBe(false);

        const invalidAge = CustomSchema.safeParse({
            id: 'test',
            name: 'Test',
            type: 'custom',
            email: 'test@example.com',
            age: -5,
        });
        expect(invalidAge.success).toBe(false);

        const valid = CustomSchema.safeParse({
            id: 'test',
            name: 'Test',
            type: 'custom',
            email: 'test@example.com',
            age: 25,
        });
        expect(valid.success).toBe(true);
    });

    it('supports optional custom fields', () => {
        const CustomSchema = createEntitySchema('custom', {
            optionalField: z.string().optional(),
        });

        const withoutOptional = CustomSchema.safeParse({
            id: 'test',
            name: 'Test',
            type: 'custom',
        });
        expect(withoutOptional.success).toBe(true);

        const withOptional = CustomSchema.safeParse({
            id: 'test',
            name: 'Test',
            type: 'custom',
            optionalField: 'value',
        });
        expect(withOptional.success).toBe(true);
    });
});

describe('validateBaseEntity', () => {
    it('returns success for valid entity', () => {
        const result = validateBaseEntity({
            id: 'test',
            name: 'Test',
            type: 'custom',
        });

        expect(result.success).toBe(true);
        expect(result.data).toBeDefined();
        expect(result.errors).toBeUndefined();
    });

    it('returns errors for invalid entity', () => {
        const result = validateBaseEntity({
            name: 'Test',
            // Missing id and type
        });

        expect(result.success).toBe(false);
        expect(result.data).toBeUndefined();
        expect(result.errors).toBeDefined();
        expect(result.errors!.length).toBeGreaterThan(0);
    });

    it('formats error paths correctly', () => {
        const result = validateBaseEntity({});

        expect(result.success).toBe(false);
        expect(result.errors).toBeDefined();

        const errorPaths = result.errors!.map(e => e.path);
        expect(errorPaths).toContain('id');
        expect(errorPaths).toContain('name');
        expect(errorPaths).toContain('type');
    });
});

describe('isBaseEntity', () => {
    it('returns true for valid entity', () => {
        const entity = {
            id: 'test',
            name: 'Test',
            type: 'custom',
        };

        expect(isBaseEntity(entity)).toBe(true);
    });

    it('returns false for invalid entity', () => {
        expect(isBaseEntity({})).toBe(false);
        expect(isBaseEntity(null)).toBe(false);
        expect(isBaseEntity(undefined)).toBe(false);
        expect(isBaseEntity('string')).toBe(false);
        expect(isBaseEntity(123)).toBe(false);
    });

    it('returns false for partial entity', () => {
        expect(isBaseEntity({ id: 'test' })).toBe(false);
        expect(isBaseEntity({ id: 'test', name: 'Test' })).toBe(false);
        expect(isBaseEntity({ name: 'Test', type: 'custom' })).toBe(false);
    });

    it('returns true for entity with extra fields', () => {
        const entity = {
            id: 'test',
            name: 'Test',
            type: 'custom',
            extraField: 'value',
        };

        expect(isBaseEntity(entity)).toBe(true);
    });
});
