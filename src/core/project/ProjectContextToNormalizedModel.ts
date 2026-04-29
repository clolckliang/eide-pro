import { EideProjectContext } from './EideProjectContext';
import {
    MigrationDiagnostic,
    NormalizedLanguage,
    NormalizedProjectModel,
    NormalizedSourceFile,
    NormalizedToolchainFamily
} from './NormalizedProjectModel';

export function projectContextToNormalizedModel(context: EideProjectContext): NormalizedProjectModel {
    const toolchainFamily = normalizeToolchainFamily(context.toolchain?.family ?? context.toolchain?.name);
    const diagnostics = createDiagnostics(context, toolchainFamily);
    const sourceFiles = context.sourceFiles.map(toNormalizedSourceFile);

    return {
        name: context.projectName,
        root: context.projectRoot,
        toolchainFamily,
        targets: [
            {
                name: context.activeTarget ?? 'default',
                sourceFiles,
                includePaths: context.includePaths,
                defines: context.defines,
                libraries: context.libraries,
                linkerScript: context.linkerScript,
                startupFile: context.startupFile,
                cFlags: [],
                cppFlags: [],
                asmFlags: [],
                linkerFlags: []
            }
        ],
        diagnostics
    };
}

export function inferNormalizedLanguage(filePath: string): NormalizedLanguage {
    const lowerPath = filePath.toLowerCase();

    if (lowerPath.endsWith('.c')) {
        return 'c';
    }

    if (
        lowerPath.endsWith('.cc') ||
        lowerPath.endsWith('.cpp') ||
        lowerPath.endsWith('.cxx') ||
        lowerPath.endsWith('.c++')
    ) {
        return 'cpp';
    }

    if (
        lowerPath.endsWith('.s') ||
        lowerPath.endsWith('.asm') ||
        lowerPath.endsWith('.a51')
    ) {
        return 'asm';
    }

    if (
        lowerPath.endsWith('.ld') ||
        lowerPath.endsWith('.sct') ||
        lowerPath.endsWith('.icf') ||
        lowerPath.endsWith('.lkf')
    ) {
        return 'linker';
    }

    return 'unknown';
}

export function normalizeToolchainFamily(toolchainName: string | undefined): NormalizedToolchainFamily {
    if (toolchainName === undefined || toolchainName.trim() === '') {
        return 'unknown';
    }

    const normalized = toolchainName.toLowerCase();

    if (normalized.includes('armclang') || normalized.includes('ac6')) {
        return 'armclang';
    }

    if (normalized.includes('armcc') || normalized.includes('keil')) {
        return 'armcc';
    }

    if (
        normalized.includes('gcc') ||
        normalized.includes('gnu') ||
        normalized.includes('riscv') ||
        normalized.includes('risc-v') ||
        normalized.includes('mips')
    ) {
        return 'gcc';
    }

    if (normalized.includes('iar')) {
        return 'iar';
    }

    if (normalized.includes('sdcc')) {
        return 'sdcc';
    }

    if (normalized.includes('cosmic')) {
        return 'cosmic';
    }

    if (normalized.includes('llvm') || normalized.includes('clang')) {
        return 'llvm';
    }

    return 'unknown';
}

function toNormalizedSourceFile(path: string): NormalizedSourceFile {
    return {
        path,
        language: inferNormalizedLanguage(path)
    };
}

function createDiagnostics(
    context: EideProjectContext,
    toolchainFamily: NormalizedToolchainFamily
): readonly MigrationDiagnostic[] {
    const diagnostics: MigrationDiagnostic[] = [];

    if (context.sourceFiles.length === 0) {
        diagnostics.push({
            level: 'warning',
            code: 'no-source-files',
            message: 'Project context does not contain source files.'
        });
    }

    if (toolchainFamily === 'unknown') {
        diagnostics.push({
            level: 'manual-review',
            code: 'unknown-toolchain',
            message: 'Project context does not contain a recognized toolchain family.'
        });
    }

    return diagnostics;
}
