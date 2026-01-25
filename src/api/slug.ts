/**
 * Generate a slug from a name.
 * "John Doe" -> "john-doe"
 * "API Reference" -> "api-reference"
 */
export const slugify = (name: string): string => {
    return name
        .toLowerCase()
        .trim()
        .replace(/[^\w\s-]/g, '')     // Remove non-word chars
        .replace(/[\s_]+/g, '-')       // Replace spaces/underscores
        .replace(/-+/g, '-')           // Collapse hyphens
        .replace(/^-+|-+$/g, '');      // Trim leading/trailing
};

/**
 * Generate a unique ID, appending a number if needed.
 */
export const generateUniqueId = async (
    baseName: string,
    exists: (id: string) => Promise<boolean>
): Promise<string> => {
    const baseId = slugify(baseName);

    if (!await exists(baseId)) {
        return baseId;
    }

    // Try appending numbers
    for (let i = 2; i <= 100; i++) {
        const candidateId = `${baseId}-${i}`;
        if (!await exists(candidateId)) {
            return candidateId;
        }
    }

    // Fallback to timestamp
    return `${baseId}-${Date.now()}`;
};
