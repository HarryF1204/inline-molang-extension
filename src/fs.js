export const normalizeNewlines = (text) =>
    String(text).replace(/\r\n?/g, "\n");

export const toSingleLine = (text) =>
    normalizeNewlines(text)
        .split("\n")
        .map((line) => line.trim())
        .filter((line) => line.length > 0)
        .join(" ");

export const coerceToText = async (value) => {
    if (typeof value === "string") return value;
    if (value == null) return undefined;

    if (typeof value.text === "function") {
        return await value.text();
    }

    if (value instanceof Uint8Array) {
        return new TextDecoder().decode(value);
    }

    if (value instanceof ArrayBuffer) {
        return new TextDecoder().decode(new Uint8Array(value));
    }

    return undefined;
};

export const readVirtualTextFile = async (fileSystem, virtualPath, normalizePath) => {
    if (!fileSystem || !virtualPath) return undefined;

    const normalized = normalizePath(virtualPath);

    try {
        if (typeof fileSystem.readFile === "function") {
            const result = await fileSystem.readFile(normalized, "utf8");
            const text = await coerceToText(result);
            if (typeof text === "string") return text;
        }
    } catch { }

    try {
        if (typeof fileSystem.getFileHandle === "function") {
            const handle = await fileSystem.getFileHandle(normalized);
            if (handle?.getFile) {
                const file = await handle.getFile();
                const text = await coerceToText(file);
                if (typeof text === "string") return text;
            }
        }
    } catch { }

    try {
        if (typeof fileSystem.get === "function") {
            const result = await fileSystem.get(normalized);
            const text = await coerceToText(result);
            if (typeof text === "string") return text;
        }
    } catch { }

    return undefined;
};