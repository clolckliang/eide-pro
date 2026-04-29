import { createExportStatus, ExportResult, ProjectExporter } from '../../core/export/ExportManager';
import {
    MigrationDiagnostic,
    NormalizedProjectModel,
    NormalizedTarget
} from '../../core/project/NormalizedProjectModel';

export interface AgentContextPackage {
    readonly schemaVersion: 1;
    readonly project: {
        readonly name: string;
        readonly root: string;
        readonly toolchainFamily?: string;
    };
    readonly targets: readonly AgentContextTarget[];
    readonly safety: AgentContextSafety;
    readonly diagnostics: readonly MigrationDiagnostic[];
}

export interface AgentContextTarget {
    readonly name: string;
    readonly sourceFiles: readonly string[];
    readonly includePaths: readonly string[];
    readonly defines: readonly string[];
    readonly libraries: readonly string[];
    readonly linkerScript?: string;
    readonly startupFile?: string;
}

export interface AgentContextSafety {
    readonly permissionLevel: 'readonly';
    readonly allowedOperations: readonly string[];
    readonly forbiddenOperations: readonly string[];
}

export class AgentContextExporter implements ProjectExporter {
    readonly id = 'agent-context';
    readonly displayName = 'Agent Context';

    async exportProject(model: NormalizedProjectModel, outputRoot: string): Promise<ExportResult> {
        const diagnostics = createDiagnostics(model);
        const contextPackage = createAgentContextPackage(model, diagnostics);
        const contextJson = `${JSON.stringify(contextPackage, null, 4)}\n`;
        const readme = createAgentContextReadme(contextPackage);

        return {
            exporterId: this.id,
            status: createExportStatus(diagnostics),
            outputRoot,
            generatedFiles: ['agent-context.json', 'README.md'],
            artifacts: [
                {
                    path: 'agent-context.json',
                    content: contextJson
                },
                {
                    path: 'README.md',
                    content: readme
                }
            ],
            diagnostics
        };
    }
}

export function createAgentContextPackage(
    model: NormalizedProjectModel,
    diagnostics: readonly MigrationDiagnostic[] = model.diagnostics
): AgentContextPackage {
    return {
        schemaVersion: 1,
        project: {
            name: model.name,
            root: model.root,
            toolchainFamily: model.toolchainFamily
        },
        targets: model.targets.map(toAgentContextTarget),
        safety: {
            permissionLevel: 'readonly',
            allowedOperations: [
                'inspect project metadata',
                'inspect source lists',
                'inspect include paths',
                'inspect defines',
                'inspect migration diagnostics'
            ],
            forbiddenOperations: [
                'build',
                'flash',
                'debug control',
                'raw gdb',
                'memory write',
                'pid parameter write'
            ]
        },
        diagnostics
    };
}

export function createAgentContextReadme(contextPackage: AgentContextPackage): string {
    const lines: string[] = [
        `# ${contextPackage.project.name} Agent Context`,
        '',
        'This package is read-only project context for Agent workflows.',
        '',
        `Project root: ${contextPackage.project.root}`,
        `Toolchain family: ${contextPackage.project.toolchainFamily ?? 'unknown'}`,
        '',
        '## Targets',
        ''
    ];

    if (contextPackage.targets.length === 0) {
        lines.push('- No normalized targets were available.');
    } else {
        for (const target of contextPackage.targets) {
            lines.push(`- ${target.name}: ${target.sourceFiles.length} source file(s)`);
        }
    }

    lines.push('');
    lines.push('## Safety');
    lines.push('');
    lines.push('Permission level: readonly');
    lines.push('');
    lines.push('Forbidden operations include build, flash, debug control, raw GDB, memory writes, and PID parameter writes.');

    if (contextPackage.diagnostics.length > 0) {
        lines.push('');
        lines.push('## Diagnostics');
        lines.push('');

        for (const diagnostic of contextPackage.diagnostics) {
            lines.push(`- ${diagnostic.level} ${diagnostic.code}: ${diagnostic.message}`);
        }
    }

    return `${lines.join('\n')}\n`;
}

function toAgentContextTarget(target: NormalizedTarget): AgentContextTarget {
    return {
        name: target.name,
        sourceFiles: target.sourceFiles.map((sourceFile) => sourceFile.path),
        includePaths: target.includePaths,
        defines: target.defines,
        libraries: target.libraries,
        linkerScript: target.linkerScript,
        startupFile: target.startupFile
    };
}

function createDiagnostics(model: NormalizedProjectModel): readonly MigrationDiagnostic[] {
    const diagnostics: MigrationDiagnostic[] = [...model.diagnostics];

    if (model.targets.length === 0) {
        diagnostics.push({
            level: 'error',
            code: 'agent-context-no-targets',
            message: 'Agent context export requires at least one normalized target.'
        });
    }

    return diagnostics;
}
