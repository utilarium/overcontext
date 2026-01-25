export class StorageError extends Error {
    constructor(
        message: string,
        public readonly code: string,
        public readonly cause?: Error
    ) {
        super(message);
        this.name = 'StorageError';
    }
}

export class EntityNotFoundError extends StorageError {
    constructor(
        public readonly entityType: string,
        public readonly entityId: string,
        public readonly namespace?: string
    ) {
        super(
            `Entity not found: ${entityType}/${entityId}${namespace ? ` in ${namespace}` : ''}`,
            'ENTITY_NOT_FOUND'
        );
        this.name = 'EntityNotFoundError';
    }
}

export class SchemaNotRegisteredError extends StorageError {
    constructor(public readonly entityType: string) {
        super(
            `Schema not registered for type: ${entityType}`,
            'SCHEMA_NOT_REGISTERED'
        );
        this.name = 'SchemaNotRegisteredError';
    }
}

export class ValidationError extends StorageError {
    constructor(
        message: string,
        public readonly validationErrors: Array<{ path: string; message: string }>
    ) {
        super(message, 'VALIDATION_ERROR');
        this.name = 'ValidationError';
    }
}

export class StorageAccessError extends StorageError {
    constructor(message: string, cause?: Error) {
        super(message, 'STORAGE_ACCESS_ERROR', cause);
        this.name = 'StorageAccessError';
    }
}

export class ReadonlyStorageError extends StorageError {
    constructor() {
        super('Storage is readonly', 'READONLY_STORAGE');
        this.name = 'ReadonlyStorageError';
    }
}

export class NamespaceNotFoundError extends StorageError {
    constructor(public readonly namespace: string) {
        super(`Namespace not found: ${namespace}`, 'NAMESPACE_NOT_FOUND');
        this.name = 'NamespaceNotFoundError';
    }
}
