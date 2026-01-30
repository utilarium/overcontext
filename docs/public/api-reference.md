# API Reference

Complete API documentation for Overcontext.

## Core Functions

### discoverOvercontext

Discovers context directories and creates a fully configured API instance.

```typescript
import { discoverOvercontext } from '@utilarium/overcontext';

const ctx = await discoverOvercontext({
  schemas: {
    person: PersonSchema,
    term: TermSchema,
  },
  pluralNames?: {
    person: 'people',
  },
  startDir?: string,
  contextDirName?: string,
});
```

**Returns**: `ContextAPI` instance with type-safe CRUD operations.

## Context API

### create

Create a new entity.

```typescript
const entity = await ctx.create(
  type: string,
  data: Partial<EntityData>,
  options?: { namespace?: string, id?: string }
): Promise<Entity>
```

### get

Get a single entity by ID.

```typescript
const entity = await ctx.get(
  type: string,
  id: string,
  namespace?: string
): Promise<Entity | undefined>
```

### getAll

Get all entities of a type.

```typescript
const entities = await ctx.getAll(
  type: string,
  namespace?: string
): Promise<Entity[]>
```

### update

Update an existing entity.

```typescript
const updated = await ctx.update(
  type: string,
  id: string,
  data: Partial<EntityData>,
  namespace?: string
): Promise<Entity>
```

### delete

Delete an entity.

```typescript
const deleted = await ctx.delete(
  type: string,
  id: string,
  namespace?: string
): Promise<boolean>
```

### search

Search entities with advanced query options.

```typescript
const results = await ctx.search({
  type?: string | string[],
  search?: string,
  searchFields?: string[],
  limit?: number,
  sort?: Array<{ field: string; direction: 'asc' | 'desc' }>,
  namespace?: string,
}): Promise<Entity[]>
```

### quickSearch

Quick search across all types and fields.

```typescript
const results = await ctx.quickSearch(
  query: string,
  options?: { limit?: number }
): Promise<Entity[]>
```

### withNamespace

Create a namespace-bound context.

```typescript
const workCtx = ctx.withNamespace('work');
// All operations use 'work' namespace
```

## Query Builder

Build complex queries programmatically.

```typescript
import { query } from '@utilarium/overcontext';

const q = query()
  .type('person')
  .search('acme', ['company'])
  .sortBy('name', 'desc')
  .limit(10)
  .build();

const results = await ctx.search(q);
```

## Storage Providers

### createFileSystemProvider

Create a filesystem-based storage provider.

```typescript
import { createFileSystemProvider } from '@utilarium/overcontext';

const provider = await createFileSystemProvider({
  basePath: string,
  registry: SchemaRegistry,
});
```

### createMemoryProvider

Create an in-memory storage provider.

```typescript
import { createMemoryProvider } from '@utilarium/overcontext';

const provider = createMemoryProvider({
  registry: SchemaRegistry,
  initialData?: Entity[],
});
```

### createHierarchicalProvider

Create a hierarchical provider that reads from multiple levels.

```typescript
import { createHierarchicalProvider } from '@utilarium/overcontext';

const provider = await createHierarchicalProvider({
  contextRoot: ContextRoot,
  registry: SchemaRegistry,
});
```

## Schema Utilities

### BaseEntitySchema

Base schema that all entity schemas must extend.

```typescript
import { BaseEntitySchema } from '@utilarium/overcontext';

const PersonSchema = BaseEntitySchema.extend({
  type: z.literal('person'),
  // ... your fields
});
```

### createEntitySchema

Helper to create entity schemas.

```typescript
import { createEntitySchema } from '@utilarium/overcontext';

const PersonSchema = createEntitySchema('person', {
  company: z.string().optional(),
  email: z.string().email().optional(),
});
```

## CLI Builder

### createCLIBuilder

Create a CLI builder with reusable commands.

```typescript
import { createCLIBuilder } from '@utilarium/overcontext';

const cli = createCLIBuilder({ api: ContextAPI });

// Available methods:
await cli.list(options);
await cli.get(options);
await cli.create(options);
await cli.update(options);
await cli.delete(options);
```

## Namespace Utilities

### createMultiNamespaceContext

Create a context that queries across multiple namespaces.

```typescript
import { createMultiNamespaceContext } from '@utilarium/overcontext';

const multiCtx = await createMultiNamespaceContext(
  { api: ContextAPI, resolver: NamespaceResolver },
  namespaces: string[]
);

// Methods:
await multiCtx.getFromAny(type, id);
await multiCtx.getAllMerged(type);
```

### createNamespaceResolver

Create a namespace resolver.

```typescript
import { createNamespaceResolver } from '@utilarium/overcontext';

const resolver = createNamespaceResolver({
  provider: StorageProvider,
  defaultNamespace?: string,
});
```

## Types

### BaseEntity

```typescript
interface BaseEntity {
  id: string;
  name: string;
  type: string;
  notes?: string;
  createdAt?: Date;
  updatedAt?: Date;
  createdBy?: string;
  namespace?: string;
  source?: string;
}
```

### StorageProvider

```typescript
interface StorageProvider {
  name: string;
  location: string;
  registry: SchemaRegistry;
  
  initialize(): Promise<void>;
  dispose(): Promise<void>;
  isAvailable(): Promise<boolean>;
  
  get<T>(type: string, id: string, namespace?: string): Promise<T | undefined>;
  getAll<T>(type: string, namespace?: string): Promise<T[]>;
  save<T>(entity: T, namespace?: string): Promise<T>;
  delete(type: string, id: string, namespace?: string): Promise<boolean>;
}
```
