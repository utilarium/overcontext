import { describe, it, expect, beforeEach } from 'vitest';
import { z } from 'zod';
import {
    createTypedAPI,
    createMemoryProvider,
    createSchemaRegistry,
    createSearchEngine,
    query,
    BaseEntitySchema,
    OvercontextAPI,
    SearchEngine,
    StorageProvider,
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

        it('supports offset', () => {
            const q = query()
                .offset(10)
                .build();

            expect(q.offset).toBe(10);
        });

        it('clamps offset to minimum 0', () => {
            const q = query()
                .offset(-5)
                .build();

            expect(q.offset).toBe(0);
        });

        it('floors fractional offset', () => {
            const q = query()
                .offset(3.7)
                .build();

            expect(q.offset).toBe(3);
        });

        it('clamps limit to minimum 1', () => {
            const q = query()
                .limit(0)
                .build();

            expect(q.limit).toBe(1);
        });

        it('floors fractional limit', () => {
            const q = query()
                .limit(2.9)
                .build();

            expect(q.limit).toBe(2);
        });

        it('clamps page parameters to valid values', () => {
            const q = query()
                .page(0, 0)
                .build();

            expect(q.limit).toBe(1);
            expect(q.offset).toBe(0);
        });
    });

    describe('sort edge cases', () => {
        it('handles sorting by date fields (ISO strings)', async () => {
            const result = await api.search({
                type: 'person',
                sort: [{ field: 'createdAt', direction: 'asc' }],
            });

            expect(result.items).toHaveLength(3);
            for (let i = 1; i < result.items.length; i++) {
                const prev = new Date(result.items[i - 1].createdAt as unknown as string).getTime();
                const curr = new Date(result.items[i].createdAt as unknown as string).getTime();
                expect(prev).toBeLessThanOrEqual(curr);
            }
        });

        it('handles sorting by date fields descending', async () => {
            const result = await api.search({
                type: 'person',
                sort: [{ field: 'createdAt', direction: 'desc' }],
            });

            expect(result.items).toHaveLength(3);
            for (let i = 1; i < result.items.length; i++) {
                const prev = new Date(result.items[i - 1].createdAt as unknown as string).getTime();
                const curr = new Date(result.items[i].createdAt as unknown as string).getTime();
                expect(prev).toBeGreaterThanOrEqual(curr);
            }
        });

        it('sorts with undefined values pushing them to end in asc order', async () => {
            const result = await api.search({
                type: 'person',
                sort: [{ field: 'company', direction: 'asc' }],
            });

            expect(result.items).toHaveLength(3);
        });

        it('sorts with undefined values pushing them to start in desc order', async () => {
            const result = await api.search({
                type: 'person',
                sort: [{ field: 'company', direction: 'desc' }],
            });

            expect(result.items).toHaveLength(3);
        });

        it('handles sorting by non-string non-date fields', async () => {
            await api.create('term', { name: 'ZZZ', expansion: 'last' });
            await api.create('term', { name: 'AAA', expansion: 'first' });

            const result = await api.search({
                type: 'term',
                sort: [{ field: 'name', direction: 'asc' }],
            });

            expect(result.items[0].name).toBe('AAA');
        });
    });

    describe('search field edge cases', () => {
        it('does not match non-string, non-array field values', async () => {
            const result = await api.search({
                search: '42',
                searchFields: ['company'],
                type: 'person',
            });

            expect(result.items.every(i => i.name.includes('42') || (i as any).company?.includes('42'))).toBe(true);
        });

        it('handles array fields containing non-string items', async () => {
            const result = await api.search({
                search: 'jon',
                searchFields: ['soundsLike'],
                type: 'person',
            });

            expect(result.items).toHaveLength(1);
            expect(result.items[0].name).toBe('John Smith');
        });

        it('handles case sensitive search with matching case', async () => {
            const result = await api.search({
                search: 'John',
                caseSensitive: true,
            });

            expect(result.items.length).toBeGreaterThan(0);
        });

        it('searches additional fields case sensitively', async () => {
            const result = await api.search({
                search: 'acme',
                searchFields: ['company'],
                caseSensitive: true,
                type: 'person',
            });

            expect(result.items).toHaveLength(0);
        });

        it('searches additional fields case insensitively', async () => {
            const result = await api.search({
                search: 'acme',
                searchFields: ['company'],
                caseSensitive: false,
                type: 'person',
            });

            expect(result.items).toHaveLength(2);
        });
    });

    describe('pagination edge cases', () => {
        it('returns hasMore false when no limit is set', async () => {
            const result = await api.search({});
            expect(result.hasMore).toBe(false);
        });

        it('returns hasMore false when limit equals total', async () => {
            const result = await api.search({
                type: 'person',
                limit: 3,
            });

            expect(result.hasMore).toBe(false);
            expect(result.total).toBe(3);
        });

        it('applies offset without limit', async () => {
            const all = await api.search({ type: 'person' });
            const offset = await api.search({ type: 'person', offset: 1 });

            expect(offset.items).toHaveLength(all.total - 1);
            expect(offset.total).toBe(all.total);
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

describe('SearchEngine sort internals', () => {
    const NumericSchema = BaseEntitySchema.extend({
        type: z.literal('scored'),
        score: z.number(),
        invalidDate: z.string().optional(),
    });

    let searchEngine: SearchEngine;
    let provider: StorageProvider;

    beforeEach(async () => {
        const registry = createSchemaRegistry();
        registry.register({ type: 'scored', schema: NumericSchema, pluralName: 'scored' });

        provider = createMemoryProvider({ registry });
        await provider.initialize();

        searchEngine = createSearchEngine({ provider, registry });
    });

    it('sorts by numeric fields using generic comparison', async () => {
        await provider.save({ id: 'low', name: 'Low', type: 'scored', score: 10 });
        await provider.save({ id: 'high', name: 'High', type: 'scored', score: 99 });
        await provider.save({ id: 'mid', name: 'Mid', type: 'scored', score: 50 });

        const result = await searchEngine.search({
            type: 'scored',
            sort: [{ field: 'score', direction: 'asc' }],
        });

        expect(result.items[0].id).toBe('low');
        expect(result.items[1].id).toBe('mid');
        expect(result.items[2].id).toBe('high');
    });

    it('sorts numeric fields descending', async () => {
        await provider.save({ id: 'low', name: 'Low', type: 'scored', score: 10 });
        await provider.save({ id: 'high', name: 'High', type: 'scored', score: 99 });

        const result = await searchEngine.search({
            type: 'scored',
            sort: [{ field: 'score', direction: 'desc' }],
        });

        expect(result.items[0].id).toBe('high');
        expect(result.items[1].id).toBe('low');
    });

    it('handles sort with null values in asc order', async () => {
        await provider.save({ id: 'has', name: 'Has', type: 'scored', score: 10 });
        await provider.save({ id: 'missing', name: 'Missing', type: 'scored', score: 0 });

        const result = await searchEngine.search({
            type: 'scored',
            sort: [{ field: 'invalidDate', direction: 'asc' }],
        });

        expect(result.items).toHaveLength(2);
    });

    it('handles sort with null values in desc order', async () => {
        await provider.save({ id: 'a', name: 'A', type: 'scored', score: 1 });
        await provider.save({ id: 'b', name: 'B', type: 'scored', score: 2, invalidDate: 'has value' });

        const result = await searchEngine.search({
            type: 'scored',
            sort: [{ field: 'invalidDate', direction: 'desc' }],
        });

        expect(result.items).toHaveLength(2);
    });

    it('handles fields with ISO-format strings that are invalid dates', async () => {
        await provider.save({
            id: 'bad-date',
            name: 'Bad Date',
            type: 'scored',
            score: 1,
            invalidDate: '9999-99-99T99:99:99',
        });
        await provider.save({
            id: 'good',
            name: 'Good',
            type: 'scored',
            score: 2,
            invalidDate: '2024-01-15T10:30:00',
        });

        const result = await searchEngine.search({
            type: 'scored',
            sort: [{ field: 'invalidDate', direction: 'asc' }],
        });

        expect(result.items).toHaveLength(2);
    });

    it('handles equal values in sort continuing to next field', async () => {
        await provider.save({ id: 'a', name: 'Same', type: 'scored', score: 10 });
        await provider.save({ id: 'b', name: 'Same', type: 'scored', score: 20 });

        const result = await searchEngine.search({
            type: 'scored',
            sort: [{ field: 'name', direction: 'asc' }, { field: 'score', direction: 'asc' }],
        });

        expect(result.items[0].id).toBe('a');
        expect(result.items[1].id).toBe('b');
    });

    it('returns 0 when all sort fields are equal', async () => {
        await provider.save({ id: 'a', name: 'Same', type: 'scored', score: 10 });
        await provider.save({ id: 'b', name: 'Same', type: 'scored', score: 10 });

        const result = await searchEngine.search({
            type: 'scored',
            sort: [{ field: 'name', direction: 'asc' }, { field: 'score', direction: 'asc' }],
        });

        expect(result.items).toHaveLength(2);
    });

    it('handles search field with non-string value', async () => {
        await provider.save({ id: 'a', name: 'Alpha', type: 'scored', score: 42 });

        const result = await searchEngine.search({
            search: '42',
            searchFields: ['score'],
            type: 'scored',
        });

        expect(result.items).toHaveLength(0);
    });

    it('handles text match when text is undefined', async () => {
        await provider.save({ id: 'a', name: 'Alpha', type: 'scored', score: 1 });

        const result = await searchEngine.search({
            search: 'something',
            searchFields: ['invalidDate'],
            type: 'scored',
        });

        expect(result.items).toHaveLength(0);
    });
});
