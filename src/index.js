import {
    MOLANG_PATH_PATTERN,
    isMolangFile,
    isJsonFile,
    collectMolangPathsDeep,
    inlineMolangPathsDeep,
} from "./molang.js";

import {
    normalizePath,
    stripLeadingDotSlash,
    stripLeadingProjectRoot,
    resolveReferencePath,
    getPackRoots,
} from "./paths.js";

import {
    readVirtualTextFile,
    toSingleLine,
} from "./fs.js";

export default function inlineMolangPathsPlugin(context = {}) {
    const fileSystem = context.fileSystem;
    const projectConfig = context.projectConfig ?? {};
    const projectRoot = context.projectRoot ?? "";
    const compileFiles = context.compileFiles;

    const { behaviorPackRoot, resourcePackRoot } = getPackRoots(
        projectConfig,
        projectRoot,
        stripLeadingDotSlash,
        stripLeadingProjectRoot
    );

    const reverseDeps = new Map();

    const resolvePath = (refPath, fromFilePath = "") =>
        resolveReferencePath(refPath, fromFilePath, {
            behaviorPackRoot,
            resourcePackRoot,
            normalizePath,
        });

    const resolveMolangContent = async (refPath, fromFilePath) => {
        const resolvedPath = resolvePath(refPath, fromFilePath);
        const raw = await readVirtualTextFile(fileSystem, resolvedPath, normalizePath);

        if (typeof raw !== "string") {
            console.warn(
                `[inline-molang-paths] Failed to read "${refPath}" from "${fromFilePath}" -> "${resolvedPath}".`
            );
            return undefined;
        }

        return toSingleLine(raw);
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
            const resolved = resolvePath(ref, source);
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

                return await inlineMolangPathsDeep(
                    fileContent,
                    normalizedPath,
                    resolveMolangContent
                );
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