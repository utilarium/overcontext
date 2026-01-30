# Defining Schemas

## Base Entity

All entities must satisfy the base contract:

```typescript
interface BaseEntity {
  id: string;      // Unique identifier
  name: string;    // Display name
  type: string;    // Entity type
  notes?: string;  // Optional notes
  
  // Metadata (managed by overcontext)
  createdAt?: Date;
  updatedAt?: Date;
  createdBy?: string;
  namespace?: string;
  source?: string;
}
```

## Creating a Schema

Use `BaseEntitySchema.extend()`:

```typescript
import { z } from 'zod';
import { BaseEntitySchema } from '@utilarium/overcontext';

const PersonSchema = BaseEntitySchema.extend({
  type: z.literal('person'),  // MUST be a literal
  
  // Add your fields
  firstName: z.string().optional(),
  lastName: z.string().optional(),
  company: z.string().optional(),
  email: z.string().email().optional(),
  sounds_like: z.array(z.string()).optional(),
});

// TypeScript type is inferred
type Person = z.infer<typeof PersonSchema>;
```

## Registering Schemas

Pass schemas when creating context:

```typescript
const ctx = await discoverOvercontext({
  schemas: {
    person: PersonSchema,
    term: TermSchema,
    project: ProjectSchema,
  },
  pluralNames: {
    person: 'people',  // Optional: custom directory name
  },
});
```

## Directory Mapping

By default, type names are pluralized for directories:
- `person` → `persons/`
- `term` → `terms/`
- `company` → `companies/`

Use `pluralNames` to customize:
- `{ person: 'people' }` → `people/`

## Type Safety

Types flow from schema registration:

```typescript
// ✓ Correct: 'company' is valid for person
await ctx.create('person', { name: 'John', company: 'Acme' });

// ✗ Error: 'expansion' is not valid for person
await ctx.create('person', { name: 'John', expansion: 'test' });
```

## Validation

Schemas are validated on:
- Entity creation
- Entity updates
- Loading from storage

Invalid entities are rejected with detailed error messages.

## Helper: createEntitySchema

For convenience, use the helper:

```typescript
import { createEntitySchema } from '@utilarium/overcontext';

const PersonSchema = createEntitySchema('person', {
  company: z.string().optional(),
  email: z.string().email().optional(),
});
```

This automatically:
- Sets `type: z.literal('person')`
- Extends `BaseEntitySchema`
- Provides proper type inference
