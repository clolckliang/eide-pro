export type NormalizedToolchainFamily =
    | 'armcc'
    | 'armclang'
    | 'gcc'
    | 'iar'
    | 'sdcc'
    | 'cosmic'
    | 'llvm'
    | 'unknown';

export type NormalizedLanguage = 'c' | 'cpp' | 'asm' | 'linker' | 'unknown';

export type MigrationDiagnosticLevel =
    | 'success'
    | 'partial'
    | 'warning'
    | 'error'
    | 'manual-review'
    | 'unsupported';

export interface MigrationDiagnostic {
    readonly level: MigrationDiagnosticLevel;
    readonly code: string;
    readonly message: string;
    readonly source?: string;
}

export interface NormalizedSourceFile {
    readonly path: string;
    readonly language?: NormalizedLanguage;
    readonly includePaths?: readonly string[];
    readonly defines?: readonly string[];
    readonly flags?: readonly string[];
    readonly excluded?: boolean;
}

export interface NormalizedTarget {
    readonly name: string;
    readonly sourceFiles: readonly NormalizedSourceFile[];
    readonly includePaths: readonly string[];
    readonly defines: readonly string[];
    readonly libraries: readonly string[];
    readonly linkerScript?: string;
    readonly startupFile?: string;
    readonly cFlags: readonly string[];
    readonly cppFlags: readonly string[];
    readonly asmFlags: readonly string[];
    readonly linkerFlags: readonly string[];
}

export interface NormalizedProjectModel {
    readonly name: string;
    readonly root: string;
    readonly toolchainFamily?: NormalizedToolchainFamily;
    readonly targets: readonly NormalizedTarget[];
    readonly diagnostics: readonly MigrationDiagnostic[];
}
