import { describe, it, expect, beforeEach } from 'vitest';
import { z } from 'zod';
import {
    createTypedAPI,
    createMemoryProvider,
    createSchemaRegistry,
    createCLIBuilder,
    BaseEntitySchema,
} from '../../src';

const PersonSchema = BaseEntitySchema.extend({
    type: z.literal('person'),
    company: z.string().optional(),
});

describe('CLIBuilder', () => {
    let cli: ReturnType<typeof createCLIBuilder<{ person: typeof PersonSchema }>>;

    beforeEach(async () => {
        const registry = createSchemaRegistry();
        registry.register({ type: 'person', schema: PersonSchema });

        const provider = createMemoryProvider({ registry });
        await provider.initialize();

        const api = createTypedAPI({
            schemas: { person: PersonSchema },
            provider,
        });

        // Seed data
        await api.create('person', { name: 'Test Person' });

        cli = createCLIBuilder({ api });
    });

    it('lists entities', async () => {
        const output = await cli.list({ type: 'person' });

        expect(output).toContain('test-person');
    });

    it('gets entity', async () => {
        const output = await cli.get({ type: 'person', id: 'test-person' });

        expect(output).toContain('Test Person');
    });

    it('creates entity', async () => {
        const output = await cli.create({
            type: 'person',
            name: 'New Person',
        });

        expect(output).toContain('Created');
    });

    it('updates entity', async () => {
        const output = await cli.update({
            type: 'person',
            id: 'test-person',
            data: { company: 'UpdatedCo' },
        });

        expect(output).toContain('Updated');
    });

    it('deletes entity', async () => {
        const output = await cli.delete({
            type: 'person',
            id: 'test-person',
        });

        expect(output).toContain('Deleted');
    });

    it('lists types', () => {
        const types = cli.types();

        expect(types).toContain('person');
    });

    it('supports format override', async () => {
        const output = await cli.list({
            type: 'person',
            format: 'json',
        });

        const parsed = JSON.parse(output);
        expect(Array.isArray(parsed)).toBe(true);
    });

    it('supports namespace override', async () => {
        await cli.create({
            type: 'person',
            name: 'Work Person',
            namespace: 'work',
        });

        const output = await cli.list({
            type: 'person',
            namespace: 'work',
        });

        expect(output).toContain('work-person');
    });

    it('uses default format', async () => {
        const output = await cli.list({ type: 'person' });

        // Default is table
        expect(output).toContain('ID');
    });

    it('supports custom default format', async () => {
        const registry = createSchemaRegistry();
        registry.register({ type: 'person', schema: PersonSchema });

        const provider = createMemoryProvider({ registry });
        const api = createTypedAPI({ schemas: { person: PersonSchema }, provider });

        const jsonCli = createCLIBuilder({ api, defaultFormat: 'json' });

        await api.create('person', { name: 'Test' });

        const output = await jsonCli.list({ type: 'person' });
        const parsed = JSON.parse(output);
        expect(Array.isArray(parsed)).toBe(true);
    });
});
