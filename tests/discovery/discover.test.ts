import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { z } from 'zod';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import {
    discoverOvercontext,
    BaseEntitySchema,
} from '../../src';

const PersonSchema = BaseEntitySchema.extend({
    type: z.literal('person'),
    company: z.string().optional(),
});

describe('discoverOvercontext', () => {
    let tempDir: string;
    let projectDir: string;

    beforeEach(async () => {
        tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'overcontext-discover-'));
        projectDir = path.join(tempDir, 'project');

        await fs.mkdir(projectDir, { recursive: true });
        await fs.mkdir(path.join(projectDir, 'context', 'people'), { recursive: true });

        // Add test entity
        await fs.writeFile(
            path.join(projectDir, 'context', 'people', 'test.yaml'),
            'id: test\nname: Test Person\n'
        );

        // Add marker
        await fs.writeFile(path.join(projectDir, 'package.json'), '{}');
    });

    afterEach(async () => {
        await fs.rm(tempDir, { recursive: true, force: true });
    });

    it('discovers and creates API', async () => {
        const api = await discoverOvercontext({
            schemas: { person: PersonSchema },
            pluralNames: { person: 'people' },
            startDir: projectDir,
        });

        expect(api).toBeDefined();
        expect(api.types()).toContain('person');
    });

    it('can read discovered entities', async () => {
        const api = await discoverOvercontext({
            schemas: { person: PersonSchema },
            pluralNames: { person: 'people' },
            startDir: projectDir,
        });

        const person = await api.get('person', 'test');
        expect(person).toBeDefined();
        expect(person?.name).toBe('Test Person');
    });

    it('can write new entities', async () => {
        const api = await discoverOvercontext({
            schemas: { person: PersonSchema },
            pluralNames: { person: 'people' },
            startDir: projectDir,
        });

        await api.create('person', {
            name: 'New Person',
            company: 'TestCo',
        });

        const person = await api.get('person', 'new-person');
        expect(person).toBeDefined();
    });

    it('throws when no context found', async () => {
        const emptyDir = path.join(tempDir, 'empty');
        await fs.mkdir(emptyDir, { recursive: true });

        await expect(
            discoverOvercontext({
                schemas: { person: PersonSchema },
                startDir: emptyDir,
            })
        ).rejects.toThrow('No context directory found');
    });

    it('supports readonly mode', async () => {
        const api = await discoverOvercontext({
            schemas: { person: PersonSchema },
            pluralNames: { person: 'people' },
            startDir: projectDir,
            readonly: true,
        });

        await expect(
            api.create('person', { name: 'New Person' })
        ).rejects.toThrow();
    });
});
