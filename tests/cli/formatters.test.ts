import { describe, it, expect } from 'vitest';
import { formatEntities, formatEntity } from '../../src/cli';

describe('formatEntities', () => {
    const entities = [
        { id: 'alice', name: 'Alice', type: 'person' },
        { id: 'bob', name: 'Bob', type: 'person' },
    ];

    describe('table format', () => {
        it('formats as table with headers', () => {
            const output = formatEntities(entities, { format: 'table' });

            expect(output).toContain('ID');
            expect(output).toContain('NAME');
            expect(output).toContain('TYPE');
            expect(output).toContain('alice');
            expect(output).toContain('Alice');
            expect(output).toContain('bob');
            expect(output).toContain('Bob');
        });

        it('formats without headers', () => {
            const output = formatEntities(entities, {
                format: 'table',
                noHeaders: true,
            });

            expect(output).not.toContain('ID');
            expect(output).not.toContain('NAME');
            expect(output).toContain('alice');
        });

        it('formats custom fields', () => {
            const customEntities = [
                { id: 'a', name: 'Alice', type: 'person', company: 'Acme' },
                { id: 'b', name: 'Bob', type: 'person', company: 'TechCorp' },
            ];

            const output = formatEntities(customEntities, {
                format: 'table',
                fields: ['id', 'name', 'company'],
            });

            expect(output).toContain('COMPANY');
            expect(output).toContain('Acme');
            expect(output).toContain('TechCorp');
        });

        it('handles missing values', () => {
            const entitiesWithMissing = [
                { id: 'a', name: 'Alice', type: 'person', company: 'Acme' },
                { id: 'b', name: 'Bob', type: 'person' },
            ];

            const output = formatEntities(entitiesWithMissing, {
                format: 'table',
                fields: ['id', 'name', 'company'],
            });

            expect(output).toContain('-'); // Missing value indicator
        });

        it('handles object values', () => {
            const entitiesWithObjects = [
                { id: 'a', name: 'Alice', type: 'person', metadata: { key: 'value' } },
            ];

            const output = formatEntities(entitiesWithObjects, {
                format: 'table',
                fields: ['id', 'name', 'metadata'],
            });

            expect(output).toContain('key');
        });

        it('returns message for empty list', () => {
            const output = formatEntities([], { format: 'table' });

            expect(output).toBe('No entities found.');
        });

        it('aligns columns properly', () => {
            const output = formatEntities(entities, { format: 'table' });

            const lines = output.split('\n');
            expect(lines.length).toBeGreaterThan(1);
        });
    });

    describe('json format', () => {
        it('formats as JSON', () => {
            const output = formatEntities(entities, { format: 'json' });

            const parsed = JSON.parse(output);
            expect(parsed).toHaveLength(2);
            expect(parsed[0].name).toBe('Alice');
        });

        it('pretty prints JSON', () => {
            const output = formatEntities(entities, { format: 'json' });

            expect(output).toContain('\n');
            expect(output).toContain('  ');
        });
    });

    describe('yaml format', () => {
        it('formats as YAML', () => {
            const output = formatEntities(entities, { format: 'yaml' });

            expect(output).toContain('id: alice');
            expect(output).toContain('name: Alice');
        });
    });
});

describe('formatEntity', () => {
    const entity = { id: 'alice', name: 'Alice', type: 'person' };

    it('formats single entity as JSON', () => {
        const output = formatEntity(entity, { format: 'json' });

        const parsed = JSON.parse(output);
        expect(parsed.name).toBe('Alice');
    });

    it('formats single entity as YAML', () => {
        const output = formatEntity(entity, { format: 'yaml' });

        expect(output).toContain('id: alice');
        expect(output).toContain('name: Alice');
    });
});
