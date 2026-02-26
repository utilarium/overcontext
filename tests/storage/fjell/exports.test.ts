import { describe, expect, it } from 'vitest';
import * as overcontext from '../../../src';

describe('fjell public exports', () => {
    it('exports fjell provider factories from package entry point', () => {
        expect(typeof overcontext.createFjellFsProvider).toBe('function');
        expect(typeof overcontext.createFjellGcsProvider).toBe('function');
    });

    it('exports fjell storage classes and test adapter', () => {
        expect(typeof overcontext.FjellStorageProvider).toBe('function');
        expect(typeof overcontext.MemoryFjellAdapter).toBe('function');
    });
});
