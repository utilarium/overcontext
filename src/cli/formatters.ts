import * as yaml from 'js-yaml';
import { BaseEntity } from '../schema/base';

export type OutputFormat = 'table' | 'json' | 'yaml';

export interface FormatterOptions {
    format: OutputFormat;
    fields?: string[];
    noHeaders?: boolean;
}

/**
 * Format entities for CLI output.
 */
export const formatEntities = <T extends BaseEntity>(
    entities: T[],
    options: FormatterOptions
): string => {
    const { format, fields, noHeaders } = options;

    if (format === 'json') {
        return JSON.stringify(entities, null, 2);
    }

    if (format === 'yaml') {
        return yaml.dump(entities);
    }

    // Table format
    if (entities.length === 0) {
        return 'No entities found.';
    }

    const displayFields = fields || ['id', 'name', 'type'];
    const rows: string[][] = [];

    if (!noHeaders) {
        rows.push(displayFields.map(f => f.toUpperCase()));
    }

    for (const entity of entities) {
        const row = displayFields.map(f => {
            const value = (entity as Record<string, unknown>)[f];
            if (value === undefined || value === null) return '-';
            if (typeof value === 'object') return JSON.stringify(value);
            return String(value);
        });
        rows.push(row);
    }

    // Calculate column widths
    const widths = displayFields.map((_, i) =>
        Math.max(...rows.map(row => row[i].length))
    );

    // Format rows
    return rows
        .map(row =>
            row.map((cell, i) => cell.padEnd(widths[i])).join('  ')
        )
        .join('\n');
};

/**
 * Format a single entity for display.
 */
export const formatEntity = <T extends BaseEntity>(
    entity: T,
    options: Pick<FormatterOptions, 'format'>
): string => {
    if (options.format === 'json') {
        return JSON.stringify(entity, null, 2);
    }
    return yaml.dump(entity);
};
