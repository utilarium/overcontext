import { describe, it, expect, beforeEach } from 'vitest';
import { z } from 'zod';
import {
    createTypedAPI,
    createMemoryProvider,
    createSchemaRegistry,
    query,
    BaseEntitySchema,
    OvercontextAPI,
} from '../../src';

const PersonSchema = BaseEntitySchema.extend({
    type: z.literal('person'),
    company: z.string().optional(),
    soundsLike: z.array(z.string()).optional(),
});

const TermSchema = BaseEntitySchema.extend({
    type: z.literal('term'),
    expansion: z.string().optional(),
});

describe('SearchEngine', () => {
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

        // Seed data
        await api.create('person', { name: 'John Smith', company: 'Acme', soundsLike: ['jon smith'] });
        await api.create('person', { name: 'Jane Doe', company: 'TechCorp' });
        await api.create('person', { name: 'Bob Johnson', company: 'Acme' });
        await api.create('term', { name: 'API', expansion: 'Application Programming Interface' });
        await api.create('term', { name: 'REST', expansion: 'Representational State Transfer' });
    });

    describe('search', () => {
        it('finds entities by partial name', async () => {
            const result = await api.search({ search: 'john' });

            expect(result.items).toHaveLength(2); // John Smith, Bob Johnson
            expect(result.total).toBe(2);
            expect(result.hasMore).toBe(false);
        });

        it('searches custom fields', async () => {
            const result = await api.search({
                search: 'jon',
                searchFields: ['soundsLike'],
            });

            expect(result.items).toHaveLength(1);
            expect(result.items[0].name).toBe('John Smith');
        });

        it('is case insensitive by default', async () => {
            const result = await api.search({ search: 'JOHN' });

            expect(result.items.length).toBeGreaterThan(0);
        });

        it('supports case sensitive search', async () => {
            const result = await api.search({
                search: 'JOHN',
                caseSensitive: true,
            });

            expect(result.items).toHaveLength(0);
        });

        it('filters by type', async () => {
            const result = await api.search({
                type: 'person',
            });

            expect(result.items).toHaveLength(3);
            expect(result.items.every(i => i.type === 'person')).toBe(true);
        });

        it('filters by multiple types', async () => {
            const result = await api.search({
                type: ['person', 'term'],
            });

            expect(result.items).toHaveLength(5);
        });

        it('filters by IDs', async () => {
            const result = await api.search({
                ids: ['john-smith', 'jane-doe'],
            });

            expect(result.items).toHaveLength(2);
            expect(result.items.map(i => i.id).sort()).toEqual(['jane-doe', 'john-smith']);
        });

        it('combines filters', async () => {
            const result = await api.search({
                type: 'person',
                search: 'acme',
                searchFields: ['company'],
            });

            expect(result.items).toHaveLength(2); // John Smith, Bob Johnson
        });

        it('sorts by name ascending by default', async () => {
            const result = await api.search({ type: 'person' });

            expect(result.items[0].name).toBe('Bob Johnson');
            expect(result.items[1].name).toBe('Jane Doe');
            expect(result.items[2].name).toBe('John Smith');
        });

        it('sorts by field descending', async () => {
            const result = await api.search({
                type: 'person',
                sort: [{ field: 'name', direction: 'desc' }],
            });

            expect(result.items[0].name).toBe('John Smith');
            expect(result.items[2].name).toBe('Bob Johnson');
        });

        it('sorts by multiple fields', async () => {
            const result = await api.search({
                type: 'person',
                sort: [
                    { field: 'company', direction: 'asc' },
                    { field: 'name', direction: 'asc' },
                ],
            });

            // Acme: Bob Johnson, John Smith; TechCorp: Jane Doe
            expect(result.items[0].name).toBe('Bob Johnson');
            expect(result.items[1].name).toBe('John Smith');
            expect(result.items[2].name).toBe('Jane Doe');
        });

        it('paginates results with limit', async () => {
            const result = await api.search({
                type: 'person',
                limit: 2,
            });

            expect(result.items).toHaveLength(2);
            expect(result.total).toBe(3);
            expect(result.hasMore).toBe(true);
        });

        it('paginates results with offset', async () => {
            const result = await api.search({
                type: 'person',
                limit: 2,
                offset: 1,
            });

            expect(result.items).toHaveLength(2);
            expect(result.total).toBe(3);
            expect(result.hasMore).toBe(false);
        });

        it('returns query in result', async () => {
            const options = { search: 'test', limit: 10 };
            const result = await api.search(options);

            expect(result.query).toEqual(options);
        });

        it('searches across all types when no type specified', async () => {
            const result = await api.search({});

            expect(result.items).toHaveLength(5); // 3 persons + 2 terms
        });
    });

    describe('quickSearch', () => {
        it('searches by name', async () => {
            const results = await api.quickSearch('john');

            expect(results).toHaveLength(2);
        });

        it('accepts type filter', async () => {
            const results = await api.quickSearch('api', { type: 'term' });

            expect(results).toHaveLength(1); // API
            expect(results.every(r => r.type === 'term')).toBe(true);
        });

        it('accepts limit', async () => {
            const results = await api.quickSearch('', { limit: 2 });

            expect(results).toHaveLength(2);
        });

        it('returns items directly without metadata', async () => {
            const results = await api.quickSearch('john');

            expect(Array.isArray(results)).toBe(true);
            expect(results[0]).toHaveProperty('name');
        });
    });

    describe('QueryBuilder', () => {
        it('builds query with fluent API', () => {
            const q = query()
                .type('person')
                .search('john')
                .limit(10)
                .sortBy('name', 'desc')
                .build();

            expect(q.type).toBe('person');
            expect(q.search).toBe('john');
            expect(q.limit).toBe(10);
            expect(q.sort).toEqual([{ field: 'name', direction: 'desc' }]);
        });

        it('supports multiple types', () => {
            const q = query()
                .type(['person', 'term'])
                .build();

            expect(q.type).toEqual(['person', 'term']);
        });

        it('supports multiple sort fields', () => {
            const q = query()
                .sortBy('company', 'asc')
                .sortBy('name', 'desc')
                .build();

            expect(q.sort).toHaveLength(2);
        });

        it('supports page helper', () => {
            const q = query()
                .page(3, 20)
                .build();

            expect(q.limit).toBe(20);
            expect(q.offset).toBe(40); // (3-1) * 20
        });

        it('supports namespace filter', () => {
            const q = query()
                .namespace('work')
                .build();

            expect(q.namespace).toBe('work');
        });

        it('supports ID filter', () => {
            const q = query()
                .ids(['id1', 'id2'])
                .build();

            expect(q.ids).toEqual(['id1', 'id2']);
        });

        it('supports case sensitive search', () => {
            const q = query()
                .search('Test')
                .caseSensitive()
                .build();

            expect(q.caseSensitive).toBe(true);
        });

        it('supports search fields', () => {
            const q = query()
                .search('test', ['field1', 'field2'])
                .build();

            expect(q.searchFields).toEqual(['field1', 'field2']);
        });
    });

    describe('namespace search', () => {
        beforeEach(async () => {
            await api.create('person', { name: 'Work Person' }, { namespace: 'work' });
            await api.create('person', { name: 'Personal Person' }, { namespace: 'personal' });
        });

        it('searches in specific namespace', async () => {
            const result = await api.search({
                type: 'person',
                namespace: 'work',
            });

            expect(result.items).toHaveLength(1);
            expect(result.items[0].name).toBe('Work Person');
        });

        it('searches in multiple namespaces', async () => {
            const result = await api.search({
                type: 'person',
                namespace: ['work', 'personal'],
            });

            expect(result.items).toHaveLength(2);
        });
    });
});
