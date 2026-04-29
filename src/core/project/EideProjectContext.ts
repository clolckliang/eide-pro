export type EideProjectKind = 'C51' | 'ARM' | 'RISC-V' | 'ANY-GCC' | 'MIPS' | 'unknown';

export interface EideToolchainInfo {
    readonly name?: string;
    readonly family?: string;
    readonly version?: string;
    readonly installDirectory?: string;
    readonly executablePrefix?: string;
}

export interface EideOutputFiles {
    readonly executable?: string;
    readonly elf?: string;
    readonly hex?: string;
    readonly bin?: string;
    readonly map?: string;
}

export interface EideFlashConfig {
    readonly programmer?: string;
    readonly configFile?: string;
    readonly targetName?: string;
}

export interface EideDebugConfig {
    readonly backendId?: string;
    readonly executable?: string;
    readonly gdbPath?: string;
    readonly serverType?: string;
    readonly svdPath?: string;
}

export interface EideProjectContext {
    readonly projectName: string;
    readonly projectRoot: string;
    readonly workspaceFile?: string;
    readonly projectType?: EideProjectKind;
    readonly activeTarget?: string;
    readonly sourceFiles: readonly string[];
    readonly includePaths: readonly string[];
    readonly defines: readonly string[];
    readonly libraries: readonly string[];
    readonly linkerScript?: string;
    readonly startupFile?: string;
    readonly toolchain?: EideToolchainInfo;
    readonly outputFiles?: EideOutputFiles;
    readonly flashConfig?: EideFlashConfig;
    readonly debugConfig?: EideDebugConfig;
}
