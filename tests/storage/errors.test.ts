import { describe, it, expect } from 'vitest';
import {
    StorageError,
    EntityNotFoundError,
    SchemaNotRegisteredError,
    ValidationError,
    StorageAccessError,
    ReadonlyStorageError,
    NamespaceNotFoundError,
} from '../../src/storage';

describe('StorageError', () => {
    it('creates error with message and code', () => {
        const error = new StorageError('Test error', 'TEST_CODE');

        expect(error.message).toBe('Test error');
        expect(error.code).toBe('TEST_CODE');
        expect(error.name).toBe('StorageError');
    });

    it('includes cause if provided', () => {
        const cause = new Error('Original error');
        const error = new StorageError('Test error', 'TEST_CODE', cause);

        expect(error.cause).toBe(cause);
    });
});

describe('EntityNotFoundError', () => {
    it('creates error with type and id', () => {
        const error = new EntityNotFoundError('person', 'john');

        expect(error.entityType).toBe('person');
        expect(error.entityId).toBe('john');
        expect(error.message).toContain('person/john');
        expect(error.code).toBe('ENTITY_NOT_FOUND');
        expect(error.name).toBe('EntityNotFoundError');
    });

    it('includes namespace in message if provided', () => {
        const error = new EntityNotFoundError('person', 'john', 'work');

        expect(error.namespace).toBe('work');
        expect(error.message).toContain('in work');
    });
});

describe('SchemaNotRegisteredError', () => {
    it('creates error with entity type', () => {
        const error = new SchemaNotRegisteredError('person');

        expect(error.entityType).toBe('person');
        expect(error.message).toContain('person');
        expect(error.code).toBe('SCHEMA_NOT_REGISTERED');
        expect(error.name).toBe('SchemaNotRegisteredError');
    });
});

describe('ValidationError', () => {
    it('creates error with validation errors', () => {
        const validationErrors = [
            { path: 'name', message: 'Required' },
            { path: 'email', message: 'Invalid email' },
        ];

        const error = new ValidationError('Validation failed', validationErrors);

        expect(error.validationErrors).toEqual(validationErrors);
        expect(error.code).toBe('VALIDATION_ERROR');
        expect(error.name).toBe('ValidationError');
    });
});

describe('StorageAccessError', () => {
    it('creates error with message', () => {
        const error = new StorageAccessError('Cannot access storage');

        expect(error.message).toBe('Cannot access storage');
        expect(error.code).toBe('STORAGE_ACCESS_ERROR');
        expect(error.name).toBe('StorageAccessError');
    });

    it('includes cause if provided', () => {
        const cause = new Error('Permission denied');
        const error = new StorageAccessError('Cannot access storage', cause);

        expect(error.cause).toBe(cause);
    });
});

describe('ReadonlyStorageError', () => {
    it('creates error with default message', () => {
        const error = new ReadonlyStorageError();

        expect(error.message).toBe('Storage is readonly');
        expect(error.code).toBe('READONLY_STORAGE');
        expect(error.name).toBe('ReadonlyStorageError');
    });
});

describe('NamespaceNotFoundError', () => {
    it('creates error with namespace', () => {
        const error = new NamespaceNotFoundError('work');

        expect(error.namespace).toBe('work');
        expect(error.message).toContain('work');
        expect(error.code).toBe('NAMESPACE_NOT_FOUND');
        expect(error.name).toBe('NamespaceNotFoundError');
    });
});
