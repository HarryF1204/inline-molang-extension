export default function inlineMolangPathsPlugin(context = {}) {
    const fileSystem = context.fileSystem;
    const projectConfig = context.projectConfig ?? {};
    const projectRoot = context.projectRoot ?? "";
    const compileFiles = context.compileFiles;

    const MOLANG_PATH_PATTERN = /(?:(?:BP|RP)\/)?molang\/[A-Za-z0-9_./-]+\.molang/gi;
    const MOLANG_PATH_EXACT_RE = /^(?:(?:BP|RP)\/)?molang\/[A-Za-z0-9_./-]+\.molang$/i;

    const reverseDeps = new Map();

    const isMolangFile = (filePath) =>
        typeof filePath === "string" && /\.molang$/i.test(filePath);

    const isJsonFile = (filePath) =>
        typeof filePath === "string" && /\.json$/i.test(filePath);

    const normalizePath = (p) =>
        String(p).replace(/\\/g, "/").replace(/\/+/g, "/");

    const stripLeadingDotSlash = (p) =>
        normalizePath(p).replace(/^\.\//, "");

    const stripLeadingProjectRoot = (p) => {
        const normalizedPath = normalizePath(p);
        const normalizedRoot = normalizePath(projectRoot);

        if (!normalizedRoot || normalizedRoot === ".") return normalizedPath;
        if (normalizedPath === normalizedRoot) return "";
        if (normalizedPath.startsWith(normalizedRoot + "/")) {
            return normalizedPath.slice(normalizedRoot.length + 1);
        }

        return normalizedPath;
    };

    const normalizeNewlines = (text) =>
        String(text).replace(/\r\n?/g, "\n");

    const toSingleLine = (text) =>
        normalizeNewlines(text)
            .split("\n")
            .map((line) => line.trim())
            .filter((line) => line.length > 0)
            .join(" ");

    const behaviorPackRoot = projectConfig?.data?.packs?.behaviorPack
        ? stripLeadingProjectRoot(stripLeadingDotSlash(projectConfig.data.packs.behaviorPack))
        : null;

    const resourcePackRoot = projectConfig?.data?.packs?.resourcePack
        ? stripLeadingProjectRoot(stripLeadingDotSlash(projectConfig.data.packs.resourcePack))
        : null;

    const getPackTypeForFile = (filePath) => {
        const normalized = normalizePath(filePath);

        if (behaviorPackRoot && normalized.startsWith(behaviorPackRoot + "/")) {
            return "BP";
        }

        if (resourcePackRoot && normalized.startsWith(resourcePackRoot + "/")) {
            return "RP";
        }

        return null;
    };

    const resolveReferencePath = (refPath, fromFilePath = "") => {
        if (typeof refPath !== "string") return refPath;

        const normalizedRef = normalizePath(refPath);

        if (normalizedRef.startsWith("BP/")) {
            if (!behaviorPackRoot) return normalizedRef;
            return normalizePath(`${behaviorPackRoot}/${normalizedRef.slice(3)}`);
        }

        if (normalizedRef.startsWith("RP/")) {
            if (!resourcePackRoot) return normalizedRef;
            return normalizePath(`${resourcePackRoot}/${normalizedRef.slice(3)}`);
        }

        if (normalizedRef.startsWith("molang/")) {
            const callerPackType = getPackTypeForFile(fromFilePath);

            if (callerPackType === "BP" && behaviorPackRoot) {
                return normalizePath(`${behaviorPackRoot}/${normalizedRef}`);
            }

            if (callerPackType === "RP" && resourcePackRoot) {
                return normalizePath(`${resourcePackRoot}/${normalizedRef}`);
            }

            return normalizedRef;
        }

        return normalizedRef;
    };

    const collectMolangPathsDeep = (value, found) => {
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

    const coerceToText = async (value) => {
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

    const readVirtualTextFile = async (virtualPath) => {
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

    const resolveMolangContent = async (refPath, fromFilePath) => {
        const resolvedPath = resolveReferencePath(refPath, fromFilePath);
        const raw = await readVirtualTextFile(resolvedPath);

        if (typeof raw !== "string") {
            console.warn(
                `[inline-molang-paths] Failed to read "${refPath}" from "${fromFilePath}" -> "${resolvedPath}".`
            );
            return undefined;
        }

        return toSingleLine(raw);
    };

    const inlineMolangPathsDeep = async (value, filePath) => {
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
                out.push(await inlineMolangPathsDeep(item, filePath));
            }
            return out;
        }

        if (value && typeof value === "object") {
            const out = {};
            for (const [key, child] of Object.entries(value)) {
                out[key] = await inlineMolangPathsDeep(child, filePath);
            }
            return out;
        }

        return value;
    };

    const registerReverseDeps = (sourceFilePath, fileContent) => {
        if (!sourceFilePath || fileContent == null) return;

        const source = normalizePath(sourceFilePath);
        const found = new Set();

        if (typeof fileContent === "string") {
            const matches = fileContent.match(MOLANG_PATH_PATTERN);
            if (matches) {
                for (const match of matches) found.add(match);
            }
        } else if (typeof fileContent === "object") {
            collectMolangPathsDeep(fileContent, found);
        }

        for (const ref of found) {
            const resolved = resolveReferencePath(ref, source);
            if (!reverseDeps.has(resolved)) {
                reverseDeps.set(resolved, new Set());
            }
            reverseDeps.get(resolved).add(source);
        }
    };

    return {
        transformPath(filePath) {
            return filePath;
        },

        async read(filePath, fileHandle) {
            if (!fileHandle) return;

            if (!isMolangFile(filePath) && !isJsonFile(filePath)) return;

            const file = await fileHandle.getFile();
            return await file.text();
        },

        async load(filePath, fileContent) {
            if (fileContent == null) return;

            if (isMolangFile(filePath)) {
                return toSingleLine(fileContent);
            }

            if (isJsonFile(filePath) && typeof fileContent === "string") {
                try {
                    return JSON.parse(fileContent);
                } catch {
                    return fileContent;
                }
            }

            return fileContent;
        },

        require(filePath, fileContent) {
            if (isMolangFile(filePath) || fileContent == null) return;

            registerReverseDeps(filePath, fileContent);

            const found = new Set();

            if (typeof fileContent === "string") {
                const matches = fileContent.match(MOLANG_PATH_PATTERN);
                if (matches) {
                    for (const match of matches) found.add(match);
                }
            } else if (typeof fileContent === "object") {
                collectMolangPathsDeep(fileContent, found);
            }

            if (found.size > 0) {
                return [...found];
            }
        },

        async transform(filePath, fileContent) {
            const normalizedPath = normalizePath(filePath);

            if (isMolangFile(normalizedPath)) {
                const dependents = reverseDeps.get(normalizedPath);

                if (
                    typeof compileFiles === "function" &&
                    dependents &&
                    dependents.size > 0
                ) {
                    await compileFiles([...dependents]);
                }

                return;
            }

            if (fileContent == null) return;

            if (typeof fileContent === "object") {
                registerReverseDeps(normalizedPath, fileContent);
                return await inlineMolangPathsDeep(fileContent, normalizedPath);
            }

            return fileContent;
        },

        finalizeBuild(filePath, fileContent) {
            if (isMolangFile(filePath)) return null;

            if (isJsonFile(filePath) && fileContent && typeof fileContent === "object") {
                return JSON.stringify(fileContent, null, 2);
            }

            return fileContent;
        },
    };
}