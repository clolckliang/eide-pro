import { NormalizedProjectModel, MigrationDiagnostic } from '../project/NormalizedProjectModel';

export type ExportStatus = 'success' | 'partial' | 'failed';

export interface ExportArtifact {
    readonly path: string;
    readonly content: string;
}

export interface ExportResult {
    readonly exporterId: string;
    readonly status: ExportStatus;
    readonly outputRoot?: string;
    readonly generatedFiles: readonly string[];
    readonly artifacts?: readonly ExportArtifact[];
    readonly diagnostics: readonly MigrationDiagnostic[];
}

export interface ProjectExporter {
    readonly id: string;
    readonly displayName: string;
    exportProject(model: NormalizedProjectModel, outputRoot: string): Promise<ExportResult>;
}

export class ExportManager {
    private readonly exporters = new Map<string, ProjectExporter>();

    register(exporter: ProjectExporter): void {
        if (this.exporters.has(exporter.id)) {
            throw new Error(`Exporter already registered: ${exporter.id}`);
        }

        this.exporters.set(exporter.id, exporter);
    }

    get(exporterId: string): ProjectExporter | undefined {
        return this.exporters.get(exporterId);
    }

    list(): readonly ProjectExporter[] {
        return Array.from(this.exporters.values());
    }

    async exportProject(exporterId: string, model: NormalizedProjectModel, outputRoot: string): Promise<ExportResult> {
        const exporter = this.get(exporterId);

        if (exporter === undefined) {
            throw new Error(`Unknown exporter: ${exporterId}`);
        }

        return exporter.exportProject(model, outputRoot);
    }
}
