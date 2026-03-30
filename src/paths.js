export const normalizePath = (p) =>
    String(p).replace(/\\/g, "/").replace(/\/+/g, "/");

export const stripLeadingDotSlash = (p) =>
    normalizePath(p).replace(/^\.\//, "");

export const stripLeadingProjectRoot = (p, projectRoot) => {
    const normalizedPath = normalizePath(p);
    const normalizedRoot = normalizePath(projectRoot);

    if (!normalizedRoot || normalizedRoot === ".") return normalizedPath;
    if (normalizedPath === normalizedRoot) return "";
    if (normalizedPath.startsWith(normalizedRoot + "/")) {
        return normalizedPath.slice(normalizedRoot.length + 1);
    }

    return normalizedPath;
};

export const getPackRoots = (
    projectConfig,
    projectRoot,
    stripDotSlash = stripLeadingDotSlash,
    stripProjectRoot = stripLeadingProjectRoot
) => {
    const behaviorPackRoot = projectConfig?.data?.packs?.behaviorPack
        ? stripProjectRoot(
            stripDotSlash(projectConfig.data.packs.behaviorPack),
            projectRoot
        )
        : null;

    const resourcePackRoot = projectConfig?.data?.packs?.resourcePack
        ? stripProjectRoot(
            stripDotSlash(projectConfig.data.packs.resourcePack),
            projectRoot
        )
        : null;

    return { behaviorPackRoot, resourcePackRoot };
};

export const getPackTypeForFile = (filePath, { behaviorPackRoot, resourcePackRoot }) => {
    const normalized = normalizePath(filePath);

    if (behaviorPackRoot && normalized.startsWith(behaviorPackRoot + "/")) {
        return "BP";
    }

    if (resourcePackRoot && normalized.startsWith(resourcePackRoot + "/")) {
        return "RP";
    }

    return null;
};

export const resolveReferencePath = (
    refPath,
    fromFilePath = "",
    { behaviorPackRoot, resourcePackRoot, normalizePath: normalize = normalizePath }
) => {
    if (typeof refPath !== "string") return refPath;

    const normalizedRef = normalize(refPath);

    if (normalizedRef.startsWith("BP/")) {
        if (!behaviorPackRoot) return normalizedRef;
        return normalize(`${behaviorPackRoot}/${normalizedRef.slice(3)}`);
    }

    if (normalizedRef.startsWith("RP/")) {
        if (!resourcePackRoot) return normalizedRef;
        return normalize(`${resourcePackRoot}/${normalizedRef.slice(3)}`);
    }

    if (normalizedRef.startsWith("molang/")) {
        const callerPackType = getPackTypeForFile(fromFilePath, {
            behaviorPackRoot,
            resourcePackRoot,
        });

        if (callerPackType === "BP" && behaviorPackRoot) {
            return normalize(`${behaviorPackRoot}/${normalizedRef}`);
        }

        if (callerPackType === "RP" && resourcePackRoot) {
            return normalize(`${resourcePackRoot}/${normalizedRef}`);
        }

        return normalizedRef;
    }

    return normalizedRef;
};