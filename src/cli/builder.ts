import { SchemaMap } from '../schema/registry';
import { OvercontextAPI } from '../api/context';
import {
    CommandContext,
    listCommand,
    getCommand,
    createCommand,
    updateCommand,
    deleteCommand,
} from './commands';
import { OutputFormat } from './formatters';

export interface CLIBuilderOptions<TSchemas extends SchemaMap> {
    api: OvercontextAPI<TSchemas>;
    defaultFormat?: OutputFormat;
}

/**
 * CLI builder for consumers to create their own CLIs.
 * 
 * @example
 * const cli = createCLIBuilder({ api });
 * 
 * // In your CLI tool:
 * const result = await cli.list({ type: 'person' });
 * console.log(result);
 */
export const createCLIBuilder = <TSchemas extends SchemaMap>(
    options: CLIBuilderOptions<TSchemas>
) => {
    const { api, defaultFormat = 'table' } = options;

    const createContext = (
        format?: OutputFormat,
        namespace?: string
    ): CommandContext<TSchemas> => ({
        api,
        outputFormat: format || defaultFormat,
        namespace,
    });

    return {
        /**
         * List entities.
         */
        list: (opts: {
            type: string;
            search?: string;
            limit?: number;
            fields?: string[];
            format?: OutputFormat;
            namespace?: string;
        }) => listCommand(createContext(opts.format, opts.namespace), opts),

        /**
         * Get a single entity.
         */
        get: (opts: {
            type: string;
            id: string;
            format?: OutputFormat;
            namespace?: string;
        }) => getCommand(createContext(opts.format, opts.namespace), opts),

        /**
         * Create an entity.
         */
        create: (opts: {
            type: string;
            name: string;
            data?: Record<string, unknown>;
            id?: string;
            format?: OutputFormat;
            namespace?: string;
        }) => createCommand(createContext(opts.format, opts.namespace), opts),

        /**
         * Update an entity.
         */
        update: (opts: {
            type: string;
            id: string;
            data: Record<string, unknown>;
            format?: OutputFormat;
            namespace?: string;
        }) => updateCommand(createContext(opts.format, opts.namespace), opts),

        /**
         * Delete an entity.
         */
        delete: (opts: {
            type: string;
            id: string;
            format?: OutputFormat;
            namespace?: string;
        }) => deleteCommand(createContext(opts.format, opts.namespace), opts),

        /**
         * List available entity types.
         */
        types: () => api.types(),
    };
};

export type CLIBuilder<TSchemas extends SchemaMap> = ReturnType<
    typeof createCLIBuilder<TSchemas>
>;
