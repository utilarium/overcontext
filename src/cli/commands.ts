import { SchemaMap } from '../schema/registry';
import { OvercontextAPI } from '../api/context';
import { formatEntities, formatEntity, OutputFormat } from './formatters';

export interface CommandContext<TSchemas extends SchemaMap = SchemaMap> {
    api: OvercontextAPI<TSchemas>;
    outputFormat: OutputFormat;
    namespace?: string;
}

export interface ListCommandOptions {
    type: string;
    search?: string;
    limit?: number;
    fields?: string[];
}

/**
 * Build a list command handler.
 */
export const listCommand = async <TSchemas extends SchemaMap>(
    ctx: CommandContext<TSchemas>,
    options: ListCommandOptions
): Promise<string> => {
    const result = await ctx.api.search({
        type: options.type,
        namespace: ctx.namespace,
        search: options.search,
        limit: options.limit || 20,
    });

    return formatEntities(result.items, {
        format: ctx.outputFormat,
        fields: options.fields,
    });
};

export interface GetCommandOptions {
    type: string;
    id: string;
}

/**
 * Build a get command handler.
 */
export const getCommand = async <TSchemas extends SchemaMap>(
    ctx: CommandContext<TSchemas>,
    options: GetCommandOptions
): Promise<string> => {
    const entity = await ctx.api.get(options.type as keyof TSchemas & string, options.id, ctx.namespace);

    if (!entity) {
        throw new Error(`Entity not found: ${options.type}/${options.id}`);
    }

    return formatEntity(entity, { format: ctx.outputFormat });
};

export interface CreateCommandOptions {
    type: string;
    name: string;
    data?: Record<string, unknown>;
    id?: string;
}

/**
 * Build a create command handler.
 */
export const createCommand = async <TSchemas extends SchemaMap>(
    ctx: CommandContext<TSchemas>,
    options: CreateCommandOptions
): Promise<string> => {
    const entity = await ctx.api.create(
        options.type as keyof TSchemas & string,
        { name: options.name, ...options.data } as any,
        { id: options.id, namespace: ctx.namespace }
    );

    return `Created ${options.type}: ${entity.id}`;
};

export interface UpdateCommandOptions {
    type: string;
    id: string;
    data: Record<string, unknown>;
}

/**
 * Build an update command handler.
 */
export const updateCommand = async <TSchemas extends SchemaMap>(
    ctx: CommandContext<TSchemas>,
    options: UpdateCommandOptions
): Promise<string> => {
    await ctx.api.update(
        options.type as keyof TSchemas & string,
        options.id,
        options.data as any,
        ctx.namespace
    );

    return `Updated ${options.type}: ${options.id}`;
};

export interface DeleteCommandOptions {
    type: string;
    id: string;
}

/**
 * Build a delete command handler.
 */
export const deleteCommand = async <TSchemas extends SchemaMap>(
    ctx: CommandContext<TSchemas>,
    options: DeleteCommandOptions
): Promise<string> => {
    const deleted = await ctx.api.delete(options.type, options.id, ctx.namespace);

    if (!deleted) {
        throw new Error(`Entity not found: ${options.type}/${options.id}`);
    }

    return `Deleted ${options.type}: ${options.id}`;
};
