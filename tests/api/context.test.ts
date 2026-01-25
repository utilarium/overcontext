import { describe, it, expect, beforeEach } from 'vitest';
import { z } from 'zod';
import {
    createTypedAPI,
    createMemoryProvider,
    createSchemaRegistry,
    BaseEntitySchema,
    OvercontextAPI,
    EntityNotFoundError,
} from '../../src';

const PersonSchema = BaseEntitySchema.extend({
    type: z.literal('person'),
    company: z.string().optional(),
});

const TermSchema = BaseEntitySchema.extend({
    type: z.literal('term'),
    expansion: z.string().optional(),
});

type PersonType = z.infer<typeof PersonSchema>;
type TermType = z.infer<typeof TermSchema>;

describe('OvercontextAPI', () => {
    let api: OvercontextAPI<{ person: typeof PersonSchema; term: typeof TermSchema }>;

    beforeEach(async () => {
        const registry = createSchemaRegistry();
        registry.register({ type: 'person', schema: PersonSchema, pluralName: 'people' });
        registry.register({ type: 'term', schema: TermSchema });

        const provider = createMemoryProvider({ registry });
        await provider.initialize();

        api = createTypedAPI({
            schemas: { person: PersonSchema, term: TermSchema },
            provider,
        });
    });

    describe('create', () => {
        it('creates entities with generated IDs', async () => {
            const person = await api.create('person', {
                name: 'John Doe',
                company: 'Acme',
            });

            expect(person.id).toBe('john-doe');
            expect(person.name).toBe('John Doe');
            expect(person.type).toBe('person');
            expect(person.company).toBe('Acme');
            expect(person.createdAt).toBeInstanceOf(Date);
            expect(person.updatedAt).toBeInstanceOf(Date);
        });

        it('generates unique IDs on collision', async () => {
            await api.create('person', { name: 'John Doe' });
            const person2 = await api.create('person', { name: 'John Doe' });

            expect(person2.id).toBe('john-doe-2');
        });

        it('accepts custom ID', async () => {
            const person = await api.create('person', {
                name: 'John Doe',
            }, { id: 'custom-id' });

            expect(person.id).toBe('custom-id');
        });

        it('respects generateUniqueId option', async () => {
            await api.create('person', { name: 'John Doe' });

            // With generateUniqueId: false, should use same ID (will overwrite)
            const person2 = await api.create('person', {
                name: 'John Doe',
            }, { generateUniqueId: false });

            expect(person2.id).toBe('john-doe');
        });

        it('creates in specified namespace', async () => {
            const person = await api.create('person', {
                name: 'John Doe',
            }, { namespace: 'work' });

            expect(person.id).toBe('john-doe');

            // Should not exist in default namespace
            const inDefault = await api.get('person', 'john-doe');
            expect(inDefault).toBeUndefined();

            // Should exist in work namespace
            const inWork = await api.get('person', 'john-doe', 'work');
            expect(inWork).toBeDefined();
        });
    });

    describe('get', () => {
        beforeEach(async () => {
            await api.create('person', { name: 'John Doe', company: 'Acme' });
        });

        it('retrieves existing entity', async () => {
            const person = await api.get('person', 'john-doe');

            expect(person).toBeDefined();
            expect(person?.name).toBe('John Doe');
        });

        it('returns undefined for non-existent entity', async () => {
            const person = await api.get('person', 'nonexistent');
            expect(person).toBeUndefined();
        });

        it('retrieves from specified namespace', async () => {
            await api.create('person', { name: 'Jane Doe' }, { namespace: 'work' });

            const person = await api.get('person', 'jane-doe', 'work');
            expect(person).toBeDefined();
        });
    });

    describe('getAll', () => {
        beforeEach(async () => {
            await api.create('person', { name: 'John Doe' });
            await api.create('person', { name: 'Jane Doe' });
            await api.create('term', { name: 'API' });
        });

        it('retrieves all entities of a type', async () => {
            const people = await api.getAll('person');

            expect(people).toHaveLength(2);
            expect(people.map(p => p.name).sort()).toEqual(['Jane Doe', 'John Doe']);
        });

        it('returns empty array for type with no entities', async () => {
            const registry = createSchemaRegistry();
            registry.register({ type: 'empty', schema: BaseEntitySchema });

            const provider = createMemoryProvider({ registry });
            const emptyApi = createTypedAPI({
                schemas: { empty: BaseEntitySchema },
                provider,
            });

            const entities = await emptyApi.getAll('empty');
            expect(entities).toEqual([]);
        });

        it('retrieves from specified namespace', async () => {
            await api.create('person', { name: 'Work Person' }, { namespace: 'work' });

            const workPeople = await api.getAll('person', 'work');
            expect(workPeople).toHaveLength(1);
            expect(workPeople[0].name).toBe('Work Person');
        });
    });

    describe('exists', () => {
        beforeEach(async () => {
            await api.create('person', { name: 'John Doe' });
        });

        it('returns true for existing entity', async () => {
            expect(await api.exists('person', 'john-doe')).toBe(true);
        });

        it('returns false for non-existent entity', async () => {
            expect(await api.exists('person', 'nonexistent')).toBe(false);
        });

        it('checks in specified namespace', async () => {
            await api.create('person', { name: 'Work Person' }, { namespace: 'work' });

            expect(await api.exists('person', 'work-person', 'work')).toBe(true);
            expect(await api.exists('person', 'work-person')).toBe(false);
        });
    });

    describe('update', () => {
        beforeEach(async () => {
            await api.create('person', { name: 'John Doe', company: 'Acme' });
        });

        it('updates existing entity', async () => {
            const updated = await api.update('person', 'john-doe', {
                company: 'NewCo',
            });

            expect(updated.name).toBe('John Doe');
            expect(updated.company).toBe('NewCo');
            expect(updated.updatedAt).toBeInstanceOf(Date);
        });

        it('throws for non-existent entity', async () => {
            await expect(
                api.update('person', 'nonexistent', { company: 'NewCo' })
            ).rejects.toThrow(EntityNotFoundError);
        });

        it('updates in specified namespace', async () => {
            await api.create('person', { name: 'Work Person' }, { namespace: 'work' });

            const updated = await api.update('person', 'work-person', {
                company: 'WorkCo',
            }, 'work');

            expect(updated.company).toBe('WorkCo');
        });

        it('preserves createdAt', async () => {
            const original = await api.get('person', 'john-doe');
            const originalCreatedAt = original?.createdAt;

            await new Promise(resolve => setTimeout(resolve, 10));

            const updated = await api.update('person', 'john-doe', {
                company: 'NewCo',
            });

            expect(updated.createdAt).toEqual(originalCreatedAt);
            if (updated.updatedAt && originalCreatedAt) {
                expect(updated.updatedAt.getTime()).toBeGreaterThan(originalCreatedAt.getTime());
            }
        });
    });

    describe('upsert', () => {
        it('creates new entity if not exists', async () => {
            const person = await api.upsert('person', {
                id: 'new-person',
                name: 'New Person',
                company: 'Acme',
            });

            expect(person.id).toBe('new-person');
            expect(person.name).toBe('New Person');
        });

        it('updates existing entity', async () => {
            await api.create('person', { name: 'John Doe', company: 'Acme' });

            const updated = await api.upsert('person', {
                id: 'john-doe',
                name: 'John Doe',
                company: 'NewCo',
            });

            expect(updated.company).toBe('NewCo');
        });

        it('preserves createdAt on update', async () => {
            const original = await api.create('person', { name: 'John Doe' });

            await new Promise(resolve => setTimeout(resolve, 10));

            const updated = await api.upsert('person', {
                id: 'john-doe',
                name: 'John Doe',
                company: 'NewCo',
            });

            expect(updated.createdAt).toEqual(original.createdAt);
        });
    });

    describe('delete', () => {
        beforeEach(async () => {
            await api.create('person', { name: 'John Doe' });
        });

        it('deletes existing entity', async () => {
            const deleted = await api.delete('person', 'john-doe');
            expect(deleted).toBe(true);

            const person = await api.get('person', 'john-doe');
            expect(person).toBeUndefined();
        });

        it('returns false for non-existent entity', async () => {
            const deleted = await api.delete('person', 'nonexistent');
            expect(deleted).toBe(false);
        });

        it('deletes from specified namespace', async () => {
            await api.create('person', { name: 'Work Person' }, { namespace: 'work' });

            const deleted = await api.delete('person', 'work-person', 'work');
            expect(deleted).toBe(true);

            const person = await api.get('person', 'work-person', 'work');
            expect(person).toBeUndefined();
        });
    });

    describe('types', () => {
        it('lists all registered types', () => {
            const types = api.types();
            expect(types).toContain('person');
            expect(types).toContain('term');
        });
    });

    describe('withNamespace', () => {
        it('creates namespaced context', async () => {
            const workApi = api.withNamespace('work');

            await workApi.create('person', { name: 'Work Person' });

            // Should exist in work namespace
            const inWork = await workApi.get('person', 'work-person');
            expect(inWork).toBeDefined();

            // Should not exist in default namespace
            const inDefault = await api.get('person', 'work-person');
            expect(inDefault).toBeUndefined();
        });

        it('namespaced context uses namespace for all operations', async () => {
            const workApi = api.withNamespace('work');

            await workApi.create('person', { name: 'Person 1' });
            await workApi.create('person', { name: 'Person 2' });

            const people = await workApi.getAll('person');
            expect(people).toHaveLength(2);

            // Default namespace should be empty
            const defaultPeople = await api.getAll('person');
            expect(defaultPeople).toHaveLength(0);
        });
    });

    describe('type safety', () => {
        it('infers correct types from schemas', async () => {
            const person: PersonType = await api.create('person', {
                name: 'John Doe',
                company: 'Acme',
            });

            expect(person.type).toBe('person');

            const term: TermType = await api.create('term', {
                name: 'API',
                expansion: 'Application Programming Interface',
            });

            expect(term.type).toBe('term');
        });
    });
});
