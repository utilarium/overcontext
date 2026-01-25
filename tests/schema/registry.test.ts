import { describe, it, expect, beforeEach } from 'vitest';
import { z } from 'zod';
import {
    createSchemaRegistry,
    BaseEntitySchema,
    SchemaRegistry,
} from '../../src/schema';

const PersonSchema = BaseEntitySchema.extend({
    type: z.literal('person'),
    company: z.string().optional(),
});

const TermSchema = BaseEntitySchema.extend({
    type: z.literal('term'),
    expansion: z.string().optional(),
});

const CompanySchema = BaseEntitySchema.extend({
    type: z.literal('company'),
    industry: z.string().optional(),
});

describe('SchemaRegistry', () => {
    let registry: SchemaRegistry;

    beforeEach(() => {
        registry = createSchemaRegistry();
    });

    describe('register', () => {
        it('registers and retrieves schemas', () => {
            registry.register({ type: 'person', schema: PersonSchema });

            expect(registry.has('person')).toBe(true);
            expect(registry.get('person')?.schema).toBe(PersonSchema);
        });

        it('stores schema type', () => {
            registry.register({ type: 'person', schema: PersonSchema });

            const registered = registry.get('person');
            expect(registered?.type).toBe('person');
        });

        it('derives default plural name', () => {
            registry.register({ type: 'person', schema: PersonSchema });

            expect(registry.getDirectoryName('person')).toBe('persons');
        });

        it('allows custom plural names', () => {
            registry.register({
                type: 'person',
                schema: PersonSchema,
                pluralName: 'people',
            });

            expect(registry.getDirectoryName('person')).toBe('people');
        });

        it('stores custom validator', () => {
            const customValidator = (entity: any) => ({ success: true, data: entity });

            registry.register({
                type: 'person',
                schema: PersonSchema,
                customValidator,
            });

            const registered = registry.get('person');
            expect(registered?.customValidator).toBe(customValidator);
        });
    });

    describe('registerAll', () => {
        it('registers multiple schemas at once', () => {
            registry.registerAll({
                person: PersonSchema,
                term: TermSchema,
            });

            expect(registry.types()).toEqual(['person', 'term']);
        });

        it('derives plural names for all schemas', () => {
            registry.registerAll({
                person: PersonSchema,
                term: TermSchema,
                company: CompanySchema,
            });

            expect(registry.getDirectoryName('person')).toBe('persons');
            expect(registry.getDirectoryName('term')).toBe('terms');
            expect(registry.getDirectoryName('company')).toBe('companies');
        });
    });

    describe('has', () => {
        it('returns true for registered types', () => {
            registry.register({ type: 'person', schema: PersonSchema });

            expect(registry.has('person')).toBe(true);
        });

        it('returns false for unregistered types', () => {
            expect(registry.has('unknown')).toBe(false);
        });
    });

    describe('types', () => {
        it('returns empty array when no schemas registered', () => {
            expect(registry.types()).toEqual([]);
        });

        it('returns all registered type names', () => {
            registry.registerAll({
                person: PersonSchema,
                term: TermSchema,
                company: CompanySchema,
            });

            const types = registry.types();
            expect(types).toHaveLength(3);
            expect(types).toContain('person');
            expect(types).toContain('term');
            expect(types).toContain('company');
        });
    });

    describe('plural name derivation', () => {
        it('adds "s" to regular words', () => {
            registry.register({ type: 'project', schema: BaseEntitySchema });
            expect(registry.getDirectoryName('project')).toBe('projects');
        });

        it('changes "y" to "ies"', () => {
            registry.register({ type: 'category', schema: BaseEntitySchema });
            expect(registry.getDirectoryName('category')).toBe('categories');
        });

        it('adds "es" to words ending in "s"', () => {
            registry.register({ type: 'class', schema: BaseEntitySchema });
            expect(registry.getDirectoryName('class')).toBe('classes');
        });

        it('adds "es" to words ending in "x"', () => {
            registry.register({ type: 'box', schema: BaseEntitySchema });
            expect(registry.getDirectoryName('box')).toBe('boxes');
        });

        it('adds "es" to words ending in "ch"', () => {
            registry.register({ type: 'branch', schema: BaseEntitySchema });
            expect(registry.getDirectoryName('branch')).toBe('branches');
        });

        it('adds "es" to words ending in "sh"', () => {
            registry.register({ type: 'brush', schema: BaseEntitySchema });
            expect(registry.getDirectoryName('brush')).toBe('brushes');
        });
    });

    describe('directory name lookup', () => {
        it('returns undefined for unregistered type', () => {
            expect(registry.getDirectoryName('unknown')).toBeUndefined();
        });

        it('returns plural name for registered type', () => {
            registry.register({
                type: 'person',
                schema: PersonSchema,
                pluralName: 'people',
            });

            expect(registry.getDirectoryName('person')).toBe('people');
        });
    });

    describe('getTypeFromDirectory', () => {
        it('returns type from directory name', () => {
            registry.register({
                type: 'person',
                schema: PersonSchema,
                pluralName: 'people',
            });

            expect(registry.getTypeFromDirectory('people')).toBe('person');
        });

        it('returns undefined for unknown directory', () => {
            expect(registry.getTypeFromDirectory('unknown')).toBeUndefined();
        });

        it('works with derived plural names', () => {
            registry.register({ type: 'project', schema: BaseEntitySchema });

            expect(registry.getTypeFromDirectory('projects')).toBe('project');
        });
    });

    describe('validate', () => {
        beforeEach(() => {
            registry.register({ type: 'person', schema: PersonSchema });
        });

        it('validates entities against schema', () => {
            const valid = registry.validate({
                id: 'john',
                name: 'John',
                type: 'person',
            });

            expect(valid.success).toBe(true);
            expect(valid.data).toBeDefined();
        });

        it('rejects invalid entities', () => {
            const invalid = registry.validate({
                id: 'john',
                name: 'John',
                type: 'person',
                company: 123,  // Should be string
            } as any);

            expect(invalid.success).toBe(false);
            expect(invalid.errors).toBeDefined();
        });

        it('rejects unknown types', () => {
            const result = registry.validate({
                id: 'test',
                name: 'Test',
                type: 'unknown',
            });

            expect(result.success).toBe(false);
            expect(result.errors?.[0].message).toContain('Unknown entity type');
        });

        it('runs custom validator if provided', () => {
            const customValidator = (entity: any) => {
                if (entity.name === 'Invalid') {
                    return {
                        success: false,
                        errors: [{ path: 'name', message: 'Name cannot be Invalid' }],
                    };
                }
                return { success: true, data: entity };
            };

            registry.register({
                type: 'validated',
                schema: BaseEntitySchema,
                customValidator,
            });

            const invalid = registry.validate({
                id: 'test',
                name: 'Invalid',
                type: 'validated',
            });

            expect(invalid.success).toBe(false);
            expect(invalid.errors?.[0].message).toContain('cannot be Invalid');

            const valid = registry.validate({
                id: 'test',
                name: 'Valid',
                type: 'validated',
            });

            expect(valid.success).toBe(true);
        });
    });

    describe('validateAs', () => {
        beforeEach(() => {
            registry.register({ type: 'person', schema: PersonSchema });
        });

        it('validates data as specific type', () => {
            const result = registry.validateAs('person', {
                id: 'john',
                name: 'John',
                type: 'person',
            });

            expect(result.success).toBe(true);
        });

        it('adds type field if missing', () => {
            const result = registry.validateAs('person', {
                id: 'john',
                name: 'John',
                // type field missing
            });

            expect(result.success).toBe(true);
            expect(result.data?.type).toBe('person');
        });

        it('rejects unknown types', () => {
            const result = registry.validateAs('unknown', {
                id: 'test',
                name: 'Test',
            });

            expect(result.success).toBe(false);
            expect(result.errors?.[0].message).toContain('Unknown entity type');
        });

        it('validates against schema rules', () => {
            const result = registry.validateAs('person', {
                id: 'john',
                name: 'John',
                company: 123,  // Should be string
            });

            expect(result.success).toBe(false);
        });

        it('handles non-object data', () => {
            const result = registry.validateAs('person', 'not an object');

            expect(result.success).toBe(false);
        });

        it('handles null data', () => {
            const result = registry.validateAs('person', null);

            expect(result.success).toBe(false);
        });
    });
});
