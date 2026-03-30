export const MOLANG_PATH_PATTERN = /(?:(?:BP|RP)\/)?molang\/[A-Za-z0-9_./-]+\.molang/gi;
export const MOLANG_PATH_EXACT_RE = /^(?:(?:BP|RP)\/)?molang\/[A-Za-z0-9_./-]+\.molang$/i;

export const isMolangFile = (filePath) =>
    typeof filePath === "string" && /\.molang$/i.test(filePath);

export const isJsonFile = (filePath) =>
    typeof filePath === "string" && /\.json$/i.test(filePath);

export const collectMolangPathsDeep = (value, found) => {
    if (typeof value === "string") {
        const matches = value.match(MOLANG_PATH_PATTERN);
        if (matches) {
            for (const match of matches) found.add(match);
        }
        return;
    }

    if (Array.isArray(value)) {
        for (const item of value) collectMolangPathsDeep(item, found);
        return;
    }

    if (value && typeof value === "object") {
        for (const child of Object.values(value)) {
            collectMolangPathsDeep(child, found);
        }
    }
};

export const inlineMolangPathsDeep = async (
    value,
    filePath,
    resolveMolangContent
) => {
    if (typeof value === "string") {
        if (!MOLANG_PATH_EXACT_RE.test(value)) return value;

        const replacement = await resolveMolangContent(value, filePath);

        if (typeof replacement !== "string") {
            console.warn(
                `[inline-molang-paths] Could not inline "${value}" in "${filePath}".`
            );
            return value;
        }

        return replacement;
    }

    if (Array.isArray(value)) {
        const out = [];
        for (const item of value) {
            out.push(await inlineMolangPathsDeep(item, filePath, resolveMolangContent));
        }
        return out;
    }

    if (value && typeof value === "object") {
        const out = {};
        for (const [key, child] of Object.entries(value)) {
            out[key] = await inlineMolangPathsDeep(child, filePath, resolveMolangContent);
        }
        return out;
    }

    return value;
};