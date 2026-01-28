# Overcontext

> Schema-driven framework for context management

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
npm install @theunwalked/overcontext zod
```

## Quick Start

```typescript
import { z } from 'zod';
import { discoverOvercontext, BaseEntitySchema } from '@theunwalked/overcontext';

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

### Storage Providers

- **Filesystem**: YAML files in directory structure
- **Memory**: In-memory for testing
- **Hierarchical**: Multi-level discovery with override behavior
- **Custom**: Implement your own

## API Overview

### CRUD Operations

```typescript
// Create
const entity = await ctx.create('person', {
  name: 'John Doe',
  company: 'Acme',
});

// Read
const person = await ctx.get('person', 'john-doe');
const allPeople = await ctx.getAll('person');

// Update
await ctx.update('person', 'john-doe', {
  company: 'NewCo',
});

// Delete
await ctx.delete('person', 'john-doe');
```

### Search and Query

```typescript
// Simple search
const results = await ctx.quickSearch('john');

// Advanced query
const results = await ctx.search({
  type: ['person', 'term'],
  search: 'api',
  searchFields: ['company', 'expansion'],
  limit: 20,
  sort: [{ field: 'name', direction: 'asc' }],
});

// Query builder
import { query } from '@theunwalked/overcontext';

const q = query()
  .type('person')
  .search('acme', ['company'])
  .sortBy('name', 'desc')
  .limit(10)
  .build();

const results = await ctx.search(q);
```

### CLI Building

```typescript
import { createCLIBuilder } from '@theunwalked/overcontext';

const cli = createCLIBuilder({ api: ctx });

// List entities
const output = await cli.list({
  type: 'person',
  format: 'table',
});
console.log(output);

// Get entity
const entity = await cli.get({
  type: 'person',
  id: 'john-doe',
  format: 'yaml',
});
```

## Documentation

- [Defining Schemas](./guide/defining-schemas.md)
- [Storage Providers](./guide/storage-providers.md)
- [Namespaces](./guide/namespaces.md)
- [Building a CLI](./guide/building-cli.md)

Full documentation: [https://utilarium.github.io/overcontext/](https://utilarium.github.io/overcontext/)

## Example: Personal Knowledge Management

```typescript
import { z } from 'zod';
import { discoverOvercontext, BaseEntitySchema } from '@theunwalked/overcontext';

// Define your domain
const PersonSchema = BaseEntitySchema.extend({
  type: z.literal('person'),
  company: z.string().optional(),
  role: z.string().optional(),
  email: z.string().email().optional(),
});

const ProjectSchema = BaseEntitySchema.extend({
  type: z.literal('project'),
  status: z.enum(['active', 'completed', 'archived']),
  owner: z.string().optional(),
  repository: z.string().url().optional(),
});

const TermSchema = BaseEntitySchema.extend({
  type: z.literal('term'),
  expansion: z.string(),
  category: z.string().optional(),
});

// Create context
const ctx = await discoverOvercontext({
  schemas: {
    person: PersonSchema,
    project: ProjectSchema,
    term: TermSchema,
  },
  pluralNames: {
    person: 'people',
  },
});

// Use it
await ctx.create('person', {
  name: 'Alice Johnson',
  company: 'Acme Corp',
  role: 'Engineering Manager',
  email: 'alice@acme.com',
});

await ctx.create('project', {
  name: 'Overcontext',
  status: 'active',
  owner: 'alice-johnson',
  repository: 'https://github.com/utilarium/overcontext',
});

await ctx.create('term', {
  name: 'API',
  expansion: 'Application Programming Interface',
  category: 'technology',
});

// Search across types
const results = await ctx.search({
  search: 'acme',
  searchFields: ['company', 'owner'],
});
```

## Requirements

- Node.js >= 24.0.0
- TypeScript >= 5.0.0 (for type safety)

## License

Apache-2.0 © Tim O'Brien
TEST
