import {
    EideProjectContext,
    EideProjectKind,
    EideToolchainInfo
} from '../core/project/EideProjectContext';
import { inferNormalizedLanguage } from '../core/project/ProjectContextToNormalizedModel';

export interface LegacyPathLike {
    readonly path?: unknown;
}

export interface LegacyToolchainLike {
    readonly name?: unknown;
    readonly categoryName?: unknown;
    readonly modelName?: unknown;
    readonly elfSuffix?: unknown;
    getToolchainDir?: () => LegacyPathLike | undefined;
}

export interface LegacyDependenceLike {
    readonly incList?: unknown;
    readonly libList?: unknown;
    readonly defineList?: unknown;
}

export interface LegacyDependenceGroupLike {
    readonly depList?: unknown;
}

export interface LegacyVirtualFileLike {
    readonly path?: unknown;
}

export interface LegacyVirtualFolderLike {
    readonly files?: unknown;
    readonly folders?: unknown;
}

export interface LegacyProjectConfigLike {
    readonly name?: unknown;
    readonly type?: unknown;
    readonly mode?: unknown;
    readonly cppPreprocessAttrs?: LegacyDependenceLike;
    readonly dependenceList?: unknown;
    readonly virtualFolder?: LegacyVirtualFolderLike;
    readonly toolchainConfig?: unknown;
    readonly deviceName?: unknown;
}

export interface LegacyProjectConfigurationLike {
    readonly config?: LegacyProjectConfigLike;
}

export interface LegacyProjectLike {
    getProjectName?: () => string;
    getProjectCurrentTargetName?: () => string;
    getProjectType?: () => string;
    getRootDir?: () => LegacyPathLike;
    getToolchain?: () => LegacyToolchainLike;
    getExecutablePath?: () => string;
    getUploaderType?: () => string;
    GetConfiguration?: () => LegacyProjectConfigurationLike;
}

interface MergedDependence {
    readonly incList: readonly string[];
    readonly libList: readonly string[];
    readonly defineList: readonly string[];
}

interface MutableMergedDependence {
    readonly incList: string[];
    readonly libList: string[];
    readonly defineList: string[];
}

export class LegacyProjectContextAdapter {
    createContext(project: LegacyProjectLike): EideProjectContext {
        const config = safeCall(() => project.GetConfiguration?.().config);
        const toolchain = safeCall(() => project.getToolchain?.());
        const rootDir = safeCall(() => project.getRootDir?.());
        const projectName = firstString(
            safeCall(() => project.getProjectName?.()),
            config?.name,
            'unknown'
        ) ?? 'unknown';
        const projectRoot = firstString(rootDir?.path, '') ?? '';
        const sourceFiles = collectVirtualSourceFiles(config?.virtualFolder);
        const dependence = mergeDependences(config);

        return {
            projectName,
            projectRoot,
            projectType: toProjectKind(firstString(safeCall(() => project.getProjectType?.()), config?.type)),
            activeTarget: firstString(safeCall(() => project.getProjectCurrentTargetName?.()), config?.mode),
            sourceFiles,
            includePaths: dependence.incList,
            defines: dependence.defineList,
            libraries: dependence.libList,
            linkerScript: getLinkerScript(config?.toolchainConfig),
            startupFile: findStartupFile(sourceFiles),
            toolchain: toToolchainInfo(toolchain),
            outputFiles: {
                executable: firstString(safeCall(() => project.getExecutablePath?.()))
            },
            flashConfig: {
                programmer: firstString(safeCall(() => project.getUploaderType?.())),
                targetName: firstString(config?.deviceName)
            }
        };
    }
}

export function createEideProjectContextFromLegacyProject(project: LegacyProjectLike): EideProjectContext {
    return new LegacyProjectContextAdapter().createContext(project);
}

function mergeDependences(config: LegacyProjectConfigLike | undefined): MergedDependence {
    const incList: string[] = [];
    const libList: string[] = [];
    const defineList: string[] = [];

    appendDependence({ incList, libList, defineList }, config?.cppPreprocessAttrs);

    if (Array.isArray(config?.dependenceList)) {
        for (const group of config.dependenceList) {
            if (!isLegacyDependenceGroup(group) || !Array.isArray(group.depList)) {
                continue;
            }

            for (const dep of group.depList) {
                appendDependence({ incList, libList, defineList }, dep);
            }
        }
    }

    return {
        incList: uniqueStrings(incList),
        libList: uniqueStrings(libList),
        defineList: uniqueStrings(defineList)
    };
}

