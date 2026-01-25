import { describe, it, expect, beforeEach } from 'vitest';
import { z } from 'zod';
import {
    createTypedAPI,
    createMemoryProvider,
    createSchemaRegistry,
    BaseEntitySchema,
    listCommand,
    getCommand,
    createCommand,
    updateCommand,
    deleteCommand,
    CommandContext,
} from '../../src';

const PersonSchema = BaseEntitySchema.extend({
    type: z.literal('person'),
    company: z.string().optional(),
});

describe('CLI Commands', () => {
    let ctx: CommandContext<{ person: typeof PersonSchema }>;

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
        await api.create('person', { name: 'John Doe', company: 'Acme' });
        await api.create('person', { name: 'Jane Smith', company: 'TechCorp' });

        ctx = {
            api,
            outputFormat: 'table',
        };
    });

    describe('listCommand', () => {
        it('lists entities', async () => {
            const output = await listCommand(ctx, { type: 'person' });

            expect(output).toContain('john-doe');
            expect(output).toContain('jane-smith');
        });

        it('filters by search', async () => {
            const output = await listCommand(ctx, {
                type: 'person',
                search: 'john',
            });

            expect(output).toContain('john-doe');
            expect(output).not.toContain('jane-smith');
        });

        it('respects limit', async () => {
            const output = await listCommand(ctx, {
                type: 'person',
                limit: 1,
            });

            const lines = output.split('\n').filter(l => l.trim());
            expect(lines.length).toBeLessThanOrEqual(2); // Header + 1 entity
        });

        it('uses custom fields', async () => {
            const output = await listCommand(ctx, {
                type: 'person',
                fields: ['name', 'company'],
            });

            expect(output).toContain('Acme');
            expect(output).toContain('TechCorp');
        });

        it('outputs as JSON', async () => {
            ctx.outputFormat = 'json';
            const output = await listCommand(ctx, { type: 'person' });

            const parsed = JSON.parse(output);
            expect(Array.isArray(parsed)).toBe(true);
        });

        it('outputs as YAML', async () => {
            ctx.outputFormat = 'yaml';
            const output = await listCommand(ctx, { type: 'person' });

            expect(output).toContain('id:');
            expect(output).toContain('name:');
        });
    });

    describe('getCommand', () => {
        it('gets entity by ID', async () => {
            const output = await getCommand(ctx, {
                type: 'person',
                id: 'john-doe',
            });

            expect(output).toContain('john-doe');
            expect(output).toContain('John Doe');
        });

        it('throws when entity not found', async () => {
            await expect(
                getCommand(ctx, { type: 'person', id: 'nonexistent' })
            ).rejects.toThrow('Entity not found');
        });

        it('outputs as JSON', async () => {
            ctx.outputFormat = 'json';
            const output = await getCommand(ctx, {
                type: 'person',
                id: 'john-doe',
            });

            const parsed = JSON.parse(output);
            expect(parsed.name).toBe('John Doe');
        });
    });

    describe('createCommand', () => {
        it('creates entity', async () => {
            const output = await createCommand(ctx, {
                type: 'person',
                name: 'New Person',
                data: { company: 'NewCo' },
            });

            expect(output).toContain('Created');
            expect(output).toContain('person');
            expect(output).toContain('new-person');

            const entity = await ctx.api.get('person', 'new-person');
            expect(entity).toBeDefined();
        });

        it('accepts custom ID', async () => {
            const output = await createCommand(ctx, {
                type: 'person',
                name: 'Custom Person',
                id: 'custom-id',
            });

            expect(output).toContain('custom-id');
        });

        it('creates in namespace', async () => {
            ctx.namespace = 'work';
            await createCommand(ctx, {
                type: 'person',
                name: 'Work Person',
            });

            const entity = await ctx.api.get('person', 'work-person', 'work');
            expect(entity).toBeDefined();
        });
    });

    describe('updateCommand', () => {
        it('updates entity', async () => {
            const output = await updateCommand(ctx, {
                type: 'person',
                id: 'john-doe',
                data: { company: 'UpdatedCo' },
            });

            expect(output).toContain('Updated');
            expect(output).toContain('john-doe');

            const entity = await ctx.api.get('person', 'john-doe');
            expect(entity?.company).toBe('UpdatedCo');
        });

        it('throws when entity not found', async () => {
            await expect(
                updateCommand(ctx, {
                    type: 'person',
                    id: 'nonexistent',
                    data: { company: 'Test' },
                })
            ).rejects.toThrow();
        });
    });

    describe('deleteCommand', () => {
        it('deletes entity', async () => {
            const output = await deleteCommand(ctx, {
                type: 'person',
                id: 'john-doe',
            });

            expect(output).toContain('Deleted');
            expect(output).toContain('john-doe');

            const entity = await ctx.api.get('person', 'john-doe');
            expect(entity).toBeUndefined();
        });

        it('throws when entity not found', async () => {
            await expect(
                deleteCommand(ctx, { type: 'person', id: 'nonexistent' })
            ).rejects.toThrow('Entity not found');
        });
    });
});
