import { describe, it, expect } from 'vitest';
import { slugify, generateUniqueId } from '../../src/api';

describe('slugify', () => {
    it('converts to lowercase', () => {
        expect(slugify('John Doe')).toBe('john-doe');
    });

    it('replaces spaces with hyphens', () => {
        expect(slugify('API Reference')).toBe('api-reference');
    });

    it('removes special characters', () => {
        expect(slugify('Hello, World!')).toBe('hello-world');
    });

    it('replaces underscores with hyphens', () => {
        expect(slugify('hello_world')).toBe('hello-world');
    });

    it('collapses multiple hyphens', () => {
        expect(slugify('hello---world')).toBe('hello-world');
    });

    it('trims leading and trailing hyphens', () => {
        expect(slugify('-hello-world-')).toBe('hello-world');
    });

    it('handles empty string', () => {
        expect(slugify('')).toBe('');
    });

    it('handles string with only special characters', () => {
        expect(slugify('!!!')).toBe('');
    });

    it('preserves numbers', () => {
        expect(slugify('Test 123')).toBe('test-123');
    });

    it('handles unicode characters', () => {
        // Unicode characters are removed by the regex
        expect(slugify('Café Münchën')).toBe('caf-mnchn');
    });
});

describe('generateUniqueId', () => {
    it('returns base slug if not exists', async () => {
        const exists = async () => false;
        const id = await generateUniqueId('Test Name', exists);
        expect(id).toBe('test-name');
    });

    it('appends -2 if base exists', async () => {
        const existingIds = new Set(['test-name']);
        const exists = async (id: string) => existingIds.has(id);

        const id = await generateUniqueId('Test Name', exists);
        expect(id).toBe('test-name-2');
    });

    it('finds first available number', async () => {
        const existingIds = new Set(['test-name', 'test-name-2', 'test-name-3']);
        const exists = async (id: string) => existingIds.has(id);

        const id = await generateUniqueId('Test Name', exists);
        expect(id).toBe('test-name-4');
    });

    it('falls back to timestamp after 100 attempts', async () => {
        const exists = async () => true; // Everything exists

        const id = await generateUniqueId('Test Name', exists);
        expect(id).toMatch(/^test-name-\d+$/);
        expect(id.length).toBeGreaterThan('test-name-'.length);
    });

    it('handles empty name', async () => {
        const exists = async () => false;
        const id = await generateUniqueId('', exists);
        expect(id).toBe('');
    });
});