function appendDependence(target: MutableMergedDependence, dependence: unknown): void {
    if (!isLegacyDependence(dependence)) {
        return;
    }

    target.incList.push(...toStringArray(dependence.incList));
    target.libList.push(...toStringArray(dependence.libList));
    target.defineList.push(...toStringArray(dependence.defineList));
}

function collectVirtualSourceFiles(folder: LegacyVirtualFolderLike | undefined): readonly string[] {
    if (folder === undefined) {
        return [];
    }

    const files: string[] = [];
    const stack: LegacyVirtualFolderLike[] = [folder];

    while (stack.length > 0) {
        const current = stack.pop();

        if (current === undefined) {
            continue;
        }

        if (Array.isArray(current.files)) {
            for (const file of current.files) {
                if (!isLegacyVirtualFile(file)) {
                    continue;
                }

                const path = firstString(file.path);

                if (path !== undefined && isBuildSourcePath(path)) {
                    files.push(path);
                }
            }
        }

        if (Array.isArray(current.folders)) {
            for (const child of current.folders) {
                if (isLegacyVirtualFolder(child)) {
                    stack.push(child);
                }
            }
        }
    }

    return uniqueStrings(files);
}

function toToolchainInfo(toolchain: LegacyToolchainLike | undefined): EideToolchainInfo | undefined {
    if (toolchain === undefined) {
        return undefined;
    }

    const installDirectory = firstString(safeCall(() => toolchain.getToolchainDir?.()?.path));

    return {
        name: firstString(toolchain.name),
        family: firstString(toolchain.categoryName, toolchain.modelName),
        installDirectory
    };
}

function getLinkerScript(toolchainConfig: unknown): string | undefined {
    if (!isRecord(toolchainConfig)) {
        return undefined;
    }

    return firstString(
        toolchainConfig.scatterFilePath,
        toolchainConfig.linkerScriptPath,
        toolchainConfig.linkerScript
    );
}

function findStartupFile(sourceFiles: readonly string[]): string | undefined {
    return sourceFiles.find((path) => {
        const normalizedPath = path.replace(/\\/g, '/').toLowerCase();
        const fileName = normalizedPath.substring(normalizedPath.lastIndexOf('/') + 1);
        return fileName.startsWith('startup.') && inferNormalizedLanguage(path) === 'asm';
    });
}

function isBuildSourcePath(path: string): boolean {
    const language = inferNormalizedLanguage(path);
    return language === 'c' || language === 'cpp' || language === 'asm';
}

function toProjectKind(value: string | undefined): EideProjectKind | undefined {
    switch (value) {
        case 'C51':
        case 'ARM':
        case 'RISC-V':
        case 'ANY-GCC':
        case 'MIPS':
        case 'unknown':
            return value;
        default:
            return undefined;
    }
}

function safeCall<T>(callback: () => T): T | undefined {
    try {
        return callback();
    } catch (_error: unknown) {
        return undefined;
    }
}

function firstString(...values: readonly unknown[]): string | undefined;
function firstString(...values: readonly unknown[]): string | undefined {
    for (const value of values) {
        if (typeof value === 'string' && value.trim() !== '') {
            return value;
        }
    }

    return undefined;
}

function toStringArray(value: unknown): string[] {
    if (!Array.isArray(value)) {
        return [];
    }

    return value.filter((item): item is string => typeof item === 'string' && item.trim() !== '');
}

function uniqueStrings(values: readonly string[]): string[] {
    return Array.from(new Set(values));
}

function isLegacyDependence(value: unknown): value is LegacyDependenceLike {
    return isRecord(value);
}

function isLegacyDependenceGroup(value: unknown): value is LegacyDependenceGroupLike {
    return isRecord(value);
}

function isLegacyVirtualFile(value: unknown): value is LegacyVirtualFileLike {
    return isRecord(value);
}

function isLegacyVirtualFolder(value: unknown): value is LegacyVirtualFolderLike {
    return isRecord(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null;
}
