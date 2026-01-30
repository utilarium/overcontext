# Overcontext Documentation

Overcontext is a schema-driven framework for managing typed context entities.

## Getting Started

- [Defining Schemas](./defining-schemas.md) - Learn how to create entity schemas
- [Storage Providers](./storage-providers.md) - Understand storage options
- [Namespaces](./namespaces.md) - Organize context by domain
- [Building a CLI](./building-cli.md) - Create command-line tools

## Core Concepts

### Schema-Driven

Overcontext doesn't define entity types. You define your own schemas using Zod, and overcontext provides the infrastructure to work with them.

### Type-Safe

TypeScript types flow from your schema definitions through the entire API.

### Hierarchical

Context can exist at multiple directory levels, with closer context overriding distant context.

### Namespace Support

Organize entities across multiple namespaces (work, personal, project-specific, etc.).

## Quick Example

```typescript
import { z } from 'zod';
import { discoverOvercontext, BaseEntitySchema } from '@utilarium/overcontext';

// Define your schema
const PersonSchema = BaseEntitySchema.extend({
  type: z.literal('person'),
  company: z.string().optional(),
});

// Create context
const ctx = await discoverOvercontext({
  schemas: { person: PersonSchema },
  pluralNames: { person: 'people' },
});

// Use it
const person = await ctx.create('person', {
  name: 'John Doe',
  company: 'Acme Corp',
});
```

## Architecture

Overcontext consists of several layers:

1. **Schema Layer** - Zod-based schema registry
2. **Storage Layer** - Pluggable storage providers (filesystem, memory)
3. **API Layer** - Type-safe CRUD operations
4. **Discovery Layer** - Hierarchical context discovery
5. **CLI Layer** - Building blocks for command-line tools

## Use Cases

- **Personal Knowledge Management** - Store people, projects, terms
- **Project Context** - Track project-specific entities
- **Tool Integration** - Share context across multiple tools
- **Configuration Management** - Structured config with validation
