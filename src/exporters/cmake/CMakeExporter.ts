import { ExportResult, ProjectExporter } from '../../core/export/ExportManager';
import {
    MigrationDiagnostic,
    NormalizedProjectModel,
    NormalizedSourceFile,
    NormalizedTarget,
    NormalizedToolchainFamily
} from '../../core/project/NormalizedProjectModel';

export class CMakeExporter implements ProjectExporter {
    readonly id = 'cmake';
    readonly displayName = 'CMake';

    async exportProject(model: NormalizedProjectModel, outputRoot: string): Promise<ExportResult> {
        const diagnostics = createDiagnostics(model);
        const content = createCMakeLists(model);

        return {
            exporterId: this.id,
            status: diagnostics.some((diagnostic) => diagnostic.level === 'error') ? 'failed' : toExportStatus(diagnostics),
            outputRoot,
            generatedFiles: ['CMakeLists.txt'],
            artifacts: [
                {
                    path: 'CMakeLists.txt',
                    content
                }
            ],
            diagnostics
        };
    }
}

export function createCMakeLists(model: NormalizedProjectModel): string {
    const target = model.targets[0];
    const projectName = sanitizeCMakeIdentifier(model.name);
    const lines: string[] = [
        'cmake_minimum_required(VERSION 3.20)',
        '',
        'set(CMAKE_SYSTEM_NAME Generic)',
        `project(${projectName} LANGUAGES C CXX ASM)`,
        ''
    ];

    if (target === undefined) {
        lines.push(`# No target data was available for ${escapeCMakeComment(model.name)}.`);
        return `${lines.join('\n')}\n`;
    }

    appendTarget(lines, projectName, target);

    return `${lines.join('\n')}\n`;
}

function appendTarget(lines: string[], cmakeTargetName: string, target: NormalizedTarget): void {
    const sourceFiles = target.sourceFiles.filter((sourceFile) => sourceFile.language !== 'linker');

    appendListCommand(lines, 'add_executable', cmakeTargetName, sourceFiles.map((sourceFile) => sourceFile.path));
    appendScopedListCommand(lines, 'target_include_directories', cmakeTargetName, target.includePaths);
    appendScopedListCommand(lines, 'target_compile_definitions', cmakeTargetName, target.defines);

    const compileOptions = [
        ...target.cFlags,
        ...target.cppFlags,
        ...target.asmFlags
    ];
    appendScopedListCommand(lines, 'target_compile_options', cmakeTargetName, compileOptions);
    appendScopedListCommand(lines, 'target_link_options', cmakeTargetName, target.linkerFlags);
    appendScopedListCommand(lines, 'target_link_libraries', cmakeTargetName, target.libraries);

    if (target.linkerScript !== undefined && target.linkerScript.trim() !== '') {
        appendLinkerScript(lines, cmakeTargetName, target.linkerScript);
    }
}

function appendScopedListCommand(lines: string[], command: string, targetName: string, values: readonly string[]): void {
    if (values.length === 0) {
        return;
    }

    appendListCommand(lines, command, targetName, ['PRIVATE', ...values]);
}

function appendListCommand(lines: string[], command: string, targetName: string, values: readonly string[]): void {
    const nonEmptyValues = values.filter((value) => value.trim() !== '');

    if (nonEmptyValues.length === 0) {
        return;
    }

    lines.push(`${command}(${targetName}`);

    for (const value of nonEmptyValues) {
        lines.push(`    ${escapeCMakeValue(value)}`);
    }

    lines.push(')');
    lines.push('');
}

function appendLinkerScript(lines: string[], targetName: string, linkerScript: string): void {
    lines.push(`target_link_options(${targetName}`);
    lines.push('    PRIVATE');
    lines.push(`    "-T${escapeCMakeString(linkerScript)}"`);
    lines.push(')');
    lines.push('');
}

function createDiagnostics(model: NormalizedProjectModel): readonly MigrationDiagnostic[] {
    const diagnostics: MigrationDiagnostic[] = [...model.diagnostics];
    const target = model.targets[0];

    if (target === undefined) {
        diagnostics.push({
            level: 'error',
            code: 'cmake-no-targets',
            message: 'CMake export requires at least one normalized target.'
        });
        return diagnostics;
    }

    if (target.sourceFiles.filter(isCompilableSource).length === 0) {
        diagnostics.push({
            level: 'warning',
            code: 'cmake-no-compilable-sources',
            message: `Target "${target.name}" does not contain C, C++, or assembly source files.`
        });
    }

    if (requiresManualToolchainReview(model.toolchainFamily)) {
        diagnostics.push({
            level: 'manual-review',
            code: 'cmake-toolchain-review',
            message: 'CMake exporter did not generate a toolchain file; verify compiler and linker settings manually.'
        });
    }

    return diagnostics;
}

function isCompilableSource(sourceFile: NormalizedSourceFile): boolean {
    return sourceFile.language === 'c' || sourceFile.language === 'cpp' || sourceFile.language === 'asm';
}

function requiresManualToolchainReview(toolchainFamily: NormalizedToolchainFamily | undefined): boolean {
    return toolchainFamily === undefined ||
        toolchainFamily === 'unknown' ||
        toolchainFamily === 'armcc' ||
        toolchainFamily === 'iar' ||
        toolchainFamily === 'sdcc' ||
        toolchainFamily === 'cosmic';
}

function toExportStatus(diagnostics: readonly MigrationDiagnostic[]): 'success' | 'partial' {
    return diagnostics.length === 0 ? 'success' : 'partial';
}

function sanitizeCMakeIdentifier(value: string): string {
    const sanitized = value.replace(/[^A-Za-z0-9_]/g, '_');
    return sanitized === '' ? 'eide_project' : sanitized;
}

function escapeCMakeValue(value: string): string {
    return `"${escapeCMakeString(toCMakePath(value))}"`;
}

function escapeCMakeString(value: string): string {
    return value.replace(/\\/g, '/').replace(/"/g, '\\"');
}

function escapeCMakeComment(value: string): string {
    return value.replace(/\r?\n/g, ' ');
}

function toCMakePath(value: string): string {
    return value.replace(/\\/g, '/');
}
