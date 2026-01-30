/**
 * Generate a slug from a name.
 * "John Doe" -> "john-doe"
 * "API Reference" -> "api-reference"
 */
export const slugify = (name: string): string => {
    const cleaned = name
        .toLowerCase()
        .trim()
        .replace(/[^\w\s-]/g, '')     // Remove non-word chars
        .replace(/[\s_]+/g, '-');     // Replace spaces/underscores
    
    // Single-pass algorithm to collapse hyphens and trim (avoid ReDoS)
    const result: string[] = [];
    let prevWasHyphen = false;
    let startIdx = 0;
    let endIdx = cleaned.length;
    
    // Skip leading hyphens
    while (startIdx < cleaned.length && cleaned[startIdx] === '-') {
        startIdx++;
    }
    
    // Skip trailing hyphens
    while (endIdx > startIdx && cleaned[endIdx - 1] === '-') {
        endIdx--;
    }
    
    // Build result, collapsing consecutive hyphens
    for (let i = startIdx; i < endIdx; i++) {
        const char = cleaned[i];
        if (char === '-') {
            if (!prevWasHyphen) {
                result.push('-');
                prevWasHyphen = true;
            }
        } else {
            result.push(char);
            prevWasHyphen = false;
        }
    }
    
    return result.join('');
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
