import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { z } from 'zod';

import { BaseEntitySchema, createSchemaRegistry } from '../../../src/schema';
import { createObservableProvider } from '../../../src/storage/observable';
import { FjellStorageProvider } from '../../../src/storage/fjell/provider';
import { MemoryFjellAdapter } from '../../../src/storage/fjell/memory-adapter';
import type { AnyStorageEvent } from '../../../src/storage/events';
import type { StorageProvider } from '../../../src/storage/interface';

const PersonSchema = BaseEntitySchema.extend({
    type: z.literal('person'),
    email: z.string().optional(),
});

const ProjectSchema = BaseEntitySchema.extend({
    type: z.literal('project'),
    status: z.string().optional(),
});

describe('Fjell storage end-to-end integration', () => {
    let provider: StorageProvider;
    let events: AnyStorageEvent[];

    beforeEach(async () => {
        const registry = createSchemaRegistry();
        registry.register({ type: 'person', schema: PersonSchema, pluralName: 'people' });
        registry.register({ type: 'project', schema: ProjectSchema, pluralName: 'projects' });

        const baseProvider = new FjellStorageProvider(
            new MemoryFjellAdapter(),
            registry,
            'fjell-memory',
            'memory://fjell',
        );
        provider = createObservableProvider(baseProvider);
        events = [];
        (provider as ReturnType<typeof createObservableProvider>).subscribe(event => events.push(event));
        await provider.initialize();
    });

    afterEach(async () => {
        await provider.dispose();
    });

    it('saves and reads entities through observable wrapper', async () => {
        await provider.save({ id: 'p1', name: 'Alice', type: 'person', email: 'alice@example.com' }, 'workspace-a');
        await provider.save({ id: 'proj1', name: 'Project A', type: 'project', status: 'active' }, 'workspace-a');

        const person = await provider.get('person', 'p1', 'workspace-a');
        const project = await provider.get('project', 'proj1', 'workspace-a');

        expect(person?.name).toBe('Alice');
        expect((person as any)?.email).toBe('alice@example.com');
        expect(project?.name).toBe('Project A');
        expect((project as any)?.status).toBe('active');
    });

    it('finds across registered types and filters by namespace', async () => {
        await provider.save({ id: 'p1', name: 'Alice Smith', type: 'person' }, 'workspace-a');
        await provider.save({ id: 'p2', name: 'Bob Jones', type: 'person' }, 'workspace-a');
        await provider.save({ id: 'proj1', name: 'Smith Project', type: 'project' }, 'workspace-a');
        await provider.save({ id: 'p3', name: 'Charlie Smith', type: 'person' }, 'workspace-b');

        const workspaceA = await provider.find({ namespace: 'workspace-a' });
        const smithAcrossTypes = await provider.find({ namespace: 'workspace-a', search: 'smith' });

        expect(workspaceA).toHaveLength(3);
        expect(smithAcrossTypes).toHaveLength(2);
        expect(smithAcrossTypes.some(item => item.type === 'person')).toBe(true);
        expect(smithAcrossTypes.some(item => item.type === 'project')).toBe(true);
    });

    it('keeps namespace data isolated for same ids', async () => {
        await provider.save({ id: 'shared', name: 'Alice A', type: 'person' }, 'workspace-a');
        await provider.save({ id: 'shared', name: 'Alice B', type: 'person' }, 'workspace-b');

        const a = await provider.get('person', 'shared', 'workspace-a');
        const b = await provider.get('person', 'shared', 'workspace-b');

        expect(a?.name).toBe('Alice A');
        expect(b?.name).toBe('Alice B');
    });

    it('emits observable events through full lifecycle', async () => {
        await provider.save({ id: 'p1', name: 'Alice', type: 'person' }, 'workspace-a');
        await provider.save({ id: 'p1', name: 'Alice Updated', type: 'person' }, 'workspace-a');
        await provider.delete('person', 'p1', 'workspace-a');

        expect(events.some(e => e.type === 'storage:initialized')).toBe(true);
        expect(events.some(e => e.type === 'entity:created')).toBe(true);
        expect(events.some(e => e.type === 'entity:updated')).toBe(true);
        expect(events.some(e => e.type === 'entity:deleted')).toBe(true);
    });
});
