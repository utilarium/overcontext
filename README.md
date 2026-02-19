# Overcontext

> Schema-driven framework for context management

## Why Overcontext?

The world is waking up to the idea that **context is king** when interacting with Large Language Models. As Andrej Karpathy put it, "context engineering" is "the delicate art and science of filling the context window with just the right information." The industry is shifting from prompt engineering to context engineering -- and the tooling ecosystem is racing to catch up.

The current landscape is converging on a common pattern: **large collections of Markdown files**. Whether it's [CLAUDE.md](https://docs.anthropic.com/en/docs/claude-code/memory) for Claude Code, [AGENTS.md](https://github.com/agentsmd/agents.md) as an open standard under the Linux Foundation, [.cursor/rules/](https://docs.cursor.com/context/rules-for-ai) for Cursor, or [copilot-instructions.md](https://docs.github.com/en/copilot/customizing-copilot/adding-repository-custom-instructions) for GitHub Copilot -- the default answer to "how do I give my AI more context?" is always the same: write more Markdown.

Markdown is a fine starting point, but it has limits. It's unstructured, unsearchable at the entity level, hard to layer across scopes, and impossible to validate. As systems move toward more agentic interaction patterns -- where AI agents dynamically search for and compose context at runtime -- we need something more structured.

**Overcontext is a reaction to that.** It started as a strategy for managing structured context files about people, projects, and terminology to support transcription tools like [Protokoll](https://github.com/redaksjon/protokoll) and other tools under development. Protokoll transforms voice memos into organized, context-aware notes by maintaining a knowledge base of people, projects, and organizations as YAML files -- using that context to correct proper names, classify content, and route transcriptions to the right places. As Protokoll's context needs grew, it became clear that a general-purpose framework was needed: one that could not only *store* context entities but *retrieve*, *search*, *layer*, and *validate* them with the rigor that agentic systems demand.

Overcontext provides that framework. It gives you schema-validated, type-safe context entities with hierarchical discovery, namespace isolation, and a query API -- the building blocks for context engineering that goes beyond flat files.

### How Overcontext Compares

The context management landscape is broad. Here's where Overcontext fits:

| Approach | Examples | What They Do | What's Missing |
|---|---|---|---|
| **Agent instruction files** | CLAUDE.md, AGENTS.md, .cursorrules | Behavioral instructions for AI agents | No entity model, no search, no validation |
| **Codebase-to-prompt tools** | [Repomix](https://github.com/yamadashy/repomix), [files-to-prompt](https://github.com/simonw/files-to-prompt), [yek](https://github.com/mohsen1/yek) | Serialize code into LLM-friendly formats | One-shot dumps, no structured entities or queries |
| **AI memory services** | [Mem0](https://mem0.ai), [Letta](https://letta.com), [Zep](https://getzep.com) | Persistent memory via embeddings and knowledge graphs | Cloud-dependent, opaque storage, not file-based |
| **MCP servers** | [Model Context Protocol](https://modelcontextprotocol.io) | Standardized protocol for connecting AI to data sources | A transport layer, not a storage or schema framework |
| **Overcontext** | This library | Schema-validated entities with hierarchical discovery, namespaces, and search | Designed to be the structured layer *underneath* all of the above |

Overcontext isn't trying to replace Markdown instruction files or MCP -- it's the structured entity layer that those systems can build on. Your `CLAUDE.md` can reference Overcontext entities. Your MCP server can serve them. Your CLI tools can query them. The context you maintain is schema-validated, version-controllable, and yours.

---

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

### Storage Providers

- **Filesystem**: YAML files in directory structure
- **Memory**: In-memory for testing
- **Hierarchical**: Multi-level discovery with override behavior
- **Custom**: Implement your own

### Custom Filenames

Control how entity files are named on disk with a filename strategy:

```typescript
const ctx = await discoverOvercontext({
  schemas: { person: PersonSchema },
  filenameStrategy: (entity) => {
    const slug = (entity as any).slug;
    return slug ? `${entity.id.substring(0, 8)}-${slug}` : entity.id;
  },
});
```

This produces files like `d00acdc4-gerald-corson.yaml` instead of `d00acdc4-5678-9abc-def0-111111111111.yaml`. Lookups, existence checks, and deletes work transparently regardless of the filename on disk. See the [Storage Providers](./guide/storage-providers.md#custom-filename-strategy) guide for details.

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
import { query } from '@utilarium/overcontext';

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
import { createCLIBuilder } from '@utilarium/overcontext';

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
import { discoverOvercontext, BaseEntitySchema } from '@utilarium/overcontext';

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
