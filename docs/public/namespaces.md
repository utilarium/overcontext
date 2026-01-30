# Namespaces

Namespaces allow organizing context by domain, project, or any other grouping.

## Basic Usage

```typescript
// Create in a namespace
await ctx.create('person', {
  name: 'Work Colleague',
}, { namespace: 'work' });

// Read from a namespace
const person = await ctx.get('person', 'work-colleague', 'work');
```

## Namespace Context

Create a context bound to a namespace:

```typescript
const workCtx = ctx.withNamespace('work');

// All operations use 'work' namespace
await workCtx.create('person', { name: 'Colleague' });
const people = await workCtx.getAll('person');
```

## Multi-Namespace Context

Query across multiple namespaces:

```typescript
import { createMultiNamespaceContext, createNamespaceResolver } from '@utilarium/overcontext';

const resolver = createNamespaceResolver({
  provider,
  defaultNamespace: 'default',
});

const multiCtx = await createMultiNamespaceContext(
  { api: ctx, resolver },
  ['work', 'shared', 'personal']
);

// Get from any namespace (priority order)
const result = await multiCtx.getFromAny('person', 'john-doe');
console.log(result.namespace); // Which namespace it came from

// Merge all namespaces (higher priority wins on ID collision)
const allPeople = await multiCtx.getAllMerged('person');
```

## Priority Resolution

When multiple namespaces are specified, earlier = higher priority:

```typescript
// 'work' has highest priority, then 'shared', then 'personal'
const ctx = await createMultiNamespaceContext(
  { api, resolver },
  ['work', 'shared', 'personal']
);
```

If `john-doe` exists in both `work` and `shared`, the `work` version is returned.

## Namespace Configuration

Register namespace metadata:

```typescript
resolver.register({
  id: 'work',
  name: 'Work Context',
  description: 'Work-related entities',
  consumers: ['work-cli', 'project-tool'],
  active: true,
});
```

## Directory Structure

```
context/
├── work/
│   ├── people/
│   │   └── colleague.yaml
│   └── terms/
│       └── jargon.yaml
├── personal/
│   └── people/
│       └── friend.yaml
└── shared/
    └── people/
        └── shared-contact.yaml
```

## Use Cases

### Project + Workspace

```typescript
// Project-specific context
const projectCtx = ctx.withNamespace('project-x');

// Workspace-wide context
const workspaceCtx = ctx.withNamespace('workspace');

// Search both
const multiCtx = await createMultiNamespaceContext(
  { api: ctx, resolver },
  ['project-x', 'workspace']
);
```

### Public + Private

```typescript
// Public entities (shared with team)
await ctx.create('term', { name: 'API' }, { namespace: 'public' });

// Private entities (personal notes)
await ctx.create('term', { name: 'Personal Note' }, { namespace: 'private' });
```
