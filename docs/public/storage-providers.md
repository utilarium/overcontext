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
