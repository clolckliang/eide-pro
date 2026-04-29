import { ExportResult, ProjectExporter } from '../../core/export/ExportManager';
import {
    MigrationDiagnostic,
    NormalizedProjectModel,
    NormalizedSourceFile,
    NormalizedTarget,
    NormalizedToolchainFamily
} from '../../core/project/NormalizedProjectModel';

export class MakefileExporter implements ProjectExporter {
    readonly id = 'makefile';
    readonly displayName = 'GNU Makefile';

    async exportProject(model: NormalizedProjectModel, outputRoot: string): Promise<ExportResult> {
        const diagnostics = createDiagnostics(model);
        const content = createMakefile(model);

        return {
            exporterId: this.id,
            status: diagnostics.some((diagnostic) => diagnostic.level === 'error') ? 'failed' : toExportStatus(diagnostics),
            outputRoot,
            generatedFiles: ['Makefile'],
            artifacts: [
                {
                    path: 'Makefile',
                    content
                }
            ],
            diagnostics
        };
    }
}

export function createMakefile(model: NormalizedProjectModel): string {
    const target = model.targets[0];
    const lines: string[] = [
        `PROJECT_NAME := ${escapeMakeValue(model.name)}`,
        'BUILD_DIR ?= build',
        'CROSS_COMPILE ?=',
        '',
        'CC ?= $(CROSS_COMPILE)gcc',
        'CXX ?= $(CROSS_COMPILE)g++',
        'AS ?= $(CROSS_COMPILE)gcc',
        'LD ?= $(CC)',
        ''
    ];

    if (target === undefined) {
        lines.push(`# No target data was available for ${escapeMakeComment(model.name)}.`);
        return `${lines.join('\n')}\n`;
    }

    appendTarget(lines, target);

    return `${lines.join('\n')}\n`;
}

function appendTarget(lines: string[], target: NormalizedTarget): void {
    const sourceFiles = target.sourceFiles.filter((sourceFile) => sourceFile.language !== 'linker');

    lines.push(`TARGET_NAME := ${escapeMakeValue(target.name)}`);
    appendVariable(lines, 'SOURCES', sourceFiles.map((sourceFile) => sourceFile.path));
    appendVariable(lines, 'INCLUDES', target.includePaths.map((includePath) => `-I${includePath}`));
    appendVariable(lines, 'DEFINES', target.defines.map((define) => `-D${define}`));
    appendVariable(lines, 'LIBS', target.libraries.map(toLibraryFlag));
    appendVariable(lines, 'CFLAGS', target.cFlags);
    appendVariable(lines, 'CXXFLAGS', target.cppFlags);
    appendVariable(lines, 'ASFLAGS', target.asmFlags);
    appendVariable(lines, 'LDFLAGS', createLinkerFlags(target));

    lines.push('OUTPUT := $(BUILD_DIR)/$(PROJECT_NAME).elf');
    lines.push('');
    lines.push('all: $(OUTPUT)');
    lines.push('');
    lines.push('$(OUTPUT): $(SOURCES)');
    lines.push('\t@mkdir -p $(BUILD_DIR)');
    lines.push('\t$(LD) $(LDFLAGS) $(SOURCES) $(LIBS) -o $@');
    lines.push('');
    lines.push('clean:');
    lines.push('\trm -rf $(BUILD_DIR)');
    lines.push('');
    lines.push('.PHONY: all clean');
}

function appendVariable(lines: string[], name: string, values: readonly string[]): void {
    const nonEmptyValues = values.filter((value) => value.trim() !== '');

    if (nonEmptyValues.length === 0) {
        lines.push(`${name} :=`);
        return;
    }

    lines.push(`${name} := \\`);
    for (let index = 0; index < nonEmptyValues.length; index++) {
        const suffix = index === nonEmptyValues.length - 1 ? '' : ' \\';
        lines.push(`    ${escapeMakeValue(toMakePath(nonEmptyValues[index]))}${suffix}`);
    }
}

function createLinkerFlags(target: NormalizedTarget): readonly string[] {
    const linkerFlags = [...target.linkerFlags];

    if (target.linkerScript !== undefined && target.linkerScript.trim() !== '') {
        linkerFlags.push(`-T${target.linkerScript}`);
    }

    return linkerFlags;
}

function createDiagnostics(model: NormalizedProjectModel): readonly MigrationDiagnostic[] {
    const diagnostics: MigrationDiagnostic[] = [...model.diagnostics];
    const target = model.targets[0];

    if (target === undefined) {
        diagnostics.push({
            level: 'error',
            code: 'makefile-no-targets',
            message: 'Makefile export requires at least one normalized target.'
        });
        return diagnostics;
    }

    if (target.sourceFiles.filter(isCompilableSource).length === 0) {
        diagnostics.push({
            level: 'warning',
            code: 'makefile-no-compilable-sources',
            message: `Target "${target.name}" does not contain C, C++, or assembly source files.`
        });
    }

    if (requiresManualToolchainReview(model.toolchainFamily)) {
        diagnostics.push({
            level: 'manual-review',
            code: 'makefile-toolchain-review',
            message: 'Makefile exporter uses generic compiler variables; verify toolchain commands and flags manually.'
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
        toolchainFamily === 'armclang' ||
        toolchainFamily === 'iar' ||
        toolchainFamily === 'sdcc' ||
        toolchainFamily === 'cosmic' ||
        toolchainFamily === 'llvm';
}

function toExportStatus(diagnostics: readonly MigrationDiagnostic[]): 'success' | 'partial' {
    return diagnostics.length === 0 ? 'success' : 'partial';
}

function toLibraryFlag(library: string): string {
    return library.startsWith('-') ? library : `-l${library}`;
}

function escapeMakeValue(value: string): string {
    return value.replace(/\\/g, '/').replace(/\$/g, '$$$$').replace(/#/g, '\\#');
}

function escapeMakeComment(value: string): string {
    return value.replace(/\r?\n/g, ' ').replace(/#/g, '\\#');
}

function toMakePath(value: string): string {
    return value.replace(/\\/g, '/');
}
