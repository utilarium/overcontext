# Getting Started

Overcontext provides infrastructure for defining and managing custom entity schemas. Unlike a library with predefined types, overcontext lets you define your own entity schemas using Zod and provides the storage, validation, discovery, and CLI building blocks to work with them.

## Features

- **Schema-Driven**: Register any Zod schema, get type-safe CRUD operations
- **Storage Agnostic**: Filesystem and in-memory providers included
- **Hierarchical Discovery**: Walk directory trees to find context at multiple levels
- **Namespace Support**: Organize entities across multiple namespaces
- **CLI Framework**: Reusable command builders for creating CLIs
- **Type-Safe**: Full TypeScript type inference from schemas
- **Observable**: Event-driven patterns with storage events

## Installation

```bash
npm install @utilarium/overcontext zod
```

## Quick Start

```typescript
import { z } from 'zod';
import { discoverOvercontext, BaseEntitySchema } from '@utilarium/overcontext';

// Define your schemas
const PersonSchema = BaseEntitySchema.extend({
  type: z.literal('person'),
  company: z.string().optional(),
  email: z.string().email().optional(),
});

const TermSchema = BaseEntitySchema.extend({
  type: z.literal('term'),
  expansion: z.string().optional(),
});

// Discover context directories and create API
const ctx = await discoverOvercontext({
  schemas: {
    person: PersonSchema,
    term: TermSchema,
  },
  pluralNames: {
    person: 'people',  // Optional: custom directory names
  },
});

// Type-safe operations
const person = await ctx.create('person', {
  name: 'John Doe',
  company: 'Acme Corp',
  email: 'john@acme.com',
});

// Search and query
const results = await ctx.search({
  type: 'person',
  search: 'acme',
  searchFields: ['company'],
});

// Get all entities
const allPeople = await ctx.getAll('person');
```

## Core Concepts

### Schema-Driven Architecture

You define entity types using Zod schemas. Overcontext provides the infrastructure:

```typescript
// You define the schema
const ProjectSchema = BaseEntitySchema.extend({
  type: z.literal('project'),
  status: z.enum(['active', 'completed', 'archived']),
  owner: z.string(),
});

// Overcontext handles storage, validation, and operations
const ctx = await discoverOvercontext({
  schemas: { project: ProjectSchema },
});
```

### Hierarchical Context

Context can exist at multiple directory levels. Closer context overrides distant:

```
/workspace/context/          # Workspace-wide entities
/workspace/project/context/  # Project-specific (overrides workspace)
```

```typescript
// Automatically discovers and merges context from multiple levels
const ctx = await discoverOvercontext({
  schemas: { person: PersonSchema },
  startDir: process.cwd(),  // Starts here, walks up
});
```

### Namespaces

Organize entities by domain:

```typescript
// Work-related entities
await ctx.create('person', { name: 'Colleague' }, { namespace: 'work' });

// Personal entities
await ctx.create('person', { name: 'Friend' }, { namespace: 'personal' });

// Query specific namespace
const workPeople = await ctx.getAll('person', 'work');
```

## Requirements

- Node.js >= 24.0.0
- TypeScript >= 5.0.0 (for type safety)

## Next Steps

- Learn about [Defining Schemas](./defining-schemas.md)
- Explore [Storage Providers](./storage-providers.md)
- Understand [Namespaces](./namespaces.md)
- Build a [CLI](./building-cli.md)
