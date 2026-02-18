# Storage Providers

Overcontext supports multiple storage backends through the `StorageProvider` interface.

## Filesystem Provider

Stores entities as YAML files in a directory structure.

### Basic Usage

```typescript
import { createFileSystemProvider, createSchemaRegistry } from '@utilarium/overcontext';

const registry = createSchemaRegistry();
registry.register({ type: 'person', schema: PersonSchema });

const provider = await createFileSystemProvider({
  basePath: '/path/to/context',
  registry,
});

await provider.initialize();
```

### Directory Structure

```
context/
├── people/
│   ├── john-doe.yaml
│   └── jane-smith.yaml
└── terms/
    └── api.yaml
```

### Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `basePath` | `string` | *(required)* | Root directory for context storage |
| `registry` | `SchemaRegistry` | *(required)* | Schema registry for validation |
| `createIfMissing` | `boolean` | `true` | Create directories that don't exist |
| `extension` | `'.yaml' \| '.yml'` | `'.yaml'` | File extension for entity files |
| `readonly` | `boolean` | `false` | Prevent write operations |
| `defaultNamespace` | `string` | `undefined` | Default namespace for operations |
| `filenameStrategy` | `(entity) => string` | `undefined` | Custom filename generation |

### With Namespaces

```
context/
├── work/
│   └── people/
│       └── colleague.yaml
└── personal/
    └── people/
        └── friend.yaml
```

### Custom Filename Strategy

By default, overcontext uses the entity `id` as the filename (e.g., `john-doe.yaml`). The `filenameStrategy` option lets you generate custom filenames from any combination of entity fields.

The function receives the full entity and returns the filename stem (without extension):

```typescript
const provider = await createFileSystemProvider({
  basePath: '/path/to/context',
  registry,
  filenameStrategy: (entity) => {
    const slug = (entity as any).slug;
    if (slug) {
      return `${entity.id.substring(0, 8)}-${slug}`;
    }
    return entity.id;
  },
});
```

This produces filenames like `d00acdc4-gerald-corson.yaml` instead of the full UUID.

```
context/
└── people/
    ├── d00acdc4-gerald-corson.yaml
    └── a1b2c3d4-jane-smith.yaml
```

#### How Lookups Work

When a `filenameStrategy` is set, the provider can no longer assume that the file for entity `abc123` is named `abc123.yaml`. Instead, it uses a two-step lookup:

1. **Direct match**: Tries `{id}{extension}` first (handles pre-migration files).
2. **Prefix scan**: If not found, scans the directory for files starting with the first 8 characters of the ID, then verifies the `id` field inside the matching file.

This means reads, existence checks, and deletes all work transparently regardless of the filename on disk.

#### File Migration on Save

When an entity is saved and the strategy produces a filename different from the existing file on disk (e.g., a slug changed, or the entity was originally saved without a strategy), the old file is automatically removed. This provides seamless migration when adopting or changing a strategy.

#### Use with discoverOvercontext

The strategy can be passed directly to `discoverOvercontext` and it flows through to all underlying filesystem providers:

```typescript
const ctx = await discoverOvercontext({
  schemas: { person: PersonSchema },
  pluralNames: { person: 'people' },
  filenameStrategy: (entity) => {
    const slug = (entity as any).slug;
    return slug ? `${entity.id.substring(0, 8)}-${slug}` : entity.id;
  },
});
```

## Memory Provider

In-memory storage for testing and temporary data.

```typescript
import { createMemoryProvider } from '@utilarium/overcontext';

const provider = createMemoryProvider({
  registry,
  initialData: [
    { id: 'test', name: 'Test', type: 'person' },
  ],
});
```

## Hierarchical Provider

Reads from multiple context directories, writes to the closest.

```typescript
import { discoverContextRoot, createHierarchicalProvider } from '@utilarium/overcontext';

const contextRoot = await discoverContextRoot({
  startDir: process.cwd(),
  contextDirName: 'context',
});

const provider = await createHierarchicalProvider({
  contextRoot,
  registry,
});
```

The hierarchical provider also accepts a `filenameStrategy` option, which is passed through to every underlying filesystem provider:

```typescript
const provider = await createHierarchicalProvider({
  contextRoot,
  registry,
  filenameStrategy: (entity) => `${entity.id.substring(0, 8)}-${(entity as any).slug}`,
});
```

### How It Works

```
/workspace/context/        # Distant context
/workspace/project/context/  # Closest context (wins on conflicts)
```

- Reads search all levels
- Writes go to closest level
- Closer entities override distant ones with same ID

## Observable Providers

Wrap any provider to emit events:

```typescript
import { createObservableProvider } from '@utilarium/overcontext';

const observable = createObservableProvider(provider);

observable.subscribe(event => {
  if (event.type === 'entity:created') {
    console.log('Created:', event.entityId);
  }
});
```

## Custom Providers

Implement the `StorageProvider` interface:

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
  // ... more methods
}
```
