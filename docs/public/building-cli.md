# Building a CLI

Overcontext provides building blocks for creating command-line tools.

## CLI Builder

The `createCLIBuilder` function provides reusable command handlers:

```typescript
import { createCLIBuilder, discoverOvercontext } from '@utilarium/overcontext';

const api = await discoverOvercontext({
  schemas: { person: PersonSchema },
  pluralNames: { person: 'people' },
});

const cli = createCLIBuilder({ api });

// Use the commands
const output = await cli.list({ type: 'person' });
console.log(output);
```

## Available Commands

### List

```typescript
await cli.list({
  type: 'person',
  search: 'john',
  limit: 10,
  fields: ['id', 'name', 'company'],
  format: 'table',
  namespace: 'work',
});
```

### Get

```typescript
await cli.get({
  type: 'person',
  id: 'john-doe',
  format: 'yaml',
});
```

### Create

```typescript
await cli.create({
  type: 'person',
  name: 'New Person',
  data: { company: 'Acme' },
  id: 'custom-id',  // Optional
  namespace: 'work',
});
```

### Update

```typescript
await cli.update({
  type: 'person',
  id: 'john-doe',
  data: { company: 'NewCo' },
});
```

### Delete

```typescript
await cli.delete({
  type: 'person',
  id: 'john-doe',
});
```

## Output Formats

### Table (default)

```
ID         NAME       COMPANY
john-doe   John Doe   Acme
jane-doe   Jane Doe   TechCorp
```

### JSON

```json
[
  {
    "id": "john-doe",
    "name": "John Doe",
    "type": "person",
    "company": "Acme"
  }
]
```

### YAML

```yaml
- id: john-doe
  name: John Doe
  type: person
  company: Acme
```

## Integration with Commander.js

```typescript
import { Command } from 'commander';
import { discoverOvercontext, createCLIBuilder } from '@utilarium/overcontext';

async function main() {
  const api = await discoverOvercontext({
    schemas: { person: PersonSchema },
    pluralNames: { person: 'people' },
  });
  
  const cli = createCLIBuilder({ api });
  
  const program = new Command()
    .name('mycontext')
    .description('Manage my context');
  
  // List command
  program
    .command('list <type>')
    .option('-s, --search <query>', 'Search query')
    .option('--json', 'Output as JSON')
    .option('-n, --namespace <ns>', 'Namespace')
    .action(async (type, opts) => {
      const output = await cli.list({
        type,
        search: opts.search,
        format: opts.json ? 'json' : 'table',
        namespace: opts.namespace,
      });
      console.log(output);
    });
  
  // Get command
  program
    .command('get <type> <id>')
    .option('--json', 'Output as JSON')
    .action(async (type, id, opts) => {
      try {
        const output = await cli.get({
          type,
          id,
          format: opts.json ? 'json' : 'yaml',
        });
        console.log(output);
      } catch (error) {
        console.error(error.message);
        process.exit(1);
      }
    });
  
  // Add command
  program
    .command('add <type> <name>')
    .option('--company <company>', 'Company name')
    .action(async (type, name, opts) => {
      const output = await cli.create({
        type,
        name,
        data: { company: opts.company },
      });
      console.log(output);
    });
  
  program.parse();
}

main().catch(console.error);
```

## Custom Formatters

Build your own formatters:

```typescript
import { formatEntities, formatEntity } from '@utilarium/overcontext';

// Custom table format
const output = formatEntities(entities, {
  format: 'table',
  fields: ['id', 'name', 'customField'],
  noHeaders: false,
});

// Single entity
const single = formatEntity(entity, { format: 'json' });
```

## Low-Level Commands

Use command functions directly:

```typescript
import {
  listCommand,
  getCommand,
  createCommand,
  updateCommand,
  deleteCommand,
} from '@utilarium/overcontext';

const ctx = {
  api,
  outputFormat: 'table',
  namespace: 'work',
};

const output = await listCommand(ctx, {
  type: 'person',
  search: 'john',
});
```
