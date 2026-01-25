import { describe, it, expect, beforeEach } from 'vitest';
import { z } from 'zod';
import {
    createTypedAPI,
    createMemoryProvider,
    createSchemaRegistry,
    createNamespaceResolver,
    createMultiNamespaceContext,
    BaseEntitySchema,
    MultiNamespaceContext,
} from '../../src';

const PersonSchema = BaseEntitySchema.extend({
    type: z.literal('person'),
    company: z.string().optional(),
});

describe('MultiNamespaceContext', () => {
    let context: MultiNamespaceContext<{ person: typeof PersonSchema }>;

    beforeEach(async () => {
        const registry = createSchemaRegistry();
        registry.register({ type: 'person', schema: PersonSchema });

        const provider = createMemoryProvider({ registry });
        await provider.initialize();

        const api = createTypedAPI({
            schemas: { person: PersonSchema },
            provider,
        });

        const resolver = createNamespaceResolver({
            provider,
            defaultNamespace: 'default',
        });

        // Create test data in different namespaces
        await api.create('person', { name: 'Work Person', company: 'WorkCo' }, { namespace: 'work' });
        await api.create('person', { name: 'Personal Person' }, { namespace: 'personal' });
        await api.create('person', { name: 'Shared Person' }, { namespace: 'shared' });
        await api.create('person', { name: 'Override Person', company: 'WorkCo' }, { namespace: 'work' });
        await api.create('person', { name: 'Override Person', company: 'SharedCo' }, { namespace: 'shared' });

        context = await createMultiNamespaceContext(
            { api, resolver },
            ['work', 'shared', 'personal']
        );
    });

    describe('getFromAny', () => {
        it('finds entity from any namespace', async () => {
            const result = await context.getFromAny('person', 'work-person');

            expect(result).toBeDefined();
            expect(result?.entity.name).toBe('Work Person');
            expect(result?.namespace).toBe('work');
        });

        it('returns first match in priority order', async () => {
            const result = await context.getFromAny('person', 'override-person');

            // Should find in 'work' first (higher priority)
            expect(result?.namespace).toBe('work');
            expect(result?.entity.company).toBe('WorkCo');
        });

        it('returns undefined if not found', async () => {
            const result = await context.getFromAny('person', 'nonexistent');

            expect(result).toBeUndefined();
        });

        it('searches all configured namespaces', async () => {
            const result = await context.getFromAny('person', 'personal-person');

            expect(result).toBeDefined();
            expect(result?.namespace).toBe('personal');
        });
    });

    describe('getAllMerged', () => {
        it('merges entities from all namespaces', async () => {
            const entities = await context.getAllMerged('person');

            // Should have all unique entities
            expect(entities.length).toBeGreaterThanOrEqual(4);
        });

        it('higher priority namespace wins on ID collision', async () => {
            const entities = await context.getAllMerged('person');

            const override = entities.find(e => e.id === 'override-person');
            expect(override).toBeDefined();
            expect(override?.company).toBe('WorkCo'); // From 'work', not 'shared'
        });

        it('returns empty array when no entities', async () => {
            const registry = createSchemaRegistry();
            registry.register({ type: 'empty', schema: BaseEntitySchema });

            const provider = createMemoryProvider({ registry });
            const api = createTypedAPI({
                schemas: { empty: BaseEntitySchema },
                provider,
            });

            const resolver = createNamespaceResolver({ provider });
            const emptyContext = await createMultiNamespaceContext({ api, resolver });

            const entities = await emptyContext.getAllMerged('empty');
            expect(entities).toEqual([]);
        });
    });

    describe('locateEntity', () => {
        it('finds namespace containing entity', async () => {
            const namespace = await context.locateEntity('person', 'work-person');

            expect(namespace).toBe('work');
        });

        it('returns first namespace in priority order', async () => {
            const namespace = await context.locateEntity('person', 'override-person');

            expect(namespace).toBe('work');
        });

        it('returns undefined if not found', async () => {
            const namespace = await context.locateEntity('person', 'nonexistent');

            expect(namespace).toBeUndefined();
        });
    });

    describe('getResolution', () => {
        it('returns namespace resolution', () => {
            const resolution = context.getResolution();

            expect(resolution.primary).toBe('work');
            expect(resolution.readable).toEqual(['work', 'shared', 'personal']);
            expect(resolution.references).toHaveLength(3);
        });

        it('marks primary as writable', () => {
            const resolution = context.getResolution();

            expect(resolution.references[0].writable).toBe(true);
            expect(resolution.references[1].writable).toBe(false);
            expect(resolution.references[2].writable).toBe(false);
        });
    });

    describe('withNamespaces', () => {
        it('creates new context with different namespaces', async () => {
            const newContext = await context.withNamespaces(['personal', 'shared']);

            const resolution = newContext.getResolution();
            expect(resolution.primary).toBe('personal');
            expect(resolution.readable).toEqual(['personal', 'shared']);
        });

        it('new context has independent resolution', async () => {
            const newContext = await context.withNamespaces('personal');

            // Original context unchanged
            expect(context.getResolution().primary).toBe('work');

            // New context has new resolution
            expect(newContext.getResolution().primary).toBe('personal');
        });
    });

    describe('base API methods', () => {
        it('uses primary namespace for writes', async () => {
            const person = await context.create('person', {
                name: 'New Person',
            });

            // Should be in primary namespace (work)
            const location = await context.locateEntity('person', person.id);
            expect(location).toBe('work');
        });

        it('can override namespace for specific operations', async () => {
            const person = await context.create('person', {
                name: 'Specific Person',
            }, { namespace: 'personal' });

            const location = await context.locateEntity('person', person.id);
            expect(location).toBe('personal');
        });

        it('forwards get to primary namespace', async () => {
            const person = await context.get('person', 'work-person');
            expect(person).toBeDefined();
        });

        it('forwards getAll to primary namespace', async () => {
            const people = await context.getAll('person');
            expect(people.length).toBeGreaterThan(0);
        });

        it('forwards exists to primary namespace', async () => {
            const exists = await context.exists('person', 'work-person');
            expect(exists).toBe(true);
        });

        it('forwards update to primary namespace', async () => {
            const updated = await context.update('person', 'work-person', {
                company: 'UpdatedCo',
            });
            expect(updated.company).toBe('UpdatedCo');
        });

        it('forwards upsert to primary namespace', async () => {
            const upserted = await context.upsert('person', {
                id: 'new-upsert',
                name: 'Upserted Person',
            });
            expect(upserted.id).toBe('new-upsert');
        });

        it('forwards delete to primary namespace', async () => {
            const deleted = await context.delete('person', 'work-person');
            expect(deleted).toBe(true);
        });

        it('forwards types', () => {
            const types = context.types();
            expect(types).toContain('person');
        });

        it('forwards search', async () => {
            const result = await context.search({ type: 'person', namespace: 'work' });
            expect(result.items.length).toBeGreaterThan(0);
        });

        it('forwards quickSearch', async () => {
            const results = await context.quickSearch('person', { namespace: 'work' });
            expect(results.length).toBeGreaterThan(0);
        });

        it('forwards withNamespace', () => {
            const namespaced = context.withNamespace('test');
            expect(namespaced.defaultNamespace).toBe('test');
        });
    });
});
