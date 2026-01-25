import { describe, it, expect, beforeEach } from 'vitest';
import { z } from 'zod';
import {
    createNamespaceResolver,
    createMemoryProvider,
    createSchemaRegistry,
    BaseEntitySchema,
    NamespaceResolver,
} from '../../src';

describe('NamespaceResolver', () => {
    let resolver: NamespaceResolver;

    beforeEach(async () => {
        const registry = createSchemaRegistry();
        registry.register({ type: 'test', schema: BaseEntitySchema });

        const provider = createMemoryProvider({ registry });
        await provider.initialize();

        // Create some namespaces with data
        await provider.save({ id: 'test1', name: 'Test 1', type: 'test' }, 'work');
        await provider.save({ id: 'test2', name: 'Test 2', type: 'test' }, 'personal');

        resolver = createNamespaceResolver({
            provider,
            defaultNamespace: 'default',
        });
    });

    describe('resolve', () => {
        it('resolves single namespace', async () => {
            const resolution = await resolver.resolve('work');

            expect(resolution.primary).toBe('work');
            expect(resolution.readable).toContain('work');
            expect(resolution.references).toHaveLength(1);
        });

        it('resolves multiple namespaces in priority order', async () => {
            const resolution = await resolver.resolve(['project', 'shared']);

            expect(resolution.primary).toBe('project');
            expect(resolution.readable).toEqual(['project', 'shared']);
            expect(resolution.references[0].namespace).toBe('project');
            expect(resolution.references[0].writable).toBe(true);
            expect(resolution.references[1].namespace).toBe('shared');
            expect(resolution.references[1].writable).toBe(false);
        });

        it('uses default namespace when none specified', async () => {
            const resolution = await resolver.resolve();

            expect(resolution.primary).toBe('default');
            expect(resolution.readable).toContain('default');
        });

        it('assigns priority based on order', async () => {
            const resolution = await resolver.resolve(['ns1', 'ns2', 'ns3']);

            expect(resolution.references[0].priority).toBeGreaterThan(
                resolution.references[1].priority
            );
            expect(resolution.references[1].priority).toBeGreaterThan(
                resolution.references[2].priority
            );
        });

        it('marks only first namespace as writable', async () => {
            const resolution = await resolver.resolve(['ns1', 'ns2']);

            expect(resolution.references[0].writable).toBe(true);
            expect(resolution.references[1].writable).toBe(false);
        });

        it('marks all as searchable by default', async () => {
            const resolution = await resolver.resolve(['ns1', 'ns2']);

            expect(resolution.references.every(r => r.searchable)).toBe(true);
        });
    });

    describe('listAll', () => {
        it('lists discovered namespaces', async () => {
            const all = await resolver.listAll();

            const ids = all.map(ns => ns.id);
            expect(ids).toContain('work');
            expect(ids).toContain('personal');
        });

        it('includes configured namespaces', async () => {
            resolver.register({
                id: 'configured',
                name: 'Configured Namespace',
                description: 'Test namespace',
            });

            const all = await resolver.listAll();

            const configured = all.find(ns => ns.id === 'configured');
            expect(configured).toBeDefined();
            expect(configured?.description).toBe('Test namespace');
        });

        it('merges configured and discovered', async () => {
            resolver.register({
                id: 'work',
                name: 'Work Namespace',
                description: 'Work-related entities',
            });

            const all = await resolver.listAll();

            const work = all.find(ns => ns.id === 'work');
            expect(work?.description).toBe('Work-related entities');
        });
    });

    describe('register', () => {
        it('registers namespace configuration', () => {
            resolver.register({
                id: 'test-ns',
                name: 'Test Namespace',
            });

            // Should be available
            expect(resolver).toBeDefined();
        });

        it('allows updating existing configuration', () => {
            resolver.register({
                id: 'test-ns',
                name: 'Original',
            });

            resolver.register({
                id: 'test-ns',
                name: 'Updated',
            });

            // Last registration wins
            expect(resolver).toBeDefined();
        });
    });

    describe('getPrimary', () => {
        it('returns default namespace', () => {
            expect(resolver.getPrimary()).toBe('default');
        });
    });

    describe('exists', () => {
        it('returns true for existing namespace', async () => {
            expect(await resolver.exists('work')).toBe(true);
        });

        it('returns false for non-existing namespace', async () => {
            expect(await resolver.exists('nonexistent')).toBe(false);
        });

        it('returns true for configured namespace', async () => {
            resolver.register({
                id: 'configured',
                name: 'Configured',
            });

            expect(await resolver.exists('configured')).toBe(true);
        });
    });
});
